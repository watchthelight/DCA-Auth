'use client';

import { motion } from 'framer-motion';
import { Download, FileText, CheckCircle, AlertCircle, Clock } from 'lucide-react';

interface Invoice {
  id: string;
  number: string;
  date: Date;
  dueDate: Date;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'overdue' | 'failed';
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
}

interface InvoiceHistoryProps {
  invoices: Invoice[];
  onDownload?: (invoice: Invoice) => void;
  onView?: (invoice: Invoice) => void;
}

export function InvoiceHistory({ invoices, onDownload, onView }: InvoiceHistoryProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'overdue':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'paid':
        return 'Paid';
      case 'pending':
        return 'Pending';
      case 'overdue':
        return 'Overdue';
      case 'failed':
        return 'Failed';
      default:
        return status;
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold">Invoice History</h3>
      </div>

      <div className="divide-y divide-gray-200">
        {invoices.map((invoice) => (
          <motion.div
            key={invoice.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-4 hover:bg-gray-50 cursor-pointer"
            onClick={() => onView?.(invoice)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-gray-100 rounded">
                  <FileText className="w-5 h-5 text-gray-600" />
                </div>

                <div>
                  <p className="font-medium">Invoice #{invoice.number}</p>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-sm text-gray-500">
                      {new Date(invoice.date).toLocaleDateString()}
                    </span>
                    <span className="text-sm text-gray-500">
                      Due: {new Date(invoice.dueDate).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="font-semibold">
                    {formatCurrency(invoice.amount, invoice.currency)}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    {getStatusIcon(invoice.status)}
                    <span className="text-sm text-gray-600">
                      {getStatusText(invoice.status)}
                    </span>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload?.(invoice);
                  }}
                  className="p-2 text-gray-600 hover:text-gray-900"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {invoices.length === 0 && (
        <div className="p-8 text-center">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500">No invoices yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Your invoices will appear here once you make a purchase
          </p>
        </div>
      )}
    </div>
  );
}