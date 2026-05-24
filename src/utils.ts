import { VALID_CDS_LEVELS, VALID_OTEL_LEVELS } from './config';

/**
 * Applies CDS log levels from the levels map.
 *
 * Uses runtime detection to handle both API styles:
 *   - cds.log(name).setLevel(level)
 *   - cds.log(name, level) constructor style
 *
 * @param cds - The CDS runtime object
 * @param levels - Map of logger name -> level string
 */
export function applyCdsLogLevels(cds: any, levels: Record<string, string>): void {
  const LOG = cds.log('log-control');
  const applied: string[] = [];

  for (const [name, level] of Object.entries(levels)) {
    if (!VALID_CDS_LEVELS.has(level)) {
      LOG.warn(`[log-control] Invalid CDS log level '${level}' for logger '${name}', skipping`);
      continue;
    }

    try {
      const logger = cds.log(name);
      if (typeof logger?.setLevel === 'function') {
        logger.setLevel(level);
        applied.push(`${name}=${level}`);
      }
    } catch (_) {
      // Ignore errors for unknown logger names
    }
  }

  if (applied.length > 0) {
    LOG.info(`[log-control] Set CDS log levels: ${applied.join(', ')}`);
  }
}

/**
 * Configures the OpenTelemetry internal DiagLogger level.
 *
 * This controls the noise from @cap-js/telemetry OTLP exporters that bypass cds.log
 * and emit directly via the OTel diag logger. Wraps in try/catch because
 * @opentelemetry/api may not be installed.
 *
 * @param level - DiagLogLevel name: 'NONE' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'VERBOSE' | 'ALL'
 */
export function applyOtelDiagLevel(level: string): void {
  const normalizedLevel = level.toUpperCase();

  if (!VALID_OTEL_LEVELS.has(normalizedLevel)) {
    // Can't use cds.log here — this runs standalone. Just skip silently.
    return;
  }

  try {
    // Dynamic require — @opentelemetry/api is optional
    const otelApi = require('@opentelemetry/api');
    const { diag, DiagConsoleLogger, DiagLogLevel } = otelApi;

    const diagLevel = DiagLogLevel[normalizedLevel as keyof typeof DiagLogLevel];
    if (diagLevel !== undefined) {
      diag.setLogger(new DiagConsoleLogger(), diagLevel);
    }
  } catch (_) {
    // @opentelemetry/api not installed — silently skip
  }
}
