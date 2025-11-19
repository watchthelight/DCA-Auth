export {
  DataGovernanceService,
  DataGovernanceConfig,
  DataAsset,
  DataQualityMetrics
} from './services/data-governance.service';

import { DataGovernanceService, DataGovernanceConfig } from './services/data-governance.service';

// Default configuration
const defaultConfig: DataGovernanceConfig = {
  catalog: {
    enabled: true,
    autoDiscovery: true,
    scanInterval: 24 // hours
  },
  classification: {
    enabled: true,
    levels: ['public', 'internal', 'confidential', 'restricted'],
    piiDetection: true
  },
  quality: {
    enabled: true,
    rules: [],
    monitoring: true
  },
  privacy: {
    enabled: true,
    encryption: {
      algorithm: 'AES-256',
      keyRotation: true,
      keyRotationDays: 90
    },
    masking: {
      enabled: true,
      fields: []
    },
    consent: {
      tracking: true,
      defaultExpiry: 365
    }
  },
  retention: {
    enabled: true,
    policies: []
  },
  lineage: {
    enabled: true,
    tracking: true,
    visualization: true
  },
  compliance: {
    frameworks: ['gdpr', 'ccpa'],
    reporting: true,
    auditLogging: true
  }
};

// Singleton instance
let governanceInstance: DataGovernanceService | null = null;

// Initialize data governance
export function initializeDataGovernance(config?: Partial<DataGovernanceConfig>): DataGovernanceService {
  if (!governanceInstance) {
    const finalConfig = {
      ...defaultConfig,
      ...config
    };

    governanceInstance = new DataGovernanceService(finalConfig);

    // Set up error handling
    governanceInstance.on('error', (error) => {
      console.error('[Data Governance] Error:', error);
    });

    governanceInstance.on('pii:detected', (data) => {
      console.warn('[Data Governance] PII detected:', data);
    });
  }

  return governanceInstance;
}

// Get governance instance
export function getDataGovernance(): DataGovernanceService {
  if (!governanceInstance) {
    return initializeDataGovernance();
  }
  return governanceInstance;
}

// Express middleware for data governance
export function dataGovernanceMiddleware() {
  return async (req: any, res: any, next: any) => {
    const governance = getDataGovernance();

    // Track data access
    if (req.method === 'GET' && req.path.includes('/api/')) {
      const asset = req.path.replace('/api/', '').split('/')[0];
      await governance.recordDataFlow('api', asset, 'read');
    }

    // Check for PII in responses
    const originalJson = res.json;
    res.json = function(data: any) {
      governance.classifyData(data, req.path).then(classification => {
        if (classification.pii) {
          console.warn(`PII detected in response for ${req.path}`);

          // Apply masking if configured
          if (req.query.mask === 'true' || req.headers['x-mask-pii'] === 'true') {
            governance.maskSensitiveData(data, classification.piiFields).then(masked => {
              return originalJson.call(res, masked);
            });
            return;
          }
        }

        return originalJson.call(res, data);
      }).catch(error => {
        console.error('Data classification error:', error);
        return originalJson.call(res, data);
      });
    };

    next();
  };
}

// Data quality validator
export class DataQualityValidator {
  private governance: DataGovernanceService;

  constructor(governance?: DataGovernanceService) {
    this.governance = governance || getDataGovernance();
  }

  async validate(table: string, data: any): Promise<{
    valid: boolean;
    errors: string[];
    qualityScore: number;
  }> {
    const validation = await this.governance.validateData(table, data);
    const quality = await this.governance.assessDataQuality(table);

    return {
      valid: validation.valid,
      errors: validation.errors,
      qualityScore: quality.overall
    };
  }

  async defineRule(rule: any): Promise<void> {
    await this.governance.defineQualityRule(rule);
  }
}

// Privacy manager
export class PrivacyManager {
  private governance: DataGovernanceService;

  constructor(governance?: DataGovernanceService) {
    this.governance = governance || getDataGovernance();
  }

