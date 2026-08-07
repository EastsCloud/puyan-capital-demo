import type { FastifyInstance, FastifyRequest } from "fastify";
import { hasPermission } from "@isater/domain";
import { z } from "zod";
import { writeAudit } from "./audit.js";
import { normalizedAnnualAllocation } from "./annual-policy.js";
import { requirePasswordChanged } from "./auth.js";
import { pool } from "./db.js";

const activateSchema = z.object({
  parameters: z.record(z.unknown()),
  changeSummary: z.string().trim().min(1).max(500),
});

function requireParameterAdmin(request: FastifyRequest) {
  const user = requirePasswordChanged(request);
  if (!hasPermission(user.role, "parameters:manage")) {
    const error = new Error("Forbidden") as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }
  return user;
}

export async function registerParameterRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/parameters/effective", async (request) => {
    const user = requirePasswordChanged(request);
    const effective = await pool.query(
      `SELECT id, version, parameters, effective_from, created_at, created_by
         FROM parameter_sets
        WHERE organization_id = $1 AND status = 'effective'
        LIMIT 1`,
      [user.organizationId],
    );
    if (effective.rows[0]) return {
      source: "organization",
      parameterSet: {
        ...effective.rows[0],
        parameters: normalizedAnnualAllocation(effective.rows[0].parameters),
      },
    };

    const defaults = await pool.query(
      `SELECT version, parameters, created_at FROM default_business_parameters
        ORDER BY version DESC LIMIT 1`,
    );
    return {
      source: "system_default",
      parameterSet: {
        ...defaults.rows[0],
        parameters: normalizedAnnualAllocation(defaults.rows[0].parameters),
      },
    };
  });

  app.post("/api/admin/parameters/activate", async (request, reply) => {
    const admin = requireParameterAdmin(request);
    const input = activateSchema.parse(request.body);
    const normalizedParameters = normalizedAnnualAllocation(input.parameters);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const nextVersion = await client.query(
        `SELECT COALESCE(max(version), 0)::int + 1 AS version
           FROM parameter_sets WHERE organization_id = $1`,
        [admin.organizationId],
      );
      await client.query(
        `UPDATE parameter_sets SET status = 'retired'
          WHERE organization_id = $1 AND status = 'effective'`,
        [admin.organizationId],
      );
      const result = await client.query(
        `INSERT INTO parameter_sets
          (organization_id, version, status, effective_from, parameters, created_by)
         VALUES ($1, $2, 'effective', now(), $3::jsonb, $4)
         RETURNING id, version, parameters, status, effective_from, created_at`,
        [admin.organizationId, nextVersion.rows[0].version, JSON.stringify(normalizedParameters), admin.id],
      );
      await writeAudit(client, {
        organizationId: admin.organizationId,
        actorUserId: admin.id,
        action: "parameters.activate",
        entityType: "parameter_set",
        entityId: result.rows[0].id,
        outcome: "allowed",
        requestId: request.id,
        ipAddress: request.ip,
        detail: { version: result.rows[0].version, changeSummary: input.changeSummary },
      });
      await client.query("COMMIT");
      return reply.code(201).send({ parameterSet: result.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}
