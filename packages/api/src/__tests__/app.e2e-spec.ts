import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../services/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

describe('DCA-Auth API (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let jwtService: JwtService;
  let authToken: string;
  let refreshToken: string;
  let testUserId: string;
  let testLicenseId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prismaService = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

    // Setup global pipes and filters as in main.ts
    app.useGlobalPipes(new ValidationPipe());
    app.enableCors();

    await app.init();

    // Clean database before tests
    await prismaService.activation.deleteMany();
    await prismaService.license.deleteMany();
    await prismaService.refreshToken.deleteMany();
    await prismaService.user.deleteMany();
    await prismaService.product.deleteMany();

    // Create test product
    const product = await prismaService.product.create({
      data: {
        name: 'Test Product',
        description: 'Product for testing',
        price: 99.99,
      },
    });
  });

  afterAll(async () => {
    // Clean up
    await prismaService.activation.deleteMany();
    await prismaService.license.deleteMany();
    await prismaService.refreshToken.deleteMany();
    await prismaService.user.deleteMany();
    await prismaService.product.deleteMany();

    await app.close();
  });

  describe('Authentication', () => {
    describe('/api/auth/register (POST)', () => {
      it('should register a new user', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/auth/register')
          .send({
            email: 'test@example.com',
            password: 'SecurePass123!',
            username: 'testuser',
          })
          .expect(201);

        expect(response.body).toHaveProperty('id');
        expect(response.body.email).toBe('test@example.com');
        expect(response.body.username).toBe('testuser');
        expect(response.body).not.toHaveProperty('password');

        testUserId = response.body.id;
      });

      it('should not allow duplicate email registration', async () => {
        await request(app.getHttpServer())
          .post('/api/auth/register')
          .send({
            email: 'test@example.com',
            password: 'AnotherPass123!',
            username: 'anotheruser',
          })
          .expect(400);
      });

      it('should validate password strength', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/auth/register')
          .send({
            email: 'weak@example.com',
            password: 'weak',
            username: 'weakuser',
          })
          .expect(400);

        expect(response.body.message).toContain('password');
      });
    });

    describe('/api/auth/login (POST)', () => {
      it('should login with valid credentials', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'SecurePass123!',
          })
          .expect(200);

        expect(response.body).toHaveProperty('accessToken');
        expect(response.body).toHaveProperty('refreshToken');
        expect(response.body).toHaveProperty('user');
        expect(response.body.user.email).toBe('test@example.com');

        authToken = response.body.accessToken;
        refreshToken = response.body.refreshToken;
      });

      it('should reject invalid credentials', async () => {
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'WrongPassword',
          })
          .expect(401);
      });

      it('should reject non-existent user', async () => {
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({
            email: 'nonexistent@example.com',
            password: 'Password123!',
          })
          .expect(401);
      });
    });

    describe('/api/auth/refresh (POST)', () => {
      it('should refresh tokens with valid refresh token', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .send({
            refreshToken,
          })
          .expect(200);

        expect(response.body).toHaveProperty('accessToken');
        expect(response.body).toHaveProperty('refreshToken');
        expect(response.body.accessToken).not.toBe(authToken);

        // Update tokens for further tests
        authToken = response.body.accessToken;
        refreshToken = response.body.refreshToken;
      });

      it('should reject invalid refresh token', async () => {
        await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .send({
            refreshToken: 'invalid-token',
          })
          .expect(401);
      });
    });

    describe('/api/auth/profile (GET)', () => {
      it('should get user profile with valid token', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/auth/profile')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.email).toBe('test@example.com');
        expect(response.body.username).toBe('testuser');
      });

      it('should reject request without token', async () => {
        await request(app.getHttpServer())
          .get('/api/auth/profile')
          .expect(401);
      });

      it('should reject request with invalid token', async () => {
        await request(app.getHttpServer())
          .get('/api/auth/profile')
          .set('Authorization', 'Bearer invalid-token')
          .expect(401);
      });
    });

    describe('/api/auth/logout (POST)', () => {
      it('should logout successfully', async () => {
        await request(app.getHttpServer())
          .post('/api/auth/logout')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            refreshToken,
          })
          .expect(200);

        // Verify refresh token is invalidated
        await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .send({
            refreshToken,
          })
          .expect(401);
      });
    });
  });

  describe('License Management', () => {
    let productId: string;
    let licenseKey: string;

    beforeAll(async () => {
      // Re-login to get fresh tokens
      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'SecurePass123!',
        });

      authToken = loginResponse.body.accessToken;
      refreshToken = loginResponse.body.refreshToken;

      // Get product ID
      const product = await prismaService.product.findFirst();
      productId = product.id;

      // Make user an admin for license creation
      await prismaService.user.update({
        where: { id: testUserId },
        data: {
          roles: {
            set: ['ADMIN'],
          },
        },
      });
    });

    describe('/api/licenses (POST)', () => {
      it('should create a license as admin', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/licenses')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            type: 'STANDARD',
            userId: testUserId,
            productId,
            maxActivations: 3,
            expiresInDays: 365,
          })
          .expect(201);

        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('key');
        expect(response.body.type).toBe('STANDARD');
        expect(response.body.maxActivations).toBe(3);

        testLicenseId = response.body.id;
        licenseKey = response.body.key;
      });

      it('should not allow regular users to create licenses', async () => {
        // Remove admin role
        await prismaService.user.update({
          where: { id: testUserId },
          data: {
            roles: {
              set: ['USER'],
            },
          },
        });

        await request(app.getHttpServer())
          .post('/api/licenses')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            type: 'STANDARD',
            userId: testUserId,
            productId,
            maxActivations: 1,
          })
          .expect(403);

        // Restore admin role
        await prismaService.user.update({
          where: { id: testUserId },
          data: {
            roles: {
              set: ['ADMIN'],
            },
          },
        });
      });
    });

    describe('/api/licenses/:id (GET)', () => {
      it('should get license details', async () => {
        const response = await request(app.getHttpServer())
          .get(`/api/licenses/${testLicenseId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.id).toBe(testLicenseId);
        expect(response.body.key).toBe(licenseKey);
      });

      it('should return 404 for non-existent license', async () => {
        await request(app.getHttpServer())
          .get('/api/licenses/non-existent-id')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404);
      });
    });

    describe('/api/licenses/activate (POST)', () => {
      it('should activate a license', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/licenses/activate')
          .send({
            key: licenseKey,
            hardwareId: 'test-hardware-123',
            deviceName: 'Test Device',
            ipAddress: '127.0.0.1',
          })
          .expect(200);

        expect(response.body).toHaveProperty('activation');
        expect(response.body).toHaveProperty('license');
        expect(response.body.activation.hardwareId).toBe('test-hardware-123');
      });

      it('should not exceed max activations', async () => {
        // Activate on multiple devices up to the limit
        await request(app.getHttpServer())
          .post('/api/licenses/activate')
          .send({
            key: licenseKey,
            hardwareId: 'test-hardware-456',
            deviceName: 'Device 2',
            ipAddress: '127.0.0.2',
          })
          .expect(200);

        await request(app.getHttpServer())
          .post('/api/licenses/activate')
          .send({
            key: licenseKey,
            hardwareId: 'test-hardware-789',
            deviceName: 'Device 3',
            ipAddress: '127.0.0.3',
          })
          .expect(200);

        // This should fail as max activations (3) is reached
        await request(app.getHttpServer())
          .post('/api/licenses/activate')
          .send({
            key: licenseKey,
            hardwareId: 'test-hardware-overflow',
            deviceName: 'Device 4',
            ipAddress: '127.0.0.4',
          })
          .expect(400);
      });
    });

    describe('/api/licenses/verify (POST)', () => {
      it('should verify an active license', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/licenses/verify')
          .send({
            key: licenseKey,
            hardwareId: 'test-hardware-123',
          })
          .expect(200);

        expect(response.body.valid).toBe(true);
        expect(response.body).toHaveProperty('license');
        expect(response.body).toHaveProperty('activation');
      });

      it('should reject verification for inactive hardware', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/licenses/verify')
          .send({
            key: licenseKey,
            hardwareId: 'unknown-hardware',
          })
          .expect(200);

        expect(response.body.valid).toBe(false);
        expect(response.body.error).toContain('No active activation');
      });
    });

    describe('/api/licenses/deactivate (POST)', () => {
      it('should deactivate a license', async () => {
        await request(app.getHttpServer())
          .post('/api/licenses/deactivate')
          .send({
            key: licenseKey,
            hardwareId: 'test-hardware-123',
          })
          .expect(200);

        // Verify deactivation
        const response = await request(app.getHttpServer())
          .post('/api/licenses/verify')
          .send({
            key: licenseKey,
            hardwareId: 'test-hardware-123',
          })
          .expect(200);

        expect(response.body.valid).toBe(false);
      });
    });

    describe('/api/licenses/:id/revoke (POST)', () => {
      it('should revoke a license as admin', async () => {
        const response = await request(app.getHttpServer())
          .post(`/api/licenses/${testLicenseId}/revoke`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            reason: 'Testing revocation',
          })
          .expect(200);

        expect(response.body.status).toBe('REVOKED');

        // Verify license cannot be activated after revocation
        await request(app.getHttpServer())
          .post('/api/licenses/activate')
          .send({
            key: licenseKey,
            hardwareId: 'new-hardware',
            deviceName: 'New Device',
            ipAddress: '127.0.0.5',
          })
          .expect(400);
      });
    });
  });

  describe('Health Checks', () => {
    describe('/api/health (GET)', () => {
      it('should return health status', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/health')
          .expect(200);

        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body.status).toBe('healthy');
      });
    });

    describe('/api/health/ready (GET)', () => {
      it('should return readiness status', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/health/ready')
          .expect(200);

        expect(response.body).toHaveProperty('ready');
        expect(response.body).toHaveProperty('services');
        expect(response.body.ready).toBe(true);
      });
    });
  });
});