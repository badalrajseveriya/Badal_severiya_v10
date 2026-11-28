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
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
    dump: () => map
  };
}

let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

function manager() {
  return createCustomIndicatorManager();
}

function save(m, name = "Test", source = "test source", options = {}) {
  return m.saveIndicator({ name, source }, options);
}

function analysisMode(m, id) {
  return m.setMode(id, "ANALYSIS_ENABLED");
}

function validated(m, id, adapterId = "test-adapter-v1") {
  return m.setCompatibility(id, {
    validated: true,
    analysisSupported: true,
    adapterId,
    reason: "Test validation"
  });
}

// 1
test("Config: exactly three slots and no execution/order trading", () => {
  assert.equal(CUSTOM_INDICATOR_MANAGER_CONFIG.maximumSlots, 3);
  assert.equal(CUSTOM_INDICATOR_MANAGER_CONFIG.executesImportedCode, false);
  assert.equal(CUSTOM_INDICATOR_MANAGER_CONFIG.orderExecution, false);
});

// 2
test("Initial state: three empty slots", () => {
  const s = manager().snapshot();
  assert.equal(s.maximumSlots, 3);
  assert.equal(s.occupiedSlots, 0);
  assert.equal(s.availableSlots, 3);
  assert.deepEqual(s.slots.map(x => x.slot), [1, 2, 3]);
  assert.ok(s.slots.every(x => !x.occupied));
});

// 3
test("Unsupported indicator can be safely saved", () => {
  const m = manager();
  const r = save(m, "Unknown", "unknown syntax");
  assert.equal(r.saved, true);
  assert.equal(r.status, "SAVED");
  assert.equal(r.slot, 1);
  assert.equal(r.indicator.compatibility.status, "UNVERIFIED");
  assert.equal(r.indicator.analysis.active, false);
});

// 4
test("Slots auto-fill in order", () => {
  const m = manager();
  assert.equal(save(m, "A", "A").slot, 1);
  assert.equal(save(m, "B", "B").slot, 2);
  assert.equal(save(m, "C", "C").slot, 3);
  assert.equal(m.snapshot().availableSlots, 0);
});

// 5
test("Fourth indicator is rejected", () => {
  const m = manager();
  save(m, "A", "A");
  save(m, "B", "B");
  save(m, "C", "C");
  const r = save(m, "D", "D");
  assert.equal(r.saved, false);
  assert.equal(r.status, "NO_SLOT_AVAILABLE");
  assert.equal(m.snapshot().occupiedSlots, 3);
});

// 6
test("Occupied slot replacement requires explicit flag", () => {
  const m = manager();
  save(m, "First", "First", { slot: 1 });
  const blocked = save(m, "Second", "Second", { slot: 1 });
  assert.equal(blocked.saved, false);
  assert.equal(blocked.status, "SLOT_OCCUPIED");

  const replaced = save(m, "Second", "Second", {
    slot: 1,
    replace: true
  });
  assert.equal(replaced.saved, true);
  assert.equal(m.getSlotSnapshot(1).indicator.name, "Second");
});

// 7 — FIXED: manager returns NO_SLOT_AVAILABLE for invalid slot 4
test("Invalid slot selection does not write outside slot bounds", () => {
  const m = manager();
  const r = save(m, "Invalid Slot", "source", { slot: 4 });
  assert.equal(r.saved, false);
  assert.equal(r.status, "NO_SLOT_AVAILABLE");
  assert.equal(m.snapshot().occupiedSlots, 0);
});

// 8
test("Plain text import safely retained without execution", () => {
  const m = manager();
  const r = m.importIndicator("arbitrary indicator source text");
  assert.equal(r.imported, true);
  assert.equal(r.importSafety.sourceExecuted, false);
  assert.equal(r.importSafety.arbitraryCodeExecution, false);
  assert.equal(m.getSlotSnapshot(1).indicator.source,
    "arbitrary indicator source text");
});

// 9
test("JSON indicator import parses correctly", () => {
  const m = manager();
  const input = JSON.stringify({
    name: "JSON Indicator",
    type: "JSON",
    source: { indicator: "custom", parameters: { length: 20 } },
    settings: { length: 20 }
  });
  const r = m.importIndicator(input);
  assert.equal(r.imported, true);
  assert.equal(r.indicator.name, "JSON Indicator");
  assert.equal(r.indicator.type, "JSON");
  assert.ok(r.indicator.source.includes("indicator"));
});

// 10
test("Empty import is rejected", () => {
  const r = manager().importIndicator("   ");
  assert.equal(r.imported, false);
  assert.equal(r.status, "EMPTY_IMPORT");
});

