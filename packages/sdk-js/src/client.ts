import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { EventEmitter } from 'eventemitter3';
import { LicenseManager } from './modules/licenses';
import { AuthManager } from './modules/auth';
import { UserManager } from './modules/users';
import { WebhookManager } from './modules/webhooks';
import { RealtimeClient } from './modules/realtime';
import {
  DCAAuthConfig,
  DCAAuthOptions,
  TokenPair,
  RequestInterceptor,
  ResponseInterceptor
} from './types';
import { DCAAuthError, NetworkError, AuthenticationError } from './errors';
import { Storage, MemoryStorage } from './storage';

export class DCAAuthClient extends EventEmitter {
  private config: DCAAuthConfig;
  private http: AxiosInstance;
  private storage: Storage;
  private refreshPromise: Promise<TokenPair> | null = null;

  // Modules
  public licenses: LicenseManager;
  public auth: AuthManager;
  public users: UserManager;
  public webhooks: WebhookManager;
  public realtime: RealtimeClient;

  constructor(config: DCAAuthOptions) {
    super();

    // Validate config
    if (!config.apiUrl && !config.baseURL) {
      throw new DCAAuthError('API URL is required');
    }

    // Initialize configuration
    this.config = {
      apiUrl: config.apiUrl || config.baseURL || 'https://api.dca-auth.com',
      apiKey: config.apiKey,
      timeout: config.timeout || 30000,
      retries: config.retries || 3,
      retryDelay: config.retryDelay || 1000,
      debug: config.debug || false,
      storage: config.storage || new MemoryStorage(),
      autoRefreshToken: config.autoRefreshToken !== false,
      wsUrl: config.wsUrl,
      headers: config.headers || {},
    };

    this.storage = this.config.storage;

    // Initialize HTTP client
    this.http = this.createHttpClient();

    // Initialize modules
    this.licenses = new LicenseManager(this.http, this);
    this.auth = new AuthManager(this.http, this, this.storage);
    this.users = new UserManager(this.http, this);
    this.webhooks = new WebhookManager(this.http, this);
    this.realtime = new RealtimeClient(this.config.wsUrl || this.config.apiUrl, this);

    // Set up event forwarding
    this.setupEventForwarding();
  }

  private createHttpClient(): AxiosInstance {
    const client = axios.create({
      baseURL: this.config.apiUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-SDK-Version': '1.0.0',
        'X-SDK-Platform': this.getPlatform(),
        ...this.config.headers,
      },
    });

