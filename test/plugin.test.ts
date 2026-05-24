import { getConfig, DEFAULTS, VALID_CDS_LEVELS, VALID_OTEL_LEVELS } from '../src/config';
import type { LogControlConfig } from '../src/config';
import { applyCdsLogLevels, applyOtelDiagLevel } from '../src/utils';
import { applyLogControl } from '../src/index';

// ─── Helpers ─────────────────────────────────────────────────────

function createMockCds(logControlConfig: Partial<LogControlConfig> = {}, nativeLogLevels?: Record<string, string>) {
  const logFn: any = jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    setLevel: jest.fn(),
  }));
  // cds.log('name') returns a logger with setLevel
  // cds.log is also used as cds.log('log-control') internally
  return {
    env: {
      logControl: Object.keys(logControlConfig).length > 0 ? logControlConfig : undefined,
      log: nativeLogLevels ? { levels: nativeLogLevels } : undefined,
    },
    log: logFn,
  };
}

// ─── Unit Tests: getConfig ───────────────────────────────────────

describe('getConfig', () => {
  it('returns defaults when no user config is set', () => {
    const cds = { env: {} };
    const config = getConfig(cds);
    expect(config.enabled).toBe(DEFAULTS.enabled);
    expect(config.levels).toEqual(DEFAULTS.levels);
    expect(config.otelDiagLevel).toBe(DEFAULTS.otelDiagLevel);
  });

  it('merges user logControl config with defaults', () => {
    const cds = {
      env: {
        logControl: {
          enabled: false,
          levels: { odata: 'error' },
          otelDiagLevel: 'WARN',
        },
      },
    };
    const config = getConfig(cds);
    expect(config.enabled).toBe(false);
    expect(config.levels.odata).toBe('error');
    expect(config.levels.remote).toBe('warn'); // from defaults
    expect(config.otelDiagLevel).toBe('WARN');
  });

  it('merges native cds.env.log.levels into config', () => {
    const cds = {
      env: {
        log: { levels: { odata: 'error', remote: 'error' } },
      },
    };
    const config = getConfig(cds);
    expect(config.levels.odata).toBe('error');
    expect(config.levels.remote).toBe('error');
    expect(config.levels.telemetry).toBe('warn'); // default kept
  });

  it('plugin logControl.levels override native cds.env.log.levels', () => {
    const cds = {
      env: {
        log: { levels: { odata: 'debug' } },
        logControl: { levels: { odata: 'error' } },
      },
    };
    const config = getConfig(cds);
    // Plugin-specific should win
    expect(config.levels.odata).toBe('error');
  });

  it('handles undefined cds.env gracefully', () => {
    const cds = { env: undefined };
    const config = getConfig(cds);
    expect(config).toEqual(DEFAULTS);
  });

  it('uses defaults when logControl is undefined', () => {
    const cds = { env: { logControl: undefined } };
    const config = getConfig(cds);
    expect(config.enabled).toBe(true);
    expect(config.levels).toEqual(DEFAULTS.levels);
  });
});

// ─── Unit Tests: applyCdsLogLevels ───────────────────────────────

