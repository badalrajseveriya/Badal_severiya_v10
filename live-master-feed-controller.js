/* ==========================================================
   BADAL SEVERIYA V12
   LIVE MASTER FEED CONTROLLER
   Version 12.1

   Purpose:
   - Start the verified Live Master Feed Bridge.
   - Load 1D and 15M historical baseline.
   - Wait for an explicitly connected real-time provider.
   - Forward only real provider candles/ticks through bridge.
   - Publish updates through badal:live-master-update.
   - Never fabricate candles or use 1H fallback.
   - No order execution.
   ========================================================== */

import {
  createLiveMasterFeedBridge
} from "./live-master-feed-bridge.js";

const MODULE = "LIVE_MASTER_FEED_CONTROLLER";
const API_NAME = "BADAL_SEVERIYA_LIVE_FEED";

const SUPPORTED_TIMEFRAMES = ["1D", "15M"];

export function createLiveMasterFeedController(options = {}) {
  const bridge = createLiveMasterFeedBridge({
    apiBase: options.apiBase,
    fetchImpl: options.fetchImpl,
    engine: options.engine,
    maxAgeMs1D: options.maxAgeMs1D,
    maxAgeMs15M: options.maxAgeMs15M
  });

  let initializationPromise = null;
  let controllerStatus = "NOT_INITIALIZED";
  let lastInitialization = null;

  async function initialize() {
    if (initializationPromise) {
      return initializationPromise;
    }

    initializationPromise = (async () => {
      controllerStatus = "LOADING_HISTORICAL_BASELINE";

      const result =
        await bridge.loadHistoricalBaseline();

      lastInitialization = result;

      if (result.status === "READY") {
        controllerStatus = "WAITING_FOR_REAL_PROVIDER";
      } else {
        controllerStatus = "WAITING_FOR_HISTORICAL_DATA";
      }

      return {
        status: controllerStatus,
        module: MODULE,
        baseline: result,
        snapshot: bridge.snapshot()
      };
    })();

    try {
      return await initializationPromise;
    } catch (error) {
      controllerStatus = "ERROR";

      lastInitialization = {
        status: "ERROR",
        reason:
          error?.message ||
          "Feed controller initialization failed."
      };

      return {
        status: "ERROR",
        module: MODULE,
        reason: lastInitialization.reason
      };
    } finally {
      if (
        controllerStatus === "ERROR" ||
        controllerStatus === "WAITING_FOR_HISTORICAL_DATA"
      ) {
        initializationPromise = null;
      }
    }
  }

  async function connect(provider) {
    const baseline = await initialize();

    if (
      baseline.status !== "WAITING_FOR_REAL_PROVIDER" &&
      baseline.status !== "CONNECTED"
    ) {
      return {
        status: "WAIT",
        module: MODULE,
        reason:
          "Historical 1D and 15M baseline must load before provider connection.",
        baseline
      };
    }

    if (
      !provider ||
      typeof provider.subscribe !== "function"
    ) {
      return {
        status: "INVALID_SOURCE",
        module: MODULE,
        reason:
          "A real provider with subscribe({ onMinute, onTick, onStatus }) is required."
      };
    }

    const result = await bridge.connect(provider);

    if (result.status === "CONNECTED") {
      controllerStatus = "CONNECTED";
    } else if (result.status === "CONNECTING") {
      controllerStatus = "CONNECTING";
    } else {
      controllerStatus = result.status;
    }

    return {
      ...result,
      module: MODULE,
      snapshot: snapshot()
    };
  }

  function disconnect() {
    const result = bridge.disconnect();

    controllerStatus = "WAITING_FOR_REAL_PROVIDER";

    return {
      ...result,
      module: MODULE,
      snapshot: snapshot()
    };
  }

  function resolveStatus(feed) {
    if (feed.status === "READY") {
      return "CONNECTED";
    }

    const sourceStatus =
      feed.source?.status || "";

    if (
      sourceStatus === "CONNECTING" ||
      sourceStatus === "RECONNECTING"
    ) {
      return sourceStatus;
    }

    if (sourceStatus === "ERROR") {
      return "ERROR";
    }

    if (
      sourceStatus === "DISCONNECTED" &&
      feed.historicalBaseline?.loaded === true
    ) {
      return "WAITING_FOR_REAL_PROVIDER";
    }

    return controllerStatus;
  }

  function snapshot() {
    const feed = bridge.snapshot();

    return {
      status: resolveStatus(feed),

      module: MODULE,
      version: "12.1",

      baseline: lastInitialization,

      feed,

      safety: {
        supportedTimeframes: [...SUPPORTED_TIMEFRAMES],
        timeframeFallback: false,
        historicalDataUsedAsLiveSource: false,
        syntheticCandlesCreated: false,
        importedSourceExecuted: false,
        orderExecution: false
      },

      providerRequirement:
        "A real market-data provider must explicitly connect and supply received minute candles or ticks.",

      disclaimer:
        "Historical data is baseline context only. Live updates require a connected real provider. Educational context only; no forecasts or trading advice."
    };
  }

  return {
    initialize,
    connect,
    disconnect,
    snapshot,

    config: {
      module: MODULE,
      version: "12.1",
      supportedTimeframes: [...SUPPORTED_TIMEFRAMES],
      requiresRealProvider: true,
      historicalBaselineOnly: true,
      syntheticCandles: false,
      timeframeFallback: false,
      orderExecution: false
    }
  };
}

let defaultController = null;

export function initializeLiveMasterFeedController(options = {}) {
  if (defaultController) {
    return defaultController;
  }

  defaultController =
    createLiveMasterFeedController(options);

  if (typeof window !== "undefined") {
    window[API_NAME] = {
      initialize: () =>
        defaultController.initialize(),

      connect: provider =>
        defaultController.connect(provider),

      disconnect: () =>
        defaultController.disconnect(),

      snapshot: () =>
        defaultController.snapshot(),

      config: defaultController.config
    };
  }

  defaultController.initialize();

  return defaultController;
}

if (typeof window !== "undefined") {
  initializeLiveMasterFeedController();
}