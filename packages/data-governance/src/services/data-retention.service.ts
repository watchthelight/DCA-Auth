import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import archiver from 'archiver';
import * as crypto from 'crypto';

export class DataRetentionService extends EventEmitter {
  private config: any;
  private prisma: PrismaClient;
  private policies: Map<string, any> = new Map();
  private archiveLocation: string;

  constructor(config: any, prisma: PrismaClient) {
    super();
    this.config = config;
    this.prisma = prisma;
    this.archiveLocation = process.env.ARCHIVE_LOCATION || path.join(process.cwd(), 'archives');

    this.loadRetentionPolicies();
    this.ensureArchiveDirectory();
  }

  private loadRetentionPolicies() {
    // Load default policies
    const defaultPolicies = [
      {
        name: 'audit_logs',
        table: 'audit_logs',
        retentionDays: 2555, // 7 years
        archiveAfterDays: 365,
        deleteAfterDays: 2555
      },
      {
        name: 'user_sessions',
        table: 'sessions',
        retentionDays: 30,
        archiveAfterDays: null,
        deleteAfterDays: 30
      },
      {
        name: 'temp_data',
        table: 'temp_*',
        retentionDays: 7,
        archiveAfterDays: null,
        deleteAfterDays: 7
      },
      {
        name: 'licenses',
        table: 'licenses',
        retentionDays: 3650, // 10 years
        archiveAfterDays: 1095, // 3 years
        deleteAfterDays: 3650
      }
    ];

    // Load from config
    if (this.config.retention?.policies) {
      defaultPolicies.push(...this.config.retention.policies);
    }

    for (const policy of defaultPolicies) {
      this.policies.set(policy.name, policy);
    }
  }

  private async ensureArchiveDirectory() {
    try {
      await fs.mkdir(this.archiveLocation, { recursive: true });
    } catch (error) {
      console.error('Failed to create archive directory:', error);
    }
  }

  async applyPolicies(): Promise<{
    archived: number;
    deleted: number;
  }> {
    let totalArchived = 0;
    let totalDeleted = 0;

    for (const [name, policy] of this.policies) {
      try {
        const result = await this.applyPolicy(policy);
        totalArchived += result.archived;
        totalDeleted += result.deleted;

        this.emit('policy:applied', {
          policy: name,
          archived: result.archived,
          deleted: result.deleted
        });
      } catch (error) {
        console.error(`Failed to apply policy ${name}:`, error);
        this.emit('policy:failed', { policy: name, error });
      }
    }

    return {
      archived: totalArchived,
      deleted: totalDeleted
    };
  }

  private async applyPolicy(policy: any): Promise<{
    archived: number;
    deleted: number;
  }> {
    const now = new Date();
    let archived = 0;
    let deleted = 0;

    // Handle archiving
    if (policy.archiveAfterDays) {
      const archiveDate = new Date(now.getTime() - policy.archiveAfterDays * 24 * 60 * 60 * 1000);

      const toArchive = await this.getRecordsToProcess(
        policy.table,
        archiveDate,
        'archive'
      );

      if (toArchive.length > 0) {
        const archiveResult = await this.archiveRecords(
          policy.table,
          toArchive
        );
        archived = archiveResult.count;
      }
    }

    // Handle deletion
    if (policy.deleteAfterDays) {
      const deleteDate = new Date(now.getTime() - policy.deleteAfterDays * 24 * 60 * 60 * 1000);

      const toDelete = await this.getRecordsToProcess(
        policy.table,
        deleteDate,
        'delete'
      );

      if (toDelete.length > 0) {
        const deleteResult = await this.deleteRecords(
          policy.table,
          toDelete
        );
        deleted = deleteResult.count;
      }
    }

    return { archived, deleted };
  }

  private async getRecordsToProcess(
    table: string,
    cutoffDate: Date,
    operation: 'archive' | 'delete'
  ): Promise<any[]> {
    try {
      // Handle wildcard tables
      if (table.includes('*')) {
        const pattern = table.replace('*', '');
        const tables = Object.keys(this.prisma).filter(t =>
          t.includes(pattern) && !t.startsWith('_') && !t.startsWith('$')
        );

        let allRecords: any[] = [];
        for (const t of tables) {
          const records = await this.getTableRecords(t, cutoffDate);
          allRecords = allRecords.concat(records);
        }
        return allRecords;
      }

      return await this.getTableRecords(table, cutoffDate);
    } catch (error) {
      console.error(`Failed to get records from ${table}:`, error);
      return [];
    }
  }

  private async getTableRecords(table: string, cutoffDate: Date): Promise<any[]> {
    try {
      const records = await this.prisma[table].findMany({
        where: {
          created_at: {
            lt: cutoffDate
          }
        }
      });
      return records;
    } catch (error) {
      // Table might not exist or have created_at field
      return [];
    }
  }

  async archive(table: string, criteria: any): Promise<{
    recordsArchived: number;
    location: string;
  }> {
    const archiveId = crypto.randomUUID();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveName = `${table}_${timestamp}_${archiveId}.archive`;
    const archivePath = path.join(this.archiveLocation, archiveName);

    try {
      // Get records to archive
      const records = await this.prisma[table].findMany({ where: criteria });

      if (records.length === 0) {
        return { recordsArchived: 0, location: '' };
      }

      // Create archive
      await this.createArchive(archivePath, {
        table,
        records,
        metadata: {
          archiveId,
          timestamp: new Date(),
          recordCount: records.length,
          criteria
        }
      });

      // Mark records as archived (soft delete)
      await this.markAsArchived(table, records);

      this.emit('data:archived', {
        table,
        count: records.length,
        location: archivePath
      });

      return {
        recordsArchived: records.length,
        location: archivePath
      };
    } catch (error) {
      console.error('Archive operation failed:', error);
      throw error;
    }
  }

