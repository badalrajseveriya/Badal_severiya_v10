
/*
 * BADAL SEVERIYA V12
 * HISTORICAL MASTER — NEWS CONTEXT UI
 *
 * Connects News Intelligence API with the Master Dashboard.
 * Displays news context only.
 *
 * No forecasts, trading signals, or future probabilities.
 */

import {
  analyzeHistoricalMasterNewsContext
} from "./historical-master-news-context.js";

const NEWS_API =
  "https://badal-severiya-news-intelligence.mrstarrdbs.workers.dev/api/news-intelligence";

const TIMEFRAMES = ["1d", "15m"];

const COLORS = {
  positive: "#16a34a",
  negative: "#dc2626",
  mixed: "#eab308",
  neutral: "#94a3b8",
  background: "#0b1220",
  panel: "#172338",
  border: "#334155",
  text: "#f1f5f9",
  muted: "#cbd5e1",
  error: "#f87171"
};

function getElement(id) {
  return document.getElementById(id);
}

/*
 * Defense-in-depth: only safe HTTPS article links
 * are rendered as clickable links in the dashboard.
 */
function getSafeArticleUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const parsed = new URL(value.trim());

    if (parsed.protocol !== "https:") {
      return null;
    }

    if (parsed.username || parsed.password) {
      return null;
    }

    if (!parsed.hostname) {
      return null;
    }

    return parsed.href;
  } catch {
    return null;
  }
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    element.textContent = String(text);
  }

  return element;
}

function getContextColor(label) {
  switch (label) {
    case "POSITIVE_NEWS_CONTEXT":
      return COLORS.positive;

    case "NEGATIVE_NEWS_CONTEXT":
      return COLORS.negative;

    case "MIXED_NEWS_CONTEXT":
      return COLORS.mixed;

    case "NEUTRAL_NEWS_CONTEXT":
      return COLORS.neutral;

    default:
      return COLORS.muted;
  }
}

function formatContextLabel(label) {
  const labels = {
    POSITIVE_NEWS_CONTEXT: "POSITIVE NEWS CONTEXT",
    NEGATIVE_NEWS_CONTEXT: "NEGATIVE NEWS CONTEXT",
    MIXED_NEWS_CONTEXT: "MIXED NEWS CONTEXT",
    NEUTRAL_NEWS_CONTEXT: "NEUTRAL NEWS CONTEXT",
    NO_CLEAR_NEWS_CONTEXT: "NO CLEAR NEWS CONTEXT"
  };

  return labels[label] || "NEWS CONTEXT UNAVAILABLE";
}

function formatDate(value) {
  if (!value) return "प्रकाशन समय उपलब्ध नहीं";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "प्रकाशन समय अमान्य";
  }

  return date.toLocaleString("hi-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata"
  });
}

function createPanel(timeframe) {
  const summary = getElement(
    `master-summary-${timeframe}`
  );

  if (!summary) return null;

  let panel = summary.querySelector(
    ".historical-master-news-context-panel"
  );

  if (panel) return panel;

  panel = createElement(
    "section",
    "historical-master-news-context-panel"
  );

  panel.dataset.timeframe = timeframe;

  panel.style.cssText = `
    margin-top:14px;
    padding:13px;
    background:${COLORS.background};
    border:1px solid ${COLORS.border};
    border-radius:10px;
  `;

  const heading = createElement(
    "h3",
    "",
    `${timeframe.toUpperCase()} — NEWS INTELLIGENCE CONTEXT`
  );

  heading.style.cssText = `
    color:#7dd3fc;
    font-size:14px;
    margin:0 0 12px;
  `;

  const status = createElement(
    "div",
    "news-context-status",
    "News Intelligence डेटा लोड हो रहा है..."
  );

  status.style.cssText = `
    color:${COLORS.muted};
    font-size:12px;
    line-height:1.6;
  `;

  const context = createElement(
    "div",
    "news-context-summary"
  );

  const articles = createElement(
    "div",
    "news-context-articles"
  );

  const refreshButton = createElement(
    "button",
    "news-context-refresh",
    "REFRESH NEWS CONTEXT"
  );

  refreshButton.type = "button";

  refreshButton.style.cssText = `
    width:100%;
    margin-top:12px;
    padding:11px;
    background:#0369a1;
    color:#ffffff;
    border:1px solid #38bdf8;
    border-radius:8px;
    font-weight:bold;
    cursor:pointer;
  `;

  const note = createElement(
    "p",
    "news-context-note",
    "News sentiment rule-based और experimental है। यह verified market impact, भविष्य की prediction या trading signal नहीं है।"
  );

  note.style.cssText = `
    color:#94a3b8;
    font-size:11px;
    line-height:1.5;
    margin:12px 0 0;
  `;

  panel.append(
    heading,
    status,
    context,
    articles,
    refreshButton,
    note
  );

  const eightPanel = summary.querySelector(
    ".master-eight-container"
  );

  if (eightPanel) {
    eightPanel.after(panel);
  } else {
    summary.appendChild(panel);
  }

  return panel;
}

