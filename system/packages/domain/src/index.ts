export type Role = "system_admin" | "decision_committee" | "execution_team";

export type Permission =
  | "users:manage"
  | "parameters:manage"
  | "audit:read"
  | "annual_data:run"
  | "annual_data:accept"
  | "target:prepare"
  | "target:vote"
  | "portfolio:read"
  | "portfolio:prepare"
  | "portfolio:submit"
  | "portfolio:vote"
  | "backtest:run"
  | "optimization:run"
  | "trade:submit"
  | "trade:review"
  | "non_equity_nav:submit"
  | "non_equity_nav:vote"
  | "monitoring:read"
  | "report:read"
  | "report:distribute";

const rolePermissions: Record<Role, ReadonlySet<Permission>> = {
  system_admin: new Set([
    "users:manage",
    "parameters:manage",
    "audit:read",
    "portfolio:read",
    "monitoring:read",
    "report:read",
  ]),
  decision_committee: new Set([
    "audit:read",
    "annual_data:run",
    "annual_data:accept",
    "target:prepare",
    "target:vote",
    "portfolio:read",
    "portfolio:vote",
    "non_equity_nav:vote",
    "monitoring:read",
    "report:read",
  ]),
  execution_team: new Set([
    "portfolio:read",
    "portfolio:prepare",
    "portfolio:submit",
    "backtest:run",
    "optimization:run",
    "trade:submit",
    "trade:review",
    "non_equity_nav:submit",
    "monitoring:read",
    "report:read",
    "report:distribute",
  ]),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return rolePermissions[role].has(permission);
}

export function assertPermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new Error(`Role ${role} does not have permission ${permission}`);
  }
}

export function assertDifferentReviewer(submitterId: string, reviewerId: string): void {
  if (submitterId === reviewerId) {
    throw new Error("Submitter and reviewer must be different users");
  }
}

export interface CommitteeVoteSummary {
  eligibleVoters: number;
  approvals: number;
  rejections: number;
  abstentions: number;
}

export type VoteOutcome = "open" | "approved" | "rejected";

export function committeeVoteOutcome(summary: CommitteeVoteSummary): VoteOutcome {
  if (!Number.isInteger(summary.eligibleVoters) || summary.eligibleVoters < 1) {
    throw new Error("At least one eligible committee voter is required");
  }
  const requiredApprovals = Math.ceil((summary.eligibleVoters * 2) / 3);
  if (summary.approvals >= requiredApprovals) return "approved";

  const votesCast = summary.approvals + summary.rejections + summary.abstentions;
  const remaining = Math.max(0, summary.eligibleVoters - votesCast);
  if (summary.approvals + remaining < requiredApprovals) return "rejected";
  return "open";
}

export interface PasswordPolicyResult {
  valid: boolean;
  reasons: Array<"too_short" | "missing_letter" | "missing_number">;
}

export function validatePassword(password: string): PasswordPolicyResult {
  const reasons: PasswordPolicyResult["reasons"] = [];
  if (password.length < 12) reasons.push("too_short");
  if (!/[A-Za-z]/.test(password)) reasons.push("missing_letter");
  if (!/\d/.test(password)) reasons.push("missing_number");
  return { valid: reasons.length === 0, reasons };
}

export * from "./workflow.js";
export * from "./investment-math.js";
export * from "./annual-allocation.js";