  async handleDataSubjectRequest(userId: string, requestType: 'access' | 'delete' | 'portability'): Promise<any> {
    switch (requestType) {
      case 'access':
        // Return all data about the user
        return this.governance.getDataCatalog({ owner: userId });

      case 'delete':
        // Delete user data
        return this.governance.purgeData('users', { id: userId }, 'GDPR right to erasure');

      case 'portability':
        // Export user data in portable format
        const data = await this.governance.getDataCatalog({ owner: userId });
        return {
          format: 'json',
          data: JSON.stringify(data, null, 2)
        };

      default:
        throw new Error(`Unknown request type: ${requestType}`);
    }
  }

  async recordConsent(userId: string, purpose: string, granted: boolean): Promise<void> {
    await this.governance.recordConsent(userId, purpose, granted);
  }

  async checkConsent(userId: string, purpose: string): Promise<boolean> {
    return this.governance.checkConsent(userId, purpose);
  }

  async maskData(data: any, fields?: string[]): Promise<any> {
    return this.governance.maskSensitiveData(data, fields);
  }

  async pseudonymize(data: any, fields: string[]): Promise<any> {
    return this.governance.pseudonymize(data, fields);
  }
}

// Compliance reporter
export class ComplianceReporter {
  private governance: DataGovernanceService;

  constructor(governance?: DataGovernanceService) {
    this.governance = governance || getDataGovernance();
  }

  async generateGDPRReport(): Promise<any> {
    return this.governance.generateComplianceReport('gdpr');
  }

  async generateCCPAReport(): Promise<any> {
    return this.governance.generateComplianceReport('ccpa');
  }

  async generateHIPAAReport(): Promise<any> {
    return this.governance.generateComplianceReport('hipaa');
  }

  async generatePCIReport(): Promise<any> {
    return this.governance.generateComplianceReport('pci');
  }

  async getComplianceStatus(): Promise<{
    frameworks: string[];
    overallCompliance: number;
    issues: string[];
    recommendations: string[];
  }> {
    const frameworks = ['gdpr', 'ccpa', 'hipaa', 'pci'];
    const reports = await Promise.all(
      frameworks.map(f => this.governance.generateComplianceReport(f))
    );

    const overallCompliance = reports.reduce((sum, r) => sum + r.score, 0) / reports.length;
    const issues = reports.flatMap(r => r.findings.filter(f => f.status !== 'compliant').map(f => f.requirement));
    const recommendations = reports.flatMap(r => r.recommendations);

    return {
      frameworks,
      overallCompliance,
      issues: [...new Set(issues)],
      recommendations: [...new Set(recommendations)]
    };
  }
}

// Export utility classes
export const dataQualityValidator = new DataQualityValidator();
export const privacyManager = new PrivacyManager();
export const complianceReporter = new ComplianceReporter();

// CLI commands
export async function runDataGovernanceScan(): Promise<void> {
  const governance = getDataGovernance();
  console.log('Starting data governance scan...');

  const assets = await governance.scanDataAssets();
  console.log(`Scanned ${assets.length} data assets`);

  const quality = await governance.assessDataQuality();
  console.log(`Data quality score: ${quality.overall.toFixed(2)}%`);

  const compliance = await complianceReporter.getComplianceStatus();
  console.log(`Compliance score: ${compliance.overallCompliance.toFixed(2)}%`);

  if (compliance.issues.length > 0) {
    console.log('\nCompliance issues found:');
    compliance.issues.forEach(issue => console.log(`  - ${issue}`));
  }

  if (compliance.recommendations.length > 0) {
    console.log('\nRecommendations:');
    compliance.recommendations.forEach(rec => console.log(`  - ${rec}`));
  }
}

// Cleanup on process exit
process.on('SIGINT', async () => {
  if (governanceInstance) {
    await governanceInstance.shutdown();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (governanceInstance) {
    await governanceInstance.shutdown();
  }
  process.exit(0);
});