'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Key,
  Users,
  Settings,
  BarChart3,
  Shield,
  FileText,
  HelpCircle,
} from 'lucide-react';

const sidebarItems = [
  {
    title: 'Overview',
    href: '/dashboard/overview',
    icon: LayoutDashboard,
  },
  {
    title: 'Licenses',
    href: '/dashboard/licenses',
    icon: Key,
  },
  {
    title: 'Users',
    href: '/dashboard/users',
    icon: Users,
  },
  {
    title: 'Analytics',
    href: '/dashboard/analytics',
    icon: BarChart3,
  },
  {
    title: 'Security',
    href: '/dashboard/security',
    icon: Shield,
  },
  {
    title: 'Audit Logs',
    href: '/dashboard/audit',
    icon: FileText,
  },
  {
    title: 'Settings',
    href: '/dashboard/settings',
    icon: Settings,
  },
  {
    title: 'Help',
    href: '/dashboard/help',
    icon: HelpCircle,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-2 p-4">
      {sidebarItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all hover:bg-accent',
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-primary'
            )}
          >
            <Icon className="h-4 w-4" />
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}