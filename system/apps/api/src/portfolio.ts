import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { writeAudit } from "./audit.js";
import { requirePasswordChanged } from "./auth.js";
import { pool } from "./db.js";

const principalSchema = z.object({
  amount: z.number().positive().max(1_000_000_000_000_000),
});

export async function registerPortfolioRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/portfolio/current", async (request) => {
    const user = requirePasswordChanged(request);
    const result = await pool.query(
      `SELECT id, code, name, base_currency, initial_principal,
              principal_effective_at, principal_set_by
         FROM portfolios
        WHERE organization_id = $1 AND is_active = true
        ORDER BY created_at LIMIT 1`,
      [user.organizationId],
    );
    return { portfolio: result.rows[0] ?? null };
  });

  app.post("/api/portfolio/current/principal", async (request, reply) => {
    const user = requirePasswordChanged(request);
    if (user.role !== "decision_committee") {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const input = principalSchema.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE portfolios
            SET initial_principal = $2,
                principal_effective_at = now(),
                principal_set_by = $3
          WHERE organization_id = $1 AND is_active = true
          RETURNING id, code, name, base_currency, initial_principal,
                    principal_effective_at, principal_set_by`,
        [user.organizationId, input.amount, user.id],
      );
      if (!result.rows[0]) {
        const error = new Error("active_portfolio_not_found") as Error & { statusCode: number };
        error.statusCode = 409;
        throw error;
      }
      await writeAudit(client, {
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: "portfolio.principal.activate",
        entityType: "portfolio",
        entityId: result.rows[0].id,
        outcome: "allowed",
        requestId: request.id,
        ipAddress: request.ip,
        detail: { amount: input.amount, currency: result.rows[0].base_currency },
      });
      await client.query("COMMIT");
      return { portfolio: result.rows[0] };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}
