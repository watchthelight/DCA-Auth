import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../services/prisma.service';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { AuditService, AuditAction } from '../audit/audit.service';

interface TwoFactorSetupResponse {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

interface VerifyTwoFactorDto {
  userId: string;
  token: string;
  backupCode?: string;
}

@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async setup(userId: string): Promise<TwoFactorSetupResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication already enabled');
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `DCA-Auth (${user.email})`,
      issuer: 'DCA-Auth',
      length: 32,
    });

    // Generate backup codes
    const backupCodes = this.generateBackupCodes(10);

    // Store temporarily (user must verify to enable)
    await this.prisma.twoFactorTemp.upsert({
      where: { userId },
      create: {
        userId,
        secret: secret.base32,
        backupCodes: backupCodes,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
      update: {
        secret: secret.base32,
        backupCodes: backupCodes,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    // Generate QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

    return {
      secret: secret.base32,
      qrCode,
      backupCodes,
    };
  }

  async enable(userId: string, token: string): Promise<void> {
    const tempData = await this.prisma.twoFactorTemp.findUnique({
      where: { userId },
    });

    if (!tempData || tempData.expiresAt < new Date()) {
      throw new BadRequestException('Two-factor setup expired or not found');
    }

    // Verify token
    const verified = speakeasy.totp.verify({
      secret: tempData.secret,
      encoding: 'base32',
      token,
      window: 2,
    });

    if (!verified) {
      throw new BadRequestException('Invalid verification code');
    }

    // Enable 2FA
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: true,
          twoFactorSecret: tempData.secret,
        },
      });

      // Store backup codes (hashed)
      await tx.backupCode.createMany({
        data: tempData.backupCodes.map(code => ({
          userId,
          code: this.hashBackupCode(code),
          used: false,
        })),
      });

      // Clean up temp data
      await tx.twoFactorTemp.delete({
        where: { userId },
      });
    });

    // Audit log
    await this.auditService.log({
      action: AuditAction.TWO_FACTOR_ENABLED,
      userId,
    });
  }

  async verify({ userId, token, backupCode }: VerifyTwoFactorDto): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('Two-factor authentication not enabled');
    }

    // If backup code provided, verify it
    if (backupCode) {
      return this.verifyBackupCode(userId, backupCode);
    }

    // Verify TOTP token
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 2, // Allow 2 time steps before/after
    });

    if (!verified) {
      // Log failed attempt
      await this.auditService.log({
        action: AuditAction.SUSPICIOUS_LOGIN,
        userId,
        metadata: { reason: 'Invalid 2FA token' },
      });
    }

    return verified;
  }

  private async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    const hashedCode = this.hashBackupCode(code);

    const backupCode = await this.prisma.backupCode.findFirst({
      where: {
        userId,
        code: hashedCode,
        used: false,
      },
    });

    if (!backupCode) {
      return false;
    }

    // Mark as used
    await this.prisma.backupCode.update({
      where: { id: backupCode.id },
      data: { used: true, usedAt: new Date() },
    });

    // Log usage
    await this.auditService.log({
      action: AuditAction.USER_LOGIN,
      userId,
      metadata: { method: 'backup_code' },
    });

    return true;
  }

  async disable(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication not enabled');
    }

    // Verify password before disabling 2FA
    const bcrypt = require('bcrypt');
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      throw new UnauthorizedException('Invalid password');
    }

    // Disable 2FA
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
        },
      });

      // Remove backup codes
      await tx.backupCode.deleteMany({
        where: { userId },
      });
    });

    // Audit log
    await this.auditService.log({
      action: AuditAction.TWO_FACTOR_DISABLED,
      userId,
    });
  }

  async regenerateBackupCodes(userId: string, password: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication not enabled');
    }

    // Verify password
    const bcrypt = require('bcrypt');
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      throw new UnauthorizedException('Invalid password');
    }

    const newCodes = this.generateBackupCodes(10);

    await this.prisma.$transaction(async (tx) => {
      // Delete old codes
      await tx.backupCode.deleteMany({
        where: { userId },
      });

      // Create new codes
      await tx.backupCode.createMany({
        data: newCodes.map(code => ({
          userId,
          code: this.hashBackupCode(code),
          used: false,
        })),
      });
    });

    return newCodes;
  }

  async getBackupCodeStatus(userId: string): Promise<any> {
    const codes = await this.prisma.backupCode.findMany({
      where: { userId },
      select: { used: true },
    });

    return {
      total: codes.length,
      used: codes.filter(c => c.used).length,
      remaining: codes.filter(c => !c.used).length,
    };
  }

  private generateBackupCodes(count: number): string[] {
    const codes: string[] = [];
    const crypto = require('crypto');

    for (let i = 0; i < count; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
    }

    return codes;
  }

  private hashBackupCode(code: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  async generateRecoveryCodes(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const recoveryCodes = this.generateBackupCodes(5);

    // Store recovery codes temporarily
    await this.prisma.recoveryCode.createMany({
      data: recoveryCodes.map(code => ({
        userId,
        code: this.hashBackupCode(code),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      })),
    });

    // Could send these via email to user
    return recoveryCodes;
  }

  async recoverAccount(email: string, recoveryCode: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('Invalid recovery attempt');
    }

    const hashedCode = this.hashBackupCode(recoveryCode);

    const validCode = await this.prisma.recoveryCode.findFirst({
      where: {
        userId: user.id,
        code: hashedCode,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!validCode) {
      throw new BadRequestException('Invalid or expired recovery code');
    }

    // Mark code as used
    await this.prisma.recoveryCode.update({
      where: { id: validCode.id },
      data: { used: true },
    });

    // Generate temporary access token for password reset
    const jwt = require('jsonwebtoken');
    const resetToken = jwt.sign(
      { userId: user.id, purpose: 'account_recovery' },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' },
    );

    // Audit log
    await this.auditService.log({
      action: AuditAction.PASSWORD_RESET,
      userId: user.id,
      metadata: { method: 'recovery_code' },
    });

    return resetToken;
  }
}