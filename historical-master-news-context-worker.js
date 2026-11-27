
import { analyzeHistoricalMasterNewsContext } from "./historical-master-news-context.js";

const MODULE = "BADAL_SEVERIYA_MASTER_NEWS_CONTEXT_PROXY";
const VERSION = "1.0.0";
const UPSTREAM =
  "https://badal-severiya-news-intelligence.mrstarrdbs.workers.dev/api/news-intelligence";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export async function handleNewsContextRequest(request, fetchImpl = fetch) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "GET") {
    return json({
      ok: false,
      module: MODULE,
      error: "Method not allowed. Use GET or OPTIONS."
    }, 405);
  }

  if (url.pathname !== "/" && url.pathname !== "/api/news-context") {
    return json({
      ok: false,
      module: MODULE,
      error: "Not found."
    }, 404);
  }

  try {
    const upstreamUrl = new URL(UPSTREAM);

    if (url.searchParams.get("refresh") === "1") {
      upstreamUrl.searchParams.set("refresh", "1");
    }

    const upstream = await fetchImpl(upstreamUrl.toString(), {
      method: "GET",
      headers: { Accept: "application/json" }
    });

    if (!upstream.ok) {
      return json({
        ok: false,
        module: MODULE,
        version: VERSION,
        status: "UPSTREAM_ERROR",
        upstreamStatus: upstream.status,
        error: "News Intelligence upstream API returned an error."
      }, 502);
    }

    let payload;

    try {
      payload = await upstream.json();
    } catch {
      return json({
        ok: false,
        module: MODULE,
        version: VERSION,
        status: "UPSTREAM_INVALID_JSON",
        error: "News Intelligence API response was not valid JSON."
      }, 502);
    }

    const context = analyzeHistoricalMasterNewsContext(payload);

    return json({
      ok: context.status === "OK",
      module: MODULE,
      version: VERSION,
      upstreamApp: payload?.app || "BADAL SEVERIYA NEWS INTELLIGENCE",
      upstreamVersion: payload?.version || null,
      fetchedAt: new Date().toISOString(),
      context
    }, context.status === "OK" ? 200 : 503);
  } catch (error) {
    return json({
      ok: false,
      module: MODULE,
      version: VERSION,
      status: "FETCH_ERROR",
      error: "Unable to connect to News Intelligence API.",
      detail: String(error?.message || error).slice(0, 200)
    }, 502);
  }
}

export default {
  fetch(request) {
    return handleNewsContextRequest(request);
  }
};
