
// BADAL SEVERIYA
// Dashboard Authentication Durable Object Store
// Version: 1.0
//
// SECURITY:
// - Separate from Angel One live-feed session storage.
// - Stores dashboard sessions server-side only.
// - Enforces five failed attempts in a 15-minute window.
// - Lockout lasts 15 minutes.
// - Sessions expire after 20 minutes.
// - Invalid or unavailable storage must fail closed.
// - No trading or order-related functionality.

const AUTH_STORE_VERSION = "1.0";

const MAX_ATTEMPTS = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 20 * 60 * 1000;

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff"
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS
  });
}

async function readJson(request) {
  try {
    const body = await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return null;
    }

    return body;
  } catch {
    return null;
  }
}

function validRateKey(value) {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{64}$/.test(value)
  );
}

function validToken(value) {
  return (
    typeof value === "string" &&
    value.length >= 20 &&
    value.length <= 100 &&
    /^[a-zA-Z0-9-]+$/.test(value)
  );
}

export class DashboardAuthStore {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method !== "POST") {
      return jsonResponse({
        ok: false,
        error: "METHOD_NOT_ALLOWED"
      }, 405);
    }

    const body = await readJson(request);

    if (!body) {
      return jsonResponse({
        ok: false,
        error: "INVALID_JSON"
      }, 400);
    }

    try {
      if (path === "/internal/auth/rate-check") {
        return await this.rateCheck(body);
      }

      if (path === "/internal/auth/rate-failure") {
        return await this.rateFailure(body);
      }

      if (path === "/internal/auth/rate-clear") {
        return await this.rateClear(body);
      }

      if (path === "/internal/auth/session-create") {
        return await this.sessionCreate(body);
      }

      if (path === "/internal/auth/session-validate") {
        return await this.sessionValidate(body);
      }

      if (path === "/internal/auth/session-revoke") {
        return await this.sessionRevoke(body);
      }

      return jsonResponse({
        ok: false,
        error: "AUTH_STORE_ROUTE_NOT_FOUND"
      }, 404);
    } catch (error) {
      console.error(
        "Dashboard Auth Store error:",
        error?.message || error
      );

      return jsonResponse({
        ok: false,
        error: "AUTH_STORE_INTERNAL_ERROR"
      }, 500);
    }
  }

  async rateCheck(body) {
    if (!validRateKey(body.rateKey)) {
      return jsonResponse({
        ok: false,
        error: "INVALID_RATE_KEY"
      }, 400);
    }

    const key = `auth-rate:${body.rateKey}`;
    const now = Date.now();

    return this.ctx.storage.transaction(async tx => {
      const record = await tx.get(key);

      if (!record) {
        return jsonResponse({
          ok: true,
          allowed: true,
          retryAfterSeconds: 0,
          remainingAttempts: MAX_ATTEMPTS
        });
      }

      if (
        record.lockUntil &&
        record.lockUntil > now
      ) {
        return jsonResponse({
          ok: true,
          allowed: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((record.lockUntil - now) / 1000)
          ),
          remainingAttempts: 0
        });
      }

      if (
        !Number.isFinite(record.windowStart) ||
        now - record.windowStart >= RATE_WINDOW_MS
      ) {
        await tx.delete(key);

        return jsonResponse({
          ok: true,
          allowed: true,
          retryAfterSeconds: 0,
          remainingAttempts: MAX_ATTEMPTS
        });
      }

      const failures = Math.max(
        0,
        Number(record.failures) || 0
      );

      return jsonResponse({
        ok: true,
        allowed: failures < MAX_ATTEMPTS,
        retryAfterSeconds: 0,
        remainingAttempts: Math.max(
          0,
          MAX_ATTEMPTS - failures
        )
      });
    });
  }

  async rateFailure(body) {
    if (!validRateKey(body.rateKey)) {
      return jsonResponse({
        ok: false,
        error: "INVALID_RATE_KEY"
      }, 400);
    }

    const key = `auth-rate:${body.rateKey}`;
    const now = Date.now();

    return this.ctx.storage.transaction(async tx => {
      let record = await tx.get(key);

      if (
        !record ||
        !Number.isFinite(record.windowStart) ||
        now - record.windowStart >= RATE_WINDOW_MS ||
        (record.lockUntil && record.lockUntil <= now)
      ) {
        record = {
          failures: 0,
          windowStart: now,
          lockUntil: 0
        };
      }

      record.failures = Math.min(
        MAX_ATTEMPTS,
        (Number(record.failures) || 0) + 1
      );

      if (record.failures >= MAX_ATTEMPTS) {
        record.lockUntil = now + LOCKOUT_MS;
      }

      await tx.put(key, record);

      return jsonResponse({
        ok: true,
        failures: record.failures,
        locked: record.lockUntil > now,
        retryAfterSeconds: record.lockUntil > now
          ? Math.ceil((record.lockUntil - now) / 1000)
          : 0
      });
    });
  }

  async rateClear(body) {
    if (!validRateKey(body.rateKey)) {
      return jsonResponse({
        ok: false,
        error: "INVALID_RATE_KEY"
      }, 400);
    }

    const key = `auth-rate:${body.rateKey}`;

    await this.ctx.storage.delete(key);

    return jsonResponse({
      ok: true
    });
  }

  async sessionCreate(body) {
    if (!validToken(body.token)) {
      return jsonResponse({
        ok: false,
        error: "INVALID_SESSION_TOKEN"
      }, 400);
    }

    const now = Date.now();
    const token = body.token;
    const key = `auth-session:${token}`;

    // Server-side time is authoritative. Client timestamps are ignored.
    const session = {
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
      version: AUTH_STORE_VERSION
    };

    await this.ctx.storage.put(key, session);

    return jsonResponse({
      ok: true,
      expiresAt: new Date(session.expiresAt).toISOString()
    });
  }

  async sessionValidate(body) {
    if (!validToken(body.token)) {
      return jsonResponse({
        ok: true,
        valid: false
      });
    }

    const key = `auth-session:${body.token}`;
    const now = Date.now();

    return this.ctx.storage.transaction(async tx => {
      const session = await tx.get(key);

      if (
        !session ||
        !Number.isFinite(session.expiresAt) ||
        session.expiresAt <= now
      ) {
        if (session) {
          await tx.delete(key);
        }

        return jsonResponse({
          ok: true,
          valid: false
        });
      }

      return jsonResponse({
        ok: true,
        valid: true,
        expiresAt: new Date(session.expiresAt).toISOString()
      });
    });
  }

  async sessionRevoke(body) {
    if (!validToken(body.token)) {
      return jsonResponse({
        ok: true,
        revoked: false
      });
    }

    await this.ctx.storage.delete(
      `auth-session:${body.token}`
    );

    return jsonResponse({
      ok: true,
      revoked: true
    });
  }
}
