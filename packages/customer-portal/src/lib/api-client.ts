import { DCAAuthClient } from '@dca-auth/sdk';

interface ApiConfig {
  baseUrl: string;
  apiKey?: string;
  accessToken?: string;
}

class CustomerPortalAPI {
  private client: DCAAuthClient;

  constructor(config: ApiConfig) {
    this.client = new DCAAuthClient({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey
    });

    if (config.accessToken) {
      this.setAccessToken(config.accessToken);
    }
  }

  setAccessToken(token: string) {
    this.client.setAuthToken(token);
  }

  // Dashboard
  async getDashboardStats() {
    const response = await fetch('/api/dashboard/stats', {
      headers: this.getHeaders()
    });
    return response.json();
  }

  async getUsageData(period: 'day' | 'week' | 'month' | 'year' = 'month') {
    const response = await fetch(`/api/dashboard/usage?period=${period}`, {
      headers: this.getHeaders()
    });
    return response.json();
  }

  // Licenses
  async getLicenses(params?: {
    page?: number;
    limit?: number;
    status?: string;
    product?: string;
  }) {
    const queryString = new URLSearchParams(params as any).toString();
    const response = await fetch(`/api/licenses${queryString ? `?${queryString}` : ''}`, {
      headers: this.getHeaders()
    });
    return response.json();
  }

  async getLicenseDetails(licenseId: string) {
    const response = await fetch(`/api/licenses/${licenseId}`, {
      headers: this.getHeaders()
    });
    return response.json();
  }

  async createLicense(data: {
    product: string;
    type: string;
    duration?: number;
    maxActivations?: number;
    metadata?: Record<string, any>;
  }) {
    const response = await fetch('/api/licenses', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    return response.json();
  }

  async updateLicense(licenseId: string, updates: Partial<{
    status: string;
    maxActivations: number;
    expiresAt: string;
    metadata: Record<string, any>;
  }>) {
    const response = await fetch(`/api/licenses/${licenseId}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(updates)
    });
    return response.json();
  }

  async revokeLicense(licenseId: string, reason?: string) {
    const response = await fetch(`/api/licenses/${licenseId}/revoke`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ reason })
    });
    return response.json();
  }

  // Billing
  async getBillingInfo() {
    const response = await fetch('/api/billing/info', {
      headers: this.getHeaders()
    });
    return response.json();
  }

  async getPaymentMethods() {
    const response = await fetch('/api/billing/payment-methods', {
      headers: this.getHeaders()
    });
    return response.json();
  }

  async addPaymentMethod(data: {
    type: 'card' | 'paypal' | 'bank';
    token: string;
    setDefault?: boolean;
  }) {
    const response = await fetch('/api/billing/payment-methods', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    return response.json();
  }

  async removePaymentMethod(methodId: string) {
    const response = await fetch(`/api/billing/payment-methods/${methodId}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    });
    return response.json();
  }

  async getInvoices(params?: {
    page?: number;
    limit?: number;
    status?: string;
  }) {
    const queryString = new URLSearchParams(params as any).toString();
    const response = await fetch(`/api/billing/invoices${queryString ? `?${queryString}` : ''}`, {
      headers: this.getHeaders()
    });
    return response.json();
  }

  async downloadInvoice(invoiceId: string) {
    const response = await fetch(`/api/billing/invoices/${invoiceId}/download`, {
      headers: this.getHeaders()
    });
    return response.blob();
  }

  async getSubscription() {
    const response = await fetch('/api/billing/subscription', {
      headers: this.getHeaders()
    });
    return response.json();
  }

  async updateSubscription(planId: string) {
    const response = await fetch('/api/billing/subscription', {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({ planId })
    });
    return response.json();
  }

