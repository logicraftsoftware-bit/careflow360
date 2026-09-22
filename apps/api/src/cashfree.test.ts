import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyCashfreeSignature } from "./cashfree.js";

describe("Cashfree webhook verification", () => {
  it("accepts an authentic raw payload", () => {
    const body = Buffer.from('{"event":"payment.captured"}');
    const secret = "clinic-specific-secret-key";
    const timestamp = "1666084200";
    const signature = createHmac("sha256", secret).update(timestamp).update(body).digest("base64");
    expect(verifyCashfreeSignature(body, signature, timestamp, secret)).toBe(true);
  });

  it("rejects a modified payload", () => {
    const body = Buffer.from('{"event":"payment.captured"}');
    const timestamp = "1666084200";
    const signature = createHmac("sha256", "secret").update(timestamp).update(body).digest("base64");
    expect(
      verifyCashfreeSignature(
        Buffer.from('{"event":"payment.failed"}'),
        signature,
        timestamp,
        "secret",
      ),
    ).toBe(false);
  });
});
