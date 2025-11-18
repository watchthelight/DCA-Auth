/**
 * License Key Generation Service
 *
 * Handles generation and formatting of license keys
 */

import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { GenerateLicenseKeyOptions } from '../../database/types/license.types.js';
import { logger } from '../../logging/logger.js';

export class KeyGeneratorService {
  // Characters to use in key generation (excluding ambiguous characters)
  private readonly SAFE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  private readonly ALL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  /**
   * Generate a license key
   */
  generateKey(options: GenerateLicenseKeyOptions = {}): string {
    const {
      format = 'custom',
      prefix = '',
      suffix = '',
      segments = 4,
      segmentLength = 5,
      separator = '-',
      uppercase = true,
      excludeAmbiguous = true,
    } = options;

    let key: string;

    switch (format) {
      case 'uuid':
        key = this.generateUuidKey();
        break;
      case 'short':
        key = this.generateShortKey();
        break;
      case 'custom':
      default:
        key = this.generateCustomKey(segments, segmentLength, excludeAmbiguous);
        break;
    }

    // Apply prefix and suffix
    if (prefix) {
      key = `${prefix}${separator}${key}`;
    }
    if (suffix) {
      key = `${key}${separator}${suffix}`;
    }

    // Apply case transformation
    if (uppercase) {
      key = key.toUpperCase();
    } else {
      key = key.toLowerCase();
    }

    logger.debug('License key generated', {
      format,
      length: key.length,
      hasPrefix: !!prefix,
      hasSuffix: !!suffix,
    });

    return key;
  }

  /**
   * Generate UUID-based key
   */
  private generateUuidKey(): string {
    return uuidv4().toUpperCase();
  }

  /**
   * Generate short key (8 characters)
   */
  generateShortKey(): string {
    const chars = this.SAFE_CHARS;
    let key = '';

    for (let i = 0; i < 8; i++) {
      const randomIndex = randomBytes(1)[0] % chars.length;
      key += chars[randomIndex];
    }

    return key;
  }

  /**
   * Generate custom format key
   */
  private generateCustomKey(
    segments: number,
    segmentLength: number,
    excludeAmbiguous: boolean
  ): string {
    const chars = excludeAmbiguous ? this.SAFE_CHARS : this.ALL_CHARS;
    const keySegments: string[] = [];

    for (let i = 0; i < segments; i++) {
      let segment = '';
      for (let j = 0; j < segmentLength; j++) {
        const randomIndex = randomBytes(1)[0] % chars.length;
        segment += chars[randomIndex];
      }
      keySegments.push(segment);
    }

    return keySegments.join('-');
  }

  /**
   * Generate a batch of unique keys
   */
  async generateBatch(
    count: number,
    options: GenerateLicenseKeyOptions = {},
    existingKeys: Set<string> = new Set()
  ): Promise<string[]> {
    const keys: string[] = [];
    const generatedKeys = new Set<string>(existingKeys);

    while (keys.length < count) {
      const key = this.generateKey(options);

      // Ensure uniqueness
      if (!generatedKeys.has(key)) {
        keys.push(key);
        generatedKeys.add(key);
      }
    }

    logger.info('Batch of license keys generated', {
      count,
      format: options.format || 'custom',
    });

    return keys;
  }

  /**
   * Validate key format
   */
  validateKeyFormat(key: string, options?: {
    format?: 'uuid' | 'custom' | 'short';
    segments?: number;
    segmentLength?: number;
  }): boolean {
    const { format = 'custom', segments = 4, segmentLength = 5 } = options || {};

    switch (format) {
      case 'uuid':
        // UUID format: 8-4-4-4-12
        const uuidRegex = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
        return uuidRegex.test(key);

      case 'short':
        // 8 alphanumeric characters
        const shortRegex = /^[A-Z0-9]{8}$/i;
        return shortRegex.test(key);

      case 'custom':
      default:
        // Custom format with segments
        const segmentPattern = `[A-Z0-9]{${segmentLength}}`;
        const pattern = new RegExp(
          `^${segmentPattern}(-${segmentPattern}){${segments - 1}}$`,
          'i'
        );
        return pattern.test(key);
    }
  }

