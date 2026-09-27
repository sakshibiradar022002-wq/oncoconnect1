// Fire one harmless test error to Sentry to prove the wiring end-to-end.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('dotenv').config({ path: new URL('./.env', import.meta.url).pathname });
process.env.NODE_ENV = 'production';
const mod = await import('./src/observability/sentry.js');
const S = mod.initSentry();
if (!S) { console.error('SENTRY_NOT_INITIALIZED'); process.exit(1); }
mod.captureException(new Error('VELTRUVIA test error — wiring complete (safe to ignore)'));
await S.flush(10000);
console.log('TEST_ERROR_SENT');
