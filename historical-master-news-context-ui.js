
/*
 * BADAL SEVERIYA V12
 * Master dashboard News Context display.
 * News article counts/context only; never trading recommendations.
 */

const NEWS_CONTEXT_URL =
  "https://badal-severiya-master-news-context.mrstarrdbs.workers.dev/api/news-context";

const PANEL_ID = "master-news-context-panel";

function el(tag, text = "") {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) {
    node.textContent = String(text);
  }
  return node;
}

function setStatus(panel, message, isError = false) {
  const status = panel.querySelector("[data-news-status]");
  if (!status) return;

  status.textContent = message;
  status.style.color = isError ? "#fca5a5" : "#cbd5e1";
}

function formatContextLabel(label) {
  const labels = {
    POSITIVE_NEWS_CONTEXT: "Positive classified context",
    NEGATIVE_NEWS_CONTEXT: "Negative classified context",
    MIXED_NEWS_CONTEXT: "Mixed context",
    NEUTRAL_NEWS_CONTEXT: "Neutral context",
    NO_CLEAR_NEWS_CONTEXT: "No clear context"
  };

  return labels[label] || "Context not classified";
}

function renderArticleList(container, articles) {
  container.replaceChildren();

  if (!Array.isArray(articles) || articles.length === 0) {
    container.appendChild(el("p", "इस श्रेणी में कोई खबर उपलब्ध नहीं।"));
    return;
  }

  for (const article of articles.slice(0, 10)) {
    const item = el("article");

    item.style.cssText =
      "margin:8px 0;padding:9px;background:#111c2e;" +
      "border:1px solid #334155;border-radius:8px;";

    const title = el("a", article.title || "Untitled news");
    title.href = article.link || "#";
    title.target = "_blank";
    title.rel = "noopener noreferrer";
    title.style.cssText =
      "color:#7dd3fc;font-weight:bold;line-height:1.4;";

    const meta = el(
      "div",
      [
        article.sourceName || article.sourceId || "Source unknown",
        article.publishedAt || "Date unavailable",
        article.sentiment || "NEUTRAL",
        article.category || "GENERAL"
      ].join(" • ")
    );

    meta.style.cssText =
      "margin-top:5px;color:#94a3b8;font-size:11px;";

    const desc = el("p", article.description || "");
    desc.style.cssText =
      "margin:6px 0 0;color:#cbd5e1;font-size:12px;";

    item.append(title, meta);

    if (article.description) {
      item.appendChild(desc);
    }

    container.appendChild(item);
  }
}

function ensurePanel() {
  let panel = document.getElementById(PANEL_ID);

  if (panel) return panel;

  const host = document.getElementById("combined-analysis");
  if (!host) return null;

  panel = el("section");
  panel.id = PANEL_ID;

  panel.style.cssText =
    "margin-top:16px;padding:14px;background:#0b1220;" +
    "border:1px solid #334155;border-radius:12px;";

  const heading = el("h3", "NEWS INTELLIGENCE — Historical Context");

  heading.style.cssText =
    "margin:0 0 10px;color:#7dd3fc;";

  const button = el("button", "Refresh News Context");
  button.type = "button";

  button.style.cssText =
    "width:100%;padding:11px;border-radius:8px;" +
    "border:1px solid #38bdf8;background:#0369a1;" +
    "color:white;font-weight:bold;cursor:pointer;";

  const status = el("p", "News context data की प्रतीक्षा है।");
  status.dataset.newsStatus = "1";

  status.style.cssText =
    "color:#cbd5e1;font-size:12px;line-height:1.5;";

  const contextBox = el("div");
  contextBox.dataset.newsSummary = "1";

  contextBox.style.cssText =
    "padding:11px;background:#172338;border:1px solid " +
    "#334155;border-radius:9px;color:#cbd5e1;font-size:13px;";

  const newsTitle = el("h4", "NIFTY-Relevant Classified News");

  newsTitle.style.cssText =
    "color:#7dd3fc;margin:14px 0 8px;";

  const articles = el("div");
  articles.dataset.newsArticles = "1";

  const note = el(
    "p",
    "News classification experimental है। Counts खबरों की संख्या हैं—" +
    "probability, verified impact, prediction या trading signal नहीं।"
  );

  note.style.cssText =
    "color:#94a3b8;font-size:11px;line-height:1.5;";

  panel.append(
    heading,
    button,
    status,
    contextBox,
    newsTitle,
    articles,
    note
  );

  host.appendChild(panel);

  button.addEventListener("click", () => loadNewsContext(true));

  return panel;
}

