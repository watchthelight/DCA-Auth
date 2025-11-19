import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '../lib/api-client';

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: string;
  organization: {
    id: string;
    name: string;
    plan: string;
  };
}

interface DashboardStats {
  totalLicenses: number;
  activeLicenses: number;
  totalUsers: number;
  monthlyValidations: number;
  revenue: {
    current: number;
    previous: number;
    change: number;
  };
}

interface PortalStore {
  // User & Auth
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Dashboard
  dashboardStats: DashboardStats | null;
  usageData: any[];

  // Licenses
  licenses: any[];
  selectedLicense: any | null;

  // Billing
  paymentMethods: any[];
  invoices: any[];
  subscription: any | null;

  // Team
  teamMembers: any[];

  // Security
  auditEvents: any[];
  securitySettings: any | null;
  apiKeys: any[];

  // Support
  tickets: any[];
  selectedTicket: any | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;

  // Dashboard Actions
  fetchDashboardStats: () => Promise<void>;
  fetchUsageData: (period: string) => Promise<void>;

  // License Actions
  fetchLicenses: (params?: any) => Promise<void>;
  createLicense: (data: any) => Promise<void>;
  updateLicense: (id: string, updates: any) => Promise<void>;
  revokeLicense: (id: string, reason?: string) => Promise<void>;

  // Billing Actions
  fetchPaymentMethods: () => Promise<void>;
  addPaymentMethod: (data: any) => Promise<void>;
  removePaymentMethod: (id: string) => Promise<void>;
  fetchInvoices: (params?: any) => Promise<void>;
  fetchSubscription: () => Promise<void>;
  updateSubscription: (planId: string) => Promise<void>;
  cancelSubscription: (reason?: string) => Promise<void>;

  // Team Actions
  fetchTeamMembers: (params?: any) => Promise<void>;
  inviteTeamMember: (data: any) => Promise<void>;
  updateTeamMember: (id: string, updates: any) => Promise<void>;
  removeTeamMember: (id: string) => Promise<void>;

  // Security Actions
  fetchAuditLog: (params?: any) => Promise<void>;
  exportAuditLog: (format: string) => Promise<void>;
  fetchSecuritySettings: () => Promise<void>;
  updateSecuritySettings: (settings: any) => Promise<void>;
  enableTwoFactor: () => Promise<void>;
  disableTwoFactor: (code: string) => Promise<void>;
  fetchApiKeys: () => Promise<void>;
  createApiKey: (data: any) => Promise<void>;
  revokeApiKey: (id: string) => Promise<void>;

  // Support Actions
  fetchTickets: (params?: any) => Promise<void>;
  createTicket: (data: any) => Promise<void>;
  fetchTicketMessages: (ticketId: string) => Promise<void>;
  sendTicketMessage: (ticketId: string, message: string, attachments?: File[]) => Promise<void>;
}