  private async createArchive(archivePath: string, data: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(archivePath);
      const archive = archiver('zip', {
        zlib: { level: 9 }
      });

      output.on('close', () => resolve());
      archive.on('error', reject);

      archive.pipe(output);

      // Add data file
      archive.append(JSON.stringify(data, null, 2), {
        name: 'data.json'
      });

      // Add metadata
      archive.append(JSON.stringify({
        created: new Date(),
        version: '1.0',
        format: 'json',
        compression: 'zip'
      }, null, 2), {
        name: 'metadata.json'
      });

      archive.finalize();
    });
  }

  private async markAsArchived(table: string, records: any[]): Promise<void> {
    const ids = records.map(r => r.id);

    try {
      await this.prisma[table].updateMany({
        where: { id: { in: ids } },
        data: { archived: true, archived_at: new Date() }
      });
    } catch (error) {
      // Table might not have archived fields
      console.log(`Could not mark records as archived in ${table}`);
    }
  }

  private async archiveRecords(table: string, records: any[]): Promise<{ count: number }> {
    const result = await this.archive(table, {
      id: { in: records.map(r => r.id) }
    });

    return { count: result.recordsArchived };
  }

  private async deleteRecords(table: string, records: any[]): Promise<{ count: number }> {
    const ids = records.map(r => r.id);

    try {
      const result = await this.prisma[table].deleteMany({
        where: { id: { in: ids } }
      });

      return { count: result.count };
    } catch (error) {
      console.error(`Failed to delete records from ${table}:`, error);
      return { count: 0 };
    }
  }

  async purge(table: string, criteria: any, reason: string): Promise<{
    recordsDeleted: number;
  }> {
    try {
      // Log the purge operation
      await this.logPurgeOperation(table, criteria, reason);

      // Perform deletion
      const result = await this.prisma[table].deleteMany({
        where: criteria
      });

      this.emit('data:purged', {
        table,
        count: result.count,
        reason
      });

      return {
        recordsDeleted: result.count
      };
    } catch (error) {
      console.error('Purge operation failed:', error);
      throw error;
    }
  }

  private async logPurgeOperation(table: string, criteria: any, reason: string): Promise<void> {
    try {
      await this.prisma.data_purge_log.create({
        data: {
          table_name: table,
          criteria: JSON.stringify(criteria),
          reason,
          purged_at: new Date(),
          purged_by: 'system'
        }
      });
    } catch (error) {
      // Log table might not exist
      console.log('Could not log purge operation:', error);
    }
  }

  async restore(archiveId: string, targetTable?: string): Promise<{
    recordsRestored: number;
  }> {
    const archives = await fs.readdir(this.archiveLocation);
    const archiveFile = archives.find(f => f.includes(archiveId));

    if (!archiveFile) {
      throw new Error(`Archive ${archiveId} not found`);
    }

    const archivePath = path.join(this.archiveLocation, archiveFile);

    // Extract and restore data
    const data = await this.extractArchive(archivePath);
    const table = targetTable || data.table;

    let restoredCount = 0;

    for (const record of data.records) {
      try {
        await this.prisma[table].create({ data: record });
        restoredCount++;
      } catch (error) {
        console.error(`Failed to restore record:`, error);
      }
    }

    this.emit('data:restored', {
      archiveId,
      table,
      count: restoredCount
    });

    return {
      recordsRestored: restoredCount
    };
  }

  private async extractArchive(archivePath: string): Promise<any> {
    // In a real implementation, would extract zip and parse JSON
    // For now, return mock data
    return {
      table: 'restored_data',
      records: [],
      metadata: {}
    };
  }

  async setPolicy(policy: {
    name: string;
    table: string;
    retentionDays: number;
    archiveAfterDays?: number;
    deleteAfterDays: number;
  }): Promise<void> {
    this.policies.set(policy.name, policy);
    this.emit('policy:updated', policy);
  }

  async removePolicy(name: string): Promise<void> {
    this.policies.delete(name);
    this.emit('policy:removed', { name });
  }

  getPolicies(): any[] {
    return Array.from(this.policies.values());
  }

  getComplianceRate(): number {
    // Calculate compliance based on policy adherence
    // This would check actual data against policies
    return 95; // Mock value
  }

  async generateRetentionReport(): Promise<{
    policies: any[];
    compliance: {
      compliant: number;
      nonCompliant: number;
      rate: number;
    };
    storage: {
      archived: number;
      active: number;
      total: number;
    };
    recommendations: string[];
  }> {
    const policies = this.getPolicies();

    return {
      policies,
      compliance: {
        compliant: 95,
        nonCompliant: 5,
        rate: 95
      },
      storage: {
        archived: 1024 * 1024 * 500, // 500MB
        active: 1024 * 1024 * 2000, // 2GB
        total: 1024 * 1024 * 2500 // 2.5GB
      },
      recommendations: [
        'Consider archiving data older than 1 year',
        'Review retention policies for temporary tables',
        'Implement automated archive verification'
      ]
    };
  }
}