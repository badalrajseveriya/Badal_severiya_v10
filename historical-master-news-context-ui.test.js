
/*
 * BADAL SEVERIYA V12
 * HISTORICAL MASTER — NEWS CONTEXT UI INTEGRITY TESTS
 *
 * Verifies dashboard UI wiring, safe article links,
 * timeframe coverage, refresh handling and context-only
 * restrictions.
 *
 * Run:
 * node historical-master-news-context-ui.test.js
 */

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

// 1. Bridge import
test("Bridge module import is present", () => {
  assert.match(
    ui,
    /from\s+["']\.\/historical-master-news-context\.js["']/
  );
});

// 2. API endpoint
test("News Intelligence API endpoint is configured", () => {
  assert.match(
    ui,
    /https:\/\/badal-severiya-news-intelligence\.mrstarrdbs\.workers\.dev\/api\/news-intelligence/
  );
});

// 3. Dual timeframe coverage
test("Only 1D and 15M timeframes are configured", () => {
  assert.match(
    ui,
    /TIMEFRAMES\s*=\s*\[\s*"1d"\s*,\s*"15m"\s*\]/
  );
});

// 4. 1D summary target
test("1D summary container ID is used", () => {
  assert.match(
    ui,
    /master-summary-\$\{timeframe\}/
  );
});

// 5. Panel creation
test("News context panel is created", () => {
  assert.match(
    ui,
    /function\s+createPanel\s*\(timeframe\)/
  );

  assert.match(
    ui,
    /historical-master-news-context-panel/
  );
});

// 6. Eight-panel placement
test("News panel is placed after eight-panel container when available", () => {
  assert.match(
    ui,
    /\.master-eight-container/
  );

  assert.match(
    ui,
    /eightPanel\.after\(panel\)/
  );
});

// 7. Safe URL helper
test("Safe article URL validator exists", () => {
  assert.match(
    ui,
    /function\s+getSafeArticleUrl\s*\(value\)/
  );
});

// 8. HTTPS-only links
test("Non-HTTPS article URLs are rejected", () => {
  assert.match(
    ui,
    /parsed\.protocol\s*!==\s*"https:"/
  );
});

// 9. Credential rejection
test("Article URL credentials are rejected", () => {
  assert.match(
    ui,
    /parsed\.username\s*\|\|\s*parsed\.password/
  );
});

// 10. Hostname validation
test("Article URL hostname is validated", () => {
  assert.match(
    ui,
    /!parsed\.hostname/
  );
});

// 11. Invalid links are not clickable
test("Unsafe article links render unavailable text", () => {
  assert.match(
    ui,
    /Article link unavailable or unsafe/
  );

  assert.match(
    ui,
    /if\s*\(safeArticleUrl\)/
  );
});

// 12. New-tab security
test("External article links use noopener noreferrer", () => {
  assert.match(
    ui,
    /articleLinkElement\.target\s*=\s*"_blank"/
  );

  assert.match(
    ui,
    /articleLinkElement\.rel\s*=\s*"noopener noreferrer"/
  );
});

// 13. Text safety
test("Dynamic text is assigned through textContent", () => {
  assert.match(
    ui,
    /element\.textContent\s*=\s*String\(text\)/
  );
});

// 14. No dynamic HTML insertion
test("UI does not use innerHTML", () => {
  assert.doesNotMatch(
    ui,
    /\.innerHTML\s*=/
  );
});

// 15. Summary rendering
test("Summary renderer exists", () => {
  assert.match(
    ui,
    /function\s+renderSummary\s*\(panel,\s*result\)/
  );
});

// 16. Article rendering
test("Article renderer exists", () => {
  assert.match(
    ui,
    /function\s+renderArticles\s*\(panel,\s*result\)/
  );
});

// 17. Relevant articles
test("NIFTY relevant articles are rendered", () => {
  assert.match(
    ui,
    /result\.articles\.relevant/
  );
});

// 18. Global context
test("Other and global context articles are supported", () => {
  assert.match(
    ui,
    /result\.articles\.otherContext/
  );
});

// 19. Stale display-only articles
test("Stale fallback articles remain display-only", () => {
  assert.match(
    ui,
    /result\.articles\.stale/
  );

  assert.match(
    ui,
    /DISPLAY ONLY/
  );
});

// 20. API refresh
test("Refresh uses refresh query parameter", () => {
  assert.match(
    ui,
    /\$\{NEWS_API\}\?refresh=1/
  );
});

// 21. HTTP error handling
test("Non-OK API responses throw an error", () => {
  assert.match(
    ui,
    /if\s*\(!response\.ok\)/
  );

  assert.match(
    ui,
    /News API HTTP \$\{response\.status\}/
  );
});

// 22. JSON parsing
test("API response JSON is parsed", () => {
  assert.match(
    ui,
    /await response\.json\(\)/
  );
});

// 23. Bridge analysis
test("API payload is passed through bridge analysis", () => {
  assert.match(
    ui,
    /analyzeHistoricalMasterNewsContext\s*\(\s*payload/
  );
});

// 24. Refresh button handler
test("Refresh button click handler is connected", () => {
  assert.match(
    ui,
    /button\.addEventListener\("click"/
  );

  assert.match(
    ui,
    /refresh:\s*true/
  );
});

// 25. Loading state
test("Refresh button is disabled while loading", () => {
  assert.match(
    ui,
    /button\.disabled\s*=\s*true/
  );
});

// 26. Loading recovery
test("Refresh button is restored in finally block", () => {
  assert.match(
    ui,
    /finally\s*\{[\s\S]*?button\.disabled\s*=\s*false/
  );
});

// 27. Error status
test("API failures are displayed in the UI", () => {
  assert.match(
    ui,
    /catch\s*\(error\)/
  );

  assert.match(
    ui,
    /News API connection error/
  );
});

// 28. Both panels initialize
test("Every configured timeframe initializes", () => {
  assert.match(
    ui,
    /for\s*\(const timeframe of TIMEFRAMES\)\s*\{\s*initializeNewsPanel\(timeframe\)/
  );
});

// 29. Dashboard script integration
test("Index HTML loads the News Context UI module", () => {
  assert.match(
    html,
    /historical-master-news-context-ui\.js/
  );
});

// 30. Context-only restriction
test("UI explicitly prohibits forecasts and trading signals", () => {
  assert.match(
    ui,
    /No forecasts, trading signals, or future probabilities/
  );
});

// 31. Conflict marker check
test("UI source contains no merge conflict markers", () => {
  assert.doesNotMatch(
    ui,
    /^(<<<<<<<|=======|>>>>>>>)/m
  );
});

console.log("");
console.log(
  `ALL ${passed} NEWS CONTEXT UI INTEGRITY TESTS PASSED`
);
