import type { FastifyInstance, FastifyRequest } from "fastify";
import { validatePassword } from "@isater/domain";
import { z } from "zod";
import { config } from "./config.js";
import { pool } from "./db.js";
import { hashPassword, hashSessionToken, newSessionToken, verifyPassword } from "./security.js";
import { writeAudit } from "./audit.js";
import type { AuthenticatedUser } from "./types.js";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(1024),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(1).max(1024),
});

function publicUser(row: Record<string, unknown>): AuthenticatedUser {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    username: String(row.username),
    displayName: String(row.display_name),
    email: row.email ? String(row.email) : null,
    role: row.role as AuthenticatedUser["role"],
    locale: row.locale as AuthenticatedUser["locale"],
    mustChangePassword: Boolean(row.must_change_password),
  };
}

async function securityEvent(
  username: string,
  outcome: "allowed" | "denied" | "failed",
  ipAddress: string,
  detail: Record<string, unknown>,
): Promise<void> {
  await pool.query(
    `INSERT INTO security_events (username_attempted, event_type, outcome, ip_address, detail)
     VALUES ($1, 'login', $2, $3, $4)`,
    [username, outcome, ipAddress, detail],
  );
}

export async function loadSession(request: FastifyRequest): Promise<void> {
  request.currentUser = null;
  request.sessionId = null;
  const token = request.cookies[config.SESSION_COOKIE_NAME];
  if (!token) return;

  const tokenHash = hashSessionToken(token);
  const result = await pool.query(
    `SELECT s.id AS session_id, s.last_seen_at, s.expires_at,
            u.id, u.organization_id, u.username, u.display_name, u.email,
            u.role, u.locale, u.must_change_password, u.status
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.status IN ('active', 'invited')`,
    [tokenHash],
  );
  const row = result.rows[0];
  if (!row) return;

  request.currentUser = publicUser(row);
  request.sessionId = row.session_id;
  await pool.query(
    `UPDATE sessions
        SET last_seen_at = now(),
            expires_at = now() + ($2::text || ' minutes')::interval
      WHERE id = $1`,
    [row.session_id, config.SESSION_IDLE_MINUTES],
  );
}

export function requireUser(request: FastifyRequest): AuthenticatedUser {
  if (!request.currentUser) {
    const error = new Error("Authentication required") as Error & { statusCode: number };
    error.statusCode = 401;
    throw error;
  }
  return request.currentUser;
}

