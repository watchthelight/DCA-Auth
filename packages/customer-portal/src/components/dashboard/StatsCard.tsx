'use client';

import { motion } from 'framer-motion';
import { ArrowUp, ArrowDown } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down';
  icon: React.ReactNode;
  color?: string;
}

export function StatsCard({
  title,
  value,
  change,
  trend,
  icon,
  color = 'blue'
}: StatsCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className="bg-white rounded-lg shadow-sm p-6 border border-gray-200"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-semibold mt-2">{value}</p>

          {change !== undefined && (
            <div className="flex items-center mt-2">
              {trend === 'up' ? (
                <ArrowUp className="w-4 h-4 text-green-500" />
              ) : (
                <ArrowDown className="w-4 h-4 text-red-500" />
              )}
              <span className={`text-sm ml-1 ${
                trend === 'up' ? 'text-green-500' : 'text-red-500'
              }`}>
                {Math.abs(change)}%
              </span>
            </div>
          )}
        </div>

        <div className={`p-3 rounded-lg bg-${color}-50`}>
          {icon}
        </div>
      </div>
    </motion.div>
  );
}