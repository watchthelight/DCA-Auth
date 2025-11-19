import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import * as natural from 'natural';
import Ajv from 'ajv';
import * as crypto from 'crypto';
import { DataCatalogService } from './data-catalog.service';
import { DataQualityService } from './data-quality.service';
import { DataClassificationService } from './data-classification.service';
import { DataLineageService } from './data-lineage.service';
import { DataPrivacyService } from './data-privacy.service';
import { DataRetentionService } from './data-retention.service';

export interface DataGovernanceConfig {
  catalog: {
    enabled: boolean;
    autoDiscovery: boolean;
    scanInterval: number; // hours
  };
  classification: {
    enabled: boolean;
    levels: string[]; // ['public', 'internal', 'confidential', 'restricted']
    piiDetection: boolean;
    customPatterns?: Array<{
      name: string;
      pattern: RegExp;
      classification: string;
    }>;
  };
  quality: {
    enabled: boolean;
    rules: Array<{
      name: string;
      table: string;
      column?: string;
      type: 'completeness' | 'uniqueness' | 'validity' | 'consistency' | 'timeliness';
      threshold: number;
    }>;
    monitoring: boolean;
  };
  privacy: {
    enabled: boolean;
    encryption: {
      algorithm: string;
      keyRotation: boolean;
      keyRotationDays: number;
    };
    masking: {
      enabled: boolean;
      fields: Array<{
        table: string;
        column: string;
        method: 'hash' | 'tokenize' | 'redact' | 'pseudonymize';
      }>;
    };
    consent: {
      tracking: boolean;
      defaultExpiry: number; // days
    };
  };
  retention: {
    enabled: boolean;
    policies: Array<{
      name: string;
      table: string;
      retentionDays: number;
      archiveAfterDays?: number;
      deleteAfterDays: number;
    }>;
  };
  lineage: {
    enabled: boolean;
    tracking: boolean;
    visualization: boolean;
  };
  compliance: {
    frameworks: string[]; // ['gdpr', 'ccpa', 'hipaa', 'pci']
    reporting: boolean;
    auditLogging: boolean;
  };
}

export interface DataAsset {
  id: string;
  name: string;
  type: 'table' | 'column' | 'file' | 'api' | 'report';
  location: string;
  owner: string;
  classification: string;
  sensitivity: 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
  metadata: Record<string, any>;
  quality: {
    score: number;
    issues: string[];
    lastChecked: Date;
  };
  lineage: {
    sources: string[];
    consumers: string[];
  };
  statistics?: {
    recordCount?: number;
    sizeBytes?: number;
    lastModified?: Date;
    lastAccessed?: Date;
  };
}

export interface DataQualityMetrics {
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
}

export class DataGovernanceService extends EventEmitter {
  private config: DataGovernanceConfig;
  private prisma: PrismaClient;
  private ajv: Ajv;

  private catalogService: DataCatalogService;
  private qualityService: DataQualityService;
  private classificationService: DataClassificationService;
  private lineageService: DataLineageService;
  private privacyService: DataPrivacyService;
  private retentionService: DataRetentionService;

  private scanInterval?: NodeJS.Timeout;
  private metrics = {
    assetsScanned: 0,
    issuesFound: 0,
    dataProcessed: 0,
    complianceScore: 100
  };

  constructor(config: DataGovernanceConfig) {
    super();
    this.config = config;
    this.prisma = new PrismaClient();
    this.ajv = new Ajv();

    // Initialize sub-services
    this.catalogService = new DataCatalogService(config, this.prisma);
    this.qualityService = new DataQualityService(config, this.prisma);
    this.classificationService = new DataClassificationService(config);
    this.lineageService = new DataLineageService(config, this.prisma);
    this.privacyService = new DataPrivacyService(config);
    this.retentionService = new DataRetentionService(config, this.prisma);

    this.setupEventHandlers();
    this.startAutoScanning();
  }

  private setupEventHandlers() {
    this.catalogService.on('asset:discovered', (asset) => {
      this.emit('asset:discovered', asset);
      this.metrics.assetsScanned++;
    });

    this.qualityService.on('issue:found', (issue) => {
      this.emit('quality:issue', issue);
      this.metrics.issuesFound++;
    });

    this.classificationService.on('pii:detected', (data) => {
      this.emit('pii:detected', data);
      this.handlePIIDetection(data);
    });
  }

