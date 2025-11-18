'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Shield } from 'lucide-react';

export function MainNav() {
  const pathname = usePathname();

  return (
    <div className="mr-4 flex">
      <Link href="/dashboard" className="mr-6 flex items-center space-x-2">
        <Shield className="h-6 w-6 text-primary" />
        <span className="font-bold">DCA-Auth</span>
      </Link>
      <nav className="flex items-center space-x-6 text-sm font-medium">
        <Link
          href="/dashboard"
          className={cn(
            'transition-colors hover:text-foreground/80',
            pathname?.startsWith('/dashboard')
              ? 'text-foreground'
              : 'text-foreground/60'
          )}
        >
          Dashboard
        </Link>
        <Link
          href="/docs"
          className={cn(
            'transition-colors hover:text-foreground/80',
            pathname?.startsWith('/docs')
              ? 'text-foreground'
              : 'text-foreground/60'
          )}
        >
          Documentation
        </Link>
        <Link
          href="/api"
          className={cn(
            'transition-colors hover:text-foreground/80',
            pathname?.startsWith('/api')
              ? 'text-foreground'
              : 'text-foreground/60'
          )}
        >
          API
        </Link>
      </nav>
    </div>
  );
}