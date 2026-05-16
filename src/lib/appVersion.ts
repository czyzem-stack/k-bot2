import pkg from '../../package.json' with { type: 'json' }

/** Single source of truth — must match package.json `version`. */
export const APP_VERSION = pkg.version
