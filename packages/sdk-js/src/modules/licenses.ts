import { AxiosInstance } from 'axios';
import { EventEmitter } from 'eventemitter3';
import {
  License,
  CreateLicenseData,
  ActivateLicenseData,
  VerifyLicenseData,
  DeactivateLicenseData,
  VerificationResult,
  PaginatedResponse,
  SearchParams,
  LicenseStatus,
  BatchOperation,
  BatchResult,
} from '../types';
import { LicenseError, LicenseExpiredError, MaxActivationsError } from '../errors';

export class LicenseManager extends EventEmitter {
  private cache: Map<string, { license: License; timestamp: number }> = new Map();
  private cacheExpiry = 5 * 60 * 1000; // 5 minutes

  constructor(
    private http: AxiosInstance,
    private client: any
  ) {
    super();
  }

  /**
   * Create a new license
   */
  async create(data: CreateLicenseData): Promise<License> {
    try {
      const response = await this.http.post<License>('/api/licenses', data);
      const license = response.data;

      this.cacheSet(license.key, license);
      this.emit('created', license);

      return license;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get license by ID
   */
  async get(licenseId: string): Promise<License> {
    try {
      const response = await this.http.get<License>(`/api/licenses/${licenseId}`);
      const license = response.data;

      this.cacheSet(license.key, license);

      return license;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get license by key
   */
  async getByKey(key: string): Promise<License> {
    // Check cache first
    const cached = this.cacheGet(key);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.http.get<License>(`/api/licenses/key/${key}`);
      const license = response.data;

      this.cacheSet(key, license);

      return license;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * List licenses with pagination and filtering
   */
  async list(params?: SearchParams): Promise<PaginatedResponse<License>> {
    try {
      const response = await this.http.get<PaginatedResponse<License>>('/api/licenses', {
        params,
      });

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * List user's licenses
   */
  async listUserLicenses(userId: string, params?: SearchParams): Promise<PaginatedResponse<License>> {
    try {
      const response = await this.http.get<PaginatedResponse<License>>(`/api/users/${userId}/licenses`, {
        params,
      });

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Activate a license
   */
  async activate(data: ActivateLicenseData): Promise<{ license: License; activation: any }> {
    try {
      const response = await this.http.post<{ license: License; activation: any }>(
        '/api/licenses/activate',
        data
      );

      const result = response.data;

      this.cacheSet(result.license.key, result.license);
      this.emit('activated', result);

      return result;
    } catch (error: any) {
      // Handle specific activation errors
      if (error.response?.data?.code === 'MAX_ACTIVATIONS_REACHED') {
        const { maxActivations, currentActivations } = error.response.data.details;
        throw new MaxActivationsError(data.key, maxActivations, currentActivations);
      }

      throw this.handleError(error);
    }
  }

  /**
   * Deactivate a license
   */
  async deactivate(data: DeactivateLicenseData): Promise<void> {
    try {
      await this.http.post('/api/licenses/deactivate', data);

      this.cacheInvalidate(data.key);
      this.emit('deactivated', data);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Verify a license
   */
  async verify(data: VerifyLicenseData): Promise<VerificationResult> {
    try {
      const response = await this.http.post<VerificationResult>('/api/licenses/verify', data);
      const result = response.data;

      if (result.valid && result.license) {
        this.cacheSet(result.license.key, result.license);
      }

      this.emit('verified', result);

      return result;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Quick verify with cache
   */
  async quickVerify(key: string, hardwareId: string): Promise<boolean> {
    // Check cache first
    const cached = this.cacheGet(key);
    if (cached) {
      // Basic validation
      if (cached.status !== LicenseStatus.ACTIVE) {
        return false;
      }

      if (cached.expiresAt && new Date(cached.expiresAt) < new Date()) {
        this.cacheInvalidate(key);
        return false;
      }

      // If cached and basic checks pass, do full verification in background
      this.verify({ key, hardwareId }).catch(() => {
        this.cacheInvalidate(key);
      });

      return true;
    }

    // No cache, do full verification
    const result = await this.verify({ key, hardwareId });
    return result.valid;
  }

  /**
   * Update license
   */
  async update(licenseId: string, data: Partial<License>): Promise<License> {
    try {
      const response = await this.http.patch<License>(`/api/licenses/${licenseId}`, data);
      const license = response.data;

      this.cacheSet(license.key, license);
      this.emit('updated', license);

      return license;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Revoke a license
   */
  async revoke(licenseId: string, reason?: string): Promise<License> {
    try {
      const response = await this.http.post<License>(`/api/licenses/${licenseId}/revoke`, {
        reason,
      });

      const license = response.data;

      this.cacheInvalidate(license.key);
      this.emit('revoked', license);

      return license;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Suspend a license
   */
  async suspend(licenseId: string, reason?: string): Promise<License> {
    try {
      const response = await this.http.post<License>(`/api/licenses/${licenseId}/suspend`, {
        reason,
      });

      const license = response.data;

      this.cacheSet(license.key, license);
      this.emit('suspended', license);

      return license;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Unsuspend a license
   */
  async unsuspend(licenseId: string): Promise<License> {
    try {
      const response = await this.http.post<License>(`/api/licenses/${licenseId}/unsuspend`);

      const license = response.data;

      this.cacheSet(license.key, license);
      this.emit('unsuspended', license);

      return license;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Extend license expiration
   */
  async extend(licenseId: string, days: number): Promise<License> {
    try {
      const response = await this.http.post<License>(`/api/licenses/${licenseId}/extend`, {
        days,
      });

      const license = response.data;

      this.cacheSet(license.key, license);
      this.emit('extended', license);

      return license;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Transfer license to another user
   */
  async transfer(licenseId: string, newUserId: string): Promise<License> {
    try {
      const response = await this.http.post<License>(`/api/licenses/${licenseId}/transfer`, {
        newUserId,
      });

      const license = response.data;

      this.cacheSet(license.key, license);
      this.emit('transferred', license);

      return license;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get license activations
   */
  async getActivations(licenseId: string): Promise<any[]> {
    try {
      const response = await this.http.get<any[]>(`/api/licenses/${licenseId}/activations`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Remove specific activation
   */
  async removeActivation(licenseId: string, activationId: string): Promise<void> {
    try {
      await this.http.delete(`/api/licenses/${licenseId}/activations/${activationId}`);

      this.emit('activationRemoved', { licenseId, activationId });
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Batch operations
   */
  async batch<T = License>(operations: BatchOperation<T>[]): Promise<BatchResult<T>> {
    try {
      const response = await this.http.post<BatchResult<T>>('/api/licenses/batch', {
        operations,
      });

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Generate license keys in bulk
   */
  async generateBulk(count: number, template: Partial<CreateLicenseData>): Promise<License[]> {
    try {
      const response = await this.http.post<License[]>('/api/licenses/generate-bulk', {
        count,
        template,
      });

      const licenses = response.data;

      // Cache all generated licenses
      licenses.forEach(license => {
        this.cacheSet(license.key, license);
      });

      this.emit('bulkGenerated', licenses);

      return licenses;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Export licenses
   */
  async export(format: 'csv' | 'json' | 'xlsx', filters?: any): Promise<Blob> {
    try {
      const response = await this.http.get('/api/licenses/export', {
        params: { format, ...filters },
        responseType: 'blob',
      });

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Import licenses
   */
  async import(file: File, options?: any): Promise<{ imported: number; failed: number; errors: any[] }> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      if (options) {
        formData.append('options', JSON.stringify(options));
      }

      const response = await this.http.post('/api/licenses/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get license statistics
   */
  async getStats(licenseId?: string): Promise<any> {
    try {
      const url = licenseId
        ? `/api/licenses/${licenseId}/stats`
        : '/api/licenses/stats';

      const response = await this.http.get(url);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Cache management
   */
  private cacheSet(key: string, license: License): void {
    this.cache.set(key, {
      license,
      timestamp: Date.now(),
    });
  }

  private cacheGet(key: string): License | null {
    const cached = this.cache.get(key);

    if (cached) {
      if (Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.license;
      } else {
        this.cache.delete(key);
      }
    }

    return null;
  }

  private cacheInvalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Error handling
   */
  private handleError(error: any): Error {
    if (error.response?.data?.code === 'LICENSE_EXPIRED') {
      const { licenseKey, expiredAt } = error.response.data.details;
      return new LicenseExpiredError(licenseKey, expiredAt);
    }

    if (error.response?.data?.code?.startsWith('LICENSE_')) {
      return new LicenseError(
        error.response.data.message,
        error.response.data.code,
        error.response.data.details
      );
    }

    return error;
  }
}