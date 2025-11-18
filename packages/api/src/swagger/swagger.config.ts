import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('DCA-Auth API')
    .setDescription(`
      # DCA-Auth API Documentation

      ## Overview
      DCA-Auth (Discord-Connected Authorization) is a comprehensive license key management system
      with Discord integration. This API provides endpoints for authentication, license management,
      user management, and system administration.

      ## Authentication
      Most endpoints require authentication via JWT tokens. Include the token in the Authorization header:
      \`Authorization: Bearer <token>\`

      ## Rate Limiting
      - General endpoints: 100 requests per minute
      - Authentication endpoints: 10 requests per minute
      - License verification: 1000 requests per minute

      ## Webhooks
      The system supports webhooks for real-time event notifications. See the Webhooks section for details.

      ## Error Codes
      - 400: Bad Request - Invalid input parameters
      - 401: Unauthorized - Missing or invalid authentication
      - 403: Forbidden - Insufficient permissions
      - 404: Not Found - Resource not found
      - 409: Conflict - Resource conflict (e.g., duplicate email)
      - 429: Too Many Requests - Rate limit exceeded
      - 500: Internal Server Error - Server error
    `)
    .setVersion('1.0.0')
    .addTag('Authentication', 'User authentication and session management')
    .addTag('Licenses', 'License creation, activation, and verification')
    .addTag('Users', 'User management and profiles')
    .addTag('Admin', 'Administrative functions')
    .addTag('Webhooks', 'Webhook management')
    .addTag('Health', 'System health and monitoring')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token obtained from login endpoint',
      },
      'JWT-auth',
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'API key for service-to-service authentication',
      },
      'api-key',
    )
    .addServer('https://api.yourdomain.com', 'Production')
    .addServer('https://staging-api.yourdomain.com', 'Staging')
    .addServer('http://localhost:3001', 'Development')
    .setContact({
      name: 'DCA-Auth Support',
      email: 'support@yourdomain.com',
      url: 'https://docs.yourdomain.com',
    })
    .setLicense({
      name: 'Proprietary',
      url: 'https://yourdomain.com/license',
    })
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) =>
      `${controllerKey.replace('Controller', '')}_${methodKey}`,
  });

  // Add custom schemas
  document.components.schemas = {
    ...document.components.schemas,
    Error: {
      type: 'object',
      properties: {
        statusCode: { type: 'number' },
        message: { type: 'string' },
        error: { type: 'string' },
        timestamp: { type: 'string', format: 'date-time' },
        path: { type: 'string' },
      },
      required: ['statusCode', 'message', 'timestamp'],
    },
    PaginatedResponse: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { type: 'object' } },
        total: { type: 'number' },
        page: { type: 'number' },
        pageSize: { type: 'number' },
        totalPages: { type: 'number' },
      },
    },
    WebhookEvent: {
      type: 'string',
      enum: [
        'license.created',
        'license.activated',
        'license.deactivated',
        'license.expired',
        'license.revoked',
        'user.registered',
        'user.login',
        'user.role_changed',
      ],
    },
  };

  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'DCA-Auth API Docs',
    customfavIcon: '/favicon.ico',
    customJs: [
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-bundle.min.js',
    ],
    customCssUrl: [
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css',
    ],
    swaggerOptions: {
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      defaultModelsExpandDepth: 2,
      defaultModelExpandDepth: 2,
      tryItOutEnabled: true,
    },
  });

  // Also export OpenAPI JSON
  app.use('/api/docs-json', (req, res) => {
    res.json(document);
  });
}