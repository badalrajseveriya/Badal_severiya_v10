
import smartApiWorker, {
  AngelOneSmartApiSession
} from "./angel-one-smartapi-worker.js";

import {
  checkRequestOrigin,
  buildCorsHeaders,
  originSecurityError
} from "./angel-one-worker-security.js";

const ALLOWED_METHODS = new Set(["GET", "POST", "OPTIONS"]);

const ALLOWED_HEADERS = new Set([
  "content-type",
  "authorization"
]);

function securePreflight(request, policy) {
  const requestedMethod = request.headers.get(
    "Access-Control-Request-Method"
  );

  const requestedHeaders = (
    request.headers.get("Access-Control-Request-Headers") || ""
  )
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);

  if (
    requestedMethod &&
    !ALLOWED_METHODS.has(requestedMethod.toUpperCase())
  ) {
    return originSecurityError({
      ok: false,
      status: 403,
      error: "CORS_METHOD_NOT_ALLOWED",
      message: "Requested HTTP method is not allowed."
    });
  }

  if (requestedHeaders.some(
    header => !ALLOWED_HEADERS.has(header)
  )) {
    return originSecurityError({
      ok: false,
      status: 403,
      error: "CORS_HEADER_NOT_ALLOWED",
      message: "One or more requested headers are not allowed."
    });
  }

  const headers = new Headers(
    buildCorsHeaders(policy, { preflight: true })
  );

  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(null, {
    status: 204,
    headers
  });
}

function applySecureCors(response, policy) {
  // WebSocket 101 response must remain untouched.
  if (response.status === 101) {
    return response;
  }

  const headers = new Headers(response.headers);

  // Remove all CORS headers from the original Worker response.
  // This prevents its old wildcard fallback from leaking through.
  for (const name of [...headers.keys()]) {
    if (name.toLowerCase().startsWith("access-control-")) {
      headers.delete(name);
    }
  }

  headers.delete("Vary");

  const safeCorsHeaders = buildCorsHeaders(policy);

  for (const [name, value] of Object.entries(safeCorsHeaders)) {
    headers.set(name, value);
  }

  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const isPublicStream =
      url.pathname === "/api/stream";

    // Browser WebSocket handshakes must always include
    // an exact allowlisted Origin.
    const policy = checkRequestOrigin(
      request,
      env,
      {
        requireOrigin: isPublicStream
      }
    );

    if (!policy.ok) {
      return originSecurityError(policy);
    }

    // Handle preflight before calling the original Worker.
    if (request.method === "OPTIONS") {
      return securePreflight(request, policy);
    }

    // Reject unsupported methods at the security boundary.
    if (!ALLOWED_METHODS.has(request.method)) {
      return originSecurityError({
        ok: false,
        status: 405,
        error: "METHOD_NOT_ALLOWED",
        message: "This HTTP method is not supported."
      });
    }

    // The original Worker still performs its own
    // Bearer-token and one-time WebSocket-ticket checks.
    const response = await smartApiWorker.fetch(
      request,
      env,
      ctx
    );

    return applySecureCors(response, policy);
  }
};

// Cloudflare requires the Durable Object class to be
// exported from the configured Worker entry point.
export { AngelOneSmartApiSession };
