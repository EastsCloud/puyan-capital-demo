import type { Permission, Role } from "./index.js";
import { hasPermission } from "./index.js";

export type AnnualCycleStep =
  | "annual_data"
  | "target_return"
  | "sleeve_targets"
  | "proposed_portfolio"
  | "backtest"
  | "optimization"
  | "portfolio_approval"
  | "implementation"
  | "monitoring"
  | "non_equity_nav"
  | "reporting"
  | "closed";

export type AnnualCycleAction =
  | "accept_annual_data"
  | "approve_target_return"
  | "complete_sleeve_targets"
  | "submit_proposed_portfolio"
  | "record_backtest_pass"
  | "record_backtest_fail"
  | "accept_optimization"
  | "approve_portfolio"
  | "reject_portfolio"
  | "confirm_implementation"
  | "open_non_equity_nav"
  | "approve_non_equity_nav"
  | "publish_report"
  | "close_cycle";

interface TransitionRule {
  from: AnnualCycleStep;
  action: AnnualCycleAction;
  permission: Permission;
  to: AnnualCycleStep;
}

const transitionRules: TransitionRule[] = [
  { from: "annual_data", action: "accept_annual_data", permission: "annual_data:accept", to: "target_return" },
  { from: "target_return", action: "approve_target_return", permission: "target:vote", to: "sleeve_targets" },
  { from: "sleeve_targets", action: "complete_sleeve_targets", permission: "portfolio:prepare", to: "proposed_portfolio" },
  { from: "proposed_portfolio", action: "submit_proposed_portfolio", permission: "portfolio:submit", to: "backtest" },
  { from: "backtest", action: "record_backtest_pass", permission: "backtest:run", to: "portfolio_approval" },
  { from: "backtest", action: "record_backtest_fail", permission: "backtest:run", to: "optimization" },
  { from: "optimization", action: "accept_optimization", permission: "optimization:run", to: "portfolio_approval" },
  { from: "portfolio_approval", action: "approve_portfolio", permission: "portfolio:vote", to: "implementation" },
  { from: "portfolio_approval", action: "reject_portfolio", permission: "portfolio:vote", to: "proposed_portfolio" },
  { from: "implementation", action: "confirm_implementation", permission: "trade:review", to: "monitoring" },
  { from: "monitoring", action: "open_non_equity_nav", permission: "non_equity_nav:submit", to: "non_equity_nav" },
  { from: "non_equity_nav", action: "approve_non_equity_nav", permission: "non_equity_nav:vote", to: "reporting" },
  { from: "reporting", action: "publish_report", permission: "report:distribute", to: "monitoring" },
  { from: "monitoring", action: "publish_report", permission: "report:distribute", to: "monitoring" },
  { from: "monitoring", action: "close_cycle", permission: "target:vote", to: "closed" },
];

export interface TransitionResult {
  allowed: boolean;
  nextStep: AnnualCycleStep;
  reason?: "invalid_transition" | "insufficient_permission";
  requiredPermission?: Permission;
}

export function transitionAnnualCycle(
  currentStep: AnnualCycleStep,
  action: AnnualCycleAction,
  role: Role,
): TransitionResult {
  const rule = transitionRules.find((candidate) => candidate.from === currentStep && candidate.action === action);
  if (!rule) return { allowed: false, nextStep: currentStep, reason: "invalid_transition" };
  if (!hasPermission(role, rule.permission)) {
    return {
      allowed: false,
      nextStep: currentStep,
      reason: "insufficient_permission",
      requiredPermission: rule.permission,
    };
  }
  return { allowed: true, nextStep: rule.to, requiredPermission: rule.permission };
}

export function stepOwner(step: AnnualCycleStep): Role | "shared" {
  const owners: Record<AnnualCycleStep, Role | "shared"> = {
    annual_data: "decision_committee",
    target_return: "decision_committee",
    sleeve_targets: "execution_team",
    proposed_portfolio: "execution_team",
    backtest: "execution_team",
    optimization: "execution_team",
    portfolio_approval: "decision_committee",
    implementation: "execution_team",
    monitoring: "execution_team",
    non_equity_nav: "shared",
    reporting: "execution_team",
    closed: "decision_committee",
  };
  return owners[step];
}
