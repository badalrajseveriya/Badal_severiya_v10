
// angel-one-dashboard-auth-wrangler.test.js
// BADAL SEVERIYA - Wrangler Authentication Configuration Validation
// Read-only validation. Does not deploy or modify Cloudflare resources.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, 'wrangler-angel-one.toml');

function readConfig() {
  assert.ok(
    fs.existsSync(CONFIG_PATH),
    'wrangler-angel-one.toml must exist in repository root'
  );

  return fs.readFileSync(CONFIG_PATH, 'utf8');
}

function getSections(config, sectionName) {
  const marker = `[[${sectionName}]]`;
  const sections = [];
  const lines = config.split(/\r?\n/);
  let current = null;

  for (const line of lines) {
    if (line.trim() === marker) {
      if (current) sections.push(current);
      current = [];
      continue;
    }

    if (current && line.trim().startsWith('[[')) {
      sections.push(current);
      current = null;
    }

    if (current) current.push(line);
  }

  if (current) sections.push(current);

  return sections.map(section => section.join('\n'));
}

function getBinding(config, bindingName) {
  const sections = getSections(config, 'durable_objects.bindings');

  return sections.find(section =>
    new RegExp(`^\\s*name\\s*=\s*"${bindingName}"\\s*$`, 'm')
      .test(section)
  );
}

function getMigration(config, migrationTag) {
  const sections = getSections(config, 'migrations');

  return sections.find(section =>
    new RegExp(`^\\s*tag\\s*=\s*"${migrationTag}"\\s*$`, 'm')
      .test(section)
  );
}

test('Wrangler configuration file exists and is readable', () => {
  const config = readConfig();

  assert.ok(config.trim().length > 0);
});

test('Worker name is correct', () => {
  const config = readConfig();

  assert.match(
    config,
    /^\s*name\s*=\s*"badal-severiya-angel-one-live"\s*$/m
  );
});

test('Worker entry file remains the Angel One SmartAPI worker', () => {
  const config = readConfig();

  assert.match(
    config,
    /^\s*main\s*=\s*"angel-one-smartapi-worker\.js"\s*$/m
  );
});

test('Existing SMARTAPI_SESSION Durable Object binding is preserved', () => {
  const config = readConfig();
  const binding = getBinding(config, 'SMARTAPI_SESSION');

  assert.ok(binding, 'SMARTAPI_SESSION binding must exist');
  assert.match(binding, /class_name\s*=\s*"AngelOneSmartApiSession"/);
});

test('AUTH_STORE Durable Object binding is configured', () => {
  const config = readConfig();
  const binding = getBinding(config, 'AUTH_STORE');

  assert.ok(binding, 'AUTH_STORE binding must exist');
  assert.match(binding, /class_name\s*=\s*"DashboardAuthStore"/);
});

test('Original v1 migration is preserved for AngelOneSmartApiSession', () => {
  const config = readConfig();
  const migration = getMigration(config, 'v1');

  assert.ok(migration, 'Existing v1 migration must not be removed');
  assert.match(
    migration,
    /new_sqlite_classes\s*=\s*\["AngelOneSmartApiSession"\]/
  );
});

test('New v2 migration is configured for DashboardAuthStore', () => {
  const config = readConfig();
  const migration = getMigration(config, 'v2');

  assert.ok(migration, 'New v2 migration must exist');
  assert.match(
    migration,
    /new_sqlite_classes\s*=\s*\["DashboardAuthStore"\]/
  );
});

test('Migration order is v1 followed by v2', () => {
  const config = readConfig();
  const migrations = getSections(config, 'migrations');

  assert.equal(migrations.length, 2, 'Expected exactly two migrations');

  const tags = migrations.map(section => {
    const match = section.match(/^\s*tag\s*=\s*"([^"]+)"\s*$/m);
    return match && match[1];
  });

  assert.deepEqual(tags, ['v1', 'v2']);
});

test('Dashboard password and secret values are not hardcoded in Wrangler config', () => {
  const config = readConfig();

  assert.doesNotMatch(
    config,
    /DASHBOARD_ACCESS_PASSWORD\s*=\s*["'][^"']+["']/i,
    'Dashboard password must not be hardcoded'
  );

  assert.doesNotMatch(
    config,
    /(?:api_key|api_secret|client_secret|access_token)\s*=\s*["'][^"']+["']/i,
    'API secrets and tokens must not be hardcoded'
  );
});

test('Workers.dev access remains enabled in configuration', () => {
  const config = readConfig();

  assert.match(config, /^\s*workers_dev\s*=\s*true\s*$/m);
});

console.log('Wrangler auth configuration test file loaded.');
