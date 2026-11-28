
// BADAL SEVERIYA
// Angel One Dashboard Authentication Module
// Version: 1.1
//
// SECURITY:
// - Dashboard password stays on Cloudflare Worker.
// - Temporary random session tokens only.
// - No localStorage/sessionStorage.
// - No cookies.
// - Session expiry is enforced by DashboardAuthStore.
// - Rate limiting is enforced by DashboardAuthStore.
// - Auth Store uses AUTH_STORE binding (separate from Angel One feed).
// - Does not authenticate Angel One directly.
// - No trading or order functionality.

const AUTH_VERSION = "1.1";

const SESSION_TTL_MS = 20 * 60 * 1000;

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

async function callAuthStore(env, path, body) {
  if (!env?.AUTH_STORE) {
    throw new Error("AUTH_STORE_BINDING_UNAVAILABLE");
  }

  const id = env.AUTH_STORE.idFromName("dashboard-auth-primary");
  const stub = env.AUTH_STORE.get(id);

  return stub.fetch(
    `https://dashboard-auth.internal${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify(body || {})
    }
  );
}

async function getClientRateKey(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";

  // Hash IP before sending it to Auth Store.
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
    rateResponse = await callAuthStore(
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
      const failureResponse = await callAuthStore(
        env,
        "/internal/auth/rate-failure",
        {
          rateKey,
          config: RATE_LIMIT_CONFIG
        }
      );

      const failureData = await failureResponse.json().catch(() => null);

      if (!failureResponse.ok || failureData?.ok !== true) {
        // Deny login if failure recording is unavailable.
        return json({
          ok: false,
          error: "AUTH_RATE_LIMITER_UNAVAILABLE"
        }, 503);
      }
    } catch {
      return json({
        ok: false,
        error: "AUTH_RATE_LIMITER_UNAVAILABLE"
      }, 503);
    }

    return json({
      ok: false,
      error: "INVALID_LOGIN"
    }, 401);
  }

  // Clear failed attempts after a correct password.
  try {
    const clearResponse = await callAuthStore(
      env,
      "/internal/auth/rate-clear",
      {
        rateKey
      }
    );

    const clearData = await clearResponse.json().catch(() => null);

    if (!clearResponse.ok || clearData?.ok !== true) {
      return json({
        ok: false,
        error: "AUTH_RATE_LIMITER_UNAVAILABLE"
      }, 503);
    }
  } catch {
    return json({
      ok: false,
      error: "AUTH_RATE_LIMITER_UNAVAILABLE"
    }, 503);
  }

  const sessionToken = crypto.randomUUID();

  let sessionResponse;

  try {
    sessionResponse = await callAuthStore(
      env,
      "/internal/auth/session-create",
      {
        token: sessionToken
      }
    );
  } catch {
    return json({
      ok: false,
      error: "SESSION_CREATION_FAILED"
    }, 503);
  }

  const sessionData = await sessionResponse.json().catch(() => null);

  if (
    !sessionResponse.ok ||
    sessionData?.ok !== true ||
    typeof sessionData.expiresAt !== "string"
  ) {
    return json({
      ok: false,
      error: "SESSION_CREATION_FAILED"
    }, 503);
  }

  const expiryTimestamp = Date.parse(sessionData.expiresAt);

  if (!Number.isFinite(expiryTimestamp) || expiryTimestamp <= Date.now()) {
    // Revoke malformed or already-expired session data.
    try {
      await callAuthStore(
        env,
        "/internal/auth/session-revoke",
        {
          token: sessionToken
        }
      );
    } catch {
      // Do not return a session token to the client.
    }

    return json({
      ok: false,
      error: "SESSION_CREATION_FAILED"
    }, 503);
  }

  return json({
    ok: true,
    version: AUTH_VERSION,
    sessionToken,
    expiresAt: sessionData.expiresAt,
    expiresInSeconds: Math.max(
      1,
      Math.floor((expiryTimestamp - Date.now()) / 1000)
    )
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
    response = await callAuthStore(
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
    const response = await callAuthStore(
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
  requiresAuthStoreBinding: true,
  authStoreBindingName: "AUTH_STORE",
  passwordRequired: true
});
