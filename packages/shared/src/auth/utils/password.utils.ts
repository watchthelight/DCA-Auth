/**
 * Password Utilities
 *
 * Provides secure password hashing, validation, and strength checking
 */

import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import { ValidationError } from '../../errors/index.js';

/**
 * Password validation schema
 */
export const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password must be at most 128 characters long')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character');

/**
 * Password strength levels
 */
export enum PasswordStrength {
  VERY_WEAK = 0,
  WEAK = 1,
  FAIR = 2,
  GOOD = 3,
  STRONG = 4,
  VERY_STRONG = 5,
}

export interface PasswordStrengthResult {
  score: PasswordStrength;
  feedback: string[];
  suggestions: string[];
  isAcceptable: boolean;
}

export class PasswordUtils {
  private static readonly SALT_ROUNDS = 12;
  private static readonly MIN_PASSWORD_LENGTH = 8;
  private static readonly MAX_PASSWORD_LENGTH = 128;

  /**
   * Hash a password using bcrypt
   */
  static async hash(password: string): Promise<string> {
    // Validate password
    const validation = passwordSchema.safeParse(password);
    if (!validation.success) {
      throw new ValidationError(
        'Invalid password',
        validation.error.errors.map(e => ({
          field: 'password',
          message: e.message,
        }))
      );
    }

    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  /**
   * Verify a password against a hash
   */
  static async verify(password: string, hash: string): Promise<boolean> {
    if (!password || !hash) {
      return false;
    }

    return bcrypt.compare(password, hash);
  }

  /**
   * Check password strength
   */
  static checkStrength(password: string): PasswordStrengthResult {
    let score = 0;
    const feedback: string[] = [];
    const suggestions: string[] = [];

    // Length check
    if (password.length < 8) {
      feedback.push('Password is too short');
      suggestions.push('Use at least 8 characters');
    } else if (password.length < 12) {
      score += 1;
    } else if (password.length < 16) {
      score += 2;
    } else {
      score += 3;
    }

    // Character variety checks
    const hasLowercase = /[a-z]/.test(password);
    const hasUppercase = /[A-Z]/.test(password);
    const hasNumbers = /[0-9]/.test(password);
    const hasSpecialChars = /[^a-zA-Z0-9]/.test(password);

    let varietyCount = 0;
    if (hasLowercase) varietyCount++;
    if (hasUppercase) varietyCount++;
    if (hasNumbers) varietyCount++;
    if (hasSpecialChars) varietyCount++;

    if (varietyCount === 1) {
      feedback.push('Password uses only one type of character');
      suggestions.push('Mix uppercase, lowercase, numbers, and symbols');
    } else if (varietyCount === 2) {
      score += 1;
      suggestions.push('Add more character variety for better security');
    } else if (varietyCount === 3) {
      score += 2;
    } else if (varietyCount === 4) {
      score += 3;
    }

    // Common pattern checks
    if (this.hasCommonPatterns(password)) {
      score = Math.max(0, score - 1);
      feedback.push('Password contains common patterns');
      suggestions.push('Avoid common patterns like "123" or "abc"');
    }

    // Sequential character check
    if (this.hasSequentialChars(password)) {
      score = Math.max(0, score - 1);
      feedback.push('Password contains sequential characters');
      suggestions.push('Avoid sequential characters');
    }

    // Repeated character check
    if (this.hasRepeatedChars(password)) {
      score = Math.max(0, score - 1);
      feedback.push('Password contains repeated characters');
      suggestions.push('Avoid repeating characters');
    }

    // Normalize score to 0-5 range
    score = Math.min(5, Math.max(0, score));

    return {
      score: score as PasswordStrength,
      feedback,
      suggestions,
      isAcceptable: score >= PasswordStrength.FAIR && password.length >= this.MIN_PASSWORD_LENGTH,
    };
  }

  /**
   * Generate a secure random password
   */
  static generateSecurePassword(
    length = 16,
    options: {
      uppercase?: boolean;
      lowercase?: boolean;
      numbers?: boolean;
      symbols?: boolean;
    } = {
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: true,
    }
  ): string {
    const charset: string[] = [];

    if (options.uppercase) charset.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    if (options.lowercase) charset.push('abcdefghijklmnopqrstuvwxyz');
    if (options.numbers) charset.push('0123456789');
    if (options.symbols) charset.push('!@#$%^&*()_+-=[]{}|;:,.<>?');

    if (charset.length === 0) {
      throw new Error('At least one character set must be enabled');
    }

    const allChars = charset.join('');
    const passwordArray = new Array(length);

    // Ensure at least one character from each selected charset
    let position = 0;
    for (const chars of charset) {
      if (position < length) {
        const randomIndex = randomBytes(1)[0] % chars.length;
        passwordArray[position] = chars[randomIndex];
        position++;
      }
    }

    // Fill the rest with random characters
    for (let i = position; i < length; i++) {
      const randomIndex = randomBytes(1)[0] % allChars.length;
      passwordArray[i] = allChars[randomIndex];
    }

    // Shuffle the array
    for (let i = passwordArray.length - 1; i > 0; i--) {
      const j = randomBytes(1)[0] % (i + 1);
      [passwordArray[i], passwordArray[j]] = [passwordArray[j], passwordArray[i]];
    }

    return passwordArray.join('');
  }

  /**
   * Generate a password reset token
   */
  static generateResetToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Hash a reset token for storage
   */
  static hashResetToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Check for common patterns in password
   */
  private static hasCommonPatterns(password: string): boolean {
    const commonPatterns = [
      '123', '234', '345', '456', '567', '678', '789',
      'abc', 'bcd', 'cde', 'def', 'efg', 'fgh',
      'qwe', 'wer', 'ert', 'rty', 'tyu', 'yui', 'uio', 'iop',
      'asd', 'sdf', 'dfg', 'fgh', 'ghj', 'hjk', 'jkl',
      'zxc', 'xcv', 'cvb', 'vbn', 'bnm',
      '111', '222', '333', '444', '555', '666', '777', '888', '999', '000',
      'password', 'admin', 'letmein', 'welcome', 'monkey', 'dragon',
    ];

    const lowerPassword = password.toLowerCase();
    return commonPatterns.some(pattern => lowerPassword.includes(pattern));
  }

  /**
   * Check for sequential characters
   */
  private static hasSequentialChars(password: string, threshold = 3): boolean {
    for (let i = 0; i < password.length - threshold + 1; i++) {
      let isSequential = true;
      for (let j = 1; j < threshold; j++) {
        if (password.charCodeAt(i + j) !== password.charCodeAt(i + j - 1) + 1) {
          isSequential = false;
          break;
        }
      }
      if (isSequential) return true;
    }
    return false;
  }

  /**
   * Check for repeated characters
   */
  private static hasRepeatedChars(password: string, threshold = 3): boolean {
    for (let i = 0; i < password.length - threshold + 1; i++) {
      const char = password[i];
      let count = 1;
      for (let j = i + 1; j < password.length && j < i + threshold; j++) {
        if (password[j] === char) {
          count++;
          if (count >= threshold) return true;
        } else {
          break;
        }
      }
    }
    return false;
  }

  /**
   * Validate password against policy
   */
  static validatePolicy(
    password: string,
    policy: {
      minLength?: number;
      maxLength?: number;
      requireUppercase?: boolean;
      requireLowercase?: boolean;
      requireNumbers?: boolean;
      requireSpecialChars?: boolean;
      minStrength?: PasswordStrength;
      forbiddenWords?: string[];
    } = {}
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const {
      minLength = 8,
      maxLength = 128,
      requireUppercase = true,
      requireLowercase = true,
      requireNumbers = true,
      requireSpecialChars = true,
      minStrength = PasswordStrength.FAIR,
      forbiddenWords = [],
    } = policy;

    // Length checks
    if (password.length < minLength) {
      errors.push(`Password must be at least ${minLength} characters long`);
    }
    if (password.length > maxLength) {
      errors.push(`Password must be at most ${maxLength} characters long`);
    }

    // Character requirements
    if (requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (requireNumbers && !/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    if (requireSpecialChars && !/[^a-zA-Z0-9]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    // Strength check
    const strength = this.checkStrength(password);
    if (strength.score < minStrength) {
      errors.push(`Password strength is too weak (minimum: ${PasswordStrength[minStrength]})`);
    }

    // Forbidden words check
    const lowerPassword = password.toLowerCase();
    for (const word of forbiddenWords) {
      if (lowerPassword.includes(word.toLowerCase())) {
        errors.push(`Password cannot contain "${word}"`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}