/**
 * Pretty Print Log Formatter
 *
 * Formats logs in a human-readable format for development.
 * Includes colorization and structured output.
 */

import winston from 'winston';
import chalk from 'chalk';

const levelColors = {
  error: chalk.red,
  warn: chalk.yellow,
  info: chalk.cyan,
  http: chalk.magenta,
  debug: chalk.green,
  silly: chalk.gray,
};

const levelIcons = {
  error: '✖',
  warn: '⚠',
  info: 'ℹ',
  http: '⇄',
  debug: '●',
  silly: '○',
};

export function prettyFormatter(): winston.Logform.Format {
  return winston.format.combine(
    // Add timestamp
    winston.format.timestamp({
      format: 'HH:mm:ss.SSS',
    }),

    // Colorize based on level
    winston.format.colorize({ all: false }),

    // Add error stack traces
    winston.format.errors({ stack: true }),

    // Custom printf format
    winston.format.printf((info) => {
      const { timestamp, level, message, stack, ...metadata } = info;

      // Get color function for level
      const colorFn = levelColors[level as keyof typeof levelColors] || chalk.white;
      const icon = levelIcons[level as keyof typeof levelIcons] || '•';

      // Format base message
      let output = `${chalk.gray(timestamp)} ${colorFn(icon)} ${colorFn(level.toUpperCase().padEnd(5))} ${message}`;

      // Add correlation ID if present
      if (metadata.correlationId) {
        output += chalk.gray(` [${String(metadata.correlationId).slice(0, 8)}]`);
      }

      // Add metadata if present
      const metaKeys = Object.keys(metadata).filter(k =>
        k !== 'correlationId' &&
        k !== 'metadata' &&
        metadata[k] !== undefined &&
        metadata[k] !== null
      );

      if (metaKeys.length > 0) {
        const metaStr = metaKeys.map(key => {
          const value = typeof metadata[key] === 'object'
            ? JSON.stringify(metadata[key], null, 2)
            : metadata[key];
          return `  ${chalk.gray(key)}: ${chalk.white(value)}`;
        }).join('\n');
        output += '\n' + metaStr;
      }

      // Add stack trace for errors
      if (stack) {
        output += '\n' + chalk.red(stack);
      }

      return output;
    })
  );
}

/**
 * Create a simple pretty formatter without colors
 */
export function simplePrettyFormatter(): winston.Logform.Format {
  return winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.errors({ stack: true }),
    winston.format.printf((info) => {
      const { timestamp, level, message, stack, ...metadata } = info;

      let output = `[${timestamp}] ${level.toUpperCase()}: ${message}`;

      // Add metadata
      if (Object.keys(metadata).length > 0) {
        output += ' ' + JSON.stringify(metadata);
      }

      // Add stack trace
      if (stack) {
        output += '\n' + stack;
      }

      return output;
    })
  );
}

/**
 * Create a development formatter with extensive details
 */
export function devFormatter(): winston.Logform.Format {
  return winston.format.combine(
    winston.format.timestamp({
      format: 'HH:mm:ss.SSS',
    }),
    winston.format.errors({ stack: true }),
    winston.format.printf((info) => {
      const { timestamp, level, message, stack, ...metadata } = info;

      const colorFn = levelColors[level as keyof typeof levelColors] || chalk.white;
      const icon = levelIcons[level as keyof typeof levelIcons] || '•';

      // Build output with detailed formatting
      const parts = [
        chalk.gray(timestamp),
        colorFn(`${icon} ${level.toUpperCase()}`),
      ];

      // Add file location if available
      if (metadata.file) {
        parts.push(chalk.blue(`[${metadata.file}:${metadata.line || '?'}]`));
      }

      // Add correlation ID
      if (metadata.correlationId) {
        parts.push(chalk.yellow(`[${String(metadata.correlationId).slice(0, 8)}]`));
      }

      // Add main message
      let output = parts.join(' ') + '\n  ' + chalk.white(message);

      // Add formatted metadata
      const ignoredKeys = ['file', 'line', 'correlationId', 'metadata', 'level', 'message', 'timestamp'];
      const metaKeys = Object.keys(metadata).filter(k => !ignoredKeys.includes(k));

      if (metaKeys.length > 0) {
        output += '\n' + chalk.gray('  Metadata:');
        metaKeys.forEach(key => {
          const value = metadata[key];
          if (typeof value === 'object') {
            output += '\n' + chalk.gray(`    ${key}:`);
            const lines = JSON.stringify(value, null, 2).split('\n');
            lines.forEach(line => {
              output += '\n      ' + chalk.white(line);
            });
          } else {
            output += '\n' + chalk.gray(`    ${key}: `) + chalk.white(value);
          }
        });
      }

      // Add stack trace
      if (stack) {
        output += '\n' + chalk.red('  Stack Trace:');
        String(stack).split('\n').forEach((line: string) => {
          output += '\n    ' + chalk.red(line);
        });
      }

      return output + '\n';
    })
  );
}