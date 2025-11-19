import { AxiosRequestConfig, AxiosResponse } from 'axios';

export interface DCAAuthOptions {
  apiUrl?: string;
  baseURL?: string; // Alias for apiUrl
  apiKey?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  debug?: boolean;
  storage?: Storage;
  autoRefreshToken?: boolean;
  wsUrl?: string;
  headers?: Record<string, string>;
}

export interface DCAAuthConfig extends Required<Omit<DCAAuthOptions, 'baseURL'>> {
  apiUrl: string;
}

export interface Storage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface User {
  id: string;
  email: string;
  username: string;
  discordId?: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  roles: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  twoFactorCode?: string;
}

export interface RegisterData {
  email: string;
  password: string;
  username: string;
}

export interface License {
  id: string;
  key: string;
  type: LicenseType;
  status: LicenseStatus;
  userId: string;
  productId: string;
  maxActivations: number;
  currentActivations: number;
  expiresAt?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  user?: User;
  product?: Product;
  activations?: Activation[];
}

export enum LicenseType {
  TRIAL = 'TRIAL',
  STANDARD = 'STANDARD',
  PREMIUM = 'PREMIUM',
  ENTERPRISE = 'ENTERPRISE'
}

export enum LicenseStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  EXPIRED = 'EXPIRED',
  SUSPENDED = 'SUSPENDED',
  REVOKED = 'REVOKED'
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  features?: string[];
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface Activation {
  id: string;
  licenseId: string;
  hardwareId: string;
  deviceName?: string;
  ipAddress?: string;
  activatedAt: string;
  lastSeenAt: string;
  metadata?: Record<string, any>;
}

export interface CreateLicenseData {
  type: LicenseType;
  userId: string;
  productId: string;
  maxActivations?: number;
  expiresInDays?: number;
  metadata?: Record<string, any>;
}

export interface ActivateLicenseData {
  key: string;
  hardwareId: string;
  deviceName?: string;
  ipAddress?: string;
  metadata?: Record<string, any>;
}

export interface VerifyLicenseData {
  key: string;
  hardwareId: string;
}

export interface DeactivateLicenseData {
  key: string;
  hardwareId: string;
}

export interface VerificationResult {
  valid: boolean;
  license?: License;
  activation?: Activation;
  error?: string;
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  secret?: string;
  headers?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWebhookData {
  url: string;
  events: string[];
  secret?: string;
  headers?: Record<string, string>;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: any;
  statusCode: number;
  success: boolean;
  error?: string;
  attempt: number;
  deliveredAt: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface SearchParams extends PaginationParams {
  search?: string;
  filters?: Record<string, any>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
  details?: any;
}

export interface AuditLog {
  id: string;
  action: string;
  userId?: string;
  targetId?: string;
  targetType?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface Analytics {
  licenses: {
    total: number;
    active: number;
    expired: number;
    revenue: number;
  };
  users: {
    total: number;
    active: number;
    new: number;
  };
  activations: {
    total: number;
    unique: number;
    averagePerLicense: number;
  };
}

export interface TwoFactorSetup {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export interface RequestInterceptor {
  (config: AxiosRequestConfig): AxiosRequestConfig | Promise<AxiosRequestConfig>;
}

export interface ResponseInterceptor {
  (response: AxiosResponse): AxiosResponse | Promise<AxiosResponse>;
}

export interface RealtimeMessage {
  event: string;
  data: any;
  timestamp: string;
}

export interface RealtimeSubscription {
  event: string;
  callback: (data: any) => void;
}

export interface BatchOperation<T> {
  items: T[];
  operation: 'create' | 'update' | 'delete';
  options?: any;
}

export interface BatchResult<T> {
  successful: T[];
  failed: Array<{ item: T; error: string }>;
  total: number;
  successCount: number;
  failureCount: number;
}