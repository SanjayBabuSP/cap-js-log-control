/**
 * Configuration interface for cap-js-log-control plugin.
 *
 * Users configure via `cds.env.logControl` in package.json or .cdsrc.json:
 * ```json
 * {
 *   "cds": {
 *     "logControl": {
 *       "enabled": true,
 *       "otelDiagLevel": "ERROR",
 *       "levels": { "odata": "warn", "remote": "warn" }
 *     }
 *   }
 * }
 * ```
 */
export interface LogControlConfig {
  /**
   * Master switch to enable/disable the plugin.
   * When false, no log levels are modified.
   */
  enabled: boolean;

  /**
   * Map of CDS logger names to log levels.
   * Keys: any string passed to cds.log(name) — e.g. 'odata', 'remote', 'telemetry'
   * Values: 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'verbose' | 'silly'
   */
  levels: Record<string, string>;

  /**
   * OpenTelemetry internal DiagLogger level.
   * Controls noise from @cap-js/telemetry OTLP exporters.
   * Values: 'NONE' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'VERBOSE' | 'ALL'
   * Defaults to 'ERROR' so only real OTel export failures are visible.
   */
  otelDiagLevel: string;
}

export const DEFAULTS: LogControlConfig = {
  enabled: true,
  levels: {
    odata: 'warn',
    remote: 'warn',
    telemetry: 'warn',
  },
  otelDiagLevel: 'ERROR',
};

/** Valid CDS log level strings */
export const VALID_CDS_LEVELS = new Set([
  'silent', 'error', 'warn', 'info', 'debug', 'verbose', 'silly',
]);

/** Valid OTel DiagLogLevel names */
export const VALID_OTEL_LEVELS = new Set([
  'NONE', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE', 'ALL',
]);

/**
 * Reads plugin configuration from cds.env.logControl and merges with defaults.
 * Also merges any levels from cds.env.log.levels that overlap with known noisy loggers.
 */
export function getConfig(cds: any): LogControlConfig {
  const userConfig = cds.env?.logControl ?? {};

  const mergedLevels = { ...DEFAULTS.levels };

  // Merge levels from native cds.env.log.levels if present
  // This allows users to use the standard CDS config format:
  //   { "cds": { "log": { "levels": { "odata": "error" } } } }
  const nativeLevels = cds.env?.log?.levels;
  if (nativeLevels && typeof nativeLevels === 'object') {
    for (const [name, level] of Object.entries(nativeLevels)) {
      if (typeof level === 'string') {
        mergedLevels[name] = level;
      }
    }
  }

  // Plugin-specific levels override native CDS levels
  if (userConfig.levels && typeof userConfig.levels === 'object') {
    for (const [name, level] of Object.entries(userConfig.levels)) {
      if (typeof level === 'string') {
        mergedLevels[name] = level;
      }
    }
  }

  return {
    enabled: userConfig.enabled ?? DEFAULTS.enabled,
    levels: mergedLevels,
    otelDiagLevel: userConfig.otelDiagLevel ?? DEFAULTS.otelDiagLevel,
  };
}
