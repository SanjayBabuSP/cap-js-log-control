/**
 * CAP Plugin Entrypoint — cap-js-log-control
 *
 * This file is auto-discovered by CAP when installed as a dependency.
 * Log control runs immediately at module load time — before any
 * lifecycle hooks fire — because logger noise starts during bootstrap.
 *
 * Run `npm run build` to compile TypeScript before publishing or testing.
 */
'use strict';
const cds = require('@sap/cds');
const { applyLogControl } = require('./dist/index');

// Run immediately at module load — before any loggers emit
applyLogControl(cds);