export function requirePasswordChanged(request: FastifyRequest): AuthenticatedUser {
  const user = requireUser(request);
  if (user.mustChangePassword) {
    const error = new Error("password_change_required") as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }
  return user;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT * FROM users WHERE lower(username) = lower($1) FOR UPDATE`,
        [input.username],
      );
      const row = result.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        await securityEvent(input.username, "denied", request.ip, { reason: "unknown_username" });
        return reply.code(401).send({ error: "invalid_credentials" });
      }

      const isLocked = row.locked_until && new Date(row.locked_until).getTime() > Date.now();
      if (row.status === "disabled" || isLocked) {
        await writeAudit(client, {
          organizationId: row.organization_id,
          actorUserId: row.id,
          action: "auth.login",
          entityType: "user",
          entityId: row.id,
          outcome: "denied",
          requestId: request.id,
          ipAddress: request.ip,
          detail: { reason: row.status === "disabled" ? "disabled" : "locked" },
        });
        await client.query("COMMIT");
        return reply.code(423).send({ error: "account_unavailable" });
      }

      const passwordMatches = await verifyPassword(row.password_hash, input.password);
      if (!passwordMatches) {
        const failures = Number(row.failed_login_count) + 1;
        const shouldLock = failures >= config.LOGIN_MAX_FAILURES;
        await client.query(
          `UPDATE users
              SET failed_login_count = $2,
                  locked_until = CASE WHEN $3 THEN now() + ($4::text || ' minutes')::interval ELSE locked_until END,
                  status = CASE WHEN $3 THEN 'locked'::user_status ELSE status END,
                  updated_at = now()
            WHERE id = $1`,
          [row.id, failures, shouldLock, config.LOGIN_LOCK_MINUTES],
        );
        await writeAudit(client, {
          organizationId: row.organization_id,
          actorUserId: row.id,
          action: "auth.login",
          entityType: "user",
          entityId: row.id,
          outcome: "denied",
          requestId: request.id,
          ipAddress: request.ip,
          detail: { reason: "password_mismatch", failures, locked: shouldLock },
        });
        await client.query("COMMIT");
        return reply.code(401).send({ error: "invalid_credentials" });
      }

      const token = newSessionToken();
      const tokenHash = hashSessionToken(token);
      const sessionResult = await client.query(
        `INSERT INTO sessions
          (user_id, token_hash, expires_at, ip_address, user_agent)
         VALUES ($1, $2, now() + ($3::text || ' minutes')::interval, $4, $5)
         RETURNING id`,
        [row.id, tokenHash, config.SESSION_IDLE_MINUTES, request.ip, request.headers["user-agent"] ?? null],
      );
      await client.query(
        `UPDATE users
            SET failed_login_count = 0,
                locked_until = NULL,
                status = 'active',
                last_login_at = now(),
                updated_at = now()
          WHERE id = $1`,
        [row.id],
      );
      await writeAudit(client, {
        organizationId: row.organization_id,
        actorUserId: row.id,
        action: "auth.login",
        entityType: "session",
        entityId: sessionResult.rows[0].id,
        outcome: "allowed",
        requestId: request.id,
        ipAddress: request.ip,
      });
      await client.query("COMMIT");

      reply.setCookie(config.SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: config.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: config.SESSION_IDLE_MINUTES * 60,
      });
      return { user: publicUser(row) };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/api/auth/me", async (request) => ({ user: requireUser(request) }));

  app.post("/api/auth/logout", async (request, reply) => {
    const user = requireUser(request);
    if (request.sessionId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("UPDATE sessions SET revoked_at = now() WHERE id = $1", [request.sessionId]);
        await writeAudit(client, {
          organizationId: user.organizationId,
          actorUserId: user.id,
          action: "auth.logout",
          entityType: "session",
          entityId: request.sessionId,
          outcome: "allowed",
          requestId: request.id,
          ipAddress: request.ip,
        });
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
    reply.clearCookie(config.SESSION_COOKIE_NAME, { path: "/" });
    return { ok: true };
  });

  app.post("/api/auth/change-password", async (request, reply) => {
    const user = requireUser(request);
    const input = changePasswordSchema.parse(request.body);
    const policy = validatePassword(input.newPassword);
    if (!policy.valid) return reply.code(400).send({ ok: false, error: "password_policy", reasons: policy.reasons });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query("SELECT password_hash FROM users WHERE id = $1 FOR UPDATE", [user.id]);
      if (!await verifyPassword(result.rows[0].password_hash, input.currentPassword)) {
        await writeAudit(client, {
          organizationId: user.organizationId,
          actorUserId: user.id,
          action: "auth.change_password",
          entityType: "user",
          entityId: user.id,
          outcome: "denied",
          requestId: request.id,
          ipAddress: request.ip,
          detail: { reason: "current_password_mismatch" },
        });
        await client.query("COMMIT");
        return reply.code(401).send({ ok: false, error: "current_password_mismatch" });
      }
      const passwordHash = await hashPassword(input.newPassword);
      await client.query(
        `UPDATE users
            SET password_hash = $2, must_change_password = false,
                password_changed_at = now(), updated_at = now()
          WHERE id = $1`,
        [user.id, passwordHash],
      );
      await client.query("UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND id <> $2", [user.id, request.sessionId]);
      await writeAudit(client, {
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: "auth.change_password",
        entityType: "user",
        entityId: user.id,
        outcome: "allowed",
        requestId: request.id,
        ipAddress: request.ip,
      });
      await client.query("COMMIT");
      return reply.send({ ok: true });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}
