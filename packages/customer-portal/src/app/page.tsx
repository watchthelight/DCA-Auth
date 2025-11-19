'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  CreditCard,
  FileText,
  Key,
  Settings,
  HelpCircle,
  Download,
  Activity,
  Shield,
  Users,
  Package,
  TrendingUp,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { DCAAuthClient } from '@dca-auth/sdk';
import { format } from 'date-fns';

// Components
import { DashboardCard } from '../components/DashboardCard';
import { LicenseTable } from '../components/LicenseTable';
import { UsageChart } from '../components/UsageChart';
import { RecentActivity } from '../components/RecentActivity';
import { SupportTickets } from '../components/SupportTickets';
import { QuickActions } from '../components/QuickActions';
import { BillingOverview } from '../components/BillingOverview';
import { SecurityStatus } from '../components/SecurityStatus';
import { TeamMembers } from '../components/TeamMembers';

export default function CustomerPortal() {
  const [client, setClient] = useState<DCAAuthClient | null>(null);
  const [selectedTab, setSelectedTab] = useState('overview');

  useEffect(() => {
    const authClient = new DCAAuthClient({
      apiUrl: process.env.NEXT_PUBLIC_API_URL,
      autoRefreshToken: true,
    });
    setClient(authClient);
  }, []);

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      if (!client) return null;

      // Fetch all dashboard data
      const [licenses, usage, billing, tickets, activity] = await Promise.all([
        client.licenses.list({ limit: 100 }),
        client.analytics.getUsage(),
        client.billing.getOverview(),
        client.support.getTickets({ status: 'open' }),
        client.activity.getRecent({ limit: 10 }),
      ]);

      return {
        licenses,
        usage,
        billing,
        tickets,
        activity,
      };
    },
    enabled: !!client,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const stats = [
    {
      title: 'Active Licenses',
      value: dashboardData?.licenses?.data.filter(l => l.status === 'ACTIVE').length || 0,
      change: '+12%',
      icon: Key,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      title: 'Total Usage',
      value: dashboardData?.usage?.total || '0',
      change: '+8.2%',
      icon: Activity,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: 'Current Billing',
      value: `$${dashboardData?.billing?.currentAmount || '0'}`,
      change: '-5%',
      icon: CreditCard,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      title: 'Support Tickets',
      value: dashboardData?.tickets?.length || 0,
      change: '2 new',
      icon: HelpCircle,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
  ];

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'licenses', label: 'Licenses', icon: Key },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'team', label: 'Team', icon: Users },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'support', label: 'Support', icon: HelpCircle },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Customer Portal</h1>
              <p className="text-gray-600 mt-1">
                Welcome back! Here's your account overview.
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <QuickActions client={client} />
              <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
                Contact Support
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedTab(tab.id)}
                className={`
                  flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm
                  ${selectedTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <tab.icon className="w-5 h-5" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <>
            {selectedTab === 'overview' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-8"
              >
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {stats.map((stat, index) => (
                    <DashboardCard key={index} {...stat} />
                  ))}
                </div>

                {/* Charts and Tables */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-white rounded-xl shadow-sm p-6">
                    <h3 className="text-lg font-semibold mb-4">Usage Trends</h3>
                    <UsageChart data={dashboardData?.usage?.history} />
                  </div>

                  <div className="bg-white rounded-xl shadow-sm p-6">
                    <h3 className="text-lg font-semibold mb-4">Billing Overview</h3>
                    <BillingOverview data={dashboardData?.billing} />
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
                  <RecentActivity activities={dashboardData?.activity} />
                </div>
              </motion.div>
            )}

            {selectedTab === 'licenses' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <LicenseManagement client={client} licenses={dashboardData?.licenses} />
              </motion.div>
            )}

            {selectedTab === 'billing' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <BillingManagement client={client} billing={dashboardData?.billing} />
              </motion.div>
            )}

            {selectedTab === 'team' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <TeamManagement client={client} />
              </motion.div>
            )}

            {selectedTab === 'security' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <SecurityCenter client={client} />
              </motion.div>
            )}

            {selectedTab === 'support' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <SupportCenter client={client} tickets={dashboardData?.tickets} />
              </motion.div>
            )}

            {selectedTab === 'settings' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <AccountSettings client={client} />
              </motion.div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex justify-between items-center">
            <div className="text-gray-600 text-sm">
              © 2024 DCA-Auth. All rights reserved.
            </div>
            <div className="flex space-x-6 text-sm">
              <a href="/docs" className="text-gray-600 hover:text-gray-900">Documentation</a>
              <a href="/api" className="text-gray-600 hover:text-gray-900">API Reference</a>
              <a href="/status" className="text-gray-600 hover:text-gray-900">System Status</a>
              <a href="/privacy" className="text-gray-600 hover:text-gray-900">Privacy Policy</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// License Management Component
function LicenseManagement({ client, licenses }: any) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">License Management</h2>
        <div className="flex space-x-3">
          <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            <Download className="w-4 h-4 inline mr-2" />
            Export
          </button>
          <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            Purchase Licenses
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm">
        <LicenseTable licenses={licenses?.data || []} client={client} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="font-semibold mb-4">License Distribution</h3>
          <LicenseDistributionChart licenses={licenses?.data || []} />
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="font-semibold mb-4">Activation Metrics</h3>
          <ActivationMetrics licenses={licenses?.data || []} />
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="font-semibold mb-4">Expiring Soon</h3>
          <ExpiringLicenses licenses={licenses?.data || []} />
        </div>
      </div>
    </div>
  );
}

// Billing Management Component
function BillingManagement({ client, billing }: any) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Billing & Payments</h2>
        <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          Update Payment Method
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <CurrentPlan billing={billing} />
          <InvoiceHistory client={client} />
          <PaymentMethods client={client} />
        </div>

        <div className="space-y-6">
          <UpcomingCharges billing={billing} />
          <UsageCredits billing={billing} />
          <BillingAlerts />
        </div>
      </div>
    </div>
  );
}

// Team Management Component
function TeamManagement({ client }: any) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Team Management</h2>
        <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          Invite Team Member
        </button>
      </div>

      <TeamMembers client={client} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RoleManagement client={client} />
        <AccessLogs client={client} />
      </div>
    </div>
  );
}

// Security Center Component
function SecurityCenter({ client }: any) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Security Center</h2>

      <SecurityStatus client={client} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TwoFactorAuth client={client} />
        <APIKeys client={client} />
        <AuditLog client={client} />
        <SecurityAlerts client={client} />
      </div>
    </div>
  );
}

// Support Center Component
function SupportCenter({ client, tickets }: any) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Support Center</h2>
        <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          Create Ticket
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SupportTickets tickets={tickets} client={client} />
        </div>

        <div className="space-y-6">
          <KnowledgeBase />
          <SystemStatus />
          <ContactSupport />
        </div>
      </div>
    </div>
  );
}

// Account Settings Component
function AccountSettings({ client }: any) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Account Settings</h2>

      <div className="bg-white rounded-xl shadow-sm">
        <ProfileSettings client={client} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <NotificationPreferences client={client} />
        <IntegrationSettings client={client} />
        <DataExport client={client} />
        <AccountDeletion client={client} />
      </div>
    </div>
  );
}

// Placeholder components for the sections
function LicenseDistributionChart({ licenses }: any) {
  return <div>License distribution chart</div>;
}

function ActivationMetrics({ licenses }: any) {
  return <div>Activation metrics</div>;
}

function ExpiringLicenses({ licenses }: any) {
  return <div>Expiring licenses list</div>;
}

function CurrentPlan({ billing }: any) {
  return <div className="bg-white rounded-xl shadow-sm p-6">Current plan details</div>;
}

function InvoiceHistory({ client }: any) {
  return <div className="bg-white rounded-xl shadow-sm p-6">Invoice history</div>;
}

function PaymentMethods({ client }: any) {
  return <div className="bg-white rounded-xl shadow-sm p-6">Payment methods</div>;
}

function UpcomingCharges({ billing }: any) {
  return <div className="bg-white rounded-xl shadow-sm p-6">Upcoming charges</div>;
}

function UsageCredits({ billing }: any) {
  return <div className="bg-white rounded-xl shadow-sm p-6">Usage credits</div>;
}

function BillingAlerts() {
  return <div className="bg-white rounded-xl shadow-sm p-6">Billing alerts</div>;
}

function RoleManagement({ client }: any) {
  return <div className="bg-white rounded-xl shadow-sm p-6">Role management</div>;
}

function AccessLogs({ client }: any) {
  return <div className="bg-white rounded-xl shadow-sm p-6">Access logs</div>;
}

function TwoFactorAuth({ client }: any) {
  return <div className="bg-white rounded-xl shadow-sm p-6">Two-factor authentication</div>;
}

function APIKeys({ client }: any) {
  return <div className="bg-white rounded-xl shadow-sm p-6">API keys</div>;
}

function AuditLog({ client }: any) {
  return <div className="bg-white rounded-xl shadow-sm p-6">Audit log</div>;
}

function SecurityAlerts({ client }: any) {
  return <div className="bg-white rounded-xl shadow-sm p-6">Security alerts</div>;
}

function KnowledgeBase() {
  return <div className="bg-white rounded-xl shadow-sm p-6">Knowledge base</div>;
}

function SystemStatus() {
  return <div className="bg-white rounded-xl shadow-sm p-6">System status</div>;
}

function ContactSupport() {
  return <div className="bg-white rounded-xl shadow-sm p-6">Contact support</div>;
}

function ProfileSettings({ client }: any) {
  return <div className="p-6">Profile settings</div>;
}

function NotificationPreferences({ client }: any) {
  return <div className="bg-white rounded-xl shadow-sm p-6">Notification preferences</div>;
}

function IntegrationSettings({ client }: any) {
  return <div className="bg-white rounded-xl shadow-sm p-6">Integration settings</div>;
}

function DataExport({ client }: any) {
  return <div className="bg-white rounded-xl shadow-sm p-6">Data export</div>;
}

function AccountDeletion({ client }: any) {
  return <div className="bg-white rounded-xl shadow-sm p-6">Account deletion</div>;
}