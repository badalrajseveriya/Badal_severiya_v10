
/* ==========================================================
   BADAL SEVERIYA V12
   CUSTOM INDICATOR MANAGER TESTS
   ========================================================== */

import assert from "node:assert/strict";

import {
  createCustomIndicatorManager,
  CUSTOM_INDICATOR_MANAGER_CONFIG
} from "./custom-indicator-manager.js";

function createMemoryStorage() {
  const map = new Map();

  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },

    setItem(key, value) {
      map.set(key, String(value));
    },

    removeItem(key) {
      map.delete(key);
    },

    dump() {
      return map;
    }
  };
}

function test(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

// ----------------------------------------------------------
// 1. Config contract
// ----------------------------------------------------------

test("Config exposes exactly three slots", () => {
  assert.equal(
    CUSTOM_INDICATOR_MANAGER_CONFIG.maximumSlots,
    3
  );

  assert.equal(
    CUSTOM_INDICATOR_MANAGER_CONFIG.executesImportedCode,
    false
  );

  assert.equal(
    CUSTOM_INDICATOR_MANAGER_CONFIG.orderExecution,
    false
  );
});

// ----------------------------------------------------------
// 2. Manager initial state
// ----------------------------------------------------------

test("Initial manager has three empty slots", () => {
  const manager =
    createCustomIndicatorManager();

  const snapshot = manager.snapshot();

  assert.equal(snapshot.maximumSlots, 3);
  assert.equal(snapshot.occupiedSlots, 0);
  assert.equal(snapshot.availableSlots, 3);

  assert.deepEqual(
    snapshot.slots.map(s => s.slot),
    [1, 2, 3]
  );

  assert.ok(
    snapshot.slots.every(s => !s.occupied)
  );
});

// ----------------------------------------------------------
// 3. Save unsupported indicator
// ----------------------------------------------------------

test("Unsupported indicator can be saved safely", () => {
  const manager =
    createCustomIndicatorManager();

  const result = manager.saveIndicator({
    name: "Unknown Custom Tool",
    source: "some unknown proprietary syntax"
  });

  assert.equal(result.saved, true);
  assert.equal(result.status, "SAVED");
  assert.equal(result.slot, 1);

  assert.equal(
    result.indicator.compatibility.status,
    "UNVERIFIED"
  );

  assert.equal(
    result.indicator.analysis.active,
    false
  );

  assert.equal(
    manager.snapshot().occupiedSlots,
    1
  );
});

// ----------------------------------------------------------
// 4. Auto-fill slots
// ----------------------------------------------------------

test("Indicators auto-fill slots in order", () => {
  const manager =
    createCustomIndicatorManager();

  const a = manager.saveIndicator({
    name: "A",
    source: "A source"
  });

  const b = manager.saveIndicator({
    name: "B",
    source: "B source"
  });

  const c = manager.saveIndicator({
    name: "C",
    source: "C source"
  });

  assert.equal(a.slot, 1);
  assert.equal(b.slot, 2);
  assert.equal(c.slot, 3);

  assert.equal(
    manager.snapshot().availableSlots,
    0
  );
});

// ----------------------------------------------------------
// 5. Maximum slot protection
// ----------------------------------------------------------

test("Fourth indicator is rejected", () => {
  const manager =
    createCustomIndicatorManager();

  manager.saveIndicator({
    name: "A",
    source: "A"
  });

  manager.saveIndicator({
    name: "B",
    source: "B"
  });

  manager.saveIndicator({
    name: "C",
    source: "C"
  });

  const result = manager.saveIndicator({
    name: "D",
    source: "D"
  });

  assert.equal(result.saved, false);

  assert.equal(
    result.status,
    "NO_SLOT_AVAILABLE"
  );

  assert.equal(
    manager.snapshot().occupiedSlots,
    3
  );
});

// ----------------------------------------------------------
// 6. Slot replacement protection
// ----------------------------------------------------------

test("Occupied slot replacement requires explicit flag", () => {
  const manager =
    createCustomIndicatorManager();

  manager.saveIndicator(
    { name: "First", source: "First source" },
    { slot: 1 }
  );

  const blocked = manager.saveIndicator(
    { name: "Second", source: "Second source" },
    { slot: 1 }
  );

  assert.equal(blocked.saved, false);
  assert.equal(blocked.status, "SLOT_OCCUPIED");

  const replaced = manager.saveIndicator(
    { name: "Second", source: "Second source" },
    { slot: 1, replace: true }
  );

  assert.equal(replaced.saved, true);
  assert.equal(replaced.slot, 1);

  assert.equal(
    manager.getSlotSnapshot(1).indicator.name,
    "Second"
  );
});

// ----------------------------------------------------------
// 7. Invalid slot
// ----------------------------------------------------------

test("Invalid slot number is rejected", () => {
  const manager =
    createCustomIndicatorManager();

  const result = manager.saveIndicator(
    { name: "Test", source: "Test" },
    { slot: 4 }
  );

  assert.equal(result.saved, false);
  assert.equal(result.status, "INVALID_DEFINITION");
});

// ----------------------------------------------------------
// 8. Import plain text safely
// ----------------------------------------------------------

test("Plain text import is safe and retained", () => {
  const manager =
    createCustomIndicatorManager();

  const result = manager.importIndicator(
    "arbitrary indicator source text"
  );

  assert.equal(result.imported, true);
  assert.equal(result.importSafety.sourceExecuted, false);
  assert.equal(result.importSafety.arbitraryCodeExecution, false);

  assert.equal(
    manager.getSlotSnapshot(1).indicator.source,
    "arbitrary indicator source text"
  );
});

// ----------------------------------------------------------
// 9. JSON import
// ----------------------------------------------------------

test("JSON indicator import is parsed", () => {
  const manager =
    createCustomIndicatorManager();

  const json = JSON.stringify({
    name: "JSON Indicator",
    type: "JSON",
    source: {
      indicator: "custom",
      parameters: {
        length: 20
      }
    },
    settings: {
      length: 20
    }
  });

  const result = manager.importIndicator(json);

  assert.equal(result.imported, true);
  assert.equal(result.indicator.name, "JSON Indicator");
  assert.equal(result.indicator.type, "JSON");
  assert.ok(
    result.indicator.source.includes("indicator")
  );
});

// ----------------------------------------------------------
// 10. Empty import
// ----------------------------------------------------------

test("Empty import rejected", () => {
  const manager =
    createCustomIndicatorManager();

  const result = manager.importIndicator("   ");

  assert.equal(result.imported, false);
  assert.equal(result.status, "EMPTY_IMPORT");
});

// ----------------------------------------------------------
// 11. Batch import is not allowed
// ----------------------------------------------------------

test("Batch import rejected safely", () => {
  const manager =
    createCustomIndicatorManager();

  const result = manager.importIndicator([
    { name: "A", source: "A" },
    { name: "B", source: "B" }
  ]);

  assert.equal(result.imported, false);

  assert.equal(
    result.status,
    "BATCH_IMPORT_NOT_SUPPORTED"
  );
});

// ----------------------------------------------------------
// 12. Edit indicator
// ----------------------------------------------------------

test("Indicator edit changes source and name", () => {
  const manager =
    createCustomIndicatorManager();

  const saved = manager.saveIndicator({
    name: "Original",
    source: "original source"
  });

  const result = manager.updateIndicator(
    saved.indicator.id,
    {
      name: "Edited",
      source: "updated source"
    }
  );

  assert.equal(result.updated, true);

  const updated = manager.getIndicator(
    saved.indicator.id
  );

  assert.equal(updated.name, "Edited");
  assert.equal(updated.source, "updated source");
  assert.equal(updated.compatibility.validated, false);
  assert.equal(updated.analysis.active, false);
});

// ----------------------------------------------------------
// 13. Missing indicator update
// ----------------------------------------------------------

test("Updating unknown ID returns NOT_FOUND", () => {
  const manager =
    createCustomIndicatorManager();

  const result = manager.updateIndicator(
    "unknown-id",
    { name: "Changed" }
  );

  assert.equal(result.updated, false);
  assert.equal(result.status, "NOT_FOUND");
});

// ----------------------------------------------------------
// 14. Enable and disable
// ----------------------------------------------------------

test("Enable and disable state works", () => {
  const manager =
    createCustomIndicatorManager();

  const saved = manager.saveIndicator({
    name: "Toggle Test",
    source: "source"
  });

  const disabled = manager.setEnabled(
    saved.indicator.id,
    false
  );

  assert.equal(disabled.updated, true);
  assert.equal(disabled.status, "DISABLED");

  assert.equal(
    manager.getIndicator(saved.indicator.id).enabled,
    false
  );

  const enabled = manager.setEnabled(
    saved.indicator.id,
    true
  );

  assert.equal(enabled.updated, true);
  assert.equal(enabled.status, "ENABLED");

  assert.equal(
    manager.getIndicator(saved.indicator.id).enabled,
    true
  );
});

// ----------------------------------------------------------
// 15. Chart-only mode
// ----------------------------------------------------------

test("Chart-only mode never activates analysis", () => {
  const manager =
    createCustomIndicatorManager();

  const saved = manager.saveIndicator({
    name: "Chart Mode",
    source: "source"
  });

  const result = manager.setMode(
    saved.indicator.id,
    "CHART_ONLY"
  );

  assert.equal(result.updated, true);
  assert.equal(result.analysisActive, false);

  const indicator = manager.getIndicator(
    saved.indicator.id
  );

  assert.equal(indicator.mode, "CHART_ONLY");
  assert.equal(indicator.analysis.active, false);
});

// ----------------------------------------------------------
// 16. Analysis mode requires adapter validation
// ----------------------------------------------------------

test("Analysis mode alone does not activate indicator", () => {
  const manager =
    createCustomIndicatorManager();

  const saved = manager.saveIndicator({
    name: "Analysis Request",
    source: "source"
  });

  manager.setMode(
    saved.indicator.id,
    "ANALYSIS_ENABLED"
  );

  const indicator = manager.getIndicator(
    saved.indicator.id
  );

  assert.equal(
    indicator.analysis.requested,
    true
  );

  assert.equal(
    indicator.analysis.active,
    false
  );

  assert.equal(
    indicator.compatibility.validated,
    false
  );
});

// ----------------------------------------------------------
// 17. Compatibility validation
// ----------------------------------------------------------

test("Validated adapter activates requested analysis mode", () => {
  const manager =
    createCustomIndicatorManager();

  const saved = manager.saveIndicator({
    name: "Validated Indicator",
    source: "source"
  });

  manager.setMode(
    saved.indicator.id,
    "ANALYSIS_ENABLED"
  );

  const result = manager.setCompatibility(
    saved.indicator.id,
    {
      validated: true,
      analysisSupported: true,
      adapterId: "test-adapter-v1",
      reason: "Adapter validation test."
    }
  );

  assert.equal(result.updated, true);
  assert.equal(result.analysisActive, true);

  const indicator = manager.getIndicator(
    saved.indicator.id
  );

  assert.equal(
    indicator.compatibility.status,
    "VALIDATED"
  );

  assert.equal(
    indicator.analysis.active,
    true
  );
});

// ----------------------------------------------------------
// 18. Compatibility must be complete
// ----------------------------------------------------------

test("Incomplete compatibility does not activate analysis", () => {
  const manager =
    createCustomIndicatorManager();

  const saved = manager.saveIndicator({
    name: "Incomplete Validation",
    source: "source"
  });

  manager.setMode(
    saved.indicator.id,
    "ANALYSIS_ENABLED"
  );

  const result = manager.setCompatibility(
    saved.indicator.id,
    {
      validated: true,
      analysisSupported: true,
      adapterId: ""
    }
  );

  assert.equal(result.analysisActive, false);

  assert.equal(
    manager.getIndicator(saved.indicator.id).analysis.active,
    false
  );
});

// ----------------------------------------------------------
// 19. Disabled mode
// ----------------------------------------------------------

test("Disabled mode forces indicator disabled", () => {
  const manager =
    createCustomIndicatorManager();

  const saved = manager.saveIndicator({
    name: "Disabled Mode",
    source: "source"
  });

  const result = manager.setMode(
    saved.indicator.id,
    "DISABLED"
  );

  assert.equal(result.updated, true);

  const indicator = manager.getIndicator(
    saved.indicator.id
  );

  assert.equal(indicator.mode, "DISABLED");
  assert.equal(indicator.enabled, false);
  assert.equal(indicator.analysis.active, false);
});

// ----------------------------------------------------------
// 20. Delete and slot reuse
// ----------------------------------------------------------

test("Delete indicator frees its slot", () => {
  const manager =
    createCustomIndicatorManager();

  const saved = manager.saveIndicator({
    name: "Delete Me",
    source: "source"
  });

  const deleted = manager.deleteIndicator(
    saved.indicator.id
  );

  assert.equal(deleted.deleted, true);
  assert.equal(deleted.status, "DELETED");
  assert.equal(manager.snapshot().occupiedSlots, 0);

  const next = manager.saveIndicator({
    name: "Slot Reuse",
    source: "new source"
  });

  assert.equal(next.slot, 1);
});

// ----------------------------------------------------------
// 21. Export
// ----------------------------------------------------------

test("Export produces reusable JSON", () => {
  const manager =
    createCustomIndicatorManager();

  const saved = manager.saveIndicator({
    name: "Export Test",
    source: "export source",
    type: "TEXT"
  });

  const exported = manager.exportIndicator(
    saved.indicator.id
  );

  assert.equal(exported.exported, true);

  const parsed = JSON.parse(exported.json);

  assert.equal(parsed.name, "Export Test");
  assert.equal(parsed.source, "export source");
  assert.equal(parsed.type, "TEXT");
});

// ----------------------------------------------------------
// 22. Persistence
// ----------------------------------------------------------

test("Persistence saves and restores indicators", () => {
  const storage = createMemoryStorage();

  const first =
    createCustomIndicatorManager({
      storage
    });

  const saved = first.saveIndicator({
    name: "Persistent Indicator",
    source: "persistent source",
    mode: "CHART_ONLY"
  });

  assert.equal(saved.saved, true);
  assert.equal(saved.persistence.saved, true);

  const second =
    createCustomIndicatorManager({
      storage
    });

  const restored = second.restore();

  assert.equal(restored.restored, true);
  assert.equal(restored.count, 1);

  const indicator =
    second.getSlotSnapshot(1).indicator;

  assert.equal(
    indicator.name,
    "Persistent Indicator"
  );

  assert.equal(
    indicator.source,
    "persistent source"
  );

  assert.equal(
    indicator.analysis.active,
    false
  );
});

// ----------------------------------------------------------
// 23. Restore malformed storage
// ----------------------------------------------------------

test("Malformed storage fails safely", () => {
  const storage = createMemoryStorage();

  storage.setItem(
    "BADAL SEVERIYA V12 CUSTOM INDICATORS",
    "{bad json"
  );

  const manager =
    createCustomIndicatorManager({
      storage
    });

  const result = manager.restore();

  assert.equal(result.restored, false);
  assert.equal(result.status, "RESTORE_FAILED");

  assert.equal(
    manager.snapshot().occupiedSlots,
    0
  );
});

// ----------------------------------------------------------
// 24. Duplicate stored IDs are ignored
// ----------------------------------------------------------

test("Duplicate IDs in storage are ignored", () => {
  const storage = createMemoryStorage();

  const duplicate = {
    id: "duplicate-id",
    name: "Duplicate",
    source: "duplicate source",
    mode: "CHART_ONLY",
    enabled: true
  };

  storage.setItem(
    "BADAL SEVERIYA V12 CUSTOM INDICATORS",
    JSON.stringify({
      version: 1,
      slots: [
        {
          slot: 1,
          occupied: true,
          indicator: duplicate
        },
        {
          slot: 2,
          occupied: true,
          indicator: duplicate
        }
      ]
    })
  );

  const manager =
    createCustomIndicatorManager({
      storage
    });

  const result = manager.restore();

  assert.equal(result.restored, true);
  assert.equal(result.count, 1);
});

// ----------------------------------------------------------
// 25. No storage adapter
// ----------------------------------------------------------

test("Manager works without storage adapter", () => {
  const manager =
    createCustomIndicatorManager();

  const saved = manager.saveIndicator({
    name: "No Storage",
    source: "source"
  });

  assert.equal(saved.saved, true);

  assert.equal(
    saved.persistence.status,
    "STORAGE_UNAVAILABLE"
  );

  assert.equal(
    manager.snapshot().occupiedSlots,
    1
  );
});

// ----------------------------------------------------------
// 26. Clear all
// ----------------------------------------------------------

test("Clear all empties all slots", () => {
  const manager =
    createCustomIndicatorManager();

  manager.saveIndicator({
    name: "A",
    source: "A"
  });

  manager.saveIndicator({
    name: "B",
    source: "B"
  });

  const result = manager.clearAll();

  assert.equal(result.cleared, true);
  assert.equal(manager.snapshot().occupiedSlots, 0);
  assert.equal(manager.snapshot().availableSlots, 3);
});

// ----------------------------------------------------------
// 27. Invalid mode falls back safely
// ----------------------------------------------------------

test("Invalid mode falls back to chart-only", () => {
  const manager =
    createCustomIndicatorManager();

  const saved = manager.saveIndicator(
    {
      name: "Invalid Mode",
      source: "source"
    },
    {
      mode: "UNSAFE_MODE"
    }
  );

  assert.equal(saved.saved, true);

  assert.equal(
    saved.indicator.mode,
    "CHART_ONLY"
  );

  assert.equal(
    saved.indicator.analysis.active,
    false
  );
});

// ----------------------------------------------------------
// 28. Analysis mode + disable blocks activation
// ----------------------------------------------------------

test("Disabled indicator cannot activate analysis", () => {
  const manager =
    createCustomIndicatorManager();

  const saved = manager.saveIndicator({
    name: "Disable Analysis",
    source: "source"
  });

  manager.setMode(
    saved.indicator.id,
    "ANALYSIS_ENABLED"
  );

  manager.setEnabled(
    saved.indicator.id,
    false
  );

  const result = manager.setCompatibility(
    saved.indicator.id,
    {
      validated: true,
      analysisSupported: true,
      adapterId: "adapter-1"
    }
  );

  assert.equal(result.analysisActive, false);

  const indicator = manager.getIndicator(
    saved.indicator.id
  );

  assert.equal(indicator.enabled, false);
  assert.equal(indicator.analysis.active, false);
});

// ----------------------------------------------------------
// 29. Source edit resets compatibility
// ----------------------------------------------------------

test("Editing source resets previous adapter validation", () => {
  const manager =
    createCustomIndicatorManager();

  const saved = manager.saveIndicator({
    name: "Edit Validation",
    source: "initial source"
  });

  manager.setMode(
    saved.indicator.id,
    "ANALYSIS_ENABLED"
  );

  manager.setCompatibility(
    saved.indicator.id,
    {
      validated: true,
      analysisSupported: true,
      adapterId: "adapter-1"
    }
  );

  assert.equal(
    manager.getIndicator(saved.indicator.id).analysis.active,
    true
  );

  manager.updateIndicator(
    saved.indicator.id,
    {
      source: "modified source"
    }
  );

  const updated = manager.getIndicator(
    saved.indicator.id
  );

  assert.equal(updated.compatibility.validated, false);
  assert.equal(updated.analysis.active, false);
});

// ----------------------------------------------------------
// 30. Unknown indicator lookup
// ----------------------------------------------------------

test("Unknown indicator ID returns null", () => {
  const manager =
    createCustomIndicatorManager();

  assert.equal(
    manager.getIndicator("unknown"),
    null
  );

  assert.equal(
    manager.deleteIndicator("unknown").deleted,
    false
  );
});

// ----------------------------------------------------------
// 31. Slot snapshots are defensive copies
// ----------------------------------------------------------

test("Returned snapshots cannot mutate manager state", () => {
  const manager =
    createCustomIndicatorManager();

  manager.saveIndicator({
    name: "Protected",
    source: "protected source"
  });

  const snapshot = manager.getSlotSnapshot(1);

  snapshot.indicator.name = "Tampered";
  snapshot.indicator.source = "tampered";

  const actual = manager.getSlotSnapshot(1);

  assert.equal(actual.indicator.name, "Protected");
  assert.equal(actual.indicator.source, "protected source");
});

// ----------------------------------------------------------
// 32. Persistence restore safety
// ----------------------------------------------------------

test("Restored analysis is never activated automatically", () => {
  const storage = createMemoryStorage();

  const manager =
    createCustomIndicatorManager({
      storage
    });

  const saved = manager.saveIndicator({
    name: "Restore Safety",
    source: "source"
  });

  manager.setMode(
    saved.indicator.id,
    "ANALYSIS_ENABLED"
  );

  manager.setCompatibility(
    saved.indicator.id,
    {
      validated: true,
      analysisSupported: true,
      adapterId: "adapter-restore"
    }
  );

  const second =
    createCustomIndicatorManager({
      storage
    });

  second.restore();

  const restored =
    second.getSlotSnapshot(1).indicator;

  assert.equal(restored.mode, "ANALYSIS_ENABLED");
  assert.equal(restored.enabled, true);
  assert.equal(restored.analysis.active, false);
});

// ----------------------------------------------------------
// Final
// ----------------------------------------------------------

console.log("");
console.log(
  "CUSTOM INDICATOR MANAGER TESTS COMPLETED"
);
console.log(
  "32 test groups executed."
);