    // Request interceptor
    client.interceptors.request.use(
      async (config) => {
        // Add API key if available
        if (this.config.apiKey) {
          config.headers['X-API-Key'] = this.config.apiKey;
        }

        // Add auth token if available
        const token = await this.storage.get('accessToken');
        if (token && !config.headers['Authorization']) {
          config.headers['Authorization'] = `Bearer ${token}`;
        }

        // Debug logging
        if (this.config.debug) {
          console.log('DCA-Auth Request:', {
            method: config.method?.toUpperCase(),
            url: config.url,
            headers: config.headers,
          });
        }

        this.emit('request', config);
        return config;
      },
      (error) => {
        this.emit('request:error', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    client.interceptors.response.use(
      (response) => {
        if (this.config.debug) {
          console.log('DCA-Auth Response:', {
            status: response.status,
            url: response.config.url,
            data: response.data,
          });
        }

        this.emit('response', response);
        return response;
      },
      async (error) => {
        const originalRequest = error.config;

        // Handle token refresh
        if (
          error.response?.status === 401 &&
          !originalRequest._retry &&
          this.config.autoRefreshToken
        ) {
          originalRequest._retry = true;

          try {
            const tokens = await this.refreshAccessToken();
            originalRequest.headers['Authorization'] = `Bearer ${tokens.accessToken}`;
            return client(originalRequest);
          } catch (refreshError) {
            this.emit('auth:logout');
            throw new AuthenticationError('Session expired. Please login again.');
          }
        }

        // Handle rate limiting
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'] || 60;
          this.emit('rateLimit', { retryAfter });

          if (originalRequest._retryCount < this.config.retries) {
            originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;
            await this.sleep(parseInt(retryAfter) * 1000);
            return client(originalRequest);
          }
        }

        // Handle network errors with retry
        if (!error.response && originalRequest._retryCount < this.config.retries) {
          originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;
          await this.sleep(this.config.retryDelay * originalRequest._retryCount);
          return client(originalRequest);
        }

        if (this.config.debug) {
          console.error('DCA-Auth Error:', error);
        }

        this.emit('response:error', error);
        throw this.handleError(error);
      }
    );

    return client;
  }

  private async refreshAccessToken(): Promise<TokenPair> {
    // Prevent multiple simultaneous refresh requests
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        const refreshToken = await this.storage.get('refreshToken');
        if (!refreshToken) {
          throw new AuthenticationError('No refresh token available');
        }

        const response = await this.http.post('/api/auth/refresh', {
          refreshToken,
        });

        const tokens: TokenPair = {
          accessToken: response.data.accessToken,
          refreshToken: response.data.refreshToken,
        };

        await this.storage.set('accessToken', tokens.accessToken);
        await this.storage.set('refreshToken', tokens.refreshToken);

        this.emit('auth:refresh', tokens);
        return tokens;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  private setupEventForwarding(): void {
    // Forward events from modules
    this.auth.on('login', (data) => this.emit('auth:login', data));
    this.auth.on('logout', () => this.emit('auth:logout'));
    this.licenses.on('activated', (data) => this.emit('license:activated', data));
    this.licenses.on('deactivated', (data) => this.emit('license:deactivated', data));
    this.licenses.on('verified', (data) => this.emit('license:verified', data));
    this.realtime.on('connected', () => this.emit('ws:connected'));
    this.realtime.on('disconnected', () => this.emit('ws:disconnected'));
    this.realtime.on('message', (data) => this.emit('ws:message', data));
  }

  private handleError(error: any): Error {
    if (error.response) {
      const { status, data } = error.response;
      const message = data?.message || error.message;

      switch (status) {
        case 400:
          return new DCAAuthError(`Bad Request: ${message}`, 'BAD_REQUEST', data);
        case 401:
          return new AuthenticationError(message);
        case 403:
          return new DCAAuthError(`Forbidden: ${message}`, 'FORBIDDEN', data);
        case 404:
          return new DCAAuthError(`Not Found: ${message}`, 'NOT_FOUND', data);
        case 409:
          return new DCAAuthError(`Conflict: ${message}`, 'CONFLICT', data);
        case 429:
          return new DCAAuthError(`Rate Limited: ${message}`, 'RATE_LIMITED', data);
        case 500:
          return new DCAAuthError(`Server Error: ${message}`, 'SERVER_ERROR', data);
        default:
          return new DCAAuthError(message, 'UNKNOWN_ERROR', data);
      }
    } else if (error.request) {
      return new NetworkError('Network error occurred');
    }

    return error;
  }

  private getPlatform(): string {
    if (typeof window !== 'undefined') {
      return 'browser';
    } else if (typeof process !== 'undefined' && process.versions?.node) {
      return `node/${process.version}`;
    }
    return 'unknown';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Add a request interceptor
   */
  public addRequestInterceptor(interceptor: RequestInterceptor): number {
    return this.http.interceptors.request.use(interceptor);
  }

  /**
   * Add a response interceptor
   */
  public addResponseInterceptor(interceptor: ResponseInterceptor): number {
    return this.http.interceptors.response.use(interceptor);
  }

  /**
   * Remove an interceptor
   */
  public removeInterceptor(type: 'request' | 'response', id: number): void {
    if (type === 'request') {
      this.http.interceptors.request.eject(id);
    } else {
      this.http.interceptors.response.eject(id);
    }
  }

  /**
   * Set authentication tokens
   */
  public async setTokens(tokens: TokenPair): Promise<void> {
    await this.storage.set('accessToken', tokens.accessToken);
    await this.storage.set('refreshToken', tokens.refreshToken);
    this.emit('auth:tokens', tokens);
  }

  /**
   * Clear authentication tokens
   */
  public async clearTokens(): Promise<void> {
    await this.storage.remove('accessToken');
    await this.storage.remove('refreshToken');
    this.emit('auth:clear');
  }

  /**
   * Get current access token
   */
  public async getAccessToken(): Promise<string | null> {
    return this.storage.get('accessToken');
  }

  /**
   * Check if authenticated
   */
  public async isAuthenticated(): Promise<boolean> {
    const token = await this.getAccessToken();
    return !!token;
  }

  /**
   * Connect to WebSocket for real-time updates
   */
  public async connectRealtime(): Promise<void> {
    const token = await this.getAccessToken();
    if (token) {
      this.realtime.setAuth(token);
    }
    return this.realtime.connect();
  }

  /**
   * Disconnect from WebSocket
   */
  public disconnectRealtime(): void {
    this.realtime.disconnect();
  }

  /**
   * Destroy the client and clean up resources
   */
  public destroy(): void {
    this.disconnectRealtime();
    this.removeAllListeners();
    this.storage.clear();
  }
}