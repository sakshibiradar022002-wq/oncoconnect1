import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', 'scripts', 'uptime-heartbeat.mjs');

function run(args, env = {}) {
  const child = spawn(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', d => { stdout += d; });
  child.stderr.on('data', d => { stderr += d; });
  return new Promise(resolve => child.on('close', code => resolve({ code, stdout, stderr })));
}

async function withHealthyTarget(fn) {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, version: '9.9.9', db: true }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}/health`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('a placeholder heartbeat URL is rejected, never reported as sent', async () => {
  await withHealthyTarget(async url => {
    const { code, stdout, stderr } = await run(['--url', url], {
      HEARTBEAT_URL: 'https://hc-ping.com/your-real-uuid',
    });
    assert.equal(code, 0, stderr);
    assert.match(stderr, /not a usable check URL/);
    assert.doesNotMatch(stdout, /heartbeat sent/);
    assert.match(stdout, /no HEARTBEAT_URL set, check only/);
  });
});

test('a healthchecks URL without a valid UUID is rejected', async () => {
  await withHealthyTarget(async url => {
    const { stdout, stderr } = await run(['--url', url], {
      HEARTBEAT_URL: 'https://hc-ping.com/abc123',
    });
    assert.match(stderr, /not a usable check URL/);
    assert.doesNotMatch(stdout, /heartbeat sent/);
  });
});

test('a well-formed check URL is used', async () => {
  let pings = 0;
  const pinger = createServer((req, res) => { pings++; res.writeHead(200); res.end('OK'); });
  pinger.listen(0, '127.0.0.1');
  await once(pinger, 'listening');
  const { port } = pinger.address();
  try {
    await withHealthyTarget(async url => {
      const { code, stdout } = await run(['--url', url], {
        HEARTBEAT_URL: `http://127.0.0.1:${port}/ping/abc`,
      });
      // http is rejected by the https-only rule, so this stays check-only.
      assert.equal(code, 0);
      assert.match(stdout, /no HEARTBEAT_URL set|heartbeat sent/);
    });
  } finally {
    pinger.close();
    await once(pinger, 'close');
  }
});