function setStatus(panel, message, state = "normal") {
  const status = panel.querySelector(
    ".news-context-status"
  );

  if (!status) return;

  status.textContent = message;

  status.style.color =
    state === "error"
      ? COLORS.error
      : COLORS.muted;
}

function makeMetric(label, value, color) {
  const card = createElement(
    "div",
    "news-context-metric"
  );

  card.style.cssText = `
    padding:9px 5px;
    background:${COLORS.panel};
    border:1px solid ${COLORS.border};
    border-radius:8px;
    text-align:center;
    min-width:0;
  `;

  const valueElement = createElement(
    "div",
    "",
    value
  );

  valueElement.style.cssText = `
    color:${color};
    font-size:17px;
    font-weight:bold;
    overflow-wrap:anywhere;
  `;

  const labelElement = createElement(
    "div",
    "",
    label
  );

  labelElement.style.cssText = `
    color:${COLORS.muted};
    font-size:10px;
    line-height:1.4;
    margin-top:5px;
  `;

  card.append(
    valueElement,
    labelElement
  );

  return card;
}

function renderSummary(panel, result) {
  const container = panel.querySelector(
    ".news-context-summary"
  );

  if (!container) return;

  container.replaceChildren();

  if (result.status !== "OK") {
    setStatus(
      panel,
      result.error || "News context उपलब्ध नहीं है।",
      "error"
    );

    return;
  }

  const context = result.context;

  const label = createElement(
    "div",
    "",
    formatContextLabel(context.label)
  );

  label.style.cssText = `
    color:${getContextColor(context.label)};
    font-size:14px;
    font-weight:bold;
    margin:10px 0;
  `;

  const metrics = createElement(
    "div",
    "news-context-metrics"
  );

  metrics.style.cssText = `
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:7px;
  `;

  metrics.append(
    makeMetric(
      "NIFTY Relevant",
      context.relevantArticleCount,
      COLORS.text
    ),

    makeMetric(
      "Positive",
      context.positiveCount,
      COLORS.positive
    ),

    makeMetric(
      "Negative",
      context.negativeCount,
      COLORS.negative
    ),

    makeMetric(
      "Mixed",
      context.mixedCount,
      COLORS.mixed
    ),

    makeMetric(
      "Neutral",
      context.neutralCount,
      COLORS.neutral
    ),

    makeMetric(
      "Active Articles",
      context.freshness.activeArticleCount,
      COLORS.text
    ),

    makeMetric(
      "Stale Display Only",
      context.freshness.staleArticleCount,
      COLORS.muted
    ),

    makeMetric(
      "Excluded",
      context.freshness.excludedNoiseCount,
      COLORS.muted
    )
  );

  const fallback = context.freshness.usedFallbackWindow;

  const fallbackNote = createElement(
    "div",
    "",
    fallback
      ? "⚠️ News fallback freshness window उपयोग हुई है।"
      : "Freshness fallback window उपयोग नहीं हुई।"
  );

  fallbackNote.style.cssText = `
    margin-top:10px;
    color:${fallback ? COLORS.mixed : COLORS.muted};
    font-size:11px;
    line-height:1.5;
  `;

  container.append(
    label,
    metrics,
    fallbackNote
  );

  setStatus(
    panel,
    `News Context तैयार | API Generated: ${formatDate(result.generatedAt)}`
  );
}

function createArticleCard(article, stale = false) {
  const card = createElement(
    "article",
    "news-context-article"
  );

  card.style.cssText = `
    margin-top:9px;
    padding:11px;
    background:${COLORS.panel};
    border:1px solid ${COLORS.border};
    border-radius:8px;
  `;

  const title = createElement(
    "div",
    "",
    article.title
  );

  title.style.cssText = `
    color:${COLORS.text};
    font-size:13px;
    font-weight:bold;
    line-height:1.5;
    overflow-wrap:anywhere;
  `;

  const meta = createElement(
    "div",
    "",
    `${article.sourceName || article.sourceId || "Source"} | ${formatDate(article.publishedAt)}`
  );

  meta.style.cssText = `
    color:${COLORS.muted};
    font-size:10px;
    margin-top:6px;
    line-height:1.5;
  `;

  const category = createElement(
    "div",
    "",
    `${article.category} | ${article.sentiment} | ${article.freshness}`
  );

  category.style.cssText = `
    color:${stale ? COLORS.mixed : getContextColor(
      article.sentiment === "POSITIVE"
        ? "POSITIVE_NEWS_CONTEXT"
        : article.sentiment === "NEGATIVE"
          ? "NEGATIVE_NEWS_CONTEXT"
          : article.sentiment === "MIXED"
            ? "MIXED_NEWS_CONTEXT"
            : "NEUTRAL_NEWS_CONTEXT"
    )};
    font-size:11px;
    margin-top:6px;
    line-height:1.5;
  `;

  const description = createElement(
    "p",
    "",
    article.description || "Description उपलब्ध नहीं"
  );

  description.style.cssText = `
    color:${COLORS.muted};
    font-size:12px;
    line-height:1.5;
    margin:8px 0 0;
  `;

  const safeArticleUrl = getSafeArticleUrl(
    article.link
  );

  let articleLinkElement;

  if (safeArticleUrl) {
    articleLinkElement = createElement(
      "a",
      "",
      "OPEN ARTICLE"
    );

    articleLinkElement.href = safeArticleUrl;
    articleLinkElement.target = "_blank";
    articleLinkElement.rel = "noopener noreferrer";

    articleLinkElement.style.cssText = `
      display:inline-block;
      margin-top:8px;
      color:#38bdf8;
      font-size:11px;
      font-weight:bold;
    `;
  } else {
    articleLinkElement = createElement(
      "div",
      "",
      "Article link unavailable or unsafe"
    );

    articleLinkElement.style.cssText = `
      margin-top:8px;
      color:${COLORS.muted};
      font-size:11px;
    `;
  }

  card.append(
    title,
    meta,
    category,
    description,
    articleLinkElement
  );

  if (stale) {
    const staleLabel = createElement(
      "div",
      "",
      "DISPLAY ONLY — ACTIVE CONTEXT में शामिल नहीं"
    );

    staleLabel.style.cssText = `
      color:${COLORS.mixed};
      font-size:10px;
      font-weight:bold;
      margin-top:8px;
    `;

    card.appendChild(staleLabel);
  }

  return card;
}

