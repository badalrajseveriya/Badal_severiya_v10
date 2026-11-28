
/**
 * BADAL SEVERIYA
 * Angel One Worker - Origin Security
 * Version: 1.0
 *
 * Exact HTTPS Origin allowlist.
 * No wildcard fallback.
 * No permissive CORS.
 */

const ALLOWED_METHODS = "GET, POST, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization";
const PREFLIGHT_MAX_AGE = "86400";

function parseAllowedOrigins(value) {
  if (typeof value !== "string" || !value.trim()) {
    return {
      ok: false,
      error: "APP_ORIGIN_NOT_CONFIGURED"
    };
  }

  const entries = value.split(",").map(item => item.trim());

  if (!entries.length || entries.some(item => !item)) {
    return {
      ok: false,
      error: "INVALID_APP_ORIGIN_CONFIGURATION"
    };
  }

  const origins = [];

  for (const entry of entries) {
    let parsed;

    try {
      parsed = new URL(entry);
    } catch {
      return {
        ok: false,
        error: "INVALID_APP_ORIGIN_CONFIGURATION"
      };
    }

    if (
      parsed.protocol !== "https:" ||
      parsed.origin !== entry ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      return {
        ok: false,
        error: "INVALID_APP_ORIGIN_CONFIGURATION"
      };
    }

    if (!origins.includes(parsed.origin)) {
      origins.push(parsed.origin);
    }
  }

  return {
    ok: true,
    origins
  };
}

/**
 * Validate the browser Origin header against APP_ORIGIN.
 *
 * requireOrigin:
 *   true  = Origin header must be present.
 *   false = non-browser/server requests may omit Origin.
 */
export function checkRequestOrigin(
  request,
  env,
  options = {}
) {
  const configuration = parseAllowedOrigins(env?.APP_ORIGIN);

  if (!configuration.ok) {
    return {
      ok: false,
      status: 503,
      error: configuration.error,
      message: "Worker Origin allowlist is not configured safely."
    };
  }

  const requestOrigin = request.headers.get("Origin");

  if (!requestOrigin) {
    if (options.requireOrigin === true) {
      return {
        ok: false,
        status: 403,
        error: "ORIGIN_HEADER_REQUIRED",
        message: "A valid browser Origin header is required."
      };
    }

    return {
      ok: true,
      origin: null,
      corsHeaders: {}
    };
  }

  if (!configuration.origins.includes(requestOrigin)) {
    return {
      ok: false,
      status: 403,
      error: "ORIGIN_NOT_ALLOWED",
      message: "This request Origin is not allowed."
    };
  }

  return {
    ok: true,
    origin: requestOrigin,
    corsHeaders: {
      "Access-Control-Allow-Origin": requestOrigin,
      "Vary": "Origin"
    }
  };
}

/**
 * Build CORS headers only after successful Origin validation.
 */
export function buildCorsHeaders(policy, options = {}) {
  if (!policy?.ok) {
    return {};
  }

  const headers = {
    ...policy.corsHeaders
  };

  if (options.preflight === true) {
    headers["Access-Control-Allow-Methods"] = ALLOWED_METHODS;
    headers["Access-Control-Allow-Headers"] = ALLOWED_HEADERS;
    headers["Access-Control-Max-Age"] = PREFLIGHT_MAX_AGE;
    headers["Vary"] = "Origin";
  }

  return headers;
}

/**
 * Safe JSON response for rejected Origin requests.
 * Never adds wildcard CORS headers.
 */
export function originSecurityError(policy) {
  const status = Number.isInteger(policy?.status)
    ? policy.status
    : 403;

  return new Response(
    JSON.stringify({
      ok: false,
      error: policy?.error || "ORIGIN_SECURITY_REJECTED",
      message: policy?.message || "Request Origin was rejected."
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    }
  );
}

export const ANGEL_ONE_ORIGIN_SECURITY_CONFIG = Object.freeze({
  version: "1.0",
  requiresHttps: true,
  allowsWildcard: false,
  requiresOriginForWebSocket: true,
  supportsExactOriginAllowlist: true
});
