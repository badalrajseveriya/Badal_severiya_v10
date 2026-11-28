
// angel-one-dashboard-auth-wrangler.test.js
// BADAL SEVERIYA - Wrangler Authentication Configuration Validation
// Read-only tests. Does not deploy or modify Cloudflare resources.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'wrangler-angel-one.toml');

function readConfig() {
  assert.ok(fs.existsSync(CONFIG_PATH), 'Wrangler config file must exist');
  return fs.readFileSync(CONFIG_PATH, 'utf8');
}

function extractBlock(config, heading) {
  const lines = config.split(/\r?\n/);
  const start = lines.findIndex(line => line.trim() === heading);

  if (start === -1) return '';

  const block = [];

  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim().startsWith('[[')) break;
    block.push(lines[i]);
  }

  return block.join('\n');
}

test('Wrangler config exists and is readable', () => {
  assert.ok(readConfig().trim().length > 0);
});

test('Worker name is correct', () => {
  assert.match(
    readConfig(),
    /^name\s*=\s*"badal-severiya-angel-one-live"\s*$/m
  );
});

test('Worker entry point is correct', () => {
  assert.match(
    readConfig(),
    /^main\s*=\s*"angel-one-smartapi-worker\.js"\s*$/m
  );
});

test('Existing SMARTAPI_SESSION binding is preserved', () => {
  const config = readConfig();
  const block = extractBlock(config, '[[durable_objects.bindings]]');

  assert.match(block, /^name\s*=\s*"SMARTAPI_SESSION"\s*$/m);
  assert.match(block, /^class_name\s*=\s*"AngelOneSmartApiSession"\s*$/m);
});

test('AUTH_STORE binding is configured', () => {
  const config = readConfig();
  const lines = config.split(/\r?\n/);
  const blocks = [];
  let active = false;
  let current = [];

  for (const line of lines) {
    if (line.trim() === '[[durable_objects.bindings]]') {
      if (active) blocks.push(current.join('\n'));
      active = true;
      current = [];
      continue;
    }

    if (active && line.trim().startsWith('[[')) {
      blocks.push(current.join('\n'));
      active = false;
      current = [];
    }

    if (active) current.push(line);
  }

  if (active) blocks.push(current.join('\n'));

  const authBlock = blocks.find(block =>
    /^name\s*=\s*"AUTH_STORE"\s*$/m.test(block)
  );

  assert.ok(authBlock, 'AUTH_STORE binding must exist');
  assert.match(authBlock, /^class_name\s*=\s*"DashboardAuthStore"\s*$/m);
});

test('Original v1 migration is preserved', () => {
  const config = readConfig();
  const blocks = [];
  const lines = config.split(/\r?\n/);
  let active = false;
  let current = [];

  for (const line of lines) {
    if (line.trim() === '[[migrations]]') {
      if (active) blocks.push(current.join('\n'));
      active = true;
      current = [];
      continue;
    }

    if (active && line.trim().startsWith('[[')) {
      blocks.push(current.join('\n'));
      active = false;
      current = [];
    }

    if (active) current.push(line);
  }

  if (active) blocks.push(current.join('\n'));

  const v1 = blocks.find(block => /^tag\s*=\s*"v1"\s*$/m.test(block));

  assert.ok(v1, 'v1 migration must remain');
  assert.match(v1, /AngelOneSmartApiSession/);
});

test('v2 migration is configured for DashboardAuthStore', () => {
  const config = readConfig();
  const blocks = [];
  const lines = config.split(/\r?\n/);
  let active = false;
  let current = [];

  for (const line of lines) {
    if (line.trim() === '[[migrations]]') {
      if (active) blocks.push(current.join('\n'));
      active = true;
      current = [];
      continue;
    }

    if (active && line.trim().startsWith('[[')) {
      blocks.push(current.join('\n'));
      active = false;
      current = [];
    }

    if (active) current.push(line);
  }

  if (active) blocks.push(current.join('\n'));

  const v2 = blocks.find(block => /^tag\s*=\s*"v2"\s*$/m.test(block));

  assert.ok(v2, 'v2 migration must exist');
  assert.match(v2, /DashboardAuthStore/);
});

test('Migration order is v1 then v2', () => {
  const config = readConfig();
  const v1Index = config.indexOf('tag = "v1"');
  const v2Index = config.indexOf('tag = "v2"');

  assert.ok(v1Index >= 0, 'v1 migration tag missing');
  assert.ok(v2Index >= 0, 'v2 migration tag missing');
  assert.ok(v1Index < v2Index, 'v1 must appear before v2');
});

test('No dashboard password or API secrets are hardcoded', () => {
  const config = readConfig();

  assert.doesNotMatch(
    config,
    /DASHBOARD_ACCESS_PASSWORD\s*=\s*["'][^"']+["']/i
  );

  assert.doesNotMatch(
    config,
    /(?:api_key|api_secret|client_secret|access_token)\s*=\s*["'][^"']+["']/i
  );
});

test('Workers.dev is enabled', () => {
  assert.match(readConfig(), /^workers_dev\s*=\s*true\s*$/m);
});

console.log('Wrangler configuration tests loaded.');
