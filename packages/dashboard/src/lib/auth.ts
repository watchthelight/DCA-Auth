/**
 * NextAuth Configuration
 *
 * Authentication configuration using NextAuth with Discord OAuth
 */

import NextAuth from 'next-auth';
import Discord from 'next-auth/providers/discord';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@dca-auth/shared/database/client';
import { UserRole } from '@prisma/client';
import type { NextAuthConfig } from 'next-auth';

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'identify email guilds',
        },
      },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }

      if (token.roles && session.user) {
        session.user.roles = token.roles as UserRole[];
      }

      return session;
    },
    async jwt({ token, user }) {
      if (!token.sub) return token;

      const existingUser = await prisma.user.findUnique({
        where: { id: token.sub },
        select: {
          id: true,
          username: true,
          email: true,
          roles: true,
          status: true,
          isBanned: true,
        },
      });

      if (!existingUser) return token;

      // Check if user is banned
      if (existingUser.isBanned) {
        throw new Error('User is banned');
      }

      token.roles = existingUser.roles;
      token.username = existingUser.username;
      token.status = existingUser.status;

      return token;
    },
  },
  events: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'discord' && profile) {
        // Update user with Discord information
        await prisma.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            avatarHash: (profile as any).avatar,
            discriminator: (profile as any).discriminator,
          },
        });
      }
    },
  },
  pages: {
    signIn: '/auth/login',
    signOut: '/auth/logout',
    error: '/auth/error',
    verifyRequest: '/auth/verify',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  debug: process.env.NODE_ENV === 'development',
};

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth(authConfig);

/**
 * Helper function to get current session
 */
export async function getSession() {
  return await auth();
}

/**
 * Helper function to check if user has required role
 */
export async function hasRole(roles: UserRole[]): Promise<boolean> {
  const session = await getSession();
  if (!session?.user?.roles) return false;

  return roles.some(role => session.user.roles?.includes(role));
}

/**
 * Helper function to require authentication
 */
export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }
  return session;
}

/**
 * Helper function to require specific role
 */
export async function requireRole(roles: UserRole[]) {
  const session = await requireAuth();
  const hasRequiredRole = await hasRole(roles);

  if (!hasRequiredRole) {
    throw new Error('Insufficient permissions');
  }

  return session;
}