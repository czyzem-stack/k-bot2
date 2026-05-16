#!/usr/bin/env node
/**
 * Fails if version strings are out of sync across release touchpoints.
 * Run: npm run verify:version
 */
import { readFileSync } from 'node:fs'

const root = new URL('..', import.meta.url)
const read = (rel) => readFileSync(new URL(rel, root), 'utf8')

const pkg = JSON.parse(read('package.json'))
const version = pkg.version
const errors = []

const lock = JSON.parse(read('package-lock.json'))
if (lock.version !== version) {
  errors.push(`package-lock.json root version is "${lock.version}", expected "${version}"`)
}
if (lock.packages?.['']?.version !== version) {
  errors.push(`package-lock.json packages[""] version mismatch`)
}

const html = read('index.html')
if (!html.includes(`k-bot2 v${version}`)) {
  errors.push(`index.html <title> must contain "k-bot2 v${version}"`)
}

const dashboard = read('src/components/KalshiTabbedDashboard.tsx')
if (!dashboard.includes('APP_VERSION')) {
  errors.push('KalshiTabbedDashboard.tsx must display APP_VERSION from src/lib/appVersion.ts')
}
if (!dashboard.includes("from '../lib/appVersion'")) {
  errors.push("KalshiTabbedDashboard.tsx must import from '../lib/appVersion'")
}

const appVersionTs = read('src/lib/appVersion.ts')
if (!appVersionTs.includes('package.json')) {
  errors.push('src/lib/appVersion.ts must import version from package.json')
}

if (errors.length) {
  console.error('Version verify failed:\n')
  for (const e of errors) console.error(`  • ${e}`)
  process.exit(1)
}

console.log(`OK — release touchpoints aligned on v${version}`)
