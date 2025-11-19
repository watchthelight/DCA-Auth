import { EventEmitter } from 'events';

export class DataClassificationService extends EventEmitter {
  private config: any;
  private piiPatterns: Map<string, RegExp>;
  private classificationRules: Map<string, any>;

  constructor(config: any) {
    super();
    this.config = config;
    this.piiPatterns = new Map();
    this.classificationRules = new Map();

    this.initializePIIPatterns();
    this.initializeClassificationRules();
  }

  private initializePIIPatterns() {
    // Common PII patterns
    this.piiPatterns.set('ssn', /\b\d{3}-\d{2}-\d{4}\b/);
    this.piiPatterns.set('credit_card', /\b(?:\d{4}[-\s]?){3}\d{4}\b/);
    this.piiPatterns.set('email', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
    this.piiPatterns.set('phone', /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/);
    this.piiPatterns.set('ip_address', /\b(?:\d{1,3}\.){3}\d{1,3}\b/);
    this.piiPatterns.set('date_of_birth', /\b(?:0[1-9]|1[0-2])[-\/](?:0[1-9]|[12]\d|3[01])[-\/](?:19|20)\d{2}\b/);
    this.piiPatterns.set('passport', /\b[A-Z]{1,2}\d{6,9}\b/);
    this.piiPatterns.set('driver_license', /\b[A-Z]{1,2}\d{5,8}\b/);

    // Add custom patterns from config
    if (this.config.classification?.customPatterns) {
      for (const pattern of this.config.classification.customPatterns) {
        this.piiPatterns.set(pattern.name, pattern.pattern);
      }
    }
  }

  private initializeClassificationRules() {
    // Default classification rules
    this.classificationRules.set('public', {
      keywords: ['public', 'open', 'shared'],
      sensitivity: 'low',
      retention: 'unlimited',
      encryption: false
    });

    this.classificationRules.set('internal', {
      keywords: ['internal', 'company', 'employee'],
      sensitivity: 'medium',
      retention: '3years',
      encryption: false
    });

    this.classificationRules.set('confidential', {
      keywords: ['confidential', 'private', 'secret'],
      sensitivity: 'high',
      retention: '7years',
      encryption: true
    });

    this.classificationRules.set('restricted', {
      keywords: ['restricted', 'classified', 'sensitive'],
      sensitivity: 'critical',
      retention: '10years',
      encryption: true
    });
  }

  async classify(data: any, context?: string): Promise<{
    level: string;
    sensitivity: 'low' | 'medium' | 'high' | 'critical';
    pii: boolean;
    piiFields?: string[];
    confidence: number;
  }> {
    const result = {
      level: 'internal',
      sensitivity: 'medium' as const,
      pii: false,
      piiFields: [] as string[],
      confidence: 0
    };

    try {
      // Check for PII
      const piiCheck = this.detectPII(data);
      if (piiCheck.hasPII) {
        result.pii = true;
        result.piiFields = piiCheck.fields;
        result.level = 'confidential';
        result.sensitivity = 'high';
      }

      // Analyze content for classification
      const contentAnalysis = this.analyzeContent(data);
      if (contentAnalysis.level) {
        result.level = contentAnalysis.level;
        result.sensitivity = contentAnalysis.sensitivity;
      }

      // Consider context if provided
      if (context) {
        const contextClassification = this.classifyByContext(context);
        if (contextClassification.sensitivity === 'critical') {
          result.level = 'restricted';
          result.sensitivity = 'critical';
        }
      }

      // Calculate confidence score
      result.confidence = this.calculateConfidence(result, piiCheck, contentAnalysis);

      if (result.pii) {
        this.emit('pii:detected', {
          data,
          fields: result.piiFields,
          context
        });
      }

      return result;
    } catch (error) {
      console.error('Error classifying data:', error);
      return result;
    }
  }

  private detectPII(data: any): { hasPII: boolean; fields: string[] } {
    const piiFields: string[] = [];
    let dataString: string;

    if (typeof data === 'string') {
      dataString = data;
    } else if (typeof data === 'object') {
      dataString = JSON.stringify(data);

      // Check individual fields
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'string') {
          for (const [piiType, pattern] of this.piiPatterns) {
            if (pattern.test(value)) {
              piiFields.push(`${key}:${piiType}`);
            }
          }
        }
      }
    } else {
      dataString = String(data);
    }

