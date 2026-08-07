import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../src/credential-crypto.js";

describe("external credential encryption", () => {
  it("round-trips a token without storing plaintext", () => {
    const token = "eodhd-test-token-1234567890";
    const encrypted = encryptSecret(token);
    expect(encrypted.ciphertext).not.toContain(token);
    expect(encrypted.iv).not.toBe("");
    expect(encrypted.authTag).not.toBe("");
    expect(decryptSecret(encrypted)).toBe(token);
  });

  it("uses a fresh IV for every write", () => {
    const first = encryptSecret("same-token-value");
    const second = encryptSecret("same-token-value");
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });
});
