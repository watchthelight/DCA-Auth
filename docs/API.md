# DCA-Auth API Documentation

## Base URL
- Production: `https://api.yourdomain.com`
- Staging: `https://staging-api.yourdomain.com`
- Development: `http://localhost:3001`

## Authentication

### JWT Token Authentication
Most endpoints require JWT authentication. Include the token in the Authorization header:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### API Key Authentication
For service-to-service communication:

```http
X-API-Key: your-api-key-here
```

## Endpoints

### Authentication

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "username": "johndoe"
}
```

**Response:**
```json
{
  "id": "user-id",
  "email": "user@example.com",
  "username": "johndoe",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "username": "johndoe"
  }
}
```

#### Refresh Token
```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Logout
```http
POST /api/auth/logout
Authorization: Bearer <token>
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Two-Factor Authentication

#### Setup 2FA
```http
POST /api/auth/2fa/setup
Authorization: Bearer <token>
```

**Response:**
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "backupCodes": [
    "A1B2-C3D4",
    "E5F6-G7H8",
    "..."
  ]
}
```

#### Enable 2FA
```http
POST /api/auth/2fa/enable
Authorization: Bearer <token>
Content-Type: application/json

{
  "token": "123456"
}
```

#### Verify 2FA
```http
POST /api/auth/2fa/verify
Content-Type: application/json

{
  "userId": "user-id",
  "token": "123456"
}
```

### License Management

#### Create License (Admin only)
```http
POST /api/licenses
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "STANDARD",
  "userId": "user-id",
  "productId": "product-id",
  "maxActivations": 3,
  "expiresInDays": 365,
  "metadata": {
    "customField": "value"
  }
}
```

**Response:**
```json
{
  "id": "license-id",
  "key": "XXXX-XXXX-XXXX-XXXX",
  "type": "STANDARD",
  "status": "ACTIVE",
  "userId": "user-id",
  "productId": "product-id",
  "maxActivations": 3,
  "currentActivations": 0,
  "expiresAt": "2025-01-01T00:00:00Z",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

#### Activate License
```http
POST /api/licenses/activate
Content-Type: application/json

{
  "key": "XXXX-XXXX-XXXX-XXXX",
  "hardwareId": "MACHINE-UNIQUE-ID",
  "deviceName": "John's PC",
  "ipAddress": "192.168.1.1"
}
```

**Response:**
```json
{
  "activation": {
    "id": "activation-id",
    "hardwareId": "MACHINE-UNIQUE-ID",
    "deviceName": "John's PC",
    "activatedAt": "2024-01-01T00:00:00Z"
  },
  "license": {
    "id": "license-id",
    "key": "XXXX-XXXX-XXXX-XXXX",
    "expiresAt": "2025-01-01T00:00:00Z"
  }
}
```

#### Verify License
```http
POST /api/licenses/verify
Content-Type: application/json

{
  "key": "XXXX-XXXX-XXXX-XXXX",
  "hardwareId": "MACHINE-UNIQUE-ID"
}
```

**Response:**
```json
{
  "valid": true,
  "license": {
    "id": "license-id",
    "expiresAt": "2025-01-01T00:00:00Z"
  },
  "activation": {
    "id": "activation-id",
    "lastSeenAt": "2024-01-01T00:00:00Z"
  }
}
```

#### Deactivate License
```http
POST /api/licenses/deactivate
Content-Type: application/json

{
  "key": "XXXX-XXXX-XXXX-XXXX",
  "hardwareId": "MACHINE-UNIQUE-ID"
}
```

#### Get License Details
```http
GET /api/licenses/{licenseId}
Authorization: Bearer <token>
```

#### List User Licenses
```http
GET /api/licenses?userId={userId}&page=1&limit=10
Authorization: Bearer <token>
```

#### Revoke License (Admin only)
```http
POST /api/licenses/{licenseId}/revoke
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Violation of terms of service"
}
```

### User Management

#### Get User Profile
```http
GET /api/users/profile
Authorization: Bearer <token>
```

#### Update User Profile
```http
PATCH /api/users/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "username": "newusername",
  "email": "newemail@example.com"
}
```

#### Change Password
```http
POST /api/users/change-password
Authorization: Bearer <token>
Content-Type: application/json

{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword456!"
}
```

#### List Users (Admin only)
```http
GET /api/users?page=1&limit=20&search=john
Authorization: Bearer <token>
```

### Webhooks

#### Register Webhook
```http
POST /api/webhooks
Authorization: Bearer <token>
Content-Type: application/json

