import { describe, expect, it } from "vitest";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "./aisensy.js";

describe("AiSensy tenant secret storage", () => {
  it("encrypts API keys and decrypts them for delivery", () => {
    const apiKey = "clinic-specific-secret-key";
    const encrypted = encryptIntegrationSecret(apiKey);
    expect(encrypted).not.toContain(apiKey);
    expect(decryptIntegrationSecret(encrypted)).toBe(apiKey);
  });

  it("uses a unique initialization vector for every save", () => {
    expect(encryptIntegrationSecret("same-key")).not.toBe(encryptIntegrationSecret("same-key"));
  });
});