describe('applyCdsLogLevels', () => {
  it('calls setLevel for each entry in the levels map', () => {
    const setLevelMock = jest.fn();
    const infoMock = jest.fn();
    const warnMock = jest.fn();

    const cds = {
      log: jest.fn(() => ({
        info: infoMock,
        warn: warnMock,
        error: jest.fn(),
        debug: jest.fn(),
        setLevel: setLevelMock,
      })),
    };

    applyCdsLogLevels(cds, { odata: 'warn', remote: 'error' });

    // cds.log called for 'log-control' + 'odata' + 'remote'
    expect(cds.log).toHaveBeenCalledWith('log-control');
    expect(cds.log).toHaveBeenCalledWith('odata');
    expect(cds.log).toHaveBeenCalledWith('remote');
    expect(setLevelMock).toHaveBeenCalledWith('warn');
    expect(setLevelMock).toHaveBeenCalledWith('error');
  });

  it('skips invalid CDS log level strings with a warning', () => {
    const setLevelMock = jest.fn();
    const warnMock = jest.fn();

    const cds = {
      log: jest.fn(() => ({
        info: jest.fn(),
        warn: warnMock,
        error: jest.fn(),
        debug: jest.fn(),
        setLevel: setLevelMock,
      })),
    };

    applyCdsLogLevels(cds, { odata: 'INVALID_LEVEL' });

    // setLevel should NOT be called for invalid levels
    // It's called 0 times because the only entry was invalid
    // But cds.log('log-control') is called for the LOG instance
    expect(warnMock).toHaveBeenCalled();
  });

  it('handles errors from cds.log() gracefully', () => {
    const infoMock = jest.fn();
    const warnMock = jest.fn();
    let callCount = 0;

    const cds = {
      log: jest.fn((name: string) => {
        if (name === 'log-control') {
          return { info: infoMock, warn: warnMock, error: jest.fn(), debug: jest.fn(), setLevel: jest.fn() };
        }
        throw new Error('Unknown logger');
      }),
    };

    // Should not throw
    expect(() => applyCdsLogLevels(cds, { unknown: 'warn' })).not.toThrow();
  });

  it('handles logger without setLevel method', () => {
    const infoMock = jest.fn();

    const cds = {
      log: jest.fn((name: string) => {
        if (name === 'log-control') {
          return { info: infoMock, warn: jest.fn(), error: jest.fn(), debug: jest.fn(), setLevel: jest.fn() };
        }
        // Return a logger without setLevel
        return { info: jest.fn(), warn: jest.fn() };
      }),
    };

    expect(() => applyCdsLogLevels(cds, { odata: 'warn' })).not.toThrow();
  });
});

// ─── Unit Tests: applyOtelDiagLevel ──────────────────────────────

describe('applyOtelDiagLevel', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it('sets OTel diag level when @opentelemetry/api is available', () => {
    const setLoggerMock = jest.fn();
    const DiagConsoleLoggerMock = jest.fn();
    const mockDiagLogLevel = {
      NONE: 0,
      ERROR: 1,
      WARN: 2,
      INFO: 3,
      DEBUG: 4,
      VERBOSE: 5,
      ALL: 9999,
    };

    jest.resetModules();
    jest.doMock('@opentelemetry/api', () => ({
      diag: { setLogger: setLoggerMock },
      DiagConsoleLogger: DiagConsoleLoggerMock,
      DiagLogLevel: mockDiagLogLevel,
    }));

    const { applyOtelDiagLevel: freshApply } = require('../src/utils');

    freshApply('ERROR');

    expect(setLoggerMock).toHaveBeenCalledTimes(1);
    expect(DiagConsoleLoggerMock).toHaveBeenCalledTimes(1);
    // Second arg should be DiagLogLevel.ERROR = 1
    expect(setLoggerMock).toHaveBeenCalledWith(
      expect.any(Object),
      1,
    );
  });

  it('handles case-insensitive level strings', () => {
    const setLoggerMock = jest.fn();
    const DiagConsoleLoggerMock = jest.fn();
    const mockDiagLogLevel = {
      NONE: 0,
      ERROR: 1,
      WARN: 2,
      INFO: 3,
      DEBUG: 4,
      VERBOSE: 5,
      ALL: 9999,
    };

    jest.resetModules();
    jest.doMock('@opentelemetry/api', () => ({
      diag: { setLogger: setLoggerMock },
      DiagConsoleLogger: DiagConsoleLoggerMock,
      DiagLogLevel: mockDiagLogLevel,
    }));

    const { applyOtelDiagLevel: freshApply } = require('../src/utils');

    freshApply('warn');

    expect(setLoggerMock).toHaveBeenCalledWith(expect.any(Object), 2);
  });

  it('is silent when @opentelemetry/api is not installed', () => {
    jest.resetModules();
    jest.doMock('@opentelemetry/api', () => {
      throw new Error('Cannot find module');
    });

    const { applyOtelDiagLevel: freshApply } = require('../src/utils');

    // Should not throw
    expect(() => freshApply('ERROR')).not.toThrow();
  });

  it('skips invalid OTel level strings silently', () => {
    // No mock needed — invalid level should be caught before require
    expect(() => applyOtelDiagLevel('INVALID_LEVEL')).not.toThrow();
  });
});

