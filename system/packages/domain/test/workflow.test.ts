import { describe, expect, it } from "vitest";
import { stepOwner, transitionAnnualCycle } from "../src/workflow.js";

describe("annual workflow state machine", () => {
  it("keeps annual data and target approval with the committee", () => {
    expect(stepOwner("annual_data")).toBe("decision_committee");
    expect(transitionAnnualCycle("annual_data", "accept_annual_data", "decision_committee")).toMatchObject({
      allowed: true,
      nextStep: "target_return",
    });
    expect(transitionAnnualCycle("annual_data", "accept_annual_data", "execution_team")).toMatchObject({
      allowed: false,
      reason: "insufficient_permission",
    });
  });

  it("hands implementation preparation to the execution team after target approval", () => {
    expect(stepOwner("sleeve_targets")).toBe("execution_team");
    expect(transitionAnnualCycle("sleeve_targets", "complete_sleeve_targets", "execution_team")).toMatchObject({
      allowed: true,
      nextStep: "proposed_portfolio",
    });
    expect(transitionAnnualCycle("sleeve_targets", "complete_sleeve_targets", "decision_committee").allowed).toBe(false);
  });

  it("routes a failed backtest to optimization and a pass to approval", () => {
    expect(transitionAnnualCycle("backtest", "record_backtest_fail", "execution_team").nextStep).toBe("optimization");
    expect(transitionAnnualCycle("backtest", "record_backtest_pass", "execution_team").nextStep).toBe("portfolio_approval");
  });

  it("requires committee approval before implementation", () => {
    expect(transitionAnnualCycle("portfolio_approval", "approve_portfolio", "execution_team").allowed).toBe(false);
    expect(transitionAnnualCycle("portfolio_approval", "approve_portfolio", "decision_committee").nextStep).toBe("implementation");
  });

  it("allows the execution team to publish a refreshed monitoring report without leaving monitoring", () => {
    expect(transitionAnnualCycle("monitoring", "publish_report", "execution_team")).toMatchObject({
      allowed: true,
      nextStep: "monitoring",
    });
    expect(transitionAnnualCycle("monitoring", "publish_report", "decision_committee").allowed).toBe(false);
  });

  it("rejects skipped or out-of-order actions", () => {
    expect(transitionAnnualCycle("target_return", "approve_portfolio", "decision_committee")).toMatchObject({
      allowed: false,
      reason: "invalid_transition",
      nextStep: "target_return",
    });
  });
});
