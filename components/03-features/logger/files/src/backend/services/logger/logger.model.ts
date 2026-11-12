export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LoggerConfig { level: LogLevel; output: 'console' | 'file' | 'both' }
export interface LogContext { scope?: string; traceId?: string; requestId?: string }
export interface LogError { name: string; code?: string; stack?: string[]; cause?: LogError; truncated?: boolean }
export interface LogRecord { timestamp: string; level: LogLevel; event: string; context?: LogContext; error?: LogError }