  async cancelSubscription(reason?: string) {
    const response = await fetch('/api/billing/subscription/cancel', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ reason })
    });
    return response.json();
  }

  // Team
  async getTeamMembers(params?: {
    page?: number;
    limit?: number;
    role?: string;
  }) {
    const queryString = new URLSearchParams(params as any).toString();
    const response = await fetch(`/api/team/members${queryString ? `?${queryString}` : ''}`, {
      headers: this.getHeaders()
    });
    return response.json();
  }

  async inviteTeamMember(data: {
    email: string;
    role: string;
    permissions?: string[];
  }) {
    const response = await fetch('/api/team/invite', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    return response.json();
  }

  async updateTeamMember(memberId: string, updates: {
    role?: string;
    permissions?: string[];
  }) {
    const response = await fetch(`/api/team/members/${memberId}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(updates)
    });
    return response.json();
  }

  async removeTeamMember(memberId: string) {
    const response = await fetch(`/api/team/members/${memberId}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    });
    return response.json();
  }

  // Security
  async getAuditLog(params?: {
    page?: number;
    limit?: number;
    types?: string[];
    severity?: string[];
    startDate?: string;
    endDate?: string;
  }) {
    const queryString = new URLSearchParams(params as any).toString();
    const response = await fetch(`/api/security/audit${queryString ? `?${queryString}` : ''}`, {
      headers: this.getHeaders()
    });
    return response.json();
  }

  async exportAuditLog(format: 'csv' | 'json' | 'pdf' = 'csv') {
    const response = await fetch(`/api/security/audit/export?format=${format}`, {
      headers: this.getHeaders()
    });
    return response.blob();
  }

  async getSecuritySettings() {
    const response = await fetch('/api/security/settings', {
      headers: this.getHeaders()
    });
    return response.json();
  }

  async updateSecuritySettings(settings: {
    twoFactorRequired?: boolean;
    ipWhitelist?: string[];
    sessionTimeout?: number;
    passwordPolicy?: {
      minLength?: number;
      requireUppercase?: boolean;
      requireNumbers?: boolean;
      requireSpecialChars?: boolean;
    };
  }) {
    const response = await fetch('/api/security/settings', {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(settings)
    });
    return response.json();
  }

  async enableTwoFactor() {
    const response = await fetch('/api/security/2fa/enable', {
      method: 'POST',
      headers: this.getHeaders()
    });
    return response.json();
  }

  async disableTwoFactor(code: string) {
    const response = await fetch('/api/security/2fa/disable', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ code })
    });
    return response.json();
  }

  async getApiKeys() {
    const response = await fetch('/api/security/api-keys', {
      headers: this.getHeaders()
    });
    return response.json();
  }

  async createApiKey(data: {
    name: string;
    permissions: string[];
    expiresAt?: string;
  }) {
    const response = await fetch('/api/security/api-keys', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    return response.json();
  }

  async revokeApiKey(keyId: string) {
    const response = await fetch(`/api/security/api-keys/${keyId}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    });
    return response.json();
  }

  // Support
  async getSupportTickets(params?: {
    page?: number;
    limit?: number;
    status?: string;
  }) {
    const response = await fetch(`/api/support/tickets${params ? `?${new URLSearchParams(params as any)}` : ''}`, {
      headers: this.getHeaders()
    });
    return response.json();
  }

  async createSupportTicket(data: {
    subject: string;
    description: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    category: string;
    attachments?: File[];
  }) {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (key === 'attachments' && Array.isArray(value)) {
        value.forEach(file => formData.append('attachments', file));
      } else {
        formData.append(key, value as string);
      }
    });

    const response = await fetch('/api/support/tickets', {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        // Don't set Content-Type, let browser set it with boundary for FormData
      },
      body: formData
    });
    return response.json();
  }

  async getTicketMessages(ticketId: string) {
    const response = await fetch(`/api/support/tickets/${ticketId}/messages`, {
      headers: this.getHeaders()
    });
    return response.json();
  }

  async sendTicketMessage(ticketId: string, message: string, attachments?: File[]) {
    const formData = new FormData();
    formData.append('message', message);
    if (attachments) {
      attachments.forEach(file => formData.append('attachments', file));
    }

    const response = await fetch(`/api/support/tickets/${ticketId}/messages`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: formData
    });
    return response.json();
  }

  // Settings
  async getOrganizationSettings() {
    const response = await fetch('/api/settings/organization', {
      headers: this.getHeaders()
    });
    return response.json();
  }

  async updateOrganizationSettings(settings: {
    name?: string;
    logo?: string;
    timezone?: string;
    language?: string;
    webhookUrl?: string;
  }) {
    const response = await fetch('/api/settings/organization', {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(settings)
    });
    return response.json();
  }

  async getUserProfile() {
    const response = await fetch('/api/settings/profile', {
      headers: this.getHeaders()
    });
    return response.json();
  }

  async updateUserProfile(profile: {
    name?: string;
    email?: string;
    avatar?: string;
    timezone?: string;
    language?: string;
  }) {
    const response = await fetch('/api/settings/profile', {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(profile)
    });
    return response.json();
  }

  async changePassword(currentPassword: string, newPassword: string) {
    const response = await fetch('/api/settings/password', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ currentPassword, newPassword })
    });
    return response.json();
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      ...this.client.getAuthHeaders()
    };
  }
}

// Export a singleton instance
export const apiClient = new CustomerPortalAPI({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  apiKey: process.env.NEXT_PUBLIC_API_KEY
});

export default CustomerPortalAPI;