import { describe, expect, it } from "vitest";
import {
  assertDifferentReviewer,
  committeeVoteOutcome,
  hasPermission,
  validatePassword,
} from "../src/index.js";

describe("role policy", () => {
  it("prevents the system administrator from investment actions", () => {
    expect(hasPermission("system_admin", "users:manage")).toBe(true);
    expect(hasPermission("system_admin", "portfolio:submit")).toBe(false);
    expect(hasPermission("system_admin", "portfolio:vote")).toBe(false);
  });

  it("keeps committee access read-only on execution-owned work", () => {
    expect(hasPermission("decision_committee", "portfolio:read")).toBe(true);
    expect(hasPermission("decision_committee", "portfolio:prepare")).toBe(false);
    expect(hasPermission("decision_committee", "trade:submit")).toBe(false);
  });

  it("allows execution preparation but not committee voting", () => {
    expect(hasPermission("execution_team", "portfolio:prepare")).toBe(true);
    expect(hasPermission("execution_team", "portfolio:vote")).toBe(false);
  });
});

describe("governance controls", () => {
  it("enforces maker-checker separation", () => {
    expect(() => assertDifferentReviewer("user-1", "user-1")).toThrow();
    expect(() => assertDifferentReviewer("user-1", "user-2")).not.toThrow();
  });

  it("supports a one-person committee and two-thirds voting", () => {
    expect(committeeVoteOutcome({ eligibleVoters: 1, approvals: 1, rejections: 0, abstentions: 0 })).toBe("approved");
    expect(committeeVoteOutcome({ eligibleVoters: 3, approvals: 2, rejections: 1, abstentions: 0 })).toBe("approved");
    expect(committeeVoteOutcome({ eligibleVoters: 4, approvals: 2, rejections: 2, abstentions: 0 })).toBe("rejected");
  });
});

describe("password policy", () => {
  it("requires 12 characters with letters and numbers", () => {
    expect(validatePassword("short1").valid).toBe(false);
    expect(validatePassword("longpasswordonly").valid).toBe(false);
    expect(validatePassword("IsaterSecure2026").valid).toBe(true);
  });
});
