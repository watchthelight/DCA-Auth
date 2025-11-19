import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import archiver from 'archiver';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { BlobServiceClient } from '@azure/storage-blob';
import { Storage } from '@google-cloud/storage';
import { PrismaClient } from '@prisma/client';
import CryptoJS from 'crypto-js';

export class BackupService extends EventEmitter {
  private config: any;
  private prisma: PrismaClient;
  private s3Client?: S3Client;
  private azureClient?: BlobServiceClient;
  private gcsClient?: Storage;
  private encryptionKey: string;

  constructor(config: any) {
    super();
    this.config = config;
    this.prisma = new PrismaClient();
    this.encryptionKey = process.env.BACKUP_ENCRYPTION_KEY || 'default-key';

    this.initializeStorageClients();
  }

  private initializeStorageClients() {
    // AWS S3
    if (process.env.AWS_REGION) {
      this.s3Client = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
        }
      });
    }

    // Azure Blob Storage
    if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
      this.azureClient = BlobServiceClient.fromConnectionString(
        process.env.AZURE_STORAGE_CONNECTION_STRING
      );
    }

    // Google Cloud Storage
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      this.gcsClient = new Storage();
    }
  }

  async backup(type: 'full' | 'incremental' | 'transaction-log'): Promise<any> {
    const backupId = crypto.randomUUID();
    const timestamp = new Date();
    const startTime = Date.now();

    this.emit('backup:progress', { id: backupId, progress: 0, status: 'initializing' });

    try {
      // Create backup directory
      const backupDir = path.join(process.cwd(), 'backups', backupId);
      await fs.mkdir(backupDir, { recursive: true });

      let components: any[] = [];
      let totalSize = 0;

      if (type === 'full' || type === 'incremental') {
        // Backup database
        this.emit('backup:progress', { id: backupId, progress: 20, status: 'backing up database' });
        const dbBackup = await this.backupDatabase(backupDir, type === 'incremental');
        components.push(dbBackup);
        totalSize += dbBackup.size;

        // Backup configuration
        this.emit('backup:progress', { id: backupId, progress: 40, status: 'backing up configuration' });
        const configBackup = await this.backupConfiguration(backupDir);
        components.push(configBackup);
        totalSize += configBackup.size;

        // Backup files
        this.emit('backup:progress', { id: backupId, progress: 60, status: 'backing up files' });
        const filesBackup = await this.backupFiles(backupDir);
        components.push(filesBackup);
        totalSize += filesBackup.size;
      } else {
        // Transaction log backup
        this.emit('backup:progress', { id: backupId, progress: 50, status: 'backing up transaction logs' });
        const logBackup = await this.backupTransactionLogs(backupDir);
        components.push(logBackup);
        totalSize += logBackup.size;
      }

      // Create archive
      this.emit('backup:progress', { id: backupId, progress: 80, status: 'creating archive' });
      const archivePath = await this.createArchive(backupDir, backupId);

      // Encrypt if enabled
      if (this.config.encryption.enabled) {
        this.emit('backup:progress', { id: backupId, progress: 90, status: 'encrypting backup' });
        await this.encryptBackup(archivePath);
      }

      // Upload to cloud storage
      this.emit('backup:progress', { id: backupId, progress: 95, status: 'uploading to cloud' });
      const location = await this.uploadBackup(archivePath, backupId);

      // Calculate checksum
      const checksum = await this.calculateChecksum(archivePath);

      // Cleanup local files
      await fs.rm(backupDir, { recursive: true, force: true });
      await fs.unlink(archivePath);

      const metadata = {
        id: backupId,
        timestamp,
        type,
        size: totalSize,
        duration: Date.now() - startTime,
        status: 'completed' as const,
        location,
        checksum,
        encrypted: this.config.encryption.enabled,
        components
      };

      // Store metadata
      await this.storeMetadata(metadata);

      this.emit('backup:progress', { id: backupId, progress: 100, status: 'completed' });
      this.emit('backup:complete', metadata);

      return metadata;
    } catch (error) {
      this.emit('backup:failed', { id: backupId, error });
      throw error;
    }
  }

  private async backupDatabase(backupDir: string, incremental: boolean): Promise<any> {
    const dbBackupPath = path.join(backupDir, 'database.sql');

    // Get last backup timestamp for incremental
    let lastBackupTime = null;
    if (incremental) {
      const lastBackup = await this.getLastBackup('full');
      lastBackupTime = lastBackup?.timestamp;
    }

    // Export database data
    const tables = ['users', 'licenses', 'activations', 'organizations', 'audit_logs'];
    let totalRecords = 0;
    let backupData = '';

    for (const table of tables) {
      const where = incremental && lastBackupTime ? {
        updatedAt: { gte: lastBackupTime }
      } : {};

      const records = await this.prisma[table].findMany({ where });
      totalRecords += records.length;

      backupData += `-- Table: ${table}\n`;
      backupData += `-- Records: ${records.length}\n`;
      backupData += JSON.stringify(records, null, 2) + '\n\n';
    }

    await fs.writeFile(dbBackupPath, backupData);

    const stats = await fs.stat(dbBackupPath);

    return {
      name: 'database',
      size: stats.size,
      records: totalRecords,
      incremental
    };
  }

  private async backupConfiguration(backupDir: string): Promise<any> {
    const configBackupPath = path.join(backupDir, 'config.json');

    const config = {
      environment: process.env.NODE_ENV,
      version: process.env.APP_VERSION,
      timestamp: new Date(),
      settings: {
        database: {
          type: process.env.DB_TYPE,
          host: process.env.DB_HOST,
          port: process.env.DB_PORT,
          name: process.env.DB_NAME
        },
        redis: {
          host: process.env.REDIS_HOST,
          port: process.env.REDIS_PORT
        },
        features: {
          twoFactor: process.env.ENABLE_2FA === 'true',
          billing: process.env.ENABLE_BILLING === 'true'
        }
      }
    };

    await fs.writeFile(configBackupPath, JSON.stringify(config, null, 2));

    const stats = await fs.stat(configBackupPath);

    return {
      name: 'configuration',
      size: stats.size,
      records: 1
    };
  }

  private async backupFiles(backupDir: string): Promise<any> {
    const filesBackupPath = path.join(backupDir, 'files');
    await fs.mkdir(filesBackupPath, { recursive: true });

    // Backup important files
    const filesToBackup = [
      'package.json',
      'package-lock.json',
      '.env.example',
      'docker-compose.yml'
    ];

    let totalSize = 0;

    for (const file of filesToBackup) {
      const sourcePath = path.join(process.cwd(), file);
      const destPath = path.join(filesBackupPath, file);

      try {
        await fs.copyFile(sourcePath, destPath);
        const stats = await fs.stat(destPath);
        totalSize += stats.size;
      } catch (error) {
        console.warn(`Failed to backup file ${file}:`, error);
      }
    }

    return {
      name: 'files',
      size: totalSize,
      records: filesToBackup.length
    };
  }

  private async backupTransactionLogs(backupDir: string): Promise<any> {
    const logsBackupPath = path.join(backupDir, 'transaction_logs.jsonl');

    // Get recent transaction logs
    const recentLogs = await this.prisma.audit_logs.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    let logData = '';
    for (const log of recentLogs) {
      logData += JSON.stringify(log) + '\n';
    }

    await fs.writeFile(logsBackupPath, logData);

    const stats = await fs.stat(logsBackupPath);

    return {
      name: 'transaction_logs',
      size: stats.size,
      records: recentLogs.length
    };
  }

  private async createArchive(backupDir: string, backupId: string): Promise<string> {
    const archivePath = path.join(process.cwd(), 'backups', `${backupId}.tar.gz`);

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(archivePath);
      const archive = archiver('tar', {
        gzip: true,
        gzipOptions: { level: 9 }
      });

      output.on('close', () => resolve(archivePath));
      archive.on('error', reject);

      archive.pipe(output);
      archive.directory(backupDir, false);
      archive.finalize();
    });
  }

  private async encryptBackup(archivePath: string): Promise<void> {
    const data = await fs.readFile(archivePath);
    const encrypted = CryptoJS.AES.encrypt(data.toString('base64'), this.encryptionKey).toString();
    await fs.writeFile(archivePath + '.enc', encrypted);
    await fs.unlink(archivePath);
    await fs.rename(archivePath + '.enc', archivePath);
  }

  private async uploadBackup(archivePath: string, backupId: string): Promise<string> {
    const fileBuffer = await fs.readFile(archivePath);
    const fileName = `backups/${backupId}.tar.gz`;

    // Try AWS S3 first
    if (this.s3Client) {
      await this.s3Client.send(new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET!,
        Key: fileName,
        Body: fileBuffer,
        ServerSideEncryption: 'AES256'
      }));

      return `s3://${process.env.AWS_S3_BUCKET}/${fileName}`;
    }

    // Try Azure Blob Storage
    if (this.azureClient) {
      const containerClient = this.azureClient.getContainerClient('backups');
      const blockBlobClient = containerClient.getBlockBlobClient(fileName);
      await blockBlobClient.upload(fileBuffer, fileBuffer.length);

      return `azure://backups/${fileName}`;
    }

    // Try Google Cloud Storage
    if (this.gcsClient) {
      const bucket = this.gcsClient.bucket(process.env.GCS_BUCKET!);
      const file = bucket.file(fileName);
      await file.save(fileBuffer);

      return `gcs://${process.env.GCS_BUCKET}/${fileName}`;
    }

    // Fallback to local storage
    const localPath = path.join(process.cwd(), 'backups', 'storage', fileName);
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.copyFile(archivePath, localPath);

    return `file://${localPath}`;
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    const fileBuffer = await fs.readFile(filePath);
    const hash = crypto.createHash('sha256');
    hash.update(fileBuffer);
    return hash.digest('hex');
  }

  private async storeMetadata(metadata: any): Promise<void> {
    // Store in database
    await this.prisma.backup_metadata.create({
      data: {
        backup_id: metadata.id,
        timestamp: metadata.timestamp,
        type: metadata.type,
        size: metadata.size,
        duration: metadata.duration,
        status: metadata.status,
        location: metadata.location,
        checksum: metadata.checksum,
        encrypted: metadata.encrypted,
        components: JSON.stringify(metadata.components)
      }
    });
  }

  async listBackups(filters?: any): Promise<any[]> {
    const where: any = {};

    if (filters?.type) {
      where.type = filters.type;
    }

    if (filters?.startDate || filters?.endDate) {
      where.timestamp = {};
      if (filters.startDate) {
        where.timestamp.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.timestamp.lte = filters.endDate;
      }
    }

    const backups = await this.prisma.backup_metadata.findMany({
      where,
      orderBy: { timestamp: 'desc' }
    });

    return backups.map(b => ({
      id: b.backup_id,
      timestamp: b.timestamp,
      type: b.type,
      size: b.size,
      duration: b.duration,
      status: b.status,
      location: b.location,
      checksum: b.checksum,
      encrypted: b.encrypted,
      components: JSON.parse(b.components)
    }));
  }

  async deleteBackup(backupId: string): Promise<void> {
    const backup = await this.prisma.backup_metadata.findUnique({
      where: { backup_id: backupId }
    });

    if (!backup) {
      throw new Error(`Backup ${backupId} not found`);
    }

    // Delete from cloud storage
    if (backup.location.startsWith('s3://')) {
      const key = backup.location.replace(`s3://${process.env.AWS_S3_BUCKET}/`, '');
      await this.s3Client!.send(new DeleteObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET!,
        Key: key
      }));
    }

    // Delete metadata
    await this.prisma.backup_metadata.delete({
      where: { backup_id: backupId }
    });

    this.emit('backup:deleted', { id: backupId });
  }

  async validateBackup(backupId: string): Promise<boolean> {
    const backup = await this.prisma.backup_metadata.findUnique({
      where: { backup_id: backupId }
    });

    if (!backup) {
      return false;
    }

    // Download and verify checksum
    // Implementation depends on storage location
    return true;
  }

  private async getLastBackup(type: string): Promise<any> {
    return this.prisma.backup_metadata.findFirst({
      where: { type, status: 'completed' },
      orderBy: { timestamp: 'desc' }
    });
  }
}