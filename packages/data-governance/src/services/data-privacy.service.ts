import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import CryptoJS from 'crypto-js';

export class DataPrivacyService extends EventEmitter {
  private config: any;
  private encryptionKeys: Map<string, string> = new Map();
  private consentRecords: Map<string, any> = new Map();
  private pseudonymMappings: Map<string, string> = new Map();

  constructor(config: any) {
    super();
    this.config = config;
    this.initializeEncryptionKeys();
  }

  private initializeEncryptionKeys() {
    // Generate or load encryption keys for each table/field
    const masterKey = process.env.MASTER_ENCRYPTION_KEY || 'default-master-key';

    // Derive keys for different purposes
    this.encryptionKeys.set('master', masterKey);
    this.encryptionKeys.set('pii', this.deriveKey(masterKey, 'pii'));
    this.encryptionKeys.set('sensitive', this.deriveKey(masterKey, 'sensitive'));
    this.encryptionKeys.set('financial', this.deriveKey(masterKey, 'financial'));
  }

  private deriveKey(masterKey: string, context: string): string {
    return crypto
      .createHmac('sha256', masterKey)
      .update(context)
      .digest('hex');
  }

  async mask(data: any, fields?: string[]): Promise<any> {
    if (typeof data === 'string') {
      return this.maskString(data);
    }

    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const masked = Array.isArray(data) ? [...data] : { ...data };

    // If specific fields are provided, mask only those
    if (fields && fields.length > 0) {
      for (const field of fields) {
        if (field in masked) {
          masked[field] = this.maskValue(masked[field], field);
        }
      }
    } else {
      // Auto-detect and mask sensitive fields
      for (const [key, value] of Object.entries(masked)) {
        if (this.isSensitiveField(key)) {
          masked[key] = this.maskValue(value, key);
        }
      }
    }

    return masked;
  }

  private isSensitiveField(fieldName: string): boolean {
    const sensitivePatterns = [
      'password',
      'secret',
      'token',
      'key',
      'ssn',
      'social_security',
      'credit_card',
      'card_number',
      'cvv',
      'pin',
      'account_number',
      'routing_number'
    ];

    const lowerField = fieldName.toLowerCase();
    return sensitivePatterns.some(pattern => lowerField.includes(pattern));
  }

  private maskValue(value: any, fieldName: string): string {
    if (value === null || value === undefined) {
      return value;
    }

    const valueStr = String(value);

    // Different masking strategies based on field type
    if (fieldName.toLowerCase().includes('email')) {
      return this.maskEmail(valueStr);
    }

    if (fieldName.toLowerCase().includes('phone')) {
      return this.maskPhone(valueStr);
    }

    if (fieldName.toLowerCase().includes('ssn') || fieldName.toLowerCase().includes('social')) {
      return this.maskSSN(valueStr);
    }

    if (fieldName.toLowerCase().includes('credit') || fieldName.toLowerCase().includes('card')) {
      return this.maskCreditCard(valueStr);
    }

    // Default masking - show first and last character
    if (valueStr.length <= 2) {
      return '*'.repeat(valueStr.length);
    }

    return valueStr[0] + '*'.repeat(Math.max(valueStr.length - 2, 1)) + valueStr[valueStr.length - 1];
  }

  private maskString(value: string): string {
    if (value.length <= 4) {
      return '*'.repeat(value.length);
    }
    return value.substring(0, 2) + '*'.repeat(value.length - 4) + value.substring(value.length - 2);
  }

  private maskEmail(email: string): string {
    const parts = email.split('@');
    if (parts.length !== 2) return '*****@*****.***';

    const [local, domain] = parts;
    const maskedLocal = local.length > 2
      ? local[0] + '*'.repeat(local.length - 2) + local[local.length - 1]
      : '*'.repeat(local.length);

    const domainParts = domain.split('.');
    const maskedDomain = domainParts[0].length > 2
      ? domainParts[0][0] + '*'.repeat(domainParts[0].length - 1)
      : '*'.repeat(domainParts[0].length);

    return `${maskedLocal}@${maskedDomain}.${domainParts.slice(1).join('.')}`;
  }