  /**
   * Parse key to extract components
   */
  parseKey(key: string): {
    prefix?: string;
    suffix?: string;
    core: string;
    segments: string[];
  } {
    const parts = key.split('-');

    // Try to detect prefix/suffix (if they look different from key segments)
    let prefix: string | undefined;
    let suffix: string | undefined;
    let coreSegments = parts;

    // Simple heuristic: if first part is shorter than others, it might be a prefix
    if (parts.length > 2 && parts[0].length < parts[1].length) {
      prefix = parts[0];
      coreSegments = parts.slice(1);
    }

    // If last part is shorter, it might be a suffix
    if (coreSegments.length > 2 &&
        coreSegments[coreSegments.length - 1].length < coreSegments[0].length) {
      suffix = coreSegments[coreSegments.length - 1];
      coreSegments = coreSegments.slice(0, -1);
    }

    return {
      prefix,
      suffix,
      core: coreSegments.join('-'),
      segments: coreSegments,
    };
  }

  /**
   * Generate checksum for a key
   */
  generateChecksum(key: string): string {
    let sum = 0;
    for (let i = 0; i < key.length; i++) {
      sum += key.charCodeAt(i);
    }
    return (sum % 9999).toString().padStart(4, '0');
  }

  /**
   * Add checksum to key
   */
  addChecksum(key: string): string {
    const checksum = this.generateChecksum(key);
    return `${key}-${checksum}`;
  }

  /**
   * Verify key checksum
   */
  verifyChecksum(keyWithChecksum: string): boolean {
    const parts = keyWithChecksum.split('-');
    if (parts.length < 2) return false;

    const checksum = parts[parts.length - 1];
    const key = parts.slice(0, -1).join('-');

    return this.generateChecksum(key) === checksum;
  }

  /**
   * Generate offline validation code
   */
  generateOfflineCode(key: string, hardwareId: string): string {
    // Simple offline validation code generation
    // In production, use a more secure algorithm
    const combined = `${key}:${hardwareId}`;
    let hash = 0;

    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(36).toUpperCase().substring(0, 8);
  }

  /**
   * Verify offline validation code
   */
  verifyOfflineCode(key: string, hardwareId: string, code: string): boolean {
    const expectedCode = this.generateOfflineCode(key, hardwareId);
    return expectedCode === code.toUpperCase();
  }

  /**
   * Obfuscate key for display
   */
  obfuscateKey(key: string, visibleChars = 4): string {
    if (key.length <= visibleChars * 2) {
      return key; // Don't obfuscate short keys
    }

    const parts = key.split('-');
    if (parts.length > 1) {
      // Obfuscate middle segments
      return parts.map((part, index) => {
        if (index === 0 || index === parts.length - 1) {
          return part;
        }
        return '*'.repeat(part.length);
      }).join('-');
    }

    // Obfuscate middle characters
    const start = key.substring(0, visibleChars);
    const end = key.substring(key.length - visibleChars);
    const middle = '*'.repeat(key.length - visibleChars * 2);

    return `${start}${middle}${end}`;
  }

  /**
   * Generate human-readable key
   */
  generateHumanReadableKey(): string {
    // Use word lists for more memorable keys
    const adjectives = [
      'RAPID', 'SMART', 'POWER', 'ULTRA', 'PRIME',
      'SUPER', 'TURBO', 'ELITE', 'MAGIC', 'SWIFT',
    ];
    const nouns = [
      'EAGLE', 'TIGER', 'FALCON', 'DRAGON', 'PHOENIX',
      'LION', 'WOLF', 'SHARK', 'HAWK', 'COBRA',
    ];

    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const number = Math.floor(Math.random() * 9999).toString().padStart(4, '0');

    return `${adjective}-${noun}-${number}`;
  }

  /**
   * Generate QR code data for key
   */
  generateQRCodeData(key: string, additionalData?: Record<string, any>): string {
    const data = {
      key,
      generated: new Date().toISOString(),
      ...additionalData,
    };

    return JSON.stringify(data);
  }

  /**
   * Format key for display
   */
  formatForDisplay(key: string, options?: {
    uppercase?: boolean;
    spacing?: boolean;
    groupSize?: number;
  }): string {
    const {
      uppercase = true,
      spacing = true,
      groupSize = 4,
    } = options || {};

    let formatted = key;

    if (uppercase) {
      formatted = formatted.toUpperCase();
    }

    if (spacing && !formatted.includes('-')) {
      // Add spacing between characters
      const groups = [];
      for (let i = 0; i < formatted.length; i += groupSize) {
        groups.push(formatted.substring(i, i + groupSize));
      }
      formatted = groups.join(' ');
    }

    return formatted;
  }
}

// Export singleton instance
export const keyGeneratorService = new KeyGeneratorService();