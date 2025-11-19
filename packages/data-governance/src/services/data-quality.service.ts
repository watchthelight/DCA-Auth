import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import Ajv from 'ajv';

export class DataQualityService extends EventEmitter {
  private config: any;
  private prisma: PrismaClient;
  private ajv: Ajv;
  private rules: Map<string, any> = new Map();
  private overallScore: number = 100;

  constructor(config: any, prisma: PrismaClient) {
    super();
    this.config = config;
    this.prisma = prisma;
    this.ajv = new Ajv();

    this.loadDefaultRules();
  }

  private loadDefaultRules() {
    // Default data quality rules
    const defaultRules = [
      {
        name: 'email_format',
        table: 'users',
        column: 'email',
        type: 'validity',
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        threshold: 100
      },
      {
        name: 'no_future_dates',
        table: '*',
        column: 'created_at',
        type: 'validity',
        condition: (value: any) => new Date(value) <= new Date(),
        threshold: 100
      },
      {
        name: 'required_fields',
        table: '*',
        column: 'id',
        type: 'completeness',
        condition: (value: any) => value !== null && value !== undefined,
        threshold: 100
      }
    ];

    for (const rule of defaultRules) {
      this.rules.set(rule.name, rule);
    }
  }

  async assess(tableOrData: string | any): Promise<{
    overall: number;
    completeness: number;
    validity: number;
    consistency: number;
    uniqueness: number;
    timeliness: number;
    issues: Array<{
      severity: 'low' | 'medium' | 'high' | 'critical';
      type: string;
      description: string;
      affectedRecords: number;
      recommendation: string;
    }>;
  }> {
    const metrics = {
      overall: 100,
      completeness: 100,
      validity: 100,
      consistency: 100,
      uniqueness: 100,
      timeliness: 100,
      issues: [] as any[]
    };

    try {
      // Get data to assess
      let data: any[];
      if (typeof tableOrData === 'string') {
        data = await this.prisma[tableOrData].findMany().catch(() => []);
      } else {
        data = Array.isArray(tableOrData) ? tableOrData : [tableOrData];
      }

      if (data.length === 0) {
        return metrics;
      }

      // Check completeness
      const completenessResult = this.checkCompleteness(data);
      metrics.completeness = completenessResult.score;
      metrics.issues.push(...completenessResult.issues);

      // Check validity
      const validityResult = this.checkValidity(data);
      metrics.validity = validityResult.score;
      metrics.issues.push(...validityResult.issues);

      // Check consistency
      const consistencyResult = this.checkConsistency(data);
      metrics.consistency = consistencyResult.score;
      metrics.issues.push(...consistencyResult.issues);

      // Check uniqueness
      const uniquenessResult = this.checkUniqueness(data);
      metrics.uniqueness = uniquenessResult.score;
      metrics.issues.push(...uniquenessResult.issues);

      // Check timeliness
      const timelinessResult = this.checkTimeliness(data);
      metrics.timeliness = timelinessResult.score;
      metrics.issues.push(...timelinessResult.issues);

      // Calculate overall score
      metrics.overall = (
        metrics.completeness +
        metrics.validity +
        metrics.consistency +
        metrics.uniqueness +
        metrics.timeliness
      ) / 5;

      this.overallScore = metrics.overall;

      if (metrics.issues.length > 0) {
        this.emit('issues:found', metrics.issues);
      }

      return metrics;
    } catch (error) {
      console.error('Error assessing data quality:', error);
      return metrics;
    }
  }

  private checkCompleteness(data: any[]): { score: number; issues: any[] } {
    const issues: any[] = [];
    let missingCount = 0;
    let totalFields = 0;

    for (const record of data) {
      for (const [key, value] of Object.entries(record)) {
        totalFields++;
        if (value === null || value === undefined || value === '') {
          missingCount++;
        }
      }
    }

    const score = totalFields > 0 ? ((totalFields - missingCount) / totalFields) * 100 : 100;

    if (missingCount > 0) {
      issues.push({
        severity: score < 50 ? 'critical' : score < 70 ? 'high' : score < 90 ? 'medium' : 'low',
        type: 'completeness',
        description: `${missingCount} missing values found across ${data.length} records`,
        affectedRecords: data.length,
        recommendation: 'Review and populate missing required fields'
      });
    }

    return { score, issues };
  }

  private checkValidity(data: any[]): { score: number; issues: any[] } {
    const issues: any[] = [];
    let invalidCount = 0;

    for (const record of data) {
      // Check email format
      if (record.email && !this.isValidEmail(record.email)) {
        invalidCount++;
      }

      // Check dates
      for (const [key, value] of Object.entries(record)) {
        if (key.includes('date') || key.includes('_at')) {
          if (value && !this.isValidDate(value)) {
            invalidCount++;
          }
        }
      }

      // Check against custom rules
      for (const [ruleName, rule] of this.rules) {
        if (rule.type === 'validity' && this.ruleApplies(rule, record)) {
          if (rule.pattern && !rule.pattern.test(record[rule.column])) {
            invalidCount++;
          } else if (rule.condition && !rule.condition(record[rule.column])) {
            invalidCount++;
          }
        }
      }
    }

    const score = data.length > 0 ? ((data.length - invalidCount) / data.length) * 100 : 100;

    if (invalidCount > 0) {
      issues.push({
        severity: score < 50 ? 'critical' : score < 70 ? 'high' : score < 90 ? 'medium' : 'low',
        type: 'validity',
        description: `${invalidCount} invalid values found`,
        affectedRecords: invalidCount,
        recommendation: 'Validate and correct data format issues'
      });
    }

    return { score, issues };
  }

