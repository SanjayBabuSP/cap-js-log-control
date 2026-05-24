# cap-js-log-control

> CAP plugin for controlling CDS logger verbosity and OpenTelemetry DiagLogger noise — reduce log clutter, surface real errors.

## Problem

SAP CAP applications on Cloud Foundry generate excessive log noise that buries real errors:

- **`odata` logger** — logs every incoming OData request with full HTTP headers JSON blobs
- **`remote` logger** — logs every outgoing remote service call with full headers
- **OpenTelemetry DiagLogger** — `@cap-js/telemetry` OTLP gRPC exporters emit diagnostic logs that bypass `cds.log` entirely

**Before:**
```
STDOUT {"level":"info","logger":"odata","msg":"POST /assets/$batch",...<3KB of headers>}
STDOUT {"level":"debug","logger":"remote","msg":"GET <api>/... Executing via @sap-cloud-sdk",...}
STDERR ExporterError: Export... failed  [repeated 50x from OTel gRPC]
STDERR Error: The request has no query  ← REAL error, buried
```

**After:**
```
STDERR Error: The request has no query  ← now visible immediately
```

## Installation

```bash
npm install cap-js-log-control
```

CAP auto-discovers the plugin via `cds-plugin.js` — no code changes needed.

## Configuration

### Quick Start (zero config)

The plugin works out of the box with sensible defaults:
- `odata` → `warn`
- `remote` → `warn`
- `telemetry` → `warn`
- OpenTelemetry DiagLogger → `ERROR`

### Plugin Config (`cds.logControl`)

Add to `package.json` or `.cdsrc.json`:

```json
{
  "cds": {
    "logControl": {
      "enabled": true,
      "otelDiagLevel": "ERROR",
      "levels": {
        "odata": "warn",
        "remote": "warn",
        "telemetry": "warn"
      }
    }
  }
}
```

### Native CDS Log Levels (also supported)

You can also use the standard CDS `log.levels` format — the plugin reads both:

```json
{
  "cds": {
    "[development]": {
      "log": {
        "levels": {
          "odata": "error",
          "remote": "error"
        }
      }
    }
  }
}
```

> **Priority:** `cds.logControl.levels` overrides `cds.log.levels` when both are set for the same logger.

### Per-Profile Overrides

Use CAP profiles to tune log levels per environment:

```json
{
  "cds": {
    "logControl": {
      "enabled": true,
      "levels": {
        "odata": "warn",
        "remote": "warn"
      }
    },
    "[development]": {
      "logControl": {
        "levels": {
          "odata": "error",
          "remote": "error"
        }
      }
    },
    "[production]": {
      "logControl": {
        "otelDiagLevel": "WARN"
      }
    }
  }
}
```

### Disable the Plugin

```json
{
  "cds": {
    "logControl": {
      "enabled": false
    }
  }
}
```

## Config Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `logControl.enabled` | `boolean` | `true` | Master switch — set `false` to disable all log control |
| `logControl.levels` | `Record<string, string>` | `{ odata: 'warn', remote: 'warn', telemetry: 'warn' }` | Map of CDS logger names to log levels |
| `logControl.otelDiagLevel` | `string` | `'ERROR'` | OpenTelemetry DiagLogger level |

### CDS Log Levels

`silent` | `error` | `warn` | `info` | `debug` | `verbose` | `silly`

### OTel DiagLogger Levels

`NONE` | `ERROR` | `WARN` | `INFO` | `DEBUG` | `VERBOSE` | `ALL`

## How It Works

1. **Runs at module load time** — not inside a lifecycle hook — because logger noise starts during CDS bootstrap before `cds.once('served')` fires.
2. **Controls CDS loggers** — calls `cds.log(name).setLevel(level)` for each configured logger.
3. **Controls OTel DiagLogger** — sets `diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR)` to suppress OTLP exporter retry chatter.
4. **Does NOT redirect stdout/stderr** — all logs still flow to CF Loggregator for cloud logging.
5. **Does NOT patch `console.log`** — only reduces log *generation* at the source.

## What This Plugin Does NOT Do

- Does NOT redirect or wrap `process.stdout` / `process.stderr`
- Does NOT patch `console.log` / `console.error`
- Does NOT affect cloud logging — all generated logs still flow to CF Loggregator
- Does NOT disable `@cap-js/telemetry` or OTLP exporters — only reduces their diagnostic output

## Development

```bash
npm install
npm run build
npm test
```

## License

[Apache-2.0](LICENSE)
