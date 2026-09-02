import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyRazorpaySignature } from "./razorpay.js";

describe("Razorpay webhook verification", () => {
  it("accepts an authentic raw payload", () => {
    const body = Buffer.from('{"event":"payment.captured"}');
    const secret = "clinic-specific-webhook-secret";
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyRazorpaySignature(body, signature, secret)).toBe(true);
  });

  it("rejects a modified payload", () => {
    const body = Buffer.from('{"event":"payment.captured"}');
    const signature = createHmac("sha256", "secret").update(body).digest("hex");
    expect(
      verifyRazorpaySignature(
        Buffer.from('{"event":"payment.failed"}'),
        signature,
        "secret",
      ),
    ).toBe(false);
  });
});