  private checkConsistency(data: any[]): { score: number; issues: any[] } {
    const issues: any[] = [];
    let inconsistentCount = 0;

    // Check for format inconsistencies
    const formats = new Map<string, Set<string>>();

    for (const record of data) {
      for (const [key, value] of Object.entries(record)) {
        if (value && typeof value === 'string') {
          const format = this.detectFormat(value);
          if (!formats.has(key)) {
            formats.set(key, new Set());
          }
          formats.get(key)!.add(format);
        }
      }
    }

    for (const [field, formatSet] of formats) {
      if (formatSet.size > 1) {
        inconsistentCount++;
        issues.push({
          severity: 'medium',
          type: 'consistency',
          description: `Field '${field}' has ${formatSet.size} different formats`,
          affectedRecords: data.length,
          recommendation: `Standardize format for field '${field}'`
        });
      }
    }

    const score = formats.size > 0 ? ((formats.size - inconsistentCount) / formats.size) * 100 : 100;

    return { score, issues };
  }

  private checkUniqueness(data: any[]): { score: number; issues: any[] } {
    const issues: any[] = [];
    const duplicates = new Map<string, number>();

    // Check for duplicate IDs
    const ids = data.map(r => r.id).filter(Boolean);
    const uniqueIds = new Set(ids);

    if (ids.length !== uniqueIds.size) {
      const duplicateCount = ids.length - uniqueIds.size;
      issues.push({
        severity: 'critical',
        type: 'uniqueness',
        description: `${duplicateCount} duplicate IDs found`,
        affectedRecords: duplicateCount,
        recommendation: 'Remove or merge duplicate records'
      });
    }

    // Check for other unique fields
    const emailSet = new Set();
    let duplicateEmails = 0;

    for (const record of data) {
      if (record.email) {
        if (emailSet.has(record.email)) {
          duplicateEmails++;
        } else {
          emailSet.add(record.email);
        }
      }
    }

    if (duplicateEmails > 0) {
      issues.push({
        severity: 'high',
        type: 'uniqueness',
        description: `${duplicateEmails} duplicate emails found`,
        affectedRecords: duplicateEmails,
        recommendation: 'Ensure email addresses are unique'
      });
    }

    const totalChecks = 2; // IDs and emails
    const failedChecks = (ids.length !== uniqueIds.size ? 1 : 0) + (duplicateEmails > 0 ? 1 : 0);
    const score = ((totalChecks - failedChecks) / totalChecks) * 100;

    return { score, issues };
  }

  private checkTimeliness(data: any[]): { score: number; issues: any[] } {
    const issues: any[] = [];
    const now = new Date();
    let staleCount = 0;

    for (const record of data) {
      // Check if data is stale (not updated in last 90 days)
      if (record.updated_at) {
        const updatedAt = new Date(record.updated_at);
        const daysSinceUpdate = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSinceUpdate > 90) {
          staleCount++;
        }
      }
    }

    const score = data.length > 0 ? ((data.length - staleCount) / data.length) * 100 : 100;

    if (staleCount > 0) {
      issues.push({
        severity: 'low',
        type: 'timeliness',
        description: `${staleCount} records haven't been updated in over 90 days`,
        affectedRecords: staleCount,
        recommendation: 'Review and update stale records'
      });
    }

    return { score, issues };
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private isValidDate(date: any): boolean {
    const d = new Date(date);
    return !isNaN(d.getTime()) && d <= new Date();
  }

  private detectFormat(value: string): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date-iso';
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return 'date-us';
    if (/^[A-Z]+$/.test(value)) return 'uppercase';
    if (/^[a-z]+$/.test(value)) return 'lowercase';
    if (/^\d+$/.test(value)) return 'numeric';
    return 'mixed';
  }

  private ruleApplies(rule: any, record: any): boolean {
    if (rule.table === '*') return true;
    // Additional logic to check if rule applies to this record
    return true;
  }

  async addRule(rule: any): Promise<void> {
    this.rules.set(rule.name, rule);
    this.emit('rule:added', rule);
  }

  async validate(table: string, data: any): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];
    const rules = Array.from(this.rules.values()).filter(r =>
      r.table === table || r.table === '*'
    );

    for (const rule of rules) {
      if (rule.type === 'validity') {
        const value = data[rule.column];

        if (rule.pattern && !rule.pattern.test(value)) {
          errors.push(`Field '${rule.column}' does not match required pattern`);
        }

        if (rule.condition && !rule.condition(value)) {
          errors.push(`Field '${rule.column}' failed validation rule '${rule.name}'`);
        }
      } else if (rule.type === 'completeness') {
        const value = data[rule.column];

        if (value === null || value === undefined || value === '') {
          errors.push(`Field '${rule.column}' is required`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  getOverallScore(): number {
    return this.overallScore;
  }

  async generateQualityReport(): Promise<{
    summary: {
      score: number;
      trend: 'improving' | 'stable' | 'declining';
      topIssues: string[];
    };
    details: any;
    recommendations: string[];
  }> {
    return {
      summary: {
        score: this.overallScore,
        trend: 'stable',
        topIssues: ['Missing values in optional fields', 'Some stale records']
      },
      details: {
        rulesCount: this.rules.size,
        lastAssessment: new Date()
      },
      recommendations: [
        'Implement automated data validation on input',
        'Schedule regular data quality assessments',
        'Create data quality dashboards for monitoring'
      ]
    };
  }
}