export const usePortalStore = create<PortalStore>()(
  persist(
    (set, get) => ({
      // Initial State
      user: null,
      isAuthenticated: false,
      isLoading: false,
      dashboardStats: null,
      usageData: [],
      licenses: [],
      selectedLicense: null,
      paymentMethods: [],
      invoices: [],
      subscription: null,
      teamMembers: [],
      auditEvents: [],
      securitySettings: null,
      apiKeys: [],
      tickets: [],
      selectedTicket: null,

      // Auth Actions
      login: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          // In a real app, this would call an auth endpoint
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });

          const data = await response.json();

          if (data.success) {
            apiClient.setAccessToken(data.accessToken);
            set({
              user: data.user,
              isAuthenticated: true,
              isLoading: false
            });
          } else {
            throw new Error(data.message || 'Login failed');
          }
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        try {
          await fetch('/api/auth/logout', { method: 'POST' });
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          set({
            user: null,
            isAuthenticated: false,
            dashboardStats: null,
            usageData: [],
            licenses: [],
            selectedLicense: null
          });
        }
      },

      // Dashboard Actions
      fetchDashboardStats: async () => {
        try {
          const stats = await apiClient.getDashboardStats();
          set({ dashboardStats: stats });
        } catch (error) {
          console.error('Failed to fetch dashboard stats:', error);
        }
      },

      fetchUsageData: async (period: string) => {
        try {
          const data = await apiClient.getUsageData(period as any);
          set({ usageData: data });
        } catch (error) {
          console.error('Failed to fetch usage data:', error);
        }
      },

      // License Actions
      fetchLicenses: async (params) => {
        try {
          const licenses = await apiClient.getLicenses(params);
          set({ licenses });
        } catch (error) {
          console.error('Failed to fetch licenses:', error);
        }
      },

      createLicense: async (data) => {
        try {
          const license = await apiClient.createLicense(data);
          set((state) => ({
            licenses: [...state.licenses, license]
          }));
        } catch (error) {
          console.error('Failed to create license:', error);
          throw error;
        }
      },

      updateLicense: async (id, updates) => {
        try {
          const updated = await apiClient.updateLicense(id, updates);
          set((state) => ({
            licenses: state.licenses.map(l =>
              l.id === id ? updated : l
            )
          }));
        } catch (error) {
          console.error('Failed to update license:', error);
          throw error;
        }
      },

      revokeLicense: async (id, reason) => {
        try {
          await apiClient.revokeLicense(id, reason);
          set((state) => ({
            licenses: state.licenses.map(l =>
              l.id === id ? { ...l, status: 'revoked' } : l
            )
          }));
        } catch (error) {
          console.error('Failed to revoke license:', error);
          throw error;
        }
      },

      // Billing Actions
      fetchPaymentMethods: async () => {
        try {
          const methods = await apiClient.getPaymentMethods();
          set({ paymentMethods: methods });
        } catch (error) {
          console.error('Failed to fetch payment methods:', error);
        }
      },

      addPaymentMethod: async (data) => {
        try {
          const method = await apiClient.addPaymentMethod(data);
          set((state) => ({
            paymentMethods: [...state.paymentMethods, method]
          }));
        } catch (error) {
          console.error('Failed to add payment method:', error);
          throw error;
        }
      },

      removePaymentMethod: async (id) => {
        try {
          await apiClient.removePaymentMethod(id);
          set((state) => ({
            paymentMethods: state.paymentMethods.filter(m => m.id !== id)
          }));
        } catch (error) {
          console.error('Failed to remove payment method:', error);
          throw error;
        }
      },

      fetchInvoices: async (params) => {
        try {
          const invoices = await apiClient.getInvoices(params);
          set({ invoices });
        } catch (error) {
          console.error('Failed to fetch invoices:', error);
        }
      },

      fetchSubscription: async () => {
        try {
          const subscription = await apiClient.getSubscription();
          set({ subscription });
        } catch (error) {
          console.error('Failed to fetch subscription:', error);
        }
      },

      updateSubscription: async (planId) => {
        try {
          const subscription = await apiClient.updateSubscription(planId);
          set({ subscription });
        } catch (error) {
          console.error('Failed to update subscription:', error);
          throw error;
        }
      },

      cancelSubscription: async (reason) => {
        try {
          await apiClient.cancelSubscription(reason);
          set({ subscription: null });
        } catch (error) {
          console.error('Failed to cancel subscription:', error);
          throw error;
        }
      },

      // Team Actions
      fetchTeamMembers: async (params) => {
        try {
          const members = await apiClient.getTeamMembers(params);
          set({ teamMembers: members });
        } catch (error) {
          console.error('Failed to fetch team members:', error);
        }
      },

      inviteTeamMember: async (data) => {
        try {
          const member = await apiClient.inviteTeamMember(data);
          set((state) => ({
            teamMembers: [...state.teamMembers, member]
          }));
        } catch (error) {
          console.error('Failed to invite team member:', error);
          throw error;
        }
      },

      updateTeamMember: async (id, updates) => {
        try {
          const updated = await apiClient.updateTeamMember(id, updates);
          set((state) => ({
            teamMembers: state.teamMembers.map(m =>
              m.id === id ? updated : m
            )
          }));
        } catch (error) {
          console.error('Failed to update team member:', error);
          throw error;
        }
      },

      removeTeamMember: async (id) => {
        try {
          await apiClient.removeTeamMember(id);
          set((state) => ({
            teamMembers: state.teamMembers.filter(m => m.id !== id)
          }));
        } catch (error) {
          console.error('Failed to remove team member:', error);
          throw error;
        }
      },

      // Security Actions
      fetchAuditLog: async (params) => {
        try {
          const events = await apiClient.getAuditLog(params);
          set({ auditEvents: events });
        } catch (error) {
          console.error('Failed to fetch audit log:', error);
        }
      },

      exportAuditLog: async (format) => {
        try {
          const blob = await apiClient.exportAuditLog(format as any);
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `audit-log.${format}`;
          a.click();
          window.URL.revokeObjectURL(url);
        } catch (error) {
          console.error('Failed to export audit log:', error);
          throw error;
        }
      },

      fetchSecuritySettings: async () => {
        try {
          const settings = await apiClient.getSecuritySettings();
          set({ securitySettings: settings });
        } catch (error) {
          console.error('Failed to fetch security settings:', error);
        }
      },

      updateSecuritySettings: async (settings) => {
        try {
          const updated = await apiClient.updateSecuritySettings(settings);
          set({ securitySettings: updated });
        } catch (error) {
          console.error('Failed to update security settings:', error);
          throw error;
        }
      },

      enableTwoFactor: async () => {
        try {
          const result = await apiClient.enableTwoFactor();
          return result;
        } catch (error) {
          console.error('Failed to enable 2FA:', error);
          throw error;
        }
      },

      disableTwoFactor: async (code) => {
        try {
          await apiClient.disableTwoFactor(code);
        } catch (error) {
          console.error('Failed to disable 2FA:', error);
          throw error;
        }
      },

      fetchApiKeys: async () => {
        try {
          const keys = await apiClient.getApiKeys();
          set({ apiKeys: keys });
        } catch (error) {
          console.error('Failed to fetch API keys:', error);
        }
      },

      createApiKey: async (data) => {
        try {
          const key = await apiClient.createApiKey(data);
          set((state) => ({
            apiKeys: [...state.apiKeys, key]
          }));
          return key;
        } catch (error) {
          console.error('Failed to create API key:', error);
          throw error;
        }
      },

      revokeApiKey: async (id) => {
        try {
          await apiClient.revokeApiKey(id);
          set((state) => ({
            apiKeys: state.apiKeys.filter(k => k.id !== id)
          }));
        } catch (error) {
          console.error('Failed to revoke API key:', error);
          throw error;
        }
      },

      // Support Actions
      fetchTickets: async (params) => {
        try {
          const tickets = await apiClient.getSupportTickets(params);
          set({ tickets });
        } catch (error) {
          console.error('Failed to fetch tickets:', error);
        }
      },

      createTicket: async (data) => {
        try {
          const ticket = await apiClient.createSupportTicket(data);
          set((state) => ({
            tickets: [...state.tickets, ticket]
          }));
          return ticket;
        } catch (error) {
          console.error('Failed to create ticket:', error);
          throw error;
        }
      },

      fetchTicketMessages: async (ticketId) => {
        try {
          const messages = await apiClient.getTicketMessages(ticketId);
          return messages;
        } catch (error) {
          console.error('Failed to fetch ticket messages:', error);
          throw error;
        }
      },

      sendTicketMessage: async (ticketId, message, attachments) => {
        try {
          const result = await apiClient.sendTicketMessage(ticketId, message, attachments);
          return result;
        } catch (error) {
          console.error('Failed to send ticket message:', error);
          throw error;
        }
      }
    }),
    {
      name: 'portal-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
);