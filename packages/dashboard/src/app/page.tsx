import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Key, Users, BarChart3, ArrowRight } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold">DCA-Auth</span>
          </div>
          <nav className="flex items-center gap-6">
            <Link href="/features" className="text-sm font-medium hover:text-primary">
              Features
            </Link>
            <Link href="/pricing" className="text-sm font-medium hover:text-primary">
              Pricing
            </Link>
            <Link href="/docs" className="text-sm font-medium hover:text-primary">
              Docs
            </Link>
            <Button asChild variant="outline">
              <Link href="/auth/login">Login</Link>
            </Button>
            <Button asChild>
              <Link href="/auth/register">Get Started</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Discord-Connected Authorization System
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            Enterprise-grade license key management with seamless Discord integration.
            Automate role-based access control and protect your software with confidence.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Button asChild size="lg">
              <Link href="/auth/register">
                Start Free Trial <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/demo">View Demo</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-bold">Key Features</h2>
          <p className="mt-4 text-center text-muted-foreground">
            Everything you need to manage licenses and access control
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <Key className="h-10 w-10 text-primary" />
                <CardTitle>License Management</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Generate, validate, and manage license keys with advanced features like
                  hardware binding and activation limits.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Users className="h-10 w-10 text-primary" />
                <CardTitle>Discord Integration</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Seamless Discord OAuth authentication and automatic role-based
                  license distribution.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Shield className="h-10 w-10 text-primary" />
                <CardTitle>Security First</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Enterprise-grade security with JWT tokens, rate limiting,
                  and comprehensive audit logging.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <BarChart3 className="h-10 w-10 text-primary" />
                <CardTitle>Analytics</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Real-time analytics and insights into license usage,
                  activations, and user behavior.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="container py-24">
        <div className="mx-auto max-w-6xl rounded-lg bg-primary/5 p-12">
          <div className="grid gap-8 text-center sm:grid-cols-3">
            <div>
              <div className="text-4xl font-bold text-primary">10K+</div>
              <div className="mt-2 text-sm text-muted-foreground">Active Licenses</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-primary">500+</div>
              <div className="mt-2 text-sm text-muted-foreground">Discord Servers</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-primary">99.9%</div>
              <div className="mt-2 text-sm text-muted-foreground">Uptime</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold">Ready to Get Started?</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Join thousands of developers using DCA-Auth to manage their software licenses.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Button asChild size="lg">
              <Link href="/auth/register">Create Free Account</Link>
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link href="/contact">Contact Sales</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="container py-12">
          <div className="grid gap-8 sm:grid-cols-4">
            <div>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <span className="font-bold">DCA-Auth</span>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Enterprise-grade license management for Discord communities.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">Product</h3>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li><Link href="/features">Features</Link></li>
                <li><Link href="/pricing">Pricing</Link></li>
                <li><Link href="/docs">Documentation</Link></li>
                <li><Link href="/api">API</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">Company</h3>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li><Link href="/about">About</Link></li>
                <li><Link href="/blog">Blog</Link></li>
                <li><Link href="/contact">Contact</Link></li>
                <li><Link href="/support">Support</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">Legal</h3>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li><Link href="/privacy">Privacy</Link></li>
                <li><Link href="/terms">Terms</Link></li>
                <li><Link href="/cookies">Cookies</Link></li>
                <li><Link href="/license">License</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t pt-8 text-center text-sm text-muted-foreground">
            © 2024 DCA-Auth. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}