// ─── Unit Tests: applyLogControl (integration) ──────────────────

describe('applyLogControl', () => {
  it('applies both CDS levels and OTel diag level when enabled', () => {
    const setLevelMock = jest.fn();
    const infoMock = jest.fn();

    const cds = {
      env: {
        logControl: {
          enabled: true,
          levels: { odata: 'error' },
          otelDiagLevel: 'ERROR',
        },
      },
      log: jest.fn(() => ({
        info: infoMock,
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        setLevel: setLevelMock,
      })),
    };

    expect(() => applyLogControl(cds)).not.toThrow();
    expect(cds.log).toHaveBeenCalled();
  });

  it('does nothing when enabled is false', () => {
    const cds = {
      env: {
        logControl: { enabled: false },
      },
      log: jest.fn(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        setLevel: jest.fn(),
      })),
    };

    applyLogControl(cds);

    // cds.log should NOT be called because plugin is disabled
    expect(cds.log).not.toHaveBeenCalled();
  });

  it('works with default config (no user overrides)', () => {
    const setLevelMock = jest.fn();

    const cds = {
      env: {},
      log: jest.fn(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        setLevel: setLevelMock,
      })),
    };

    expect(() => applyLogControl(cds)).not.toThrow();
    // Should set levels for the 3 defaults: odata, remote, telemetry
    expect(setLevelMock).toHaveBeenCalledWith('warn');
  });

  it('respects native CDS log.levels config', () => {
    const setLevelMock = jest.fn();

    const cds = {
      env: {
        log: { levels: { odata: 'error', remote: 'error' } },
      },
      log: jest.fn(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        setLevel: setLevelMock,
      })),
    };

    applyLogControl(cds);

    expect(setLevelMock).toHaveBeenCalledWith('error');
  });
});

// ─── Validation constants ────────────────────────────────────────

describe('validation constants', () => {
  it('VALID_CDS_LEVELS contains expected levels', () => {
    expect(VALID_CDS_LEVELS.has('silent')).toBe(true);
    expect(VALID_CDS_LEVELS.has('error')).toBe(true);
    expect(VALID_CDS_LEVELS.has('warn')).toBe(true);
    expect(VALID_CDS_LEVELS.has('info')).toBe(true);
    expect(VALID_CDS_LEVELS.has('debug')).toBe(true);
    expect(VALID_CDS_LEVELS.has('verbose')).toBe(true);
    expect(VALID_CDS_LEVELS.has('silly')).toBe(true);
    expect(VALID_CDS_LEVELS.has('INVALID')).toBe(false);
  });

  it('VALID_OTEL_LEVELS contains expected levels', () => {
    expect(VALID_OTEL_LEVELS.has('NONE')).toBe(true);
    expect(VALID_OTEL_LEVELS.has('ERROR')).toBe(true);
    expect(VALID_OTEL_LEVELS.has('WARN')).toBe(true);
    expect(VALID_OTEL_LEVELS.has('INFO')).toBe(true);
    expect(VALID_OTEL_LEVELS.has('DEBUG')).toBe(true);
    expect(VALID_OTEL_LEVELS.has('VERBOSE')).toBe(true);
    expect(VALID_OTEL_LEVELS.has('ALL')).toBe(true);
    expect(VALID_OTEL_LEVELS.has('invalid')).toBe(false);
  });
});
