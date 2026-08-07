import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  assertDifferentReviewer,
  committeeVoteOutcome,
  hasPermission,
  transitionAnnualCycle,
  type AnnualCycleAction,
  type AnnualCycleStep,
  type Role,
} from "@isater/domain";
import { z } from "zod";
import { requireUser } from "./auth.js";
import { writeAudit } from "./audit.js";
import { pool } from "./db.js";

const createAnnualCycleSchema = z.object({
  businessYear: z.number().int().min(2000).max(2200),
});

const annualActionSchema = z.object({
  action: z.enum([
    "accept_annual_data",
    "approve_target_return",
    "complete_sleeve_targets",
    "submit_proposed_portfolio",
    "record_backtest_pass",
    "record_backtest_fail",
    "accept_optimization",
    "approve_portfolio",
    "reject_portfolio",
    "confirm_implementation",
    "open_non_equity_nav",
    "approve_non_equity_nav",
    "publish_report",
    "close_cycle",
  ]),
  payload: z.record(z.unknown()).default({}),
});

const voteSchema = z.object({
  decision: z.enum(["approve", "reject", "abstain"]),
});

const executionActionSchema = z.object({
  actionType: z.string().trim().min(1).max(120),
  payload: z.record(z.unknown()),
});

const reviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
});

const committeeActions = new Set<AnnualCycleAction>([
  "accept_annual_data",
  "approve_target_return",
  "approve_portfolio",
  "reject_portfolio",
  "approve_non_equity_nav",
  "close_cycle",
]);

function forbidden(message = "Forbidden") {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 403;
  return error;
}

function invalidState(message: string) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 409;
  return error;
}

function jsonValue<T>(value: T | string): T {
  return typeof value === "string" ? JSON.parse(value) as T : value;
}

function requireCommittee(request: FastifyRequest) {
  const user = requireUser(request);
  if (user.role !== "decision_committee") throw forbidden();
  return user;
}

function requireExecution(request: FastifyRequest) {
  const user = requireUser(request);
  if (user.role !== "execution_team") throw forbidden();
  return user;
}