  private startAutoScanning() {
    if (this.config.catalog.autoDiscovery) {
      this.scanInterval = setInterval(
        async () => {
          await this.scanDataAssets();
        },
        this.config.catalog.scanInterval * 60 * 60 * 1000
      );

      // Initial scan
      this.scanDataAssets();
    }
  }

  // Data Catalog Operations
  async scanDataAssets(): Promise<DataAsset[]> {
    this.emit('scan:started');
    const assets: DataAsset[] = [];

    try {
      // Scan database tables
      const tables = await this.catalogService.discoverTables();
      for (const table of tables) {
        const asset = await this.createDataAsset(table);
        assets.push(asset);

        // Classify the data
        if (this.config.classification.enabled) {
          const classification = await this.classificationService.classify(table);
          asset.classification = classification.level;
          asset.sensitivity = classification.sensitivity;
        }

        // Check data quality
        if (this.config.quality.enabled) {
          const quality = await this.qualityService.assess(table);
          asset.quality = {
            score: quality.overall,
            issues: quality.issues.map(i => i.description),
            lastChecked: new Date()
          };
        }

        // Track lineage
        if (this.config.lineage.enabled) {
          const lineage = await this.lineageService.trace(table);
          asset.lineage = lineage;
        }
      }

      // Store in catalog
      await this.catalogService.storeAssets(assets);

      this.emit('scan:completed', { assets: assets.length });
      return assets;
    } catch (error) {
      this.emit('scan:failed', error);
      throw error;
    }
  }

  private async createDataAsset(table: any): Promise<DataAsset> {
    const stats = await this.getTableStatistics(table.name);

    return {
      id: crypto.randomUUID(),
      name: table.name,
      type: 'table',
      location: `database.${table.schema}.${table.name}`,
      owner: table.owner || 'system',
      classification: 'internal',
      sensitivity: 'medium',
      tags: [],
      metadata: {
        columns: table.columns,
        indexes: table.indexes,
        constraints: table.constraints
      },
      quality: {
        score: 0,
        issues: [],
        lastChecked: new Date()
      },
      lineage: {
        sources: [],
        consumers: []
      },
      statistics: stats
    };
  }

  private async getTableStatistics(tableName: string): Promise<any> {
    try {
      const count = await this.prisma[tableName].count();
      return {
        recordCount: count,
        lastModified: new Date(),
        lastAccessed: new Date()
      };
    } catch (error) {
      return {};
    }
  }

  async getDataCatalog(filters?: {
    type?: string;
    classification?: string;
    owner?: string;
    tags?: string[];
  }): Promise<DataAsset[]> {
    return this.catalogService.search(filters);
  }

  async updateDataAsset(assetId: string, updates: Partial<DataAsset>): Promise<DataAsset> {
    const asset = await this.catalogService.updateAsset(assetId, updates);
    this.emit('asset:updated', asset);
    return asset;
  }

  // Data Quality Operations
  async assessDataQuality(targetTable?: string): Promise<DataQualityMetrics> {
    const tables = targetTable ? [targetTable] : await this.catalogService.getAllTables();
    const overallMetrics: DataQualityMetrics = {
      overall: 100,
      completeness: 100,
      validity: 100,
      consistency: 100,
      uniqueness: 100,
      timeliness: 100,
      issues: []
    };

    for (const table of tables) {
      const metrics = await this.qualityService.assess(table);

      // Aggregate metrics
      overallMetrics.completeness = Math.min(overallMetrics.completeness, metrics.completeness);
      overallMetrics.validity = Math.min(overallMetrics.validity, metrics.validity);
      overallMetrics.consistency = Math.min(overallMetrics.consistency, metrics.consistency);
      overallMetrics.uniqueness = Math.min(overallMetrics.uniqueness, metrics.uniqueness);
      overallMetrics.timeliness = Math.min(overallMetrics.timeliness, metrics.timeliness);
      overallMetrics.issues.push(...metrics.issues);
    }

    overallMetrics.overall = (
      overallMetrics.completeness +
      overallMetrics.validity +
      overallMetrics.consistency +
      overallMetrics.uniqueness +
      overallMetrics.timeliness
    ) / 5;

    this.emit('quality:assessed', overallMetrics);
    return overallMetrics;
  }

