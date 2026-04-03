// SpanVault - Logger
// Winston-based structured logging with file and console output

import * as winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';

// Determine log directory - default to local logs folder
const logDir = process.env.SPANVAULT_LOG_DIR || path.join(process.cwd(), '..', 'logs');

// Ensure log directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const serviceName = process.env.SPANVAULT_SERVICE || 'spanvault';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: serviceName },
  transports: [
    // Console output with colors for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          return `${timestamp} [${service}] ${level}: ${message}${metaStr}`;
        })
      ),
    }),
    // File output - all levels
    new winston.transports.File({
      filename: path.join(logDir, `${serviceName}.log`),
      maxsize: 10 * 1024 * 1024,  // 10MB per file
      maxFiles: 5,
      tailable: true,
    }),
    // Separate error log file
    new winston.transports.File({
      filename: path.join(logDir, `${serviceName}-error.log`),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 3,
    }),
  ],
});