export async function registerWorkflowRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/workflows/annual", async (request, reply) => {
    const user = requireCommittee(request);
    if (!hasPermission(user.role, "annual_data:run")) throw forbidden();
    const input = createAnnualCycleSchema.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const portfolio = await client.query(
        `SELECT id, initial_principal FROM portfolios
          WHERE organization_id = $1 AND is_active = true
          ORDER BY created_at LIMIT 1`,
        [user.organizationId],
      );
      if (!portfolio.rows[0]) throw invalidState("No active portfolio exists");
      if (portfolio.rows[0].initial_principal == null) throw invalidState("Portfolio principal must be effective before the annual cycle starts");
      const parameterSet = await client.query(
        `SELECT id FROM parameter_sets
          WHERE organization_id = $1 AND status = 'effective' LIMIT 1`,
        [user.organizationId],
      );
      if (!parameterSet.rows[0]) throw invalidState("Business parameters must be effective before the annual cycle starts");
      const active = await client.query(
        `SELECT id FROM workflow_cases
          WHERE portfolio_id = $1 AND workflow_type = 'annual_cycle' AND status = 'active'`,
        [portfolio.rows[0].id],
      );
      if (active.rows[0]) throw invalidState("An annual cycle is already active");
      const result = await client.query(
        `INSERT INTO workflow_cases
          (organization_id, portfolio_id, workflow_type, business_year, status, current_step, created_by)
         VALUES ($1, $2, 'annual_cycle', $3, 'active', 'annual_data', $4)
         RETURNING *`,
        [user.organizationId, portfolio.rows[0].id, input.businessYear, user.id],
      );
      await writeAudit(client, {
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: "workflow.annual.create",
        entityType: "workflow_case",
        entityId: result.rows[0].id,
        outcome: "allowed",
        requestId: request.id,
        ipAddress: request.ip,
        detail: { businessYear: input.businessYear },
      });
      await client.query("COMMIT");
      return reply.code(201).send({ workflow: result.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/api/workflows/annual/active", async (request) => {
    const user = requireUser(request);
    const result = await pool.query(
      `SELECT w.*, p.code AS portfolio_code, p.name AS portfolio_name, p.base_currency
         FROM workflow_cases w
         JOIN portfolios p ON p.id = w.portfolio_id
        WHERE w.organization_id = $1
          AND w.workflow_type = 'annual_cycle'
          AND w.status = 'active'
        ORDER BY w.business_year DESC, w.created_at DESC
        LIMIT 1`,
      [user.organizationId],
    );
    return { workflow: result.rows[0] ?? null };
  });

  app.get("/api/workflows/:workflowId/approval-rounds/open", async (request) => {
    const user = requireUser(request);
    const { workflowId } = request.params as { workflowId: string };
    const result = await pool.query(
      `SELECT r.* FROM approval_rounds r
        JOIN workflow_cases w ON w.id = r.workflow_case_id
       WHERE r.workflow_case_id = $1 AND w.organization_id = $2 AND r.status = 'open'
       ORDER BY r.opened_at DESC LIMIT 1`,
      [workflowId, user.organizationId],
    );
    return { approvalRound: result.rows[0] ?? null };
  });

  app.get("/api/workflows/:workflowId/implementation/context", async (request) => {
    const user = requireUser(request);
    const { workflowId } = request.params as { workflowId: string };
    const portfolio = await pool.query(
      `SELECT pp.id, pp.version, pp.created_by, p.initial_principal, p.base_currency, s.targets,
              COALESCE(json_agg(h ORDER BY h.sleeve, h.style, h.ticker)
                FILTER (WHERE h.id IS NOT NULL), '[]') AS holdings
         FROM proposed_portfolio_versions pp
         JOIN workflow_cases w ON w.id = pp.workflow_case_id
         JOIN portfolios p ON p.id = w.portfolio_id
         JOIN sleeve_target_versions s ON s.id = pp.sleeve_target_version_id
         LEFT JOIN proposed_holdings h ON h.proposed_portfolio_version_id = pp.id
        WHERE pp.workflow_case_id = $1 AND w.organization_id = $2 AND pp.status = 'approved'
        GROUP BY pp.id, p.initial_principal, p.base_currency, s.targets
        ORDER BY pp.version DESC LIMIT 1`,
      [workflowId, user.organizationId],
    );
    if (!portfolio.rows[0]) throw invalidState("Approved portfolio not found");
    const targets = jsonValue<{ equityTargets: Array<{ key: string; weight: number }> }>(portfolio.rows[0].targets);
    const holdings = jsonValue<Array<Record<string, any>>>(portfolio.rows[0].holdings);
    const principal = Number(portfolio.rows[0].initial_principal);
    const orders = holdings.map((holding) => {
      const sleeveTarget = targets.equityTargets.find((target) => target.key === holding.sleeve);
      if (!sleeveTarget) throw invalidState(`Sleeve target missing for ${holding.sleeve}`);
      const portfolioWeight = Number(sleeveTarget.weight) * Number(holding.weight);
      return {
        ticker: holding.ticker, exchangeCode: holding.exchange_code, market: holding.market, sleeve: holding.sleeve,
        style: holding.style, side: "BUY", sleeveWeight: Number(holding.weight), portfolioWeight,
        targetValue: principal * portfolioWeight, currency: portfolio.rows[0].base_currency,
      };
    });
    const action = await pool.query(
      `SELECT a.*, submitter.display_name AS submitted_by_name, reviewer.display_name AS reviewed_by_name
         FROM maker_checker_actions a
         JOIN users submitter ON submitter.id = a.submitted_by
         LEFT JOIN users reviewer ON reviewer.id = a.reviewed_by
        WHERE a.workflow_case_id = $1 AND a.action_type = 'confirm_implementation'
        ORDER BY a.submitted_at DESC LIMIT 1`, [workflowId],
    );
    return {
      approvedPortfolio: { id: portfolio.rows[0].id, version: portfolio.rows[0].version, principal, currency: portfolio.rows[0].base_currency },
      orders, executionAction: action.rows[0] ?? null,
    };
  });

  app.post("/api/workflows/:workflowId/actions", async (request) => {
    const user = requireUser(request);
    const input = annualActionSchema.parse(request.body);
    if (committeeActions.has(input.action)) {
      throw invalidState("Committee actions must be completed through a vote");
    }
    if (input.action === "confirm_implementation") {
      throw invalidState("Implementation confirmation requires maker-checker review");
    }
    const { workflowId } = request.params as { workflowId: string };
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT * FROM workflow_cases
          WHERE id = $1 AND organization_id = $2 AND status = 'active'
          FOR UPDATE`,
        [workflowId, user.organizationId],
      );
      const workflow = current.rows[0];
      if (!workflow) throw invalidState("Active workflow not found");
      const transition = transitionAnnualCycle(workflow.current_step as AnnualCycleStep, input.action, user.role);
      if (!transition.allowed) throw forbidden(`Action not allowed: ${transition.reason}`);
      if (input.action === "publish_report") {
        const reportVersionId = input.payload.reportVersionId;
        if (typeof reportVersionId !== "string") throw invalidState("The report version is required");
        const report = await client.query(
          `SELECT id FROM report_versions WHERE id = $1 AND workflow_case_id = $2 AND status = 'draft'`,
          [reportVersionId, workflowId],
        );
        if (!report.rows[0]) throw invalidState("A draft report is required for publication");
        await client.query(`UPDATE report_versions SET status = 'published', published_at = now() WHERE id = $1`, [reportVersionId]);
      }
      const result = await client.query(
        `UPDATE workflow_cases
            SET current_step = $2,
                version = version + 1,
                payload = payload || $3::jsonb,
                updated_at = now()
          WHERE id = $1
          RETURNING *`,
        [workflowId, transition.nextStep, JSON.stringify(input.payload)],
      );
      await writeAudit(client, {
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: `workflow.${input.action}`,
        entityType: "workflow_case",
        entityId: workflowId,
        outcome: "allowed",
        requestId: request.id,
        ipAddress: request.ip,
        detail: { from: workflow.current_step, to: transition.nextStep, version: result.rows[0].version },
      });
      await client.query("COMMIT");
      return { workflow: result.rows[0] };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.post("/api/workflows/:workflowId/approval-rounds", async (request, reply) => {
    const user = requireUser(request);
    const input = annualActionSchema.parse(request.body);
    if (!committeeActions.has(input.action)) throw invalidState("This action does not require a committee vote");
    if (input.action === "approve_portfolio") {
      if (user.role !== "execution_team" || !hasPermission(user.role, "portfolio:submit")) throw forbidden();
    } else if (input.action === "approve_non_equity_nav") {
      if (user.role !== "execution_team" || !hasPermission(user.role, "non_equity_nav:submit")) throw forbidden();
    } else if (user.role !== "decision_committee") {
      throw forbidden();
    }
    const { workflowId } = request.params as { workflowId: string };
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT * FROM workflow_cases
          WHERE id = $1 AND organization_id = $2 AND status = 'active'
          FOR UPDATE`,
        [workflowId, user.organizationId],
      );
      const workflow = current.rows[0];
      if (!workflow) throw invalidState("Active workflow not found");
      const transition = transitionAnnualCycle(workflow.current_step as AnnualCycleStep, input.action, "decision_committee");
      if (!transition.allowed) throw invalidState(`Vote cannot open: ${transition.reason}`);
      if (input.action === "accept_annual_data") {
        const packageId = input.payload.annualDataPackageId;
        if (typeof packageId !== "string") throw invalidState("The annual data package is required");
        const packageResult = await client.query(
          `SELECT id FROM annual_data_packages
            WHERE id = $1 AND workflow_case_id = $2 AND accepted_at IS NULL`,
          [packageId, workflowId],
        );
        if (!packageResult.rows[0]) throw invalidState("The annual data package is not available for approval");
      }
      if (input.action === "approve_target_return") {
        const targetReturnVersionId = input.payload.targetReturnVersionId;
        if (typeof targetReturnVersionId !== "string") throw invalidState("The target-return version is required");
        const targetResult = await client.query(
          `SELECT id FROM target_return_versions
            WHERE id = $1 AND workflow_case_id = $2 AND approved_at IS NULL`,
          [targetReturnVersionId, workflowId],
        );
        if (!targetResult.rows[0]) throw invalidState("The target-return version is not available for approval");
      }
      if (input.action === "approve_portfolio") {
        const proposedPortfolioVersionId = input.payload.proposedPortfolioVersionId;
        if (typeof proposedPortfolioVersionId !== "string") throw invalidState("The proposed portfolio version is required");
        const portfolioResult = await client.query(
          `SELECT p.id FROM proposed_portfolio_versions p
            JOIN backtest_runs b ON b.proposed_portfolio_version_id = p.id
           WHERE p.id = $1 AND p.workflow_case_id = $2 AND p.status = 'backtest_passed' AND b.hard_control_pass = true`,
          [proposedPortfolioVersionId, workflowId],
        );
        if (!portfolioResult.rows[0]) throw invalidState("A backtest-passed portfolio is required for approval");
      }
      if (input.action === "approve_non_equity_nav") {
        const nonEquityNavVersionId = input.payload.nonEquityNavVersionId;
        if (typeof nonEquityNavVersionId !== "string") throw invalidState("The non-equity NAV version is required");
        const navResult = await client.query(
          `SELECT id FROM non_equity_nav_versions
            WHERE id = $1 AND workflow_case_id = $2 AND status = 'submitted'`,
          [nonEquityNavVersionId, workflowId],
        );
        if (!navResult.rows[0]) throw invalidState("A submitted non-equity NAV version is required for approval");
      }
      const round = await client.query(
        `INSERT INTO approval_rounds
          (workflow_case_id, workflow_version, required_role, proposed_action, proposal, opened_by, status)
         VALUES ($1, $2, 'decision_committee', $3, $4, $5, 'open')
         RETURNING *`,
        [workflowId, workflow.version, input.action, input.payload, user.id],
      );
      await writeAudit(client, {
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: "approval.open",
        entityType: "approval_round",
        entityId: round.rows[0].id,
        outcome: "allowed",
        requestId: request.id,
        ipAddress: request.ip,
        detail: { proposedAction: input.action, workflowVersion: workflow.version },
      });
      await client.query("COMMIT");
      return reply.code(201).send({ approvalRound: round.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.post("/api/approval-rounds/:roundId/votes", async (request) => {
    const user = requireCommittee(request);
    const input = voteSchema.parse(request.body);
    const { roundId } = request.params as { roundId: string };
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const roundResult = await client.query(
        `SELECT r.*, w.organization_id, w.current_step, w.version AS current_workflow_version
           FROM approval_rounds r
           JOIN workflow_cases w ON w.id = r.workflow_case_id
          WHERE r.id = $1 AND w.organization_id = $2
          FOR UPDATE OF r, w`,
        [roundId, user.organizationId],
      );
      const round = roundResult.rows[0];
      if (!round || round.status !== "open") throw invalidState("Open approval round not found");
      if (Number(round.workflow_version) !== Number(round.current_workflow_version)) {
        throw invalidState("Workflow changed after this approval round opened");
      }
      await client.query(
        `INSERT INTO approval_votes (approval_round_id, voter_id, decision)
         VALUES ($1, $2, $3)
         ON CONFLICT (approval_round_id, voter_id)
         DO UPDATE SET decision = excluded.decision, decided_at = now()`,
        [roundId, user.id, input.decision],
      );
      const eligible = await client.query(
        `SELECT count(*)::int AS count FROM users
          WHERE organization_id = $1 AND role = 'decision_committee' AND status = 'active'`,
        [user.organizationId],
      );
      const votes = await client.query(
        `SELECT
           count(*) FILTER (WHERE decision = 'approve')::int AS approvals,
           count(*) FILTER (WHERE decision = 'reject')::int AS rejections,
           count(*) FILTER (WHERE decision = 'abstain')::int AS abstentions
         FROM approval_votes WHERE approval_round_id = $1`,
        [roundId],
      );
      const summary = {
        eligibleVoters: eligible.rows[0].count,
        approvals: votes.rows[0].approvals,
        rejections: votes.rows[0].rejections,
        abstentions: votes.rows[0].abstentions,
      };
      const outcome = committeeVoteOutcome(summary);
      let workflow = null;
      if (outcome !== "open") {
        await client.query(
          "UPDATE approval_rounds SET status = $2, closed_at = now() WHERE id = $1",
          [roundId, outcome],
        );
        if (outcome === "approved") {
          const transition = transitionAnnualCycle(
            round.current_step as AnnualCycleStep,
            round.proposed_action as AnnualCycleAction,
            user.role,
          );
          if (!transition.allowed) throw invalidState("Approved action is no longer valid");
          const changed = await client.query(
            `UPDATE workflow_cases
                SET current_step = $2,
                    version = version + 1,
                    payload = payload || $3::jsonb,
                    status = CASE WHEN $2 = 'closed' THEN 'closed' ELSE status END,
                    closed_at = CASE WHEN $2 = 'closed' THEN now() ELSE closed_at END,
                    updated_at = now()
              WHERE id = $1
              RETURNING *`,
            [round.workflow_case_id, transition.nextStep, round.proposal],
          );
          workflow = changed.rows[0];
          if (round.proposed_action === "accept_annual_data") {
            const proposal = jsonValue<Record<string, unknown>>(round.proposal);
            if (typeof proposal.annualDataPackageId !== "string") throw invalidState("Approved annual data package identifier is missing");
            await client.query(
              `UPDATE annual_data_packages SET accepted_at = now()
                WHERE id = $1 AND workflow_case_id = $2`,
              [proposal.annualDataPackageId, round.workflow_case_id],
            );
          }
          if (round.proposed_action === "approve_target_return") {
            const proposal = jsonValue<Record<string, unknown>>(round.proposal);
            if (typeof proposal.targetReturnVersionId !== "string") throw invalidState("Approved target-return identifier is missing");
            await client.query(
              `UPDATE target_return_versions SET approved_at = now()
                WHERE id = $1 AND workflow_case_id = $2`,
              [proposal.targetReturnVersionId, round.workflow_case_id],
            );
          }
          if (round.proposed_action === "approve_portfolio") {
            const proposal = jsonValue<Record<string, unknown>>(round.proposal);
            if (typeof proposal.proposedPortfolioVersionId !== "string") throw invalidState("Approved portfolio identifier is missing");
            await client.query(
              `UPDATE proposed_portfolio_versions SET status = 'approved'
                WHERE id = $1 AND workflow_case_id = $2 AND status = 'backtest_passed'`,
              [proposal.proposedPortfolioVersionId, round.workflow_case_id],
            );
          }
          if (round.proposed_action === "approve_non_equity_nav") {
            const proposal = jsonValue<Record<string, unknown>>(round.proposal);
            if (typeof proposal.nonEquityNavVersionId !== "string") throw invalidState("Approved non-equity NAV identifier is missing");
            await client.query(
              `UPDATE non_equity_nav_versions SET status = 'approved', approved_at = now()
                WHERE id = $1 AND workflow_case_id = $2 AND status = 'submitted'`,
              [proposal.nonEquityNavVersionId, round.workflow_case_id],
            );
          }
        }
      }
      await writeAudit(client, {
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: "approval.vote",
        entityType: "approval_round",
        entityId: roundId,
        outcome: "allowed",
        requestId: request.id,
        ipAddress: request.ip,
        detail: { decision: input.decision, result: outcome, summary },
      });
      await client.query("COMMIT");
      return { result: outcome, summary, workflow };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.post("/api/workflows/:workflowId/execution-actions", async (request, reply) => {
    const user = requireExecution(request);
    const input = executionActionSchema.parse(request.body);
    const { workflowId } = request.params as { workflowId: string };
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const workflow = await client.query(
        "SELECT id, current_step FROM workflow_cases WHERE id = $1 AND organization_id = $2 AND status = 'active'",
        [workflowId, user.organizationId],
      );
      if (!workflow.rows[0]) throw invalidState("Active workflow not found");
      if (input.actionType === "confirm_implementation" && workflow.rows[0].current_step !== "implementation") {
        throw invalidState("Implementation is not the current workflow step");
      }
      if (input.actionType === "confirm_implementation") {
        const pending = await client.query(
          `SELECT id FROM maker_checker_actions WHERE workflow_case_id = $1
            AND action_type = 'confirm_implementation' AND status = 'pending_review'`, [workflowId],
        );
        if (pending.rows[0]) throw invalidState("An implementation plan is already awaiting review");
      }
      const result = await client.query(
        `INSERT INTO maker_checker_actions
          (workflow_case_id, action_type, submitted_by, status, payload)
         VALUES ($1, $2, $3, 'pending_review', $4)
         RETURNING *`,
        [workflowId, input.actionType, user.id, input.payload],
      );
      await writeAudit(client, {
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: "execution.submit",
        entityType: "maker_checker_action",
        entityId: result.rows[0].id,
        outcome: "allowed",
        requestId: request.id,
        ipAddress: request.ip,
        detail: { actionType: input.actionType },
      });
      await client.query("COMMIT");
      return reply.code(201).send({ executionAction: result.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.post("/api/execution-actions/:actionId/review", async (request) => {
    const user = requireExecution(request);
    const input = reviewSchema.parse(request.body);
    const { actionId } = request.params as { actionId: string };
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const actionResult = await client.query(
        `SELECT a.*, w.organization_id, w.current_step, w.version AS workflow_version
           FROM maker_checker_actions a
           JOIN workflow_cases w ON w.id = a.workflow_case_id
          WHERE a.id = $1 AND w.organization_id = $2
          FOR UPDATE OF a, w`,
        [actionId, user.organizationId],
      );
      const action = actionResult.rows[0];
      if (!action || action.status !== "pending_review") throw invalidState("Pending execution action not found");
      assertDifferentReviewer(action.submitted_by, user.id);
      const status = input.decision === "approve" ? "approved" : "rejected";
      const reviewed = await client.query(
        `UPDATE maker_checker_actions
            SET reviewed_by = $2, reviewed_at = now(), status = $3
          WHERE id = $1 RETURNING *`,
        [actionId, user.id, status],
      );
      let workflow = null;
      if (status === "approved" && action.action_type === "confirm_implementation") {
        const transition = transitionAnnualCycle(action.current_step as AnnualCycleStep, "confirm_implementation", user.role);
        if (!transition.allowed) throw invalidState("Implementation confirmation is not valid at the current step");
        const changed = await client.query(
          `UPDATE workflow_cases
              SET current_step = $2, version = version + 1, updated_at = now()
            WHERE id = $1 RETURNING *`,
          [action.workflow_case_id, transition.nextStep],
        );
        workflow = changed.rows[0];
      }
      await writeAudit(client, {
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: "execution.review",
        entityType: "maker_checker_action",
        entityId: actionId,
        outcome: "allowed",
        requestId: request.id,
        ipAddress: request.ip,
        detail: { decision: input.decision, submitter: action.submitted_by },
      });
      await client.query("COMMIT");
      return { executionAction: reviewed.rows[0], workflow };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}
