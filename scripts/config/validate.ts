#!/usr/bin/env node
/**
 * Configuration Validation CLI
 *
 * Validates the current configuration and reports any issues.
 * Usage: npm run config:validate
 */

import chalk from 'chalk';
import { configManager } from '../../packages/shared/src/config/config.js';
import {
  configValidator,
  validateProductionConfig,
  validateCompleteness,
  checkDeprecatedOptions,
} from '../../packages/shared/src/config/validator.js';

console.log(chalk.bold.blue('DCA-Auth Configuration Validator\n'));

try {
  // Load configuration
  console.log(chalk.gray('Loading configuration...'));
  const config = configManager.getAll();

  // Get environment
  const env = configManager.getEnvironment();
  console.log(chalk.gray(`Environment: ${chalk.cyan(env)}\n`));

  // Validate completeness
  console.log(chalk.bold('Checking configuration completeness...'));
  const completenessValidator = validateCompleteness(config);
  if (completenessValidator.hasErrors()) {
    console.log(completenessValidator.formatErrors());
    process.exit(1);
  } else {
    console.log(chalk.green('✓ All required configuration values are present\n'));
  }

  // Check for deprecated options
  console.log(chalk.bold('Checking for deprecated options...'));
  const deprecationValidator = checkDeprecatedOptions(config);
  if (deprecationValidator.hasWarnings()) {
    console.log(deprecationValidator.formatWarnings());
  } else {
    console.log(chalk.green('✓ No deprecated options found\n'));
  }

  // Production-specific checks
  if (env === 'production') {
    console.log(chalk.bold('Running production configuration checks...'));
    const productionValidator = validateProductionConfig(config);

    if (productionValidator.hasErrors() || productionValidator.hasWarnings()) {
      console.log(productionValidator.generateReport());

      if (productionValidator.hasErrors()) {
        console.log(chalk.red('\n✗ Production configuration has critical issues'));
        process.exit(1);
      }
    } else {
      console.log(chalk.green('✓ Production configuration is secure\n'));
    }
  }

  // Display configuration summary
  console.log(chalk.bold('Configuration Summary:'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`  Application: ${chalk.cyan(config.app.name)} v${chalk.cyan(config.app.version)}`);
  console.log(`  Environment: ${chalk.cyan(config.app.environment)}`);
  console.log(`  Server: ${chalk.cyan(config.app.server.host)}:${chalk.cyan(config.app.server.port)}`);
  console.log(`  Database: ${chalk.cyan(config.database.url ? 'Connected' : 'Not configured')}`);
  console.log(`  Redis: ${chalk.cyan(config.redis.host)}:${chalk.cyan(config.redis.port)}`);
  console.log(`  Discord Bot: ${chalk.cyan(config.discord.bot.token ? 'Configured' : 'Not configured')}`);
  console.log(chalk.gray('─'.repeat(50)));

  // Display feature flags
  console.log('\n' + chalk.bold('Feature Flags:'));
  console.log(chalk.gray('─'.repeat(50)));

  const enabledFeatures = Object.entries(config.features.flags)
    .filter(([_, enabled]) => enabled)
    .map(([feature]) => feature);

  if (enabledFeatures.length > 0) {
    enabledFeatures.forEach(feature => {
      console.log(`  ${chalk.green('✓')} ${feature}`);
    });
  } else {
    console.log(chalk.gray('  No features enabled'));
  }
  console.log(chalk.gray('─'.repeat(50)));

  console.log(chalk.green.bold('\n✓ Configuration validation passed'));

} catch (error) {
  console.error(chalk.red.bold('\n✗ Configuration validation failed:'));
  console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
  process.exit(1);
}