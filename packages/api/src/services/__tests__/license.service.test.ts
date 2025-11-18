import { Test, TestingModule } from '@nestjs/testing';
import { LicenseService } from '../license.service';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LicenseStatus, LicenseType, Prisma } from '@prisma/client';

describe('LicenseService', () => {
  let service: LicenseService;
  let prismaService: jest.Mocked<PrismaService>;
  let redisService: jest.Mocked<RedisService>;

  const mockLicense = {
    id: 'license-123',
    key: 'XXXX-XXXX-XXXX-XXXX',
    type: LicenseType.STANDARD,
    status: LicenseStatus.ACTIVE,
    userId: 'user-123',
    productId: 'product-123',
    maxActivations: 3,
    currentActivations: 1,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {
      id: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
    },
    product: {
      id: 'product-123',
      name: 'Test Product',
      description: 'Test product description',
    },
    activations: [],
  };

  const mockActivation = {
    id: 'activation-123',
    licenseId: 'license-123',
    hardwareId: 'hardware-123',
    deviceName: 'Test Device',
    ipAddress: '192.168.1.1',
    activatedAt: new Date(),
    lastSeenAt: new Date(),
    metadata: {},
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LicenseService,
        {
          provide: PrismaService,
          useValue: {
            license: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              count: jest.fn(),
            },
            activation: {
              create: jest.fn(),
              findFirst: jest.fn(),
              findMany: jest.fn(),
              delete: jest.fn(),
              update: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
            },
            product: {
              findUnique: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            setex: jest.fn(),
            exists: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<LicenseService>(LicenseService);
    prismaService = module.get(PrismaService);
    redisService = module.get(RedisService);
  });

  describe('create', () => {
    it('should create a license successfully', async () => {
      const createDto = {
        type: LicenseType.STANDARD,
        userId: 'user-123',
        productId: 'product-123',
        maxActivations: 3,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      };

      jest.spyOn(service as any, 'generateLicenseKey').mockReturnValue('XXXX-XXXX-XXXX-XXXX');
      prismaService.license.create.mockResolvedValue(mockLicense);

      const result = await service.create(createDto);

      expect(result).toEqual(mockLicense);
      expect(prismaService.license.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          key: 'XXXX-XXXX-XXXX-XXXX',
          type: createDto.type,
          userId: createDto.userId,
          productId: createDto.productId,
          maxActivations: createDto.maxActivations,
          expiresAt: createDto.expiresAt,
          status: LicenseStatus.ACTIVE,
        }),
        include: {
          user: true,
          product: true,
          activations: true,
        },
      });
    });

    it('should generate unique license key', async () => {
      const createDto = {
        type: LicenseType.PREMIUM,
        userId: 'user-123',
        productId: 'product-123',
        maxActivations: 5,
      };

      // First call returns existing key, second returns unique key
      jest.spyOn(service as any, 'generateLicenseKey')
        .mockReturnValueOnce('EXISTING-KEY')
        .mockReturnValueOnce('UNIQUE-KEY');

      prismaService.license.findUnique
        .mockResolvedValueOnce(mockLicense) // Key exists
        .mockResolvedValueOnce(null); // Key is unique

      prismaService.license.create.mockResolvedValue({
        ...mockLicense,
        key: 'UNIQUE-KEY',
      });

      const result = await service.create(createDto);

      expect(result.key).toBe('UNIQUE-KEY');
      expect(prismaService.license.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('findOne', () => {
    it('should find a license by ID', async () => {
      prismaService.license.findUnique.mockResolvedValue(mockLicense);

      const result = await service.findOne('license-123');

      expect(result).toEqual(mockLicense);
      expect(prismaService.license.findUnique).toHaveBeenCalledWith({
        where: { id: 'license-123' },
        include: {
          user: true,
          product: true,
          activations: true,
        },
      });
    });

    it('should throw NotFoundException if license not found', async () => {
      prismaService.license.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('activate', () => {
    it('should activate a license successfully', async () => {
      const activateDto = {
        key: 'XXXX-XXXX-XXXX-XXXX',
        hardwareId: 'hardware-123',
        deviceName: 'Test Device',
        ipAddress: '192.168.1.1',
      };

      prismaService.license.findUnique.mockResolvedValue(mockLicense);
      prismaService.activation.findFirst.mockResolvedValue(null);
      prismaService.$transaction.mockImplementation(async (callback) => {
        return callback(prismaService as any);
      });
      prismaService.activation.create.mockResolvedValue(mockActivation);
      prismaService.license.update.mockResolvedValue({
        ...mockLicense,
        currentActivations: 2,
      });

      const result = await service.activate(activateDto);

      expect(result).toHaveProperty('activation');
      expect(result).toHaveProperty('license');
      expect(prismaService.activation.create).toHaveBeenCalled();
      expect(prismaService.license.update).toHaveBeenCalledWith({
        where: { id: mockLicense.id },
        data: { currentActivations: { increment: 1 } },
      });
    });

    it('should reuse existing activation for same hardware', async () => {
      const activateDto = {
        key: 'XXXX-XXXX-XXXX-XXXX',
        hardwareId: 'hardware-123',
        deviceName: 'Test Device',
        ipAddress: '192.168.1.1',
      };

      prismaService.license.findUnique.mockResolvedValue(mockLicense);
      prismaService.activation.findFirst.mockResolvedValue(mockActivation);
      prismaService.activation.update.mockResolvedValue({
        ...mockActivation,
        lastSeenAt: new Date(),
      });

      const result = await service.activate(activateDto);

      expect(result.activation).toEqual(
        expect.objectContaining({
          id: mockActivation.id,
          hardwareId: mockActivation.hardwareId,
        }),
      );
      expect(prismaService.activation.create).not.toHaveBeenCalled();
      expect(prismaService.activation.update).toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid license key', async () => {
      const activateDto = {
        key: 'INVALID-KEY',
        hardwareId: 'hardware-123',
        deviceName: 'Test Device',
        ipAddress: '192.168.1.1',
      };

      prismaService.license.findUnique.mockResolvedValue(null);

      await expect(service.activate(activateDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for expired license', async () => {
      const activateDto = {
        key: 'XXXX-XXXX-XXXX-XXXX',
        hardwareId: 'hardware-123',
        deviceName: 'Test Device',
        ipAddress: '192.168.1.1',
      };

      const expiredLicense = {
        ...mockLicense,
        expiresAt: new Date(Date.now() - 1000), // Expired
      };

      prismaService.license.findUnique.mockResolvedValue(expiredLicense);

      await expect(service.activate(activateDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when max activations reached', async () => {
      const activateDto = {
        key: 'XXXX-XXXX-XXXX-XXXX',
        hardwareId: 'new-hardware',
        deviceName: 'New Device',
        ipAddress: '192.168.1.2',
      };

      const maxedLicense = {
        ...mockLicense,
        currentActivations: 3,
        maxActivations: 3,
      };

      prismaService.license.findUnique.mockResolvedValue(maxedLicense);
      prismaService.activation.findFirst.mockResolvedValue(null);

      await expect(service.activate(activateDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('deactivate', () => {
    it('should deactivate a license successfully', async () => {
      const deactivateDto = {
        key: 'XXXX-XXXX-XXXX-XXXX',
        hardwareId: 'hardware-123',
      };

      prismaService.license.findUnique.mockResolvedValue(mockLicense);
      prismaService.activation.findFirst.mockResolvedValue(mockActivation);
      prismaService.$transaction.mockImplementation(async (callback) => {
        return callback(prismaService as any);
      });
      prismaService.activation.delete.mockResolvedValue(mockActivation);
      prismaService.license.update.mockResolvedValue({
        ...mockLicense,
        currentActivations: 0,
      });

      await service.deactivate(deactivateDto);

      expect(prismaService.activation.delete).toHaveBeenCalledWith({
        where: { id: mockActivation.id },
      });
      expect(prismaService.license.update).toHaveBeenCalledWith({
        where: { id: mockLicense.id },
        data: { currentActivations: { decrement: 1 } },
      });
    });

    it('should throw BadRequestException if activation not found', async () => {
      const deactivateDto = {
        key: 'XXXX-XXXX-XXXX-XXXX',
        hardwareId: 'non-existent-hardware',
      };

      prismaService.license.findUnique.mockResolvedValue(mockLicense);
      prismaService.activation.findFirst.mockResolvedValue(null);

      await expect(service.deactivate(deactivateDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('verify', () => {
    it('should verify a valid license', async () => {
      const verifyDto = {
        key: 'XXXX-XXXX-XXXX-XXXX',
        hardwareId: 'hardware-123',
      };

      prismaService.license.findUnique.mockResolvedValue(mockLicense);
      prismaService.activation.findFirst.mockResolvedValue(mockActivation);
      redisService.setex.mockResolvedValue('OK');

      const result = await service.verify(verifyDto);

      expect(result).toEqual({
        valid: true,
        license: mockLicense,
        activation: mockActivation,
      });
      expect(redisService.setex).toHaveBeenCalledWith(
        `license:verify:${mockLicense.key}:${verifyDto.hardwareId}`,
        300,
        JSON.stringify({ valid: true }),
      );
    });

    it('should return cached verification result', async () => {
      const verifyDto = {
        key: 'XXXX-XXXX-XXXX-XXXX',
        hardwareId: 'hardware-123',
      };

      const cachedResult = JSON.stringify({ valid: true });
      redisService.get.mockResolvedValue(cachedResult);

      const result = await service.verify(verifyDto);

      expect(result).toEqual({ valid: true });
      expect(prismaService.license.findUnique).not.toHaveBeenCalled();
    });

    it('should return invalid for non-existent license', async () => {
      const verifyDto = {
        key: 'INVALID-KEY',
        hardwareId: 'hardware-123',
      };

      prismaService.license.findUnique.mockResolvedValue(null);

      const result = await service.verify(verifyDto);

      expect(result).toEqual({
        valid: false,
        error: 'License not found',
      });
    });

    it('should return invalid for inactive activation', async () => {
      const verifyDto = {
        key: 'XXXX-XXXX-XXXX-XXXX',
        hardwareId: 'hardware-123',
      };

      prismaService.license.findUnique.mockResolvedValue(mockLicense);
      prismaService.activation.findFirst.mockResolvedValue(null);

      const result = await service.verify(verifyDto);

      expect(result).toEqual({
        valid: false,
        error: 'No active activation found for this hardware',
      });
    });
  });

  describe('revoke', () => {
    it('should revoke a license successfully', async () => {
      prismaService.license.findUnique.mockResolvedValue(mockLicense);
      prismaService.$transaction.mockImplementation(async (callback) => {
        return callback(prismaService as any);
      });
      prismaService.activation.delete.mockResolvedValue(mockActivation);
      prismaService.license.update.mockResolvedValue({
        ...mockLicense,
        status: LicenseStatus.REVOKED,
      });

      const result = await service.revoke('license-123', 'Violation of terms');

      expect(result.status).toBe(LicenseStatus.REVOKED);
      expect(prismaService.license.update).toHaveBeenCalledWith({
        where: { id: 'license-123' },
        data: {
          status: LicenseStatus.REVOKED,
          metadata: expect.objectContaining({
            revokedAt: expect.any(String),
            revokeReason: 'Violation of terms',
          }),
        },
      });
    });

    it('should clear cache when revoking', async () => {
      prismaService.license.findUnique.mockResolvedValue(mockLicense);
      prismaService.$transaction.mockImplementation(async (callback) => {
        return callback(prismaService as any);
      });
      prismaService.license.update.mockResolvedValue({
        ...mockLicense,
        status: LicenseStatus.REVOKED,
      });

      await service.revoke('license-123');

      expect(redisService.del).toHaveBeenCalledWith(
        expect.stringContaining(`license:verify:${mockLicense.key}`),
      );
    });
  });
});