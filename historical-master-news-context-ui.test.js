
// BADAL SEVERIYA V12
// HISTORICAL MASTER — NEWS CONTEXT UI INTEGRITY TESTS

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync(
  new URL("./historical-master-news-context-ui.js", import.meta.url),
  "utf8"
);

const html = readFileSync(
  new URL("./index.html", import.meta.url),
  "utf8"
);

let passed = 0;

function test(name, callback) {
  callback();
  passed += 1;
  console.log("PASS:", name);
}

test("Bridge module import is present", () => {
  assert.match(ui, /from\s+["']\.\/historical-master-news-context\.js["']/);
});

test("News Intelligence API endpoint is configured", () => {
  assert.match(
    ui,
    /https:\/\/badal-severiya-news-intelligence\.mrstarrdbs\.workers\.dev\/api\/news-intelligence/
  );
});

test("Only 1D and 15M timeframes are configured", () => {
  assert.match(ui, /TIMEFRAMES\s*=\s*\[\s*"1d"\s*,\s*"15m"\s*\]/);
});

test("Summary container ID is used", () => {
  assert.match(ui, /master-summary-\$\{timeframe\}/);
});

test("News context panel is created", () => {
  assert.match(ui, /function\s+createPanel\s*\(timeframe\)/);
  assert.match(ui, /historical-master-news-context-panel/);
});

test("News panel is placed after eight-panel container", () => {
  assert.match(ui, /\.master-eight-container/);
  assert.match(ui, /eightPanel\.after\(panel\)/);
});

test("Safe article URL validator exists", () => {
  assert.match(ui, /function\s+getSafeArticleUrl\s*\(value\)/);
});

test("Non-HTTPS article URLs are rejected", () => {
  assert.match(ui, /parsed\.protocol\s*!==\s*"https:"/);
});

test("Article URL credentials are rejected", () => {
  assert.match(ui, /parsed\.username\s*\|\|\s*parsed\.password/);
});

test("Article URL hostname is validated", () => {
  assert.match(ui, /!parsed\.hostname/);
});

test("Unsafe article links render unavailable text", () => {
  assert.match(ui, /Article link unavailable or unsafe/);
  assert.match(ui, /if\s*\(safeArticleUrl\)/);
});

test("External article links use noopener noreferrer", () => {
  assert.match(ui, /articleLinkElement\.target\s*=\s*"_blank"/);
  assert.match(ui, /articleLinkElement\.rel\s*=\s*"noopener noreferrer"/);
});

test("Dynamic text is assigned through textContent", () => {
  assert.match(ui, /element\.textContent\s*=\s*String\(text\)/);
});

test("UI does not use innerHTML", () => {
  assert.doesNotMatch(ui, /\.innerHTML\s*=/);
});

test("Summary renderer exists", () => {
  assert.match(ui, /function\s+renderSummary\s*\(panel,\s*result\)/);
});

test("Article renderer exists", () => {
  assert.match(ui, /function\s+renderArticles\s*\(panel,\s*result\)/);
});

test("NIFTY relevant articles are rendered", () => {
  assert.match(ui, /result\.articles\.relevant/);
});

test("Other and global context articles are supported", () => {
  assert.match(ui, /result\.articles\.otherContext/);
});

test("Stale fallback articles remain display-only", () => {
  assert.match(ui, /result\.articles\.stale/);
  assert.match(ui, /DISPLAY ONLY/);
});

test("Refresh uses refresh query parameter", () => {
  assert.match(ui, /\$\{NEWS_API\}\?refresh=1/);
});

test("Non-OK API responses throw an error", () => {
  assert.match(ui, /if\s*\(!response\.ok\)/);
  assert.match(ui, /News API HTTP \$\{response\.status\}/);
});

test("API response JSON is parsed", () => {
  assert.match(ui, /await response\.json\(\)/);
});

test("API payload is passed through bridge analysis", () => {
  assert.match(ui, /analyzeHistoricalMasterNewsContext\s*\(\s*payload/);
});

test("Refresh button click handler is connected", () => {
  assert.match(ui, /button\.addEventListener\("click"/);
  assert.match(ui, /refresh:\s*true/);
});

test("Refresh button is disabled while loading", () => {
  assert.match(ui, /button\.disabled\s*=\s*true/);
});

test("Refresh button is restored in finally block", () => {
  assert.match(
    ui,
    /finally\s*\{[\s\S]*?button\.disabled\s*=\s*false/
  );
});

test("API failures are displayed in the UI", () => {
  assert.match(ui, /catch\s*\(error\)/);
  assert.match(ui, /News API connection error/);
});

test("Every configured timeframe initializes", () => {
  assert.match(
    ui,
    /for\s*\(const timeframe of TIMEFRAMES\)\s*\{\s*initializeNewsPanel\(timeframe\)/
  );
});

test("Index HTML loads the News Context UI module", () => {
  assert.match(html, /historical-master-news-context-ui\.js/);
});

test("UI explicitly prohibits forecasts and trading signals", () => {
  assert.match(ui, /No forecasts, trading signals, or future probabilities/);
});

test("UI source contains no merge conflict markers", () => {
  assert.doesNotMatch(ui, /^(<<<<<<<|=======|>>>>>>>)/m);
});

// Timeout protection tests

test("UI defines a finite News API timeout", () => {
  const match = ui.match(/NEWS_API_TIMEOUT_MS\s*=\s*(\d+)/);

  assert.ok(match, "NEWS_API_TIMEOUT_MS constant must exist");

  const timeoutMs = Number(match[1]);

  assert.ok(
    Number.isFinite(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 30000,
    `Timeout must be between 1000 and 30000 ms; received ${timeoutMs}`
  );
});

test("News API request uses AbortController", () => {
  assert.match(ui, /new\s+AbortController\s*\(/);
  assert.match(ui, /signal:\s*controller\.signal/);
});

test("Timeout timer is cleared after request settles", () => {
  assert.match(ui, /clearTimeout\s*\(\s*timeoutId\s*\)/);
});

test("Timeout has a specific user-facing error message", () => {
  assert.match(ui, /News API request timed out/i);
});

console.log("");
console.log(`ALL ${passed} NEWS CONTEXT UI INTEGRITY TESTS PASSED`);
