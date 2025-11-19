'use client';

import { motion } from 'framer-motion';
import { CreditCard, Check, MoreVertical } from 'lucide-react';
import { useState } from 'react';

interface PaymentMethod {
  id: string;
  type: 'card' | 'paypal' | 'bank';
  last4?: string;
  brand?: string;
  email?: string;
  bankName?: string;
  isDefault: boolean;
  expiryMonth?: number;
  expiryYear?: number;
}

interface PaymentMethodCardProps {
  method: PaymentMethod;
  onSetDefault?: (id: string) => void;
  onRemove?: (id: string) => void;
  onEdit?: (id: string) => void;
}

export function PaymentMethodCard({
  method,
  onSetDefault,
  onRemove,
  onEdit
}: PaymentMethodCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  const getCardBrandIcon = (brand?: string) => {
    // In a real app, you'd return actual brand icons
    return <CreditCard className="w-8 h-8 text-gray-600" />;
  };

  const getMethodDisplay = () => {
    switch (method.type) {
      case 'card':
        return (
          <div className="flex items-center gap-3">
            {getCardBrandIcon(method.brand)}
            <div>
              <p className="font-medium">
                {method.brand} •••• {method.last4}
              </p>
              <p className="text-sm text-gray-500">
                Expires {method.expiryMonth}/{method.expiryYear}
              </p>
            </div>
          </div>
        );
      case 'paypal':
        return (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-xs">PP</span>
            </div>
            <div>
              <p className="font-medium">PayPal</p>
              <p className="text-sm text-gray-500">{method.email}</p>
            </div>
          </div>
        );
      case 'bank':
        return (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-xs">B</span>
            </div>
            <div>
              <p className="font-medium">{method.bankName}</p>
              <p className="text-sm text-gray-500">•••• {method.last4}</p>
            </div>
          </div>
        );
    }
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className={`relative bg-white rounded-lg p-4 border ${
        method.isDefault ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
      }`}
    >
      <div className="flex items-center justify-between">
        {getMethodDisplay()}

        <div className="flex items-center gap-2">
          {method.isDefault && (
            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
              Default
            </span>
          )}

          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-8 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                {!method.isDefault && (
                  <button
                    onClick={() => {
                      onSetDefault?.(method.id);
                      setShowMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Set as Default
                  </button>
                )}
                <button
                  onClick={() => {
                    onEdit?.(method.id);
                    setShowMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                >
                  Edit
                </button>
                {!method.isDefault && (
                  <button
                    onClick={() => {
                      onRemove?.(method.id);
                      setShowMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 text-red-600"
                  >
                    Remove
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}