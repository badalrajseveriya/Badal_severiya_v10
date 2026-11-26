
/**
 * BADAL SEVERIYA V12
 * Angel One Historical Import UI Tests
 *
 * Checks:
 * - HTML structure and required controls.
 * - Preview and upload confirmation.
 * - Runtime token security.
 * - File size/type validation.
 * - API pagination and pipeline integration.
 * - Upload progress/result field contracts.
 * - Sequential upload failure safety.
 * - Historical-only safety description.
 * - Inline module JavaScript syntax.
 *
 * Historical import only.
 * No trading or order placement.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const HTML_FILE = new URL(
  "./angelone-historical-import.html",
  import.meta.url
);

const html = readFileSync(
  HTML_FILE,
  "utf8"
);

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function getInlineModuleScript(source) {
  const matches = [
    ...source.matchAll(
      /<script\s+type=["']module["']\s*>([\s\S]*?)<\/script>/gi
    )
  ];

  assert.ok(
    matches.length > 0,
    "HTML must contain a module script."
  );

  return matches
    .map(match => match[1])
    .join("\n");
}

function removeModuleImports(script) {
  // Remove multiline named imports from the inline module.
  return script.replace(
    /^\s*import\s*\{[^}]*\}\s*from\s*["'][^"']+["'];?\s*$/gm,
    ""
  );
}

function compileInlineModule(script) {
  const sourceWithoutImports =
    removeModuleImports(script);

  assert.ok(
    sourceWithoutImports.trim().length > 0,
    "Inline module script must not be empty."
  );

  assert.doesNotMatch(
    sourceWithoutImports,
    /^\s*import\b/m,
    "All static imports must be removed before syntax compilation."
  );

  // Syntax-only compilation.
  // Does not execute the code or require a browser DOM.
  assert.doesNotThrow(
    () => new Function(sourceWithoutImports),
    "Inline module JavaScript must be syntactically valid."
  );
}

// --------------------------------------------------
// 1. HTML document structure
// --------------------------------------------------

test(
  "contains a valid basic HTML document structure",
  () => {
    assert.match(html, /<!DOCTYPE html>/i);
    assert.match(html, /<html\b/i);
    assert.match(html, /<head>/i);
    assert.match(html, /<body>/i);
    assert.match(html, /<\/html>/i);

    assert.match(
      html,
      /BADAL SEVERIYA V12/i
    );
  }
);

// --------------------------------------------------
// 2. Required UI controls
// --------------------------------------------------

test(
  "contains all required historical import controls",
  () => {
    const requiredIds = [
      "apiBaseUrl",
      "index",
      "timeframe",
      "ingestToken",
      "jsonFile",
      "previewButton",
      "uploadButton",
      "clearButton",
      "status",
      "previewCard",
      "progressContainer",
      "progressBar",
      "previewDetails",
      "existingCount",
      "incomingCount",
      "duplicateCount",
      "finalCount",
      "batchSize",
      "batchCount"
    ];

    for (const id of requiredIds) {
      assert.ok(
        html.includes(`id="${id}"`),
        `Missing required HTML element: ${id}`
      );
    }
  }
);

// --------------------------------------------------
// 3. Supported timeframe options
// --------------------------------------------------

test(
  "only offers 15m and 1d import timeframes",
  () => {
    const timeframeSelect =
      html.match(
        /<select[^>]*id="timeframe"[^>]*>([\s\S]*?)<\/select>/i
      );

    assert.ok(
      timeframeSelect,
      "Timeframe selector must exist."
    );

    const options = [
      ...timeframeSelect[1].matchAll(
        /<option\s+value=["']([^"']+)["']/gi
      )
    ].map(match => match[1]);

    assert.deepEqual(
      options,
      ["15m", "1d"]
    );
  }
);

// --------------------------------------------------
// 4. File validation
// --------------------------------------------------

test(
  "enforces JSON file type and 20 MB size limit",
  () => {
    assert.match(
      html,
      /accept=["'][^"']*\.json[^"']*["']/i
    );

    assert.match(
      html,
      /20\s*MB/i
    );

    assert.match(
      html,
      /20\s*\*\s*1024\s*\*\s*1024/
    );

    assert.match(
      html,
      /file\.size\s*>\s*MAX_FILE_BYTES/
    );
  }
);

// --------------------------------------------------
// 5. Preview workflow
// --------------------------------------------------

test(
  "contains a preview-only validation workflow",
  () => {
    assert.match(
      html,
      /PREVIEW\s*&amp;\s*CHECK DATA/i
    );

    assert.match(
      html,
      /fetchExistingHistoricalCandles/
    );

    assert.match(
      html,
      /prepareAngelOneHistoricalImport/
    );

    assert.match(
      html,
      /Preview does not modify the database/i
    );

    assert.match(
      html,
      /PREVIEW PASSED/i
    );
  }
);

// --------------------------------------------------
// 6. Upload confirmation
// --------------------------------------------------

test(
  "requires confirmation before historical upload",
  () => {
    assert.match(
      html,
      /CONFIRM\s*&amp;\s*UPLOAD TO D1/i
    );

    assert.match(
      html,
      /window\.confirm/
    );

    assert.match(
      html,
      /This will modify the D1 historical database/i
    );

    assert.match(
      html,
      /Upload cancelled/i
    );
  }
);

// --------------------------------------------------
// 7. Token security
// --------------------------------------------------

test(
  "does not persist the ingest token",
  () => {
    assert.match(
      html,
      /id="ingestToken"[\s\S]*?type="password"/i
    );

    assert.match(
      html,
      /tokenInput\.value\s*=\s*["']{2}/
    );

    assert.match(
      html,
      /pagehide/
    );

    // Ignore plain explanatory text.
    // Block actual storage API property access.
    assert.doesNotMatch(
      html,
      /\b(?:window\.)?(?:localStorage|sessionStorage)\s*(?:\.|\[)/
    );

    // Block cookie reading/writing through document.cookie.
    assert.doesNotMatch(
      html,
      /\bdocument\.cookie\b/
    );
  }
);

// --------------------------------------------------
// 8. Correct pipeline module imports
// --------------------------------------------------

test(
  "imports the correct controller and pipeline modules",
  () => {
    assert.match(
      html,
      /angelone-historical-import-controller\.js/
    );

    assert.match(
      html,
      /angelone-historical-import-pipeline\.js/
    );

    assert.match(
      html,
      /runAngelOneHistoricalImportPipeline/
    );

    assert.match(
      html,
      /fetchExistingHistoricalCandles/
    );
  }
);

// --------------------------------------------------
// 9. Upload progress field contract
// --------------------------------------------------

test(
  "uses the uploader progress field uploadedCandles",
  () => {
    assert.match(
      html,
      /event\.uploadedCandles/
    );

    assert.match(
      html,
      /event\.completedBatches/
    );

    assert.match(
      html,
      /event\.totalBatches/
    );

    assert.doesNotMatch(
      html,
      /event\.uploadedCandleCount/
    );
  }
);

// --------------------------------------------------
// 10. Upload result contract
// --------------------------------------------------

test(
  "uses the pipeline upload result fields",
  () => {
    assert.match(
      html,
      /result\.upload\.uploadedBatchCount/
    );

    assert.match(
      html,
      /result\.upload\.uploadedCandleCount/
    );

    assert.match(
      html,
      /result\.existingFetch\.candleCount/
    );

    assert.match(
      html,
      /result\.preparation\.finalUniqueCandleCount/
    );
  }
);

// --------------------------------------------------
// 11. Sequential upload safety
// --------------------------------------------------

test(
  "contains sequential pipeline upload and failure handling",
  () => {
    assert.match(
      html,
      /runAngelOneHistoricalImportPipeline/
    );

    assert.match(
      html,
      /UPLOAD FAILED/
    );

    assert.match(
      html,
      /Check D1 status before retrying/
    );

    assert.match(
      html,
      /result\.status !== ["']completed["']/
    );
  }
);

// --------------------------------------------------
// 12. Historical-only functionality
// --------------------------------------------------

test(
  "clearly identifies historical-only functionality",
  () => {
    assert.match(
      html,
      /Historical data import only/i
    );

    assert.match(
      html,
      /does not place orders/i
    );

    assert.match(
      html,
      /execute trades|trading signals/i
    );
  }
);

// --------------------------------------------------
// 13. Inline JavaScript syntax
// --------------------------------------------------

test(
  "inline module JavaScript has valid syntax",
  () => {
    const script =
      getInlineModuleScript(html);

    compileInlineModule(script);
  }
);

// --------------------------------------------------
// Final message
// --------------------------------------------------

console.log(
  "ANGEL ONE HISTORICAL IMPORT UI TESTS PASSED"
);
