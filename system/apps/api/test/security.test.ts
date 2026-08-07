import { describe, expect, it } from "vitest";
import { hashPassword, hashSessionToken, newSessionToken, verifyPassword } from "../src/security.js";

describe("credential security", () => {
  it("hashes passwords with Argon2id and verifies only the correct value", async () => {
    const hash = await hashPassword("IsaterSecure2026");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    await expect(verifyPassword(hash, "IsaterSecure2026")).resolves.toBe(true);
    await expect(verifyPassword(hash, "Incorrect2026")).resolves.toBe(false);
  });

  it("generates opaque session tokens and stores deterministic hashes", () => {
    const token = newSessionToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(hashSessionToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken(token)).not.toBe(token);
  });
});
