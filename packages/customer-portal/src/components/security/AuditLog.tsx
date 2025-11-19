'use client';

import { motion } from 'framer-motion';
import {
  Shield,
  Key,
  User,
  FileText,
  AlertTriangle,
  CheckCircle,
  Info,
  XCircle,
  Download,
  Filter
} from 'lucide-react';
import { useState } from 'react';

interface AuditEvent {
  id: string;
  type: 'auth' | 'license' | 'team' | 'billing' | 'security';
  action: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  timestamp: Date;
  user: {
    id: string;
    name: string;
    email: string;
  };
  ipAddress: string;
  userAgent: string;
  details: Record<string, any>;
  metadata?: {
    location?: string;
    device?: string;
  };
}

interface AuditLogProps {
  events: AuditEvent[];
  onExport?: () => void;
  onFilter?: (filters: any) => void;
}

export function AuditLog({ events, onExport, onFilter }: AuditLogProps) {
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedSeverity, setSelectedSeverity] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'auth':
        return <Key className="w-4 h-4" />;
      case 'license':
        return <FileText className="w-4 h-4" />;
      case 'team':
        return <User className="w-4 h-4" />;
      case 'billing':
        return <FileText className="w-4 h-4" />;
      case 'security':
        return <Shield className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4" />;
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'info':
        return <Info className="w-4 h-4 text-blue-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'critical':
        return <AlertTriangle className="w-4 h-4 text-red-700" />;
      default:
        return <Info className="w-4 h-4 text-gray-500" />;
    }
  };

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case 'auth':
        return 'bg-blue-100 text-blue-800';
      case 'license':
        return 'bg-green-100 text-green-800';
      case 'team':
        return 'bg-purple-100 text-purple-800';
      case 'billing':
        return 'bg-yellow-100 text-yellow-800';
      case 'security':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatTimestamp = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(date));
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Audit Log</h3>
            <p className="text-sm text-gray-600 mt-1">
              Track all activity in your organization
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-2"
            >
              <Filter className="w-4 h-4" />
              Filter
            </button>
            <button
              onClick={onExport}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Event Type
                </label>
                <div className="space-y-2">
                  {['auth', 'license', 'team', 'billing', 'security'].map((type) => (
                    <label key={type} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedTypes.includes(type)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTypes([...selectedTypes, type]);
                          } else {
                            setSelectedTypes(selectedTypes.filter((t) => t !== type));
                          }
                        }}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm capitalize">{type}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Severity
                </label>
                <div className="space-y-2">
                  {['info', 'warning', 'error', 'critical'].map((severity) => (
                    <label key={severity} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedSeverity.includes(severity)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedSeverity([...selectedSeverity, severity]);
                          } else {
                            setSelectedSeverity(
                              selectedSeverity.filter((s) => s !== severity)
                            );
                          }
                        }}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm capitalize">{severity}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end mt-3 gap-2">
              <button
                onClick={() => {
                  setSelectedTypes([]);
                  setSelectedSeverity([]);
                }}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900"
              >
                Clear
              </button>
              <button
                onClick={() => {
                  onFilter?.({ types: selectedTypes, severity: selectedSeverity });
                  setShowFilters(false);
                }}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Apply Filters
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="divide-y divide-gray-200">
        {events.map((event) => (
          <motion.div
            key={event.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-4 hover:bg-gray-50"
          >
            <div className="flex items-start gap-4">
              <div className="mt-1">{getSeverityIcon(event.severity)}</div>

              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${getEventTypeColor(event.type)}`}>
                        {event.type}
                      </span>
                      <p className="font-medium">{event.action}</p>
                    </div>

                    <div className="mt-1 text-sm text-gray-600">
                      <span>{event.user.name}</span>
                      <span className="mx-2">•</span>
                      <span>{event.user.email}</span>
                    </div>

                    {Object.keys(event.details).length > 0 && (
                      <div className="mt-2 p-2 bg-gray-50 rounded text-xs font-mono">
                        {JSON.stringify(event.details, null, 2)}
                      </div>
                    )}

                    <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                      <span>IP: {event.ipAddress}</span>
                      {event.metadata?.location && (
                        <span>Location: {event.metadata.location}</span>
                      )}
                      {event.metadata?.device && (
                        <span>Device: {event.metadata.device}</span>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-sm text-gray-500">
                      {formatTimestamp(event.timestamp)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {events.length === 0 && (
        <div className="p-8 text-center">
          <Shield className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500">No audit events found</p>
          <p className="text-sm text-gray-400 mt-1">
            Activity will be logged here as it occurs
          </p>
        </div>
      )}
    </div>
  );
}