function renderArticles(panel, result) {
  const container = panel.querySelector(
    ".news-context-articles"
  );

  if (!container) return;

  container.replaceChildren();

  if (result.status !== "OK") return;

  const heading = createElement(
    "h4",
    "",
    "NIFTY-RELEVANT NEWS"
  );

  heading.style.cssText = `
    color:#7dd3fc;
    font-size:13px;
    margin:14px 0 8px;
  `;

  container.appendChild(heading);

  const relevant = result.articles.relevant || [];

  if (!relevant.length) {
    container.appendChild(
      createElement(
        "p",
        "",
        "अभी कोई Active NIFTY-relevant article उपलब्ध नहीं।"
      )
    );
  } else {
    for (const article of relevant.slice(0, 10)) {
      container.appendChild(
        createArticleCard(article)
      );
    }
  }

  const globalArticles =
    result.articles.otherContext || [];

  if (globalArticles.length) {
    const globalHeading = createElement(
      "h4",
      "",
      "OTHER / GLOBAL CONTEXT"
    );

    globalHeading.style.cssText = `
      color:#7dd3fc;
      font-size:13px;
      margin:14px 0 8px;
    `;

    container.appendChild(globalHeading);

    for (const article of globalArticles.slice(0, 5)) {
      container.appendChild(
        createArticleCard(article)
      );
    }
  }

  const staleArticles =
    result.articles.stale || [];

  if (staleArticles.length) {
    const staleHeading = createElement(
      "h4",
      "",
      "STALE FALLBACK ARTICLES — DISPLAY ONLY"
    );

    staleHeading.style.cssText = `
      color:${COLORS.mixed};
      font-size:13px;
      margin:14px 0 8px;
    `;

    container.appendChild(staleHeading);

    for (const article of staleArticles.slice(0, 5)) {
      container.appendChild(
        createArticleCard(article, true)
      );
    }
  }
}

async function loadNewsContext({
  refresh = false
} = {}) {
  const url = refresh
    ? `${NEWS_API}?refresh=1`
    : NEWS_API;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    cache: refresh ? "no-store" : "default"
  });

  if (!response.ok) {
    throw new Error(
      `News API HTTP ${response.status}`
    );
  }

  const payload = await response.json();

  return analyzeHistoricalMasterNewsContext(
    payload,
    {
      maxArticles: 100
    }
  );
}

async function updatePanel(timeframe, {
  refresh = false
} = {}) {
  const panel = createPanel(timeframe);

  if (!panel) return;

  const button = panel.querySelector(
    ".news-context-refresh"
  );

  if (button) {
    button.disabled = true;
    button.textContent = "LOADING NEWS...";
  }

  setStatus(
    panel,
    refresh
      ? "News Intelligence refresh हो रहा है..."
      : "News Intelligence डेटा लोड हो रहा है..."
  );

  try {
    const result = await loadNewsContext({
      refresh
    });

    renderSummary(panel, result);
    renderArticles(panel, result);
  } catch (error) {
    console.error(
      `News context ${timeframe} error:`,
      error
    );

    setStatus(
      panel,
      `News API connection error: ${error.message}. CORS/API उपलब्धता जाँचें।`,
      "error"
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "REFRESH NEWS CONTEXT";
    }
  }
}

function initializeNewsPanel(timeframe) {
  const panel = createPanel(timeframe);

  if (!panel) return;

  const button = panel.querySelector(
    ".news-context-refresh"
  );

  if (button) {
    button.addEventListener("click", () => {
      updatePanel(timeframe, {
        refresh: true
      });
    });
  }

  updatePanel(timeframe);
}

for (const timeframe of TIMEFRAMES) {
  initializeNewsPanel(timeframe);
}

console.log(
  "BADAL SEVERIYA: Historical Master News Context UI initialized."
);