// 11
test("Batch import is rejected safely", () => {
  const r = manager().importIndicator([
    { name: "A", source: "A" },
    { name: "B", source: "B" }
  ]);
  assert.equal(r.imported, false);
  assert.equal(r.status, "BATCH_IMPORT_NOT_SUPPORTED");
});

// 12
test("Editing changes name/source and invalidates compatibility", () => {
  const m = manager();
  const s = save(m, "Original", "original source");
  const r = m.updateIndicator(s.indicator.id, {
    name: "Edited",
    source: "updated source"
  });
  assert.equal(r.updated, true);
  const i = m.getIndicator(s.indicator.id);
  assert.equal(i.name, "Edited");
  assert.equal(i.source, "updated source");
  assert.equal(i.compatibility.validated, false);
  assert.equal(i.analysis.active, false);
});

// 13
test("Unknown update ID returns NOT_FOUND", () => {
  const r = manager().updateIndicator("unknown-id", { name: "Changed" });
  assert.equal(r.updated, false);
  assert.equal(r.status, "NOT_FOUND");
});

// 14
test("Enable and disable state works", () => {
  const m = manager();
  const s = save(m, "Toggle");
  assert.equal(m.setEnabled(s.indicator.id, false).status, "DISABLED");
  assert.equal(m.getIndicator(s.indicator.id).enabled, false);
  assert.equal(m.setEnabled(s.indicator.id, true).status, "ENABLED");
  assert.equal(m.getIndicator(s.indicator.id).enabled, true);
});

// 15
test("Chart-only mode never activates analysis", () => {
  const m = manager();
  const s = save(m, "Chart Only");
  const r = m.setMode(s.indicator.id, "CHART_ONLY");
  assert.equal(r.updated, true);
  assert.equal(r.analysisActive, false);
  assert.equal(m.getIndicator(s.indicator.id).analysis.active, false);
});

// 16
test("Analysis mode alone does not activate indicator", () => {
  const m = manager();
  const s = save(m, "Analysis Request");
  analysisMode(m, s.indicator.id);
  const i = m.getIndicator(s.indicator.id);
  assert.equal(i.analysis.requested, true);
  assert.equal(i.analysis.active, false);
  assert.equal(i.compatibility.validated, false);
});

// 17
test("Validated adapter activates requested analysis mode", () => {
  const m = manager();
  const s = save(m, "Validated");
  analysisMode(m, s.indicator.id);
  const r = validated(m, s.indicator.id);
  assert.equal(r.updated, true);
  assert.equal(r.analysisActive, true);
  const i = m.getIndicator(s.indicator.id);
  assert.equal(i.compatibility.status, "VALIDATED");
  assert.equal(i.analysis.active, true);
});

// 18
test("Incomplete compatibility does not activate analysis", () => {
  const m = manager();
  const s = save(m, "Incomplete");
  analysisMode(m, s.indicator.id);
  const r = m.setCompatibility(s.indicator.id, {
    validated: true,
    analysisSupported: true,
    adapterId: ""
  });
  assert.equal(r.analysisActive, false);
  assert.equal(m.getIndicator(s.indicator.id).analysis.active, false);
});

// 19
test("Disabled mode forces indicator disabled", () => {
  const m = manager();
  const s = save(m, "Disabled");
  const r = m.setMode(s.indicator.id, "DISABLED");
  assert.equal(r.updated, true);
  const i = m.getIndicator(s.indicator.id);
  assert.equal(i.mode, "DISABLED");
  assert.equal(i.enabled, false);
  assert.equal(i.analysis.active, false);
});

// 20
test("Delete frees slot for reuse", () => {
  const m = manager();
  const s = save(m, "Delete Me");
  const r = m.deleteIndicator(s.indicator.id);
  assert.equal(r.deleted, true);
  assert.equal(r.status, "DELETED");
  assert.equal(m.snapshot().occupiedSlots, 0);
  assert.equal(save(m, "Reuse").slot, 1);
});

// 21
test("Export produces reusable JSON", () => {
  const m = manager();
  const s = save(m, "Export Test", "export source");
  const r = m.exportIndicator(s.indicator.id);
  assert.equal(r.exported, true);
  const parsed = JSON.parse(r.json);
  assert.equal(parsed.name, "Export Test");
  assert.equal(parsed.source, "export source");
});

