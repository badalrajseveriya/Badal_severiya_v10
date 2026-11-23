
// ======================================================
// BADAL SEVERIYA V12
// HISTORICAL DASHBOARD RENDERER
// Educational and historical analysis only
// No forecasts or trading recommendations
// ======================================================

const NOTE =
  "Historical educational dashboard rendering only. No forecasts, probabilities or trading recommendations.";

const REQUIRED_CARD_IDS = [
  "data-quality",
  "market-indicators",
  "market-structure",
  "support-resistance",
  "fibonacci",
  "candle-patterns"
];

// ------------------------------------------------------
// HELPERS
// ------------------------------------------------------

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value, fallback = "") {
  return (
    typeof value === "string" && value.trim()
      ? value.trim()
      : fallback
  );
}

// ------------------------------------------------------
// INPUT VALIDATION
// ------------------------------------------------------

function validateUIModel(model) {
  const errors = [];

  if (!isObject(model)) {
    return {
      valid: false,
      errors: ["UI model must be an object."]
    };
  }

  if (model.status !== "OK") {
    errors.push("UI model status is invalid.");
  }

  if (model.dataType !== "HISTORICAL_ONLY") {
    errors.push("Only historical data is permitted.");
  }

  if (!isObject(model.screen)) {
    errors.push("Screen model is missing.");
  }

  if (!isObject(model.layout)) {
    errors.push("Layout model is missing.");
  }

  const cards = safeArray(model.layout?.cards);

  if (cards.length !== REQUIRED_CARD_IDS.length) {
    errors.push("Exactly six dashboard cards are required.");
  }

  for (let i = 0; i < REQUIRED_CARD_IDS.length; i++) {
    if (cards[i]?.id !== REQUIRED_CARD_IDS[i]) {
      errors.push(
        `Invalid card at position ${i + 1}.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ------------------------------------------------------
// RENDER CARD
// ------------------------------------------------------

function renderCard(card, index) {
  return {
    component: "DashboardCard",
    key: card.id,
    id: card.id,
    title: safeText(card.title, "Untitled Section"),
    order: index + 1,
    visible: card.visible === true,
    expanded: card.defaultExpanded === true,
    collapsible: card.collapsible === true,
    content: card.content
  };
}

// ------------------------------------------------------
// RENDER SCREEN
// ------------------------------------------------------

function renderScreen(screen) {
  return {
    component: "DashboardScreen",
    screenId: safeText(screen.id, "historical-dashboard"),
    header: {
      title: safeText(screen.title, "BADAL SEVERIYA V12"),
      subtitle: safeText(
        screen.subtitle,
        "Historical Market Analysis"
      )
    },
    metadata: {
      timeframe: safeText(screen.timeframe, "15m"),
      candleCount:
        Number.isInteger(screen.candleCount)
          ? screen.candleCount
          : 0,
      generatedAt: screen.generatedAt ?? null
    }
  };
}

// ------------------------------------------------------
// EMPTY STATE
// ------------------------------------------------------

function createEmptyState() {
  return {
    component: "EmptyState",
    title: "Historical Data Unavailable",
    message:
      "No historical dashboard information is available.",
    visible: false
  };
}

// ------------------------------------------------------
// MAIN RENDERER
// ------------------------------------------------------

export function renderHistoricalDashboard(model) {
  try {
    const validation = validateUIModel(model);

    if (!validation.valid) {
      throw new Error(
        `Renderer validation failed: ${validation.errors.join(" ")}`
      );
    }

    const cards = model.layout.cards.map(
      renderCard
    );

    const visibleCards = cards.filter(
      card => card.visible
    );

    return {
      status: "OK",
      version: "12.0",
      module: "HISTORICAL_DASHBOARD_RENDERER",
      dataType: "HISTORICAL_ONLY",

      screen: renderScreen(model.screen),

      viewport: {
        responsive: model.layout.responsive,
        scrollable: true,
        cardCount: cards.length,
        visibleCardCount: visibleCards.length
      },

      renderTree: {
        component: "DashboardRoot",
        direction: "VERTICAL",
        children: [
          {
            component: "DashboardHeader",
            key: "dashboard-header"
          },
          ...visibleCards
        ]
      },

      emptyState: createEmptyState(),

      validation: {
        status: "OK",
        valid: true,
        checkedCards: cards.length,
        errors: []
      },

      note: NOTE
    };

  } catch (error) {
    return {
      status: "ERROR",
      version: "12.0",
      module: "HISTORICAL_DASHBOARD_RENDERER",
      dataType: "HISTORICAL_ONLY",
      error: error.message,
      note: NOTE
    };
  }
}