    // Check overall data
    for (const [piiType, pattern] of this.piiPatterns) {
      if (pattern.test(dataString)) {
        if (!piiFields.some(f => f.includes(piiType))) {
          piiFields.push(piiType);
        }
      }
    }

    return {
      hasPII: piiFields.length > 0,
      fields: piiFields
    };
  }

  private analyzeContent(data: any): {
    level: string;
    sensitivity: 'low' | 'medium' | 'high' | 'critical';
  } {
    const dataString = typeof data === 'object' ? JSON.stringify(data) : String(data);
    const lowerData = dataString.toLowerCase();

    for (const [level, rule] of this.classificationRules) {
      for (const keyword of rule.keywords) {
        if (lowerData.includes(keyword)) {
          return {
            level,
            sensitivity: rule.sensitivity
          };
        }
      }
    }

    return {
      level: 'internal',
      sensitivity: 'medium'
    };
  }

  private classifyByContext(context: string): {
    level: string;
    sensitivity: 'low' | 'medium' | 'high' | 'critical';
  } {
    const lowerContext = context.toLowerCase();

    if (lowerContext.includes('payment') || lowerContext.includes('financial')) {
      return { level: 'restricted', sensitivity: 'critical' };
    }

    if (lowerContext.includes('medical') || lowerContext.includes('health')) {
      return { level: 'restricted', sensitivity: 'critical' };
    }

    if (lowerContext.includes('password') || lowerContext.includes('credential')) {
      return { level: 'restricted', sensitivity: 'critical' };
    }

    if (lowerContext.includes('personal') || lowerContext.includes('private')) {
      return { level: 'confidential', sensitivity: 'high' };
    }

    return { level: 'internal', sensitivity: 'medium' };
  }

  private calculateConfidence(result: any, piiCheck: any, contentAnalysis: any): number {
    let confidence = 50; // Base confidence

    // Increase confidence for PII detection
    if (piiCheck.hasPII) {
      confidence += piiCheck.fields.length * 10;
    }

    // Increase confidence for keyword matches
    if (contentAnalysis.level !== 'internal') {
      confidence += 20;
    }

    // Cap at 100
    return Math.min(confidence, 100);
  }

  async scanForPII(table: string): Promise<{
    hasPII: boolean;
    fields: Array<{
      column: string;
      type: string;
      confidence: number;
    }>;
  }> {
    // Mock implementation - would query actual table data
    const mockColumns = ['email', 'phone', 'ssn', 'address', 'name'];
    const fields: any[] = [];

    for (const column of mockColumns) {
      for (const [piiType, pattern] of this.piiPatterns) {
        if (column.toLowerCase().includes(piiType.toLowerCase().replace('_', ''))) {
          fields.push({
            column,
            type: piiType,
            confidence: 90
          });
        }
      }
    }

    return {
      hasPII: fields.length > 0,
      fields
    };
  }

  async updateClassificationRule(name: string, rule: any): Promise<void> {
    this.classificationRules.set(name, rule);
    this.emit('rule:updated', { name, rule });
  }

  async addPIIPattern(name: string, pattern: RegExp): Promise<void> {
    this.piiPatterns.set(name, pattern);
    this.emit('pattern:added', { name, pattern: pattern.toString() });
  }

  getClassificationLevels(): string[] {
    return Array.from(this.classificationRules.keys());
  }

  getPIITypes(): string[] {
    return Array.from(this.piiPatterns.keys());
  }
}