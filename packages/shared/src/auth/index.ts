/**
 * Authentication Module Exports
 *
 * Central export file for all authentication-related functionality
 */

// Services
export { jwtService, JWTService, TokenPair, DecodedToken } from './services/jwt.service.js';
export { authService, AuthenticationService, LoginResult, RegisterResult } from './services/auth.service.js';
export { sessionService, SessionService } from './services/session.service.js';

// Strategies
export { discordStrategy, DiscordStrategy, DiscordTokenResponse, DiscordGuild } from './strategies/discord.strategy.js';

// Middleware
export {
  authenticate,
  authenticateOptional,
  requireRole,
  requireAnyRole,
  requireAdmin,
  requireModerator,
  canAccessResource,
  validateApiKey,
  refreshTokenMiddleware,
  logoutMiddleware,
  AuthenticatedUser,
  SessionInfo,
} from './middleware/auth.middleware.js';

// Utilities
export {
  PasswordUtils,
  passwordSchema,
  PasswordStrength,
  PasswordStrengthResult,
} from './utils/password.utils.js';