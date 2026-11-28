
/**
 * BADAL SEVERIYA
 * Angel One Dashboard Authentication Module
 * Version: 1.0
 *
 * SECURITY:
 * - Dashboard password stays on Cloudflare Worker.
 * - Temporary random session tokens only.
 * - No localStorage/sessionStorage.
 * - Session expires automatically.
 * - Rate limiting is enforced by Durable Object.
 * - Login token is returned only after successful authentication.
 * - This module does not authenticate Angel One directly.
 */

const AUTH_VERSION = "1.0";

const SESSION_TTL_MS = 20 * 60 * 1000; // 20 minutes

const RATE_LIMIT_CONFIG = Object.freeze({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
  lockoutMs: 15 * 60 * 1000
});

const AUTH_HEADERS = Object.freeze({
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff"
});

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: AUTH_HEADERS
  });
}

function safeString(value) {
  return typeof value === "string" ? value : "";
}

function constantTimeEqual(a, b) {
  a = safeString(a);
  b = safeString(b);

  if (!a || !b || a.length !== b.length) {
    return false;
  }

  let mismatch = 0;

  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return mismatch === 0;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);

  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes
  );

  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function callAuthDO(env, path, body) {
  if (!env?.SMARTAPI_SESSION) {
    throw new Error("AUTH_DURABLE_OBJECT_UNAVAILABLE");
  }

  const id = env.SMARTAPI_SESSION.idFromName("primary");
  const stub = env.SMARTAPI_SESSION.get(id);

  return stub.fetch(
    `https://dashboard-auth.internal${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body || {})
    }
  );
}

async function getClientRateKey(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";

  // Hash the IP before sending it to Durable Object storage.
  return sha256(ip);
}

async function parseBody(request) {
  try {
    const body = await request.json();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return null;
    }

    return body;
  } catch {
    return null;
  }
}

/**
 * Authenticate Dashboard user.
 *
 * POST /api/auth/login
 * Body: { "password": "..." }
 *
 * Successful response:
 * {
 *   ok: true,
 *   sessionToken: "...",
 *   expiresAt: "...",
 *   expiresInSeconds: 1200
 * }
 */
export async function dashboardLogin(request, env) {
  if (request.method !== "POST") {
    return json({
      ok: false,
      error: "METHOD_NOT_ALLOWED"
    }, 405);
  }

  const configuredPassword = safeString(
    env?.DASHBOARD_ACCESS_PASSWORD
  );

  if (!configuredPassword) {
    return json({
      ok: false,
      error: "DASHBOARD_PASSWORD_NOT_CONFIGURED"
    }, 503);
  }

  const body = await parseBody(request);
  const suppliedPassword = safeString(body?.password);

  if (!suppliedPassword || suppliedPassword.length > 256) {
    return json({
      ok: false,
      error: "INVALID_LOGIN"
    }, 400);
  }

  const rateKey = await getClientRateKey(request);

  let rateResponse;

  try {
    rateResponse = await callAuthDO(
      env,
      "/internal/auth/rate-check",
      {
        rateKey,
        config: RATE_LIMIT_CONFIG
      }
    );
  } catch {
    return json({
      ok: false,
      error: "AUTH_RATE_LIMITER_UNAVAILABLE"
    }, 503);
  }

  const rateData = await rateResponse.json().catch(() => null);

  if (!rateResponse.ok || rateData?.ok !== true) {
    return json({
      ok: false,
      error: "AUTH_RATE_LIMITER_UNAVAILABLE"
    }, 503);
  }

  if (rateData.allowed !== true) {
    return json({
      ok: false,
      error: "LOGIN_RATE_LIMITED",
      retryAfterSeconds: Math.max(
        1,
        Number(rateData.retryAfterSeconds) || 60
      )
    }, 429);
  }

  if (!constantTimeEqual(suppliedPassword, configuredPassword)) {
    try {
      await callAuthDO(
        env,
        "/internal/auth/rate-failure",
        {
          rateKey,
          config: RATE_LIMIT_CONFIG
        }
      );
    } catch {
      // Fail closed: login still denied.
    }

    return json({
      ok: false,
      error: "INVALID_LOGIN"
    }, 401);
  }

  // Clear the failed-attempt counter after correct password.
  try {
    await callAuthDO(
      env,
      "/internal/auth/rate-clear",
      {
        rateKey
      }
    );
  } catch {
    return json({
      ok: false,
      error: "AUTH_RATE_LIMITER_UNAVAILABLE"
    }, 503);
  }

  const sessionToken = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  let sessionResponse;

  try {
    sessionResponse = await callAuthDO(
      env,
      "/internal/auth/session-create",
      {
        token: sessionToken,
        createdAt: now,
        expiresAt
      }
    );
  } catch {
    return json({
      ok: false,
      error: "SESSION_CREATION_FAILED"
    }, 503);
  }

  const sessionData = await sessionResponse.json().catch(() => null);

  if (!sessionResponse.ok || sessionData?.ok !== true) {
    return json({
      ok: false,
      error: "SESSION_CREATION_FAILED"
    }, 503);
  }

  return json({
    ok: true,
    version: AUTH_VERSION,
    sessionToken,
    expiresAt: new Date(expiresAt).toISOString(),
    expiresInSeconds: SESSION_TTL_MS / 1000
  });
}

/**
 * Validate a temporary dashboard token.
 *
 * Expected request header:
 * X-Dashboard-Session: <token>
 */
export async function validateDashboardSession(request, env) {
  const token = safeString(
    request.headers.get("X-Dashboard-Session")
  );

  if (!token || token.length > 100) {
    return {
      ok: false,
      status: 401,
      error: "DASHBOARD_SESSION_REQUIRED"
    };
  }

  let response;

  try {
    response = await callAuthDO(
      env,
      "/internal/auth/session-validate",
      {
        token,
        now: Date.now()
      }
    );
  } catch {
    return {
      ok: false,
      status: 503,
      error: "SESSION_VALIDATION_UNAVAILABLE"
    };
  }

  const data = await response.json().catch(() => null);

  if (!response.ok || data?.ok !== true) {
    return {
      ok: false,
      status: 503,
      error: "SESSION_VALIDATION_UNAVAILABLE"
    };
  }

  if (data.valid !== true) {
    return {
      ok: false,
      status: 401,
      error: "DASHBOARD_SESSION_INVALID"
    };
  }

  return {
    ok: true,
    expiresAt: data.expiresAt
  };
}

/**
 * Revoke dashboard session.
 *
 * POST /api/auth/logout
 * Header: X-Dashboard-Session
 */
export async function dashboardLogout(request, env) {
  if (request.method !== "POST") {
    return json({
      ok: false,
      error: "METHOD_NOT_ALLOWED"
    }, 405);
  }

  const token = safeString(
    request.headers.get("X-Dashboard-Session")
  );

  if (!token || token.length > 100) {
    return json({
      ok: true,
      status: "LOGGED_OUT"
    });
  }

  try {
    const response = await callAuthDO(
      env,
      "/internal/auth/session-revoke",
      {
        token
      }
    );

    const data = await response.json().catch(() => null);

    if (!response.ok || data?.ok !== true) {
      return json({
        ok: false,
        error: "SESSION_REVOCATION_FAILED"
      }, 503);
    }
  } catch {
    return json({
      ok: false,
      error: "SESSION_REVOCATION_FAILED"
    }, 503);
  }

  return json({
    ok: true,
    status: "LOGGED_OUT"
  });
}

export const ANGEL_ONE_DASHBOARD_AUTH_CONFIG = Object.freeze({
  version: AUTH_VERSION,
  sessionDurationMs: SESSION_TTL_MS,
  rateLimit: RATE_LIMIT_CONFIG,
  persistentBrowserSession: false,
  usesLocalStorage: false,
  usesSessionStorage: false,
  usesCookies: false,
  requiresDurableObject: true,
  passwordRequired: true
});
