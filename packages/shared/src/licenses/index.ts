/**
 * License Management Module Exports
 *
 * Central export file for all license-related functionality
 */

// Services
export {
  keyGeneratorService,
  KeyGeneratorService,
} from './services/key-generator.service.js';

export {
  keyValidatorService,
  KeyValidatorService,
} from './services/key-validator.service.js';

export {
  licenseKeyService,
  LicenseKeyService,
} from './services/license-key.service.js';

// Re-export types
export * from '../database/types/license.types.js';