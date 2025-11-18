/**
 * JWT Service
 *
 * Handles JSON Web Token generation, validation, and management
 * for authentication and authorization.
 */

import jwt, { JwtPayload, SignOptions, VerifyOptions } from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import { config } from '../../config/index.js';
import { logger } from '../../logging/logger.js';
import { AuthError } from '../../errors/index.js';
import { TokenPayload } from '../../database/types/session.types.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface DecodedToken extends JwtPayload {
  sub: string;
  sid: string;
  jti: string;
  type: 'access' | 'refresh';
  roles?: string[];
  permissions?: string[];
  fingerprint?: string;
}

export class JWTService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresIn: string;
  private readonly issuer: string;
  private readonly audience: string;

  constructor() {
    this.accessSecret = config.auth.jwt.accessSecret;
    this.refreshSecret = config.auth.jwt.refreshSecret;
    this.accessExpiresIn = config.auth.jwt.accessExpiresIn;
    this.refreshExpiresIn = config.auth.jwt.refreshExpiresIn;
    this.issuer = config.auth.jwt.issuer;
    this.audience = config.auth.jwt.audience;
  }

  /**
   * Generate a token pair (access and refresh tokens)
   */
  async generateTokenPair(
    userId: string,
    sessionId: string,
    roles?: string[],
    permissions?: string[],
    fingerprint?: string
  ): Promise<TokenPair> {
    try {
      const jti = this.generateJTI();
      const now = Math.floor(Date.now() / 1000);

      // Generate access token
      const accessPayload: TokenPayload = {
        sub: userId,
        sid: sessionId,
        jti: `${jti}-access`,
        iat: now,
        exp: now + this.parseExpiresIn(this.accessExpiresIn),
        type: 'access',
        roles,
        permissions,
        fingerprint: fingerprint ? this.hashFingerprint(fingerprint) : undefined,
      };

      const accessToken = jwt.sign(accessPayload, this.accessSecret, {
        issuer: this.issuer,
        audience: this.audience,
        algorithm: 'HS256',
      } as SignOptions);

      // Generate refresh token
      const refreshPayload: TokenPayload = {
        sub: userId,
        sid: sessionId,
        jti: `${jti}-refresh`,
        iat: now,
        exp: now + this.parseExpiresIn(this.refreshExpiresIn),
        type: 'refresh',
        fingerprint: fingerprint ? this.hashFingerprint(fingerprint) : undefined,
      };

      const refreshToken = jwt.sign(refreshPayload, this.refreshSecret, {
        issuer: this.issuer,
        audience: this.audience,
        algorithm: 'HS256',
      } as SignOptions);

      logger.debug('Token pair generated', {
        userId,
        sessionId,
        jti,
        hasFingerprint: !!fingerprint,
      });

      return {
        accessToken,
        refreshToken,
        expiresIn: this.parseExpiresIn(this.accessExpiresIn),
        tokenType: 'Bearer',
      };
    } catch (error) {
      logger.error('Failed to generate token pair', error, { userId, sessionId });
      throw new AuthError('Failed to generate tokens', 'TOKEN_GENERATION_FAILED');
    }
  }

  /**
   * Verify and decode an access token
   */
  async verifyAccessToken(token: string, fingerprint?: string): Promise<DecodedToken> {
    try {
      const decoded = jwt.verify(token, this.accessSecret, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['HS256'],
      } as VerifyOptions) as DecodedToken;

      // Check token type
      if (decoded.type !== 'access') {
        throw new AuthError('Invalid token type', 'INVALID_TOKEN_TYPE');
      }

      // Verify fingerprint if provided
      if (fingerprint && decoded.fingerprint) {
        const hashedFingerprint = this.hashFingerprint(fingerprint);
        if (hashedFingerprint !== decoded.fingerprint) {
          throw new AuthError('Token fingerprint mismatch', 'FINGERPRINT_MISMATCH');
        }
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthError('Access token expired', 'TOKEN_EXPIRED');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthError('Invalid access token', 'INVALID_TOKEN');
      }
      throw error;
    }
  }

  /**
   * Verify and decode a refresh token
   */
  async verifyRefreshToken(token: string, fingerprint?: string): Promise<DecodedToken> {
    try {
      const decoded = jwt.verify(token, this.refreshSecret, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['HS256'],
      } as VerifyOptions) as DecodedToken;

      // Check token type
      if (decoded.type !== 'refresh') {
        throw new AuthError('Invalid token type', 'INVALID_TOKEN_TYPE');
      }

      // Verify fingerprint if provided
      if (fingerprint && decoded.fingerprint) {
        const hashedFingerprint = this.hashFingerprint(fingerprint);
        if (hashedFingerprint !== decoded.fingerprint) {
          throw new AuthError('Token fingerprint mismatch', 'FINGERPRINT_MISMATCH');
        }
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthError('Refresh token expired', 'TOKEN_EXPIRED');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthError('Invalid refresh token', 'INVALID_TOKEN');
      }
      throw error;
    }
  }

  /**
   * Decode a token without verification (for debugging/logging)
   */
  decodeToken(token: string): DecodedToken | null {
    try {
      return jwt.decode(token) as DecodedToken;
    } catch {
      return null;
    }
  }

  /**
   * Generate a secure random token
   */
  generateSecureToken(length = 32): string {
    return randomBytes(length).toString('hex');
  }

  /**
   * Generate a JWT ID (JTI)
   */
  private generateJTI(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Hash a fingerprint for storage in token
   */
  private hashFingerprint(fingerprint: string): string {
    return createHash('sha256').update(fingerprint).digest('hex');
  }

  /**
   * Parse expires in string to seconds
   */
  private parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid expiresIn format: ${expiresIn}`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 60 * 60 * 24;
      default:
        throw new Error(`Invalid time unit: ${unit}`);
    }
  }

  /**
   * Hash an access token for storage
   */
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Generate a token family ID for refresh token rotation
   */
  generateTokenFamily(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Create a short-lived token for specific actions (password reset, email verification, etc.)
   */
  async createActionToken(
    userId: string,
    action: string,
    data?: Record<string, any>,
    expiresIn = '1h'
  ): Promise<string> {
    const payload = {
      sub: userId,
      action,
      data,
      jti: this.generateJTI(),
      iat: Math.floor(Date.now() / 1000),
    };

    return jwt.sign(payload, this.accessSecret, {
      expiresIn,
      issuer: this.issuer,
      audience: this.audience,
      algorithm: 'HS256',
    } as SignOptions);
  }

  /**
   * Verify an action token
   */
  async verifyActionToken(token: string, expectedAction: string): Promise<JwtPayload> {
    try {
      const decoded = jwt.verify(token, this.accessSecret, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['HS256'],
      } as VerifyOptions) as JwtPayload & { action: string };

      if (decoded.action !== expectedAction) {
        throw new AuthError('Invalid action token', 'INVALID_ACTION');
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthError('Action token expired', 'TOKEN_EXPIRED');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthError('Invalid action token', 'INVALID_TOKEN');
      }
      throw error;
    }
  }
}

// Export singleton instance
export const jwtService = new JWTService();