function renderSummary(panel, response) {
  const box = panel.querySelector("[data-news-summary]");
  const context = response?.context?.context;

  box.replaceChildren();

  if (!context) {
    box.textContent =
      response?.context?.error || "Context unavailable.";
    return;
  }

  const label = el("strong", formatContextLabel(context.label));

  label.style.cssText =
    "display:block;color:#f8fafc;font-size:15px;margin-bottom:8px;";

  box.appendChild(label);

  const stats = el("div");

  stats.style.cssText =
    "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;";

  const entries = [
    ["Relevant", context.relevantArticleCount],
    ["Positive", context.positiveCount],
    ["Negative", context.negativeCount],
    ["Mixed", context.mixedCount],
    ["Neutral", context.neutralCount],
    ["Active news", context.freshness?.activeArticleCount],
    ["Stale (display only)", context.freshness?.staleArticleCount],
    ["Excluded old/invalid", context.freshness?.excludedNoiseCount]
  ];

  for (const [name, value] of entries) {
    const cell = el("div");

    cell.style.cssText =
      "padding:8px;background:#0b1220;border:1px solid " +
      "#334155;border-radius:7px;";

    const caption = el("div", name);
    caption.style.cssText = "font-size:11px;color:#94a3b8;";

    const number = el("strong", Number.isFinite(value) ? value : "N/A");
    number.style.cssText = "font-size:16px;color:#f1f5f9;";

    cell.append(caption, number);
    stats.appendChild(cell);
  }

  box.appendChild(stats);

  const categories = context.sentimentCounts;

  if (categories) {
    const categoryText = el(
      "p",
      "Category counts — India Index: " + categories.indiaIndex +
      ", Macro: " + categories.indiaMacro +
      ", Regulatory: " + categories.regulatory +
      ", Stock-specific: " + categories.stockSpecific +
      ", Global: " + categories.global
    );

    categoryText.style.cssText =
      "margin:9px 0 0;color:#cbd5e1;font-size:12px;";

    box.appendChild(categoryText);
  }
}

async function loadNewsContext(refresh = false) {
  const panel = ensurePanel();

  if (!panel) return;

  setStatus(
    panel,
    refresh
      ? "News sources को refresh करके context प्राप्त कर रहे हैं…"
      : "News context लोड हो रहा है…"
  );

  const button = panel.querySelector("button");

  if (button) button.disabled = true;

  try {
    const url = refresh
      ? NEWS_CONTEXT_URL + "?refresh=1"
      : NEWS_CONTEXT_URL;

    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });

    const payload = await response.json();

    if (!response.ok || payload?.ok !== true) {
      throw new Error(
        payload?.context?.error ||
        payload?.error ||
        "News context endpoint returned an error."
      );
    }

    renderSummary(panel, payload);

    renderArticleList(
      panel.querySelector("[data-news-articles]"),
      payload.context.articles?.relevant || []
    );

    setStatus(
      panel,
      "Bridge " + payload.version +
      " • News Intelligence " +
      (payload.upstreamVersion || "version unavailable") +
      " • Updated " + (payload.fetchedAt || "time unavailable")
    );
  } catch (error) {
    setStatus(
      panel,
      "News Context unavailable: " +
      String(error?.message || error) +
      " — Worker deployment/connection जाँचें।",
      true
    );
  } finally {
    if (button) button.disabled = false;
  }
}

function boot() {
  if (!ensurePanel()) return;
  loadNewsContext(false);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