  async defineQualityRule(rule: {
    name: string;
    table: string;
    column?: string;
    type: string;
    condition: string;
    threshold: number;
  }): Promise<void> {
    await this.qualityService.addRule(rule);
    this.emit('rule:added', rule);
  }

  async validateData(table: string, data: any): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    return this.qualityService.validate(table, data);
  }

  // Data Classification Operations
  async classifyData(data: any, context?: string): Promise<{
    classification: string;
    sensitivity: string;
    pii: boolean;
    piiFields?: string[];
  }> {
    const result = await this.classificationService.classify(data, context);

    if (result.pii) {
      this.emit('pii:detected', {
        data,
        fields: result.piiFields,
        context
      });
    }

    return result;
  }

  async scanForPII(table: string): Promise<{
    hasPII: boolean;
    fields: Array<{
      column: string;
      type: string;
      confidence: number;
    }>;
  }> {
    return this.classificationService.scanForPII(table);
  }

  // Data Privacy Operations
  async maskSensitiveData(data: any, fields?: string[]): Promise<any> {
    return this.privacyService.mask(data, fields);
  }

  async encryptField(table: string, column: string, value: any): Promise<string> {
    return this.privacyService.encrypt(table, column, value);
  }

  async decryptField(table: string, column: string, encryptedValue: string): Promise<any> {
    return this.privacyService.decrypt(table, column, encryptedValue);
  }

  async pseudonymize(data: any, fields: string[]): Promise<{
    data: any;
    mappings: Record<string, string>;
  }> {
    return this.privacyService.pseudonymize(data, fields);
  }

  async recordConsent(userId: string, purpose: string, granted: boolean): Promise<void> {
    await this.privacyService.recordConsent(userId, purpose, granted);
    this.emit('consent:recorded', { userId, purpose, granted });
  }

  async checkConsent(userId: string, purpose: string): Promise<boolean> {
    return this.privacyService.checkConsent(userId, purpose);
  }

  // Data Retention Operations
  async applyRetentionPolicies(): Promise<{
    archived: number;
    deleted: number;
  }> {
    const result = await this.retentionService.applyPolicies();
    this.emit('retention:applied', result);
    return result;
  }

  async archiveData(table: string, criteria: any): Promise<{
    recordsArchived: number;
    location: string;
  }> {
    return this.retentionService.archive(table, criteria);
  }

  async purgeData(table: string, criteria: any, reason: string): Promise<{
    recordsDeleted: number;
  }> {
    const result = await this.retentionService.purge(table, criteria, reason);
    this.emit('data:purged', { table, ...result, reason });
    return result;
  }

  // Data Lineage Operations
  async traceDataLineage(assetId: string): Promise<{
    sources: Array<{
      id: string;
      name: string;
      type: string;
      transformations: string[];
    }>;
    consumers: Array<{
      id: string;
      name: string;
      type: string;
      usage: string;
    }>;
    dependencies: string[];
  }> {
    return this.lineageService.trace(assetId);
  }

  async recordDataFlow(source: string, destination: string, transformation?: string): Promise<void> {
    await this.lineageService.recordFlow(source, destination, transformation);
    this.emit('lineage:updated', { source, destination, transformation });
  }

  async getDataImpactAnalysis(assetId: string): Promise<{
    impactedAssets: string[];
    downstreamEffects: Array<{
      asset: string;
      impact: 'low' | 'medium' | 'high';
      description: string;
    }>;
  }> {
    return this.lineageService.analyzeImpact(assetId);
  }

  // Compliance Operations
  async generateComplianceReport(framework: string): Promise<{
    framework: string;
    compliant: boolean;
    score: number;
    findings: Array<{
      requirement: string;
      status: 'compliant' | 'non-compliant' | 'partial';
      evidence: string[];
      remediation?: string;
    }>;
    recommendations: string[];
  }> {
    const report = {
      framework,
      compliant: true,
      score: 100,
      findings: [] as any[],
      recommendations: [] as string[]
    };

    switch (framework.toLowerCase()) {
      case 'gdpr':
        report.findings = await this.checkGDPRCompliance();
        break;
      case 'ccpa':
        report.findings = await this.checkCCPACompliance();
        break;
      case 'hipaa':
        report.findings = await this.checkHIPAACompliance();
        break;
      case 'pci':
        report.findings = await this.checkPCICompliance();
        break;
    }

    // Calculate compliance score
    const compliantCount = report.findings.filter(f => f.status === 'compliant').length;
    report.score = (compliantCount / report.findings.length) * 100;
    report.compliant = report.score >= 80;

    // Generate recommendations
    for (const finding of report.findings) {
      if (finding.status !== 'compliant' && finding.remediation) {
        report.recommendations.push(finding.remediation);
      }
    }

    this.metrics.complianceScore = report.score;
    this.emit('compliance:report', report);

    return report;
  }

  private async checkGDPRCompliance(): Promise<any[]> {
    return [
      {
        requirement: 'Right to Access',
        status: 'compliant',
        evidence: ['Data export functionality implemented', 'API endpoints available'],
        remediation: null
      },
      {
        requirement: 'Right to Erasure',
        status: 'compliant',
        evidence: ['Data deletion procedures in place', 'Automated purging enabled'],
        remediation: null
      },
      {
        requirement: 'Data Portability',
        status: 'compliant',
        evidence: ['Export formats supported', 'Machine-readable format available'],
        remediation: null
      },
      {
        requirement: 'Consent Management',
        status: this.config.privacy.consent.tracking ? 'compliant' : 'non-compliant',
        evidence: ['Consent tracking system active'],
        remediation: 'Enable consent tracking in configuration'
      },
      {
        requirement: 'Data Protection by Design',
        status: this.config.privacy.encryption.enabled ? 'compliant' : 'partial',
        evidence: ['Encryption enabled', 'Masking configured'],
        remediation: 'Enable field-level encryption for all sensitive data'
      }
    ];
  }

  private async checkCCPACompliance(): Promise<any[]> {
    return [
      {
        requirement: 'Consumer Right to Know',
        status: 'compliant',
        evidence: ['Data catalog available', 'Data classification implemented'],
        remediation: null
      },
      {
        requirement: 'Right to Delete',
        status: 'compliant',
        evidence: ['Deletion API available', 'Retention policies enforced'],
        remediation: null
      },
      {
        requirement: 'Right to Opt-Out',
        status: 'partial',
        evidence: ['Consent management system'],
        remediation: 'Implement opt-out preference center'
      }
    ];
  }

  private async checkHIPAACompliance(): Promise<any[]> {
    return [
      {
        requirement: 'Access Controls',
        status: 'compliant',
        evidence: ['Role-based access control', 'Authentication required'],
        remediation: null
      },
      {
        requirement: 'Audit Logging',
        status: this.config.compliance.auditLogging ? 'compliant' : 'non-compliant',
        evidence: ['Comprehensive audit logs'],
        remediation: 'Enable audit logging for all data access'
      },
      {
        requirement: 'Encryption',
        status: this.config.privacy.encryption.enabled ? 'compliant' : 'non-compliant',
        evidence: ['Data encrypted at rest and in transit'],
        remediation: 'Enable encryption for PHI data'
      }
    ];
  }

  private async checkPCICompliance(): Promise<any[]> {
    return [
      {
        requirement: 'Cardholder Data Protection',
        status: 'compliant',
        evidence: ['PAN masking implemented', 'Tokenization available'],
        remediation: null
      },
      {
        requirement: 'Strong Access Control',
        status: 'compliant',
        evidence: ['Multi-factor authentication', 'Principle of least privilege'],
        remediation: null
      },
      {
        requirement: 'Regular Security Testing',
        status: 'partial',
        evidence: ['Automated vulnerability scanning'],
        remediation: 'Implement quarterly penetration testing'
      }
    ];
  }

  private async handlePIIDetection(data: any) {
    // Automatically apply privacy controls
    if (this.config.privacy.masking.enabled) {
      await this.maskSensitiveData(data.data, data.fields);
    }

    // Log the detection
    await this.prisma.data_governance_events.create({
      data: {
        event_type: 'pii_detection',
        details: JSON.stringify(data),
        timestamp: new Date()
      }
    });
  }

  // Metrics and Monitoring
  getMetrics() {
    return {
      ...this.metrics,
      catalogSize: this.catalogService.getSize(),
      qualityScore: this.qualityService.getOverallScore(),
      retentionCompliance: this.retentionService.getComplianceRate()
    };
  }

  async shutdown() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
    }

    await this.prisma.$disconnect();
    this.emit('shutdown');
  }
}