
/* ==========================================================
   BADAL SEVERIYA V12
   CUSTOM INDICATOR MANAGER
   3 Slots | Safe Import | Save | Edit | Enable | Export

   IMPORTANT:
   - Imported indicator source is NEVER executed here.
   - Unsupported indicators may still be saved.
   - Analysis inclusion requires a validated adapter.
   - No trading/order execution.
   ========================================================== */

const VERSION = "12.0";
const MODULE = "CUSTOM_INDICATOR_MANAGER";

const MAX_SLOTS = 3;
const STORAGE_VERSION = 1;

const VALID_MODES = [
  "CHART_ONLY",
  "ANALYSIS_ENABLED",
  "DISABLED"
];

const VALID_TYPES = [
  "PINE_SCRIPT",
  "JSON",
  "FORMULA",
  "SOURCE_CODE",
  "TEXT",
  "UNKNOWN"
];

const DEFAULT_STORAGE_KEY =
  "BADAL_SEVERIYA_V12_CUSTOM_INDICATORS";

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeString(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  try {
    return String(value);
  } catch {
    return fallback;
  }
}

function createId() {
  return (
    "indicator_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 10)
  );
}

function detectType(source, declaredType = null) {
  const type = safeString(declaredType)
    .trim()
    .toUpperCase();

  if (VALID_TYPES.includes(type)) {
    return type;
  }

  const text = safeString(source).trim();

  if (!text) {
    return "UNKNOWN";
  }

  if (
    text.startsWith("{") ||
    text.startsWith("[")
  ) {
    try {
      JSON.parse(text);
      return "JSON";
    } catch {
      // Do not reject non-JSON source.
    }
  }

  if (
    /(^|\n)\s*\/\/@version\s*=/i.test(text) ||
    /\b(?:indicator|strategy)\s*\(/i.test(text)
  ) {
    return "PINE_SCRIPT";
  }

  if (
    /\b(?:ema|sma|rsi|macd|atr|stdev|highest|lowest)\s*\(/i.test(text)
  ) {
    return "FORMULA";
  }

  if (
    /\b(?:function|const|let|var|import|export|class)\b/i.test(text)
  ) {
    return "SOURCE_CODE";
  }

  return "TEXT";
}

function normalizeMode(mode) {
  const normalized = safeString(mode)
    .trim()
    .toUpperCase();

  return VALID_MODES.includes(normalized)
    ? normalized
    : "CHART_ONLY";
}

function normalizeDefinition(input) {
  if (
    typeof input === "string"
  ) {
    return {
      name: "Imported Indicator",
      source: input,
      type: detectType(input),
      format: "RAW_TEXT",
      metadata: {}
    };
  }

  if (!isObject(input)) {
    throw new Error(
      "Indicator definition must be text or an object."
    );
  }

  const name = safeString(
    input.name ??
    input.title ??
    input.indicatorName,
    "Imported Indicator"
  ).trim();

  const sourceValue =
    input.source ??
    input.script ??
    input.code ??
    input.formula ??
    input.content ??
    input.definition ??
    "";

  let source;

  if (typeof sourceValue === "string") {
    source = sourceValue;
  } else {
    try {
      source = JSON.stringify(
        sourceValue,
        null,
        2
      );
    } catch {
      source = safeString(sourceValue);
    }
  }

  const type = detectType(
    source,
    input.type ?? input.format
  );

  return {
    name: name || "Imported Indicator",
    source,
    type,
    format: safeString(
      input.format,
      type
    ).trim() || type,

    metadata: isObject(input.metadata)
      ? { ...input.metadata }
      : {},

    description: safeString(
      input.description
    ),

    author: safeString(
      input.author
    ),

    version: safeString(
      input.version
    ),

    timeframe: safeString(
      input.timeframe
    ),

    settings: isObject(input.settings)
      ? { ...input.settings }
      : {}
  };
}

function clone(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}

function makeSlot(slotNumber) {
  return {
    slot: slotNumber,
    occupied: false,
    indicator: null
  };
}

function makeIndicator(
  definition,
  options = {}
) {
  const normalized =
    normalizeDefinition(definition);

  const now = Date.now();

  return {
    id: safeString(options.id) || createId(),

    name: normalized.name,

    type: normalized.type,

    format: normalized.format,

    source: normalized.source,

    description: normalized.description || "",

    author: normalized.author || "",

    version: normalized.version || "",

    timeframe: normalized.timeframe || "",

    metadata: normalized.metadata,

    settings: normalized.settings,

    mode: normalizeMode(
      options.mode ??
      definition?.mode ??
      "CHART_ONLY"
    ),

    enabled:
      options.enabled === undefined
        ? true
        : Boolean(options.enabled),

    compatibility: {
      status: "UNVERIFIED",
      adapterId: null,
      validated: false,
      analysisSupported: false,
      reason:
        "Compatibility adapter validation has not been completed.",
      checkedAt: null
    },

    analysis: {
      requested:
        normalizeMode(
          options.mode ??
          definition?.mode
        ) === "ANALYSIS_ENABLED",

      active: false,

      reason:
        "Indicator must pass compatibility and data validation before analysis inclusion."
    },

    createdAt:
      Number(options.createdAt) || now,

    updatedAt: now
  };
}

function sanitizeStoredIndicator(input) {
  if (!isObject(input)) {
    return null;
  }

  try {
    const normalized =
      normalizeDefinition(input);

    const id = safeString(input.id).trim();

    if (!id) {
      return null;
    }

    const indicator = makeIndicator(
      normalized,
      {
        id,
        mode: input.mode,
        enabled: input.enabled,
        createdAt: input.createdAt
      }
    );

    indicator.updatedAt =
      Number(input.updatedAt) ||
      indicator.updatedAt;

    if (isObject(input.compatibility)) {
      indicator.compatibility = {
        status: safeString(
          input.compatibility.status,
          "UNVERIFIED"
        ),

        adapterId:
          input.compatibility.adapterId ?? null,

        validated:
          input.compatibility.validated === true,

        analysisSupported:
          input.compatibility.analysisSupported === true,

        reason: safeString(
          input.compatibility.reason
        ),

        checkedAt:
          Number(input.compatibility.checkedAt) ||
          null
      };
    }

    if (isObject(input.analysis)) {
      indicator.analysis = {
        requested:
          input.analysis.requested === true,

        active: false,

        reason: safeString(
          input.analysis.reason,
          "Analysis activation requires runtime validation."
        )
      };
    }

    return indicator;
  } catch {
    return null;
  }
}

export function createCustomIndicatorManager(
  options = {}
) {
  const storage =
    isObject(options.storage)
      ? options.storage
      : null;

  const storageKey =
    safeString(
      options.storageKey,
      DEFAULT_STORAGE_KEY
    );

  let slots = [
    makeSlot(1),
    makeSlot(2),
    makeSlot(3)
  ];

  let lastError = null;
  let persistenceAvailable = Boolean(
    storage &&
    typeof storage.getItem === "function" &&
    typeof storage.setItem === "function"
  );

  function getSlot(slotNumber) {
    const slot = Number(slotNumber);

    if (
      !Number.isInteger(slot) ||
      slot < 1 ||
      slot > MAX_SLOTS
    ) {
      return null;
    }

    return slots[slot - 1];
  }

  function findIndicator(id) {
    const normalizedId = safeString(id);

    for (const slot of slots) {
      if (
        slot.occupied &&
        slot.indicator?.id === normalizedId
      ) {
        return slot;
      }
    }

    return null;
  }

  function firstEmptySlot() {
    return slots.find(
      slot => !slot.occupied
    ) || null;
  }

  function persist() {
    if (!persistenceAvailable) {
      return {
        saved: false,
        status: "STORAGE_UNAVAILABLE",
        reason:
          "No compatible storage adapter supplied."
      };
    }

    try {
      const payload = {
        version: STORAGE_VERSION,
        module: MODULE,
        savedAt: Date.now(),

        slots: slots.map(slot => ({
          slot: slot.slot,
          occupied: slot.occupied,
          indicator: slot.indicator
        }))
      };

      storage.setItem(
        storageKey,
        JSON.stringify(payload)
      );

      lastError = null;

      return {
        saved: true,
        status: "SAVED",
        storageKey
      };
    } catch (error) {
      lastError = safeString(
        error?.message,
        "Storage write failed."
      );

      return {
        saved: false,
        status: "SAVE_FAILED",
        reason: lastError
      };
    }
  }

  function restore() {
    if (
      !storage ||
      typeof storage.getItem !== "function"
    ) {
      persistenceAvailable = false;

      return {
        restored: false,
        status: "STORAGE_UNAVAILABLE",
        count: 0
      };
    }

    persistenceAvailable =
      typeof storage.setItem === "function";

    try {
      const raw = storage.getItem(storageKey);

      if (!raw) {
        return {
          restored: false,
          status: "EMPTY_STORAGE",
          count: 0
        };
      }

      const payload = JSON.parse(raw);

      if (
        !isObject(payload) ||
        !Array.isArray(payload.slots)
      ) {
        throw new Error(
          "Stored indicator data has an invalid structure."
        );
      }

      const nextSlots = [
        makeSlot(1),
        makeSlot(2),
        makeSlot(3)
      ];

      const seenIds = new Set();

      for (const storedSlot of payload.slots) {
        const slotNumber = Number(
          storedSlot?.slot
        );

        if (
          !Number.isInteger(slotNumber) ||
          slotNumber < 1 ||
          slotNumber > MAX_SLOTS ||
          !storedSlot?.occupied
        ) {
          continue;
        }

        const indicator =
          sanitizeStoredIndicator(
            storedSlot.indicator
          );

        if (
          !indicator ||
          seenIds.has(indicator.id)
        ) {
          continue;
        }

        seenIds.add(indicator.id);

        nextSlots[slotNumber - 1] = {
          slot: slotNumber,
          occupied: true,
          indicator
        };
      }

      slots = nextSlots;

      lastError = null;

      return {
        restored: true,
        status: "RESTORED",
        count: slots.filter(
          s => s.occupied
        ).length
      };
    } catch (error) {
      lastError = safeString(
        error?.message,
        "Storage restore failed."
      );

      return {
        restored: false,
        status: "RESTORE_FAILED",
        count: 0,
        reason: lastError
      };
    }
  }

  function saveIndicator(
    definition,
    saveOptions = {}
  ) {
    try {
      const targetSlot =
        saveOptions.slot === undefined ||
        saveOptions.slot === null
          ? firstEmptySlot()
          : getSlot(saveOptions.slot);

      if (!targetSlot) {
        return {
          saved: false,
          status: "NO_SLOT_AVAILABLE",
          reason:
            "All three indicator slots are occupied."
        };
      }

      if (
        saveOptions.slot !== undefined &&
        targetSlot.occupied &&
        saveOptions.replace !== true
      ) {
        return {
          saved: false,
          status: "SLOT_OCCUPIED",
          reason:
            "The selected slot is occupied. Replacement must be explicitly enabled."
        };
      }

      const indicator = makeIndicator(
        definition,
        {
          mode: saveOptions.mode,
          enabled: saveOptions.enabled
        }
      );

      targetSlot.occupied = true;
      targetSlot.indicator = indicator;

      const saved = persist();

      return {
        saved: true,
        status: "SAVED",
        slot: targetSlot.slot,
        indicator: clone(indicator),
        persistence: saved
      };
    } catch (error) {
      return {
        saved: false,
        status: "INVALID_DEFINITION",
        reason: safeString(
          error?.message,
          "Indicator could not be saved."
        )
      };
    }
  }

  function importIndicator(
    imported,
    importOptions = {}
  ) {
    let definition = imported;

    if (typeof imported === "string") {
      const text = imported.trim();

      if (!text) {
        return {
          imported: false,
          status: "EMPTY_IMPORT",
          reason:
            "Import content is empty."
        };
      }

      try {
        const parsed = JSON.parse(text);

        if (
          isObject(parsed) ||
          Array.isArray(parsed)
        ) {
          definition = parsed;
        } else {
          definition = text;
        }
      } catch {
        definition = text;
      }
    }

    if (Array.isArray(definition)) {
      return {
        imported: false,
        status: "BATCH_IMPORT_NOT_SUPPORTED",
        reason:
          "Import one indicator at a time. Batch import is not enabled."
      };
    }

    const result = saveIndicator(
      definition,
      importOptions
    );

    return {
      imported: result.saved,
      ...result,
      importSafety: {
        sourceExecuted: false,
        arbitraryCodeExecution: false,
        status: "SAFE_TEXT_IMPORT"
      }
    };
  }

  function updateIndicator(
    id,
    changes = {}
  ) {
    const slot = findIndicator(id);

    if (!slot) {
      return {
        updated: false,
        status: "NOT_FOUND"
      };
    }

    if (!isObject(changes)) {
      return {
        updated: false,
        status: "INVALID_CHANGES"
      };
    }

    const current = slot.indicator;

    const definition = {
      name: changes.name ?? current.name,

      source:
        changes.source ??
        changes.script ??
        changes.code ??
        changes.formula ??
        current.source,

      type: changes.type ?? current.type,

      format:
        changes.format ??
        current.format,

      description:
        changes.description ??
        current.description,

      author:
        changes.author ??
        current.author,

      version:
        changes.version ??
        current.version,

      timeframe:
        changes.timeframe ??
        current.timeframe,

      metadata:
        changes.metadata ??
        current.metadata,

      settings:
        changes.settings ??
        current.settings
    };

    try {
      const normalized =
        normalizeDefinition(definition);

      current.name = normalized.name;
      current.source = normalized.source;
      current.type = normalized.type;
      current.format = normalized.format;
      current.description = normalized.description;
      current.author = normalized.author;
      current.version = normalized.version;
      current.timeframe = normalized.timeframe;
      current.metadata = normalized.metadata;
      current.settings = normalized.settings;

      if (changes.mode !== undefined) {
        current.mode = normalizeMode(
          changes.mode
        );
      }

      if (changes.enabled !== undefined) {
        current.enabled =
          Boolean(changes.enabled);
      }

      // Source/settings changes invalidate
      // prior compatibility validation.
      current.compatibility = {
        status: "UNVERIFIED",
        adapterId: null,
        validated: false,
        analysisSupported: false,
        reason:
          "Indicator content changed; compatibility must be revalidated.",
        checkedAt: null
      };

      current.analysis = {
        requested:
          current.mode === "ANALYSIS_ENABLED",

        active: false,

        reason:
          "Updated indicator requires fresh adapter validation."
      };

      current.updatedAt = Date.now();

      const persistence = persist();

      return {
        updated: true,
        status: "UPDATED",
        slot: slot.slot,
        indicator: clone(current),
        persistence
      };
    } catch (error) {
      return {
        updated: false,
        status: "UPDATE_FAILED",
        reason: safeString(error?.message)
      };
    }
  }

  function setEnabled(id, enabled) {
    const slot = findIndicator(id);

    if (!slot) {
      return {
        updated: false,
        status: "NOT_FOUND"
      };
    }

    slot.indicator.enabled =
      Boolean(enabled);

    if (!slot.indicator.enabled) {
      slot.indicator.analysis.active = false;
      slot.indicator.analysis.reason =
        "Indicator is disabled.";
    }

    slot.indicator.updatedAt = Date.now();

    return {
      updated: true,
      status: slot.indicator.enabled
        ? "ENABLED"
        : "DISABLED",
      slot: slot.slot,
      persistence: persist()
    };
  }

  function setMode(id, mode) {
    const slot = findIndicator(id);

    if (!slot) {
      return {
        updated: false,
        status: "NOT_FOUND"
      };
    }

    const normalizedMode =
      normalizeMode(mode);

    const indicator = slot.indicator;

    indicator.mode = normalizedMode;

    indicator.analysis.requested =
      normalizedMode === "ANALYSIS_ENABLED";

    // Never activate analysis merely
    // because the mode was selected.
    indicator.analysis.active = false;

    if (normalizedMode === "DISABLED") {
      indicator.enabled = false;

      indicator.analysis.reason =
        "Indicator is disabled.";
    } else if (
      normalizedMode === "CHART_ONLY"
    ) {
      indicator.analysis.reason =
        "Chart-only mode. Not included in master analysis.";
    } else {
      indicator.analysis.reason =
        "Analysis requested. Awaiting compatibility, adapter and data validation.";
    }

    indicator.updatedAt = Date.now();

    return {
      updated: true,
      status: "MODE_UPDATED",
      slot: slot.slot,
      mode: normalizedMode,
      analysisActive: false,
      persistence: persist()
    };
  }

  function setCompatibility(
    id,
    compatibility = {}
  ) {
    const slot = findIndicator(id);

    if (!slot) {
      return {
        updated: false,
        status: "NOT_FOUND"
      };
    }

    const indicator = slot.indicator;

    const validated =
      compatibility.validated === true &&
      compatibility.analysisSupported === true &&
      Boolean(compatibility.adapterId);

    indicator.compatibility = {
      status: validated
        ? "VALIDATED"
        : safeString(
            compatibility.status,
            "UNVERIFIED"
          ),

      adapterId:
        compatibility.adapterId ?? null,

      validated,

      analysisSupported:
        compatibility.analysisSupported === true,

      reason: safeString(
        compatibility.reason,
        validated
          ? "Adapter validation supplied."
          : "Adapter validation incomplete."
      ),

      checkedAt: Date.now()
    };

    const canActivate =
      indicator.enabled &&
      indicator.mode === "ANALYSIS_ENABLED" &&
      validated;

    indicator.analysis.active =
      canActivate;

    indicator.analysis.requested =
      indicator.mode === "ANALYSIS_ENABLED";

    indicator.analysis.reason =
      canActivate
        ? "Adapter compatibility validated. Runtime data validation is still required before each analysis."
        : "Indicator is not active in master analysis.";

    indicator.updatedAt = Date.now();

    const persistence = persist();

    return {
      updated: true,
      status: validated
        ? "COMPATIBILITY_VALIDATED"
        : "COMPATIBILITY_UNVERIFIED",
      slot: slot.slot,
      analysisActive: canActivate,
      persistence
    };
  }

  function deleteIndicator(id) {
    const slot = findIndicator(id);

    if (!slot) {
      return {
        deleted: false,
        status: "NOT_FOUND"
      };
    }

    const slotNumber = slot.slot;

    slots[slotNumber - 1] =
      makeSlot(slotNumber);

    return {
      deleted: true,
      status: "DELETED",
      slot: slotNumber,
      persistence: persist()
    };
  }

  function getIndicator(id) {
    const slot = findIndicator(id);

    return slot
      ? clone(slot.indicator)
      : null;
  }

  function getSlotSnapshot(slotNumber) {
    const slot = getSlot(slotNumber);

    if (!slot) {
      return {
        valid: false,
        status: "INVALID_SLOT"
      };
    }

    return clone(slot);
  }

  function listIndicators() {
    return slots.map(slot => ({
      slot: slot.slot,
      occupied: slot.occupied,

      indicator: slot.occupied
        ? clone(slot.indicator)
        : null
    }));
  }

  function exportIndicator(id) {
    const indicator = getIndicator(id);

    if (!indicator) {
      return {
        exported: false,
        status: "NOT_FOUND"
      };
    }

    const exportData = {
      exportVersion: 1,

      name: indicator.name,
      type: indicator.type,
      format: indicator.format,
      source: indicator.source,

      description: indicator.description,
      author: indicator.author,
      version: indicator.version,
      timeframe: indicator.timeframe,

      metadata: indicator.metadata,
      settings: indicator.settings,

      mode: indicator.mode,
      enabled: indicator.enabled
    };

    return {
      exported: true,
      status: "EXPORTED",
      data: exportData,
      json: JSON.stringify(
        exportData,
        null,
        2
      )
    };
  }

  function clearAll() {
    slots = [
      makeSlot(1),
      makeSlot(2),
      makeSlot(3)
    ];

    return {
      cleared: true,
      status: "CLEARED",
      persistence: persist()
    };
  }

  function snapshot() {
    const occupied = slots.filter(
      slot => slot.occupied
    ).length;

    return {
      status: "READY",
      module: MODULE,
      version: VERSION,

      maximumSlots: MAX_SLOTS,
      occupiedSlots: occupied,
      availableSlots: MAX_SLOTS - occupied,

      persistence: {
        available: persistenceAvailable,
        storageKey,
        lastError
      },

      slots: listIndicators(),

      safety: {
        importedSourceExecuted: false,
        arbitraryCodeExecution: false,
        unsupportedIndicatorsMayBeSaved: true,
        analysisRequiresValidatedAdapter: true,
        orderExecution: false
      }
    };
  }

  return {
    saveIndicator,
    importIndicator,
    updateIndicator,
    setEnabled,
    setMode,
    setCompatibility,
    deleteIndicator,
    getIndicator,
    getSlotSnapshot,
    listIndicators,
    exportIndicator,
    restore,
    clearAll,
    snapshot,
    persist,

    config: {
      version: VERSION,
      module: MODULE,
      maximumSlots: MAX_SLOTS,
      supportedModes: [...VALID_MODES],
      acceptedTypes: [...VALID_TYPES],
      safeImport: true,
      executesImportedCode: false,
      displayOnly: true,
      orderExecution: false
    }
  };
}

export const CUSTOM_INDICATOR_MANAGER_CONFIG = {
  version: VERSION,
  module: MODULE,
  maximumSlots: MAX_SLOTS,
  modes: VALID_MODES,
  types: VALID_TYPES,
  safeImport: true,
  executesImportedCode: false,
  unsupportedIndicatorsMayBeSaved: true,
  analysisRequiresAdapterValidation: true,
  displayOnly: true,
  orderExecution: false
};