  private maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      return '*'.repeat(phone.length);
    }
    return phone.substring(0, phone.length - 4) + '****';
  }

  private maskSSN(ssn: string): string {
    const digits = ssn.replace(/\D/g, '');
    if (digits.length !== 9) {
      return '***-**-****';
    }
    return `***-**-${digits.substring(5)}`;
  }

  private maskCreditCard(card: string): string {
    const digits = card.replace(/\D/g, '');
    if (digits.length < 12) {
      return '*'.repeat(card.length);
    }
    return '*'.repeat(card.length - 4) + digits.substring(digits.length - 4);
  }

  async encrypt(table: string, column: string, value: any): Promise<string> {
    const key = this.getEncryptionKey(table, column);
    const valueStr = JSON.stringify(value);
    const encrypted = CryptoJS.AES.encrypt(valueStr, key).toString();

    this.emit('data:encrypted', { table, column });
    return encrypted;
  }

  async decrypt(table: string, column: string, encryptedValue: string): Promise<any> {
    const key = this.getEncryptionKey(table, column);

    try {
      const decrypted = CryptoJS.AES.decrypt(encryptedValue, key);
      const decryptedStr = decrypted.toString(CryptoJS.enc.Utf8);

      this.emit('data:decrypted', { table, column });
      return JSON.parse(decryptedStr);
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  private getEncryptionKey(table: string, column: string): string {
    // Check for specific key for this table/column
    const specificKey = this.encryptionKeys.get(`${table}.${column}`);
    if (specificKey) return specificKey;

    // Check for table-level key
    const tableKey = this.encryptionKeys.get(table);
    if (tableKey) return tableKey;

    // Determine key based on common patterns
    if (column.toLowerCase().includes('financial') || column.toLowerCase().includes('payment')) {
      return this.encryptionKeys.get('financial')!;
    }

    if (column.toLowerCase().includes('ssn') || column.toLowerCase().includes('social')) {
      return this.encryptionKeys.get('pii')!;
    }

    // Default to sensitive key
    return this.encryptionKeys.get('sensitive')!;
  }

  async pseudonymize(data: any, fields: string[]): Promise<{
    data: any;
    mappings: Record<string, string>;
  }> {
    const pseudonymized = Array.isArray(data) ? [...data] : { ...data };
    const mappings: Record<string, string> = {};

    for (const field of fields) {
      if (field in pseudonymized) {
        const originalValue = String(pseudonymized[field]);

        // Check if we already have a mapping
        let pseudonym = this.pseudonymMappings.get(originalValue);

        if (!pseudonym) {
          // Generate new pseudonym
          pseudonym = this.generatePseudonym(field);
          this.pseudonymMappings.set(originalValue, pseudonym);
        }

        pseudonymized[field] = pseudonym;
        mappings[originalValue] = pseudonym;
      }
    }

    this.emit('data:pseudonymized', { fields, count: Object.keys(mappings).length });

    return { data: pseudonymized, mappings };
  }

  private generatePseudonym(field: string): string {
    const prefix = field.substring(0, 3).toUpperCase();
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `${prefix}_${random}`;
  }

  async tokenize(value: string): Promise<string> {
    const token = crypto.randomBytes(16).toString('hex');

    // Store mapping (in production, use secure token vault)
    this.pseudonymMappings.set(token, value);

    this.emit('data:tokenized');
    return token;
  }

  async detokenize(token: string): Promise<string> {
    const value = this.pseudonymMappings.get(token);

    if (!value) {
      throw new Error('Token not found');
    }

    this.emit('data:detokenized');
    return value;
  }

  async recordConsent(userId: string, purpose: string, granted: boolean): Promise<void> {
    const consentId = crypto.randomUUID();
    const consent = {
      id: consentId,
      userId,
      purpose,
      granted,
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + (this.config.privacy?.consent?.defaultExpiry || 365) * 24 * 60 * 60 * 1000)
    };

    // Store by user and purpose
    const key = `${userId}:${purpose}`;
    this.consentRecords.set(key, consent);

    this.emit('consent:recorded', consent);
  }

  async checkConsent(userId: string, purpose: string): Promise<boolean> {
    const key = `${userId}:${purpose}`;
    const consent = this.consentRecords.get(key);

    if (!consent) {
      return false;
    }

    // Check if consent is still valid
    if (consent.expiresAt && new Date() > new Date(consent.expiresAt)) {
      // Consent expired
      this.consentRecords.delete(key);
      this.emit('consent:expired', { userId, purpose });
      return false;
    }

    return consent.granted;
  }

  async revokeConsent(userId: string, purpose?: string): Promise<void> {
    if (purpose) {
      // Revoke specific consent
      const key = `${userId}:${purpose}`;
      this.consentRecords.delete(key);
      this.emit('consent:revoked', { userId, purpose });
    } else {
      // Revoke all consents for user
      const toDelete: string[] = [];
      for (const [key, consent] of this.consentRecords) {
        if (consent.userId === userId) {
          toDelete.push(key);
        }
      }

      for (const key of toDelete) {
        this.consentRecords.delete(key);
      }

      this.emit('consent:revoked', { userId, purpose: 'all' });
    }
  }

  async getConsentHistory(userId: string): Promise<any[]> {
    const history: any[] = [];

    for (const [key, consent] of this.consentRecords) {
      if (consent.userId === userId) {
        history.push(consent);
      }
    }

    return history.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async anonymize(data: any, preserveStructure: boolean = true): Promise<any> {
    if (!preserveStructure) {
      // Complete anonymization - return null/empty
      return Array.isArray(data) ? [] : {};
    }

    // Structural anonymization - preserve structure but remove values
    const anonymized = Array.isArray(data) ? [...data] : { ...data };

    const anonymizeValue = (value: any, key: string): any => {
      if (value === null || value === undefined) {
        return value;
      }

      const type = typeof value;

      switch (type) {
        case 'string':
          return 'ANONYMIZED';
        case 'number':
          return 0;
        case 'boolean':
          return false;
        case 'object':
          if (value instanceof Date) {
            return new Date(0);
          }
          if (Array.isArray(value)) {
            return [];
          }
          return {};
        default:
          return null;
      }
    };

    if (Array.isArray(anonymized)) {
      return anonymized.map(item => this.anonymize(item, preserveStructure));
    }

    for (const [key, value] of Object.entries(anonymized)) {
      anonymized[key] = anonymizeValue(value, key);
    }

    this.emit('data:anonymized');
    return anonymized;
  }

  async rotateEncryptionKeys(): Promise<void> {
    const newMasterKey = crypto.randomBytes(32).toString('hex');

    // Re-encrypt all data with new keys
    // This would involve:
    // 1. Decrypt with old key
    // 2. Encrypt with new key
    // 3. Update stored data

    this.encryptionKeys.set('master', newMasterKey);
    this.encryptionKeys.set('pii', this.deriveKey(newMasterKey, 'pii'));
    this.encryptionKeys.set('sensitive', this.deriveKey(newMasterKey, 'sensitive'));
    this.encryptionKeys.set('financial', this.deriveKey(newMasterKey, 'financial'));

    this.emit('keys:rotated', { timestamp: new Date() });
  }

  getPrivacyMetrics(): {
    encryptedFields: number;
    maskedFields: number;
    consentRecords: number;
    pseudonymMappings: number;
  } {
    return {
      encryptedFields: this.encryptionKeys.size,
      maskedFields: 0, // Would track in production
      consentRecords: this.consentRecords.size,
      pseudonymMappings: this.pseudonymMappings.size
    };
  }
}