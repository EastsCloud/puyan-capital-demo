import type { FastifyInstance, FastifyRequest } from "fastify";
import { hasPermission, validatePassword, type Role } from "@isater/domain";
import { z } from "zod";
import { writeAudit } from "./audit.js";
import { pool } from "./db.js";
import { requirePasswordChanged } from "./auth.js";
import { hashPassword } from "./security.js";

const createUserSchema = z.object({
  username: z.string().trim().min(3).max(120),
  displayName: z.string().trim().min(1).max(160),
  email: z.string().email().optional(),
  role: z.enum(["system_admin", "decision_committee", "execution_team"]),
  locale: z.enum(["zh-CN", "en"]).default("zh-CN"),
  temporaryPassword: z.string().max(1024),
});

const resetPasswordSchema = z.object({ temporaryPassword: z.string().max(1024) });

function requireAdmin(request: FastifyRequest) {
  const user = requirePasswordChanged(request);
  if (!hasPermission(user.role, "users:manage")) {
    const error = new Error("Forbidden") as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }
  return user;
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/admin/users", async (request) => {
    const admin = requireAdmin(request);
    const result = await pool.query(
      `SELECT id, username, display_name, email, role, status, locale,
              must_change_password, last_login_at, created_at
         FROM users WHERE organization_id = $1 ORDER BY created_at`,
      [admin.organizationId],
    );
    return { users: result.rows };
  });

  app.post("/api/admin/users", async (request, reply) => {
    const admin = requireAdmin(request);
    const input = createUserSchema.parse(request.body);
    const policy = validatePassword(input.temporaryPassword);
    if (!policy.valid) return reply.code(400).send({ error: "password_policy", reasons: policy.reasons });
    const passwordHash = await hashPassword(input.temporaryPassword);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO users
          (organization_id, username, display_name, email, role, locale, password_hash, status, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'invited', true)
         RETURNING id, username, display_name, email, role, status, locale, must_change_password, created_at`,
        [admin.organizationId, input.username, input.displayName, input.email ?? null, input.role as Role, input.locale, passwordHash],
      );
      await writeAudit(client, {
        organizationId: admin.organizationId,
        actorUserId: admin.id,
        action: "admin.user.create",
        entityType: "user",
        entityId: result.rows[0].id,
        outcome: "allowed",
        requestId: request.id,
        ipAddress: request.ip,
        detail: { role: input.role },
      });
      await client.query("COMMIT");
      return reply.code(201).send({ user: result.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.post("/api/admin/users/:userId/reset-password", async (request, reply) => {
    const admin = requireAdmin(request);
    const input = resetPasswordSchema.parse(request.body);
    const { userId } = request.params as { userId: string };
    if (userId === admin.id) return reply.code(409).send({ error: "administrator_cannot_reset_self" });
    const policy = validatePassword(input.temporaryPassword);
    if (!policy.valid) return reply.code(400).send({ error: "password_policy", reasons: policy.reasons });
    const passwordHash = await hashPassword(input.temporaryPassword);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const target = await client.query(
        "SELECT id, role FROM users WHERE id = $1 AND organization_id = $2 FOR UPDATE",
        [userId, admin.organizationId],
      );
      if (!target.rows[0]) return reply.code(404).send({ error: "user_not_found" });
      await client.query(
        `UPDATE users SET password_hash = $2, must_change_password = true, status = 'invited',
             failed_login_count = 0, locked_until = NULL, updated_at = now()
          WHERE id = $1`,
        [userId, passwordHash],
      );
      await client.query("UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
      await writeAudit(client, {
        organizationId: admin.organizationId, actorUserId: admin.id, action: "admin.user.reset_password",
        entityType: "user", entityId: userId, outcome: "allowed", requestId: request.id,
        ipAddress: request.ip, detail: { role: target.rows[0].role, sessionsRevoked: true },
      });
      await client.query("COMMIT");
      return { ok: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}