{
  "url": "https://yourapp.com/webhook",
  "events": ["license.created", "license.activated"],
  "secret": "optional-webhook-secret"
}
```

#### List Webhooks
```http
GET /api/webhooks
Authorization: Bearer <token>
```

#### Delete Webhook
```http
DELETE /api/webhooks/{webhookId}
Authorization: Bearer <token>
```

#### Get Webhook Statistics
```http
GET /api/webhooks/{webhookId}/stats
Authorization: Bearer <token>
```

### Audit Logs (Admin only)

#### Search Audit Logs
```http
GET /api/audit?userId={userId}&action={action}&startDate={date}&endDate={date}
Authorization: Bearer <token>
```

#### Get Audit Statistics
```http
GET /api/audit/stats
Authorization: Bearer <token>
```

### Health & Monitoring

#### Health Check
```http
GET /api/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "uptime": 86400,
  "version": "1.0.0"
}
```

#### Readiness Check
```http
GET /api/health/ready
```

**Response:**
```json
{
  "ready": true,
  "services": {
    "database": "connected",
    "redis": "connected",
    "discord": "connected"
  }
}
```

#### Metrics (Prometheus format)
```http
GET /metrics
```

## Error Responses

### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": "Invalid input parameters",
  "error": "Bad Request",
  "timestamp": "2024-01-01T00:00:00Z",
  "path": "/api/licenses"
}
```

### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized",
  "timestamp": "2024-01-01T00:00:00Z",
  "path": "/api/users/profile"
}
```

### 403 Forbidden
```json
{
  "statusCode": 403,
  "message": "Insufficient permissions",
  "error": "Forbidden",
  "timestamp": "2024-01-01T00:00:00Z",
  "path": "/api/admin/users"
}
```

### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "License not found",
  "error": "Not Found",
  "timestamp": "2024-01-01T00:00:00Z",
  "path": "/api/licenses/invalid-id"
}
```

### 429 Too Many Requests
```json
{
  "statusCode": 429,
  "message": "Rate limit exceeded",
  "error": "Too Many Requests",
  "timestamp": "2024-01-01T00:00:00Z",
  "path": "/api/auth/login",
  "retryAfter": 60
}
```

## Rate Limiting

| Endpoint Category | Rate Limit | Window |
|------------------|------------|---------|
| Authentication | 10 req | 1 minute |
| License Activation | 100 req | 1 minute |
| License Verification | 1000 req | 1 minute |
| General API | 100 req | 1 minute |
| Admin Operations | 50 req | 1 minute |

## Webhook Events

### Event Payloads

#### license.created
```json
{
  "event": "license.created",
  "timestamp": "2024-01-01T00:00:00Z",
  "data": {
    "licenseId": "license-id",
    "key": "XXXX-XXXX-XXXX-XXXX",
    "userId": "user-id",
    "productId": "product-id"
  }
}
```

#### license.activated
```json
{
  "event": "license.activated",
  "timestamp": "2024-01-01T00:00:00Z",
  "data": {
    "licenseId": "license-id",
    "activationId": "activation-id",
    "hardwareId": "MACHINE-ID",
    "deviceName": "Device Name"
  }
}
```

#### user.registered
```json
{
  "event": "user.registered",
  "timestamp": "2024-01-01T00:00:00Z",
  "data": {
    "userId": "user-id",
    "email": "user@example.com",
    "username": "johndoe"
  }
}
```

### Webhook Security

Webhooks include a signature header for verification:

```http
X-Webhook-Signature: sha256=<signature>
```

To verify the signature:

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  const expectedSignature = `sha256=${hmac.digest('hex')}`;

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

## SDK Examples

### JavaScript/TypeScript
```typescript
import { DCAAuthClient } from '@dca-auth/sdk';

const client = new DCAAuthClient({
  apiUrl: 'https://api.yourdomain.com',
  apiKey: 'your-api-key'
});

// Verify license
const result = await client.licenses.verify({
  key: 'XXXX-XXXX-XXXX-XXXX',
  hardwareId: 'MACHINE-ID'
});

if (result.valid) {
  console.log('License is valid');
}
```

### Python
```python
from dca_auth import DCAAuthClient

client = DCAAuthClient(
    api_url='https://api.yourdomain.com',
    api_key='your-api-key'
)

# Verify license
result = client.licenses.verify(
    key='XXXX-XXXX-XXXX-XXXX',
    hardware_id='MACHINE-ID'
)

if result['valid']:
    print('License is valid')
```

### cURL
```bash
# Verify license
curl -X POST https://api.yourdomain.com/api/licenses/verify \
  -H "Content-Type: application/json" \
  -d '{
    "key": "XXXX-XXXX-XXXX-XXXX",
    "hardwareId": "MACHINE-ID"
  }'
```

## Best Practices

1. **Rate Limiting**: Implement exponential backoff when rate limited
2. **Caching**: Cache license verification results for 5 minutes
3. **Error Handling**: Always check for error responses
4. **Security**: Store API keys and tokens securely
5. **Webhooks**: Implement retry logic for webhook deliveries
6. **Monitoring**: Track API usage and response times

## Support

- Documentation: https://docs.yourdomain.com
- API Status: https://status.yourdomain.com
- Support Email: support@yourdomain.com
- Discord Server: https://discord.gg/yourinvite