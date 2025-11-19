'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import {
  Copy,
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  Download,
  RefreshCw,
  Shield
} from 'lucide-react';

interface License {
  id: string;
  key: string;
  type: string;
  status: 'active' | 'expired' | 'suspended' | 'revoked';
  product: string;
  activations: number;
  maxActivations: number;
  expiresAt: Date | null;
  createdAt: Date;
  lastValidated: Date;
}

interface LicenseTableProps {
  licenses: License[];
  onEdit?: (license: License) => void;
  onDelete?: (license: License) => void;
  onViewDetails?: (license: License) => void;
}

export function LicenseTable({
  licenses,
  onEdit,
  onDelete,
  onViewDetails
}: LicenseTableProps) {
  const [selectedLicenses, setSelectedLicenses] = useState<string[]>([]);
  const [showActions, setShowActions] = useState<string | null>(null);

  const handleSelectAll = () => {
    if (selectedLicenses.length === licenses.length) {
      setSelectedLicenses([]);
    } else {
      setSelectedLicenses(licenses.map(l => l.id));
    }
  };

  const handleSelect = (id: string) => {
    setSelectedLicenses(prev =>
      prev.includes(id)
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Show toast notification here
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'expired':
        return 'bg-red-100 text-red-800';
      case 'suspended':
        return 'bg-yellow-100 text-yellow-800';
      case 'revoked':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Licenses</h3>

          <div className="flex items-center gap-2">
            {selectedLicenses.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">
                  {selectedLicenses.length} selected
                </span>
                <button className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
                  Bulk Actions
                </button>
              </div>
            )}

            <button className="p-2 text-gray-600 hover:text-gray-900">
              <RefreshCw className="w-4 h-4" />
            </button>

            <button className="p-2 text-gray-600 hover:text-gray-900">
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedLicenses.length === licenses.length}
                  onChange={handleSelectAll}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                License Key
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Product
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Activations
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Expires
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {licenses.map((license) => (
              <motion.tr
                key={license.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="hover:bg-gray-50"
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedLicenses.includes(license.id)}
                    onChange={() => handleSelect(license.id)}
                    className="rounded border-gray-300"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono">
                      {license.key.substring(0, 8)}...
                    </code>
                    <button
                      onClick={() => copyToClipboard(license.key)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm">
                  {license.product}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                    {license.type}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(license.status)}`}>
                    {license.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  {license.activations}/{license.maxActivations}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {license.expiresAt
                    ? new Date(license.expiresAt).toLocaleDateString()
                    : 'Never'}
                </td>
                <td className="px-4 py-3">
                  <div className="relative">
                    <button
                      onClick={() => setShowActions(
                        showActions === license.id ? null : license.id
                      )}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {showActions === license.id && (
                      <div className="absolute right-0 top-8 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                        <button
                          onClick={() => onViewDetails?.(license)}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                        >
                          <Eye className="w-4 h-4" />
                          View Details
                        </button>
                        <button
                          onClick={() => onEdit?.(license)}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                        >
                          <Edit className="w-4 h-4" />
                          Edit
                        </button>
                        <button
                          onClick={() => onDelete?.(license)}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {licenses.length === 0 && (
        <div className="p-8 text-center">
          <Shield className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500">No licenses found</p>
          <p className="text-sm text-gray-400 mt-1">
            Create your first license to get started
          </p>
        </div>
      )}
    </div>
  );
}