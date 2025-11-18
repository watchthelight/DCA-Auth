/**
 * Log Sanitization Utility
 *
 * Removes sensitive information from log entries to prevent
 * accidental exposure of passwords, tokens, and PII.
 */

interface SanitizationOptions {
  sensitiveKeys?: string[];
  redactedValue?: string;
  maxDepth?: number;
  preserveStructure?: boolean;
}

const DEFAULT_SENSITIVE_KEYS = [
  'password',
  'passwd',
  'pass',
  'secret',
  'token',
  'apikey',
  'api_key',
  'access_token',
  'refresh_token',
  'private_key',
  'client_secret',
  'authorization',
  'cookie',
  'session',
  'credit_card',
  'card_number',
  'cvv',
  'ssn',
  'social_security',
  'tax_id',
  'email',
  'phone',
  'address',
  'birthdate',
  'dob',
];

const DEFAULT_OPTIONS: SanitizationOptions = {
  sensitiveKeys: DEFAULT_SENSITIVE_KEYS,
  redactedValue: '[REDACTED]',
  maxDepth: 10,
  preserveStructure: true,
};

/**
 * Check if a key should be sanitized
 */
function shouldSanitize(key: string, sensitiveKeys: string[]): boolean {
  const lowerKey = key.toLowerCase();
  return sensitiveKeys.some(sensitive =>
    lowerKey.includes(sensitive.toLowerCase())
  );
}

/**
 * Sanitize a string value that might contain sensitive data
 */
function sanitizeString(value: string): string {
  // Email pattern
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  value = value.replace(emailPattern, '[EMAIL]');

  // Phone pattern (US format)
  const phonePattern = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
  value = value.replace(phonePattern, '[PHONE]');

  // Credit card pattern
  const creditCardPattern = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;
  value = value.replace(creditCardPattern, '[CARD]');

  // SSN pattern
  const ssnPattern = /\b\d{3}-\d{2}-\d{4}\b/g;
  value = value.replace(ssnPattern, '[SSN]');

  // JWT token pattern
  const jwtPattern = /\bey[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\b/g;
  value = value.replace(jwtPattern, '[JWT]');

  // API key patterns
  const apiKeyPattern = /\b[A-Za-z0-9]{32,}\b/g;
  if (apiKeyPattern.test(value) && value.length > 30) {
    return '[API_KEY]';
  }

  return value;
}

/**
 * Recursively sanitize an object
 */
export function sanitizeLogData(
  data: any,
  options: SanitizationOptions = {},
  depth: number = 0
): any {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Prevent infinite recursion
  if (depth > opts.maxDepth!) {
    return '[MAX_DEPTH_EXCEEDED]';
  }

  // Handle null and undefined
  if (data === null || data === undefined) {
    return data;
  }

  // Handle primitives
  if (typeof data !== 'object') {
    if (typeof data === 'string') {
      return sanitizeString(data);
    }
    return data;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => sanitizeLogData(item, opts, depth + 1));
  }

  // Handle dates
  if (data instanceof Date) {
    return data.toISOString();
  }

  // Handle errors
  if (data instanceof Error) {
    return {
      name: data.name,
      message: sanitizeString(data.message),
      stack: data.stack,
    };
  }

  // Handle objects
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    // Check if key should be sanitized
    if (shouldSanitize(key, opts.sensitiveKeys!)) {
      if (opts.preserveStructure) {
        // Preserve the structure but redact the value
        sanitized[key] = opts.redactedValue;
      }
      // Skip the key entirely if not preserving structure
      continue;
    }

    // Recursively sanitize the value
    sanitized[key] = sanitizeLogData(value, opts, depth + 1);
  }

  return sanitized;
}

/**
 * Create a sanitizer with custom options
 */
export function createSanitizer(options: SanitizationOptions) {
  return (data: any) => sanitizeLogData(data, options);
}

/**
 * Sanitize URL parameters
 */
export function sanitizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);

    // Sanitize query parameters
    for (const [key, value] of params.entries()) {
      if (shouldSanitize(key, DEFAULT_SENSITIVE_KEYS)) {
        params.set(key, '[REDACTED]');
      } else {
        params.set(key, sanitizeString(value));
      }
    }

    urlObj.search = params.toString();
    return urlObj.toString();
  } catch {
    // If URL parsing fails, return sanitized string
    return sanitizeString(url);
  }
}

/**
 * Sanitize HTTP headers
 */
export function sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  const sensitiveHeaders = [
    'authorization',
    'cookie',
    'x-api-key',
    'x-auth-token',
    'x-csrf-token',
  ];

  for (const [key, value] of Object.entries(headers)) {
    if (sensitiveHeaders.some(h => key.toLowerCase() === h)) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Mask sensitive parts of strings (show first and last few characters)
 */
export function maskSensitiveString(
  value: string,
  showFirst: number = 3,
  showLast: number = 3
): string {
  if (value.length <= showFirst + showLast) {
    return '[REDACTED]';
  }

  const first = value.slice(0, showFirst);
  const last = value.slice(-showLast);
  const masked = '*'.repeat(Math.max(value.length - showFirst - showLast, 3));

  return `${first}${masked}${last}`;
}