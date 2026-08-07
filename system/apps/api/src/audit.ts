import type { FastifyInstance } from "fastify";
import { requirePasswordChanged } from "./auth.js";
import { pool, type DatabaseClient, type DatabasePool } from "./db.js";

interface AuditInput {
  organizationId: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  outcome: "allowed" | "denied" | "failed";
  requestId?: string | null;
  ipAddress?: string | null;
  detail?: Record<string, unknown>;
}

export async function writeAudit(client: DatabaseClient | DatabasePool, input: AuditInput): Promise<void> {
  await client.query(
    `INSERT INTO audit_events
      (organization_id, actor_user_id, action, entity_type, entity_id, outcome, request_id, ip_address, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.organizationId,
      input.actorUserId ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.outcome,
      input.requestId ?? null,
      input.ipAddress ?? null,
      input.detail ?? {},
    ],
  );
}

export async function registerAuditRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/admin/audit-events", async (request) => {
    const user = requirePasswordChanged(request);
    if (user.role !== "system_admin") {
      const error = new Error("Forbidden") as Error & { statusCode: number };
      error.statusCode = 403;
      throw error;
    }
    const result = await pool.query(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.outcome, a.detail, a.occurred_at,
              u.display_name AS actor_name, u.username AS actor_username
         FROM audit_events a
         LEFT JOIN users u ON u.id = a.actor_user_id
        WHERE a.organization_id = $1
        ORDER BY a.occurred_at DESC, a.id DESC
        LIMIT 200`,
      [user.organizationId],
    );
    return { auditEvents: result.rows };
  });
}