// 22
test("Persistence saves and restores", () => {
  const storage = createMemoryStorage();
  const first = createCustomIndicatorManager({ storage });
  const s = first.saveIndicator({
    name: "Persistent",
    source: "persistent source",
    mode: "CHART_ONLY"
  });
  assert.equal(s.saved, true);
  assert.equal(s.persistence.saved, true);

  const second = createCustomIndicatorManager({ storage });
  const r = second.restore();
  assert.equal(r.restored, true);
  assert.equal(r.count, 1);
  const i = second.getSlotSnapshot(1).indicator;
  assert.equal(i.name, "Persistent");
  assert.equal(i.source, "persistent source");
  assert.equal(i.analysis.active, false);
});

// 23
test("Malformed storage fails safely", () => {
  const storage = createMemoryStorage();
  storage.setItem("BADAL SEVERIYA V12 CUSTOM INDICATORS", "{bad json");
  const m = createCustomIndicatorManager({ storage });
  const r = m.restore();
  assert.equal(r.restored, false);
  assert.equal(r.status, "RESTORE_FAILED");
  assert.equal(m.snapshot().occupiedSlots, 0);
});

// 24
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
        { slot: 1, occupied: true, indicator: duplicate },
        { slot: 2, occupied: true, indicator: duplicate }
      ]
    })
  );
  const m = createCustomIndicatorManager({ storage });
  const r = m.restore();
  assert.equal(r.restored, true);
  assert.equal(r.count, 1);
});

// 25
test("Manager works without storage adapter", () => {
  const r = save(manager(), "No Storage");
  assert.equal(r.saved, true);
  assert.equal(r.persistence.status, "STORAGE_UNAVAILABLE");
});

// 26
test("Clear all empties every slot", () => {
  const m = manager();
  save(m, "A", "A");
  save(m, "B", "B");
  const r = m.clearAll();
  assert.equal(r.cleared, true);
  assert.equal(m.snapshot().occupiedSlots, 0);
  assert.equal(m.snapshot().availableSlots, 3);
});

// 27
test("Invalid mode safely defaults to chart-only", () => {
  const m = manager();
  const r = save(m, "Invalid Mode", "source", { mode: "UNSAFE_MODE" });
  assert.equal(r.saved, true);
  assert.equal(r.indicator.mode, "CHART_ONLY");
  assert.equal(r.indicator.analysis.active, false);
});

// 28
test("Disabled indicator cannot activate analysis", () => {
  const m = manager();
  const s = save(m, "Disabled Analysis");
  analysisMode(m, s.indicator.id);
  m.setEnabled(s.indicator.id, false);
  const r = validated(m, s.indicator.id);
  assert.equal(r.analysisActive, false);
  const i = m.getIndicator(s.indicator.id);
  assert.equal(i.enabled, false);
  assert.equal(i.analysis.active, false);
});

// 29
test("Source edit resets previous adapter validation", () => {
  const m = manager();
  const s = save(m, "Edit Validation", "initial source");
  analysisMode(m, s.indicator.id);
  validated(m, s.indicator.id);
  assert.equal(m.getIndicator(s.indicator.id).analysis.active, true);

  m.updateIndicator(s.indicator.id, { source: "modified source" });
  const i = m.getIndicator(s.indicator.id);
  assert.equal(i.compatibility.validated, false);
  assert.equal(i.analysis.active, false);
});

// 30
test("Unknown lookup and deletion safely handled", () => {
  const m = manager();
  assert.equal(m.getIndicator("unknown"), null);
  assert.equal(m.deleteIndicator("unknown").deleted, false);
});

// 31
test("Returned snapshots are defensive copies", () => {
  const m = manager();
  save(m, "Protected", "protected source");
  const s = m.getSlotSnapshot(1);
  s.indicator.name = "Tampered";
  s.indicator.source = "tampered";
  const actual = m.getSlotSnapshot(1);
  assert.equal(actual.indicator.name, "Protected");
  assert.equal(actual.indicator.source, "protected source");
});

// 32
test("Restored analysis is never activated automatically", () => {
  const storage = createMemoryStorage();
  const first = createCustomIndicatorManager({ storage });
  const s = save(first, "Restore Safety");
  analysisMode(first, s.indicator.id);
  validated(first, s.indicator.id, "adapter-restore");

  const second = createCustomIndicatorManager({ storage });
  second.restore();
  const i = second.getSlotSnapshot(1).indicator;
  assert.equal(i.mode, "ANALYSIS_ENABLED");
  assert.equal(i.enabled, true);
  assert.equal(i.analysis.active, false);
});

console.log("");
console.log(`CUSTOM INDICATOR MANAGER: ${passed}/32 TEST GROUPS PASSED`);
console.log("TEST FILE EXECUTION COMPLETED");
