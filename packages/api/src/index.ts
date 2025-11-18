/**
 * DCA-Auth API Server Exports
 *
 * Main export file for the API package
 */

// Export app creation functions
export { createApp, setupGracefulShutdown, setupErrorHandlers } from './app.js';

// Export route handlers (useful for testing)
export { default as authRoutes } from './routes/auth.routes.js';
export { default as userRoutes } from './routes/user.routes.js';
export { default as licenseRoutes } from './routes/license.routes.js';
export { default as adminRoutes } from './routes/admin.routes.js';
export { default as healthRoutes } from './routes/health.routes.js';
