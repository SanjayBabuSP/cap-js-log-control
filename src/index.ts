import { getConfig, LogControlConfig } from './config';
import { applyCdsLogLevels, applyOtelDiagLevel } from './utils';

/**
 * Main entry point for the log control plugin.
 *
 * Must be called at module load time (not inside a lifecycle hook)
 * because logger noise starts during CDS bootstrap before any hooks fire.
 *
 * @param cds - The CDS runtime object
 */
export function applyLogControl(cds: any): void {
  const config: LogControlConfig = getConfig(cds);

  if (!config.enabled) {
    return;
  }

  applyCdsLogLevels(cds, config.levels);
  applyOtelDiagLevel(config.otelDiagLevel);
}
