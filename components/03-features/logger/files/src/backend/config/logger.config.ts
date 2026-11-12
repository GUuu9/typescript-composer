import type { LoggerConfig } from '../services/logger/logger.model.ts';

export function validateLoggerConfig(config: LoggerConfig): LoggerConfig {
  if (!config || !['debug', 'info', 'warn', 'error'].includes(config.level) || !['console', 'file', 'both'].includes(config.output)) throw new Error('Invalid LOGGER_LEVEL or LOGGER_OUTPUT');
  return { level: config.level, output: config.output };
}
export function readLoggerConfig(): LoggerConfig {
  return validateLoggerConfig({ level: process.env.LOGGER_LEVEL || 'info', output: process.env.LOGGER_OUTPUT || 'console' } as LoggerConfig);
}
