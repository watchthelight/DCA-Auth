import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

export class DataCatalogService extends EventEmitter {
  private config: any;
  private prisma: PrismaClient;
  private catalog: Map<string, any> = new Map();

  constructor(config: any, prisma: PrismaClient) {
    super();
    this.config = config;
    this.prisma = prisma;
  }

  async discoverTables(): Promise<any[]> {
    const tables: any[] = [];

    try {
      // Get all Prisma model names
      const modelNames = Object.keys(this.prisma).filter(
        key => !key.startsWith('_') && !key.startsWith('$')
      );

      for (const modelName of modelNames) {
        const model = this.prisma[modelName];

        // Get table information
        const tableInfo = {
          name: modelName,
          schema: 'public',
          owner: 'system',
          columns: await this.getTableColumns(modelName),
          indexes: [],
          constraints: [],
          created: new Date(),
          modified: new Date()
        };

        tables.push(tableInfo);
        this.emit('table:discovered', tableInfo);
      }

      return tables;
    } catch (error) {
      console.error('Error discovering tables:', error);
      throw error;
    }
  }

  private async getTableColumns(tableName: string): Promise<any[]> {
    // In a real implementation, this would query the database schema
    // For now, return mock column data based on common patterns
    const commonColumns = {
      users: [
        { name: 'id', type: 'uuid', nullable: false, primary: true },
        { name: 'email', type: 'varchar', nullable: false, unique: true },
        { name: 'name', type: 'varchar', nullable: true },
        { name: 'password', type: 'varchar', nullable: false },
        { name: 'created_at', type: 'timestamp', nullable: false },
        { name: 'updated_at', type: 'timestamp', nullable: false }
      ],
      licenses: [
        { name: 'id', type: 'uuid', nullable: false, primary: true },
        { name: 'key', type: 'varchar', nullable: false, unique: true },
        { name: 'user_id', type: 'uuid', nullable: false },
        { name: 'product', type: 'varchar', nullable: false },
        { name: 'status', type: 'varchar', nullable: false },
        { name: 'expires_at', type: 'timestamp', nullable: true }
      ]
    };

    return commonColumns[tableName] || [
      { name: 'id', type: 'uuid', nullable: false, primary: true },
      { name: 'created_at', type: 'timestamp', nullable: false },
      { name: 'updated_at', type: 'timestamp', nullable: false }
    ];
  }

  async storeAssets(assets: any[]): Promise<void> {
    for (const asset of assets) {
      this.catalog.set(asset.id, asset);

      // Store in database
      await this.prisma.data_catalog.upsert({
        where: { asset_id: asset.id },
        update: {
          name: asset.name,
          type: asset.type,
          location: asset.location,
          owner: asset.owner,
          classification: asset.classification,
          sensitivity: asset.sensitivity,
          tags: JSON.stringify(asset.tags),
          metadata: JSON.stringify(asset.metadata),
          quality_score: asset.quality?.score || 0,
          updated_at: new Date()
        },
        create: {
          asset_id: asset.id,
          name: asset.name,
          type: asset.type,
          location: asset.location,
          owner: asset.owner,
          classification: asset.classification,
          sensitivity: asset.sensitivity,
          tags: JSON.stringify(asset.tags),
          metadata: JSON.stringify(asset.metadata),
          quality_score: asset.quality?.score || 0,
          created_at: new Date(),
          updated_at: new Date()
        }
      }).catch(() => {
        // Handle if table doesn't exist
        console.log('Data catalog table not found, using in-memory storage');
      });
    }

    this.emit('assets:stored', { count: assets.length });
  }

  async search(filters?: any): Promise<any[]> {
    const results: any[] = [];

    for (const [id, asset] of this.catalog) {
      let match = true;

      if (filters?.type && asset.type !== filters.type) {
        match = false;
      }

      if (filters?.classification && asset.classification !== filters.classification) {
        match = false;
      }

      if (filters?.owner && asset.owner !== filters.owner) {
        match = false;
      }

      if (filters?.tags && filters.tags.length > 0) {
        const hasAllTags = filters.tags.every((tag: string) =>
          asset.tags.includes(tag)
        );
        if (!hasAllTags) {
          match = false;
        }
      }

      if (match) {
        results.push(asset);
      }
    }

    return results;
  }

  async updateAsset(assetId: string, updates: any): Promise<any> {
    const asset = this.catalog.get(assetId);
    if (!asset) {
      throw new Error(`Asset ${assetId} not found`);
    }

    const updatedAsset = { ...asset, ...updates };
    this.catalog.set(assetId, updatedAsset);

    // Update in database
    try {
      await this.prisma.data_catalog.update({
        where: { asset_id: assetId },
        data: {
          ...updates,
          tags: updates.tags ? JSON.stringify(updates.tags) : undefined,
          metadata: updates.metadata ? JSON.stringify(updates.metadata) : undefined,
          updated_at: new Date()
        }
      });
    } catch (error) {
      console.log('Failed to update in database:', error);
    }

    this.emit('asset:updated', updatedAsset);
    return updatedAsset;
  }

  async getAllTables(): Promise<string[]> {
    const tables: string[] = [];

    for (const [id, asset] of this.catalog) {
      if (asset.type === 'table') {
        tables.push(asset.name);
      }
    }

    return tables;
  }

  getSize(): number {
    return this.catalog.size;
  }

  async getAssetById(assetId: string): Promise<any> {
    return this.catalog.get(assetId);
  }

  async deleteAsset(assetId: string): Promise<void> {
    this.catalog.delete(assetId);

    try {
      await this.prisma.data_catalog.delete({
        where: { asset_id: assetId }
      });
    } catch (error) {
      console.log('Failed to delete from database:', error);
    }

    this.emit('asset:deleted', { id: assetId });
  }

  async getAssetStatistics(): Promise<{
    totalAssets: number;
    byType: Record<string, number>;
    byClassification: Record<string, number>;
    bySensitivity: Record<string, number>;
  }> {
    const stats = {
      totalAssets: this.catalog.size,
      byType: {} as Record<string, number>,
      byClassification: {} as Record<string, number>,
      bySensitivity: {} as Record<string, number>
    };

    for (const [id, asset] of this.catalog) {
      // Count by type
      stats.byType[asset.type] = (stats.byType[asset.type] || 0) + 1;

      // Count by classification
      stats.byClassification[asset.classification] =
        (stats.byClassification[asset.classification] || 0) + 1;

      // Count by sensitivity
      stats.bySensitivity[asset.sensitivity] =
        (stats.bySensitivity[asset.sensitivity] || 0) + 1;
    }

    return stats;
  }
}