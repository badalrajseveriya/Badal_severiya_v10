const NOTE =
  "Historical educational dashboard only. No forecasts, probabilities or trading recommendations.";

const REQUIRED_CARD_IDS = [
  "data-quality",
  "market-indicators",
  "market-structure",
  "support-resistance",
  "fibonacci",
  "candle-patterns"
];

const OPTIONAL_MASTER_CARD_ID =
  "historical-master-analysis";

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

function validateDisplayData(display) {
  const errors = [];

  if (!isObject(display)) {
    return {
      valid: false,
      errors: ["Display data must be an object."]
    };
  }

  if (display.status !== "OK") {
    errors.push("Display status is invalid.");
  }

  if (display.dataType !== "HISTORICAL_ONLY") {
    errors.push("Only historical data is permitted.");
  }

  if (!isObject(display.screen)) {
    errors.push("Screen information is missing.");
  }

  if (
    !isObject(display.layout) ||
    display.layout.type !== "VERTICAL_CARDS"
  ) {
    errors.push("Dashboard layout is invalid.");
  }

  const cards = safeArray(display.layout?.cards);

  const expectedSix =
    cards.length === REQUIRED_CARD_IDS.length;

  const expectedSeven =
    cards.length ===
      REQUIRED_CARD_IDS.length + 1 &&
    cards[6]?.id === OPTIONAL_MASTER_CARD_ID;

  if (!expectedSix && !expectedSeven) {
    errors.push(
      "Dashboard must contain the six required cards, optionally followed by the Master Analysis card."
    );
  }

  for (
    let i = 0;
    i < REQUIRED_CARD_IDS.length;
    i++
  ) {
    if (cards[i]?.id !== REQUIRED_CARD_IDS[i]) {
      errors.push(
        `Invalid dashboard card at position ${i + 1}.`
      );
    }
  }

  if (expectedSeven) {
    const master = cards[6];

    if (
      !isObject(master) ||
      master.title !== "Master Historical Analysis" ||
      master.timeframe !== "15m" ||
      !Number.isInteger(master.candleCount) ||
      master.candleCount < 200 ||
      !isObject(master.composition) ||
      !isObject(master.composition.percentages)
    ) {
      errors.push(
        "Master Analysis card is invalid."
      );
    }

    const p = master?.composition?.percentages;

    if (
      !isObject(p) ||
      !["bullish", "bearish", "neutral"].every(
        key => Number.isFinite(p[key])
      ) ||
      Math.abs(
        p.bullish + p.bearish + p.neutral - 100
      ) > 0.2
    ) {
      errors.push(
        "Master Analysis percentages are invalid."
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function createCardModel(card, index) {
  return {
    id: card.id,
    title: card.title,
    order: index + 1,
    visible: true,
    collapsible: true,
    defaultExpanded: index < 3,
    content: card
  };
}

function createScreenModel(screen) {
  return {
    id: screen.screenId,
    title: screen.title,
    subtitle: screen.subtitle,
    timeframe: screen.timeframe,
    candleCount: screen.candleCount,
    generatedAt: screen.generatedAt
  };
}

function createResponsiveLayout() {
  return {
    mobile: {
      columns: 1,
      cardDirection: "VERTICAL",
      scrollable: true
    },
    tablet: {
      columns: 2,
      cardDirection: "GRID",
      scrollable: true
    },
    desktop: {
      columns: 3,
      cardDirection: "GRID",
      scrollable: true
    }
  };
}

export function createHistoricalDashboardUIModel(display) {
  try {
    const validation =
      validateDisplayData(display);

    if (!validation.valid) {
      throw new Error(
        `UI model validation failed: ${validation.errors.join(" ")}`
      );
    }

    const cards =
      display.layout.cards.map(
        createCardModel
      );

    return {
      status: "OK",
      version: "12.0",
      module: "HISTORICAL_DASHBOARD_UI_MODEL",
      dataType: "HISTORICAL_ONLY",

      screen:
        createScreenModel(display.screen),

      layout: {
        type: "RESPONSIVE",
        cards,
        cardCount: cards.length,
        responsive:
          createResponsiveLayout()
      },

      navigation: {
        type: "SINGLE_SCREEN",
        sections: cards.map(card => card.id)
      },

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
      module: "HISTORICAL_DASHBOARD_UI_MODEL",
      dataType: "HISTORICAL_ONLY",
      error: error.message,
      note: NOTE
    };
  }
}