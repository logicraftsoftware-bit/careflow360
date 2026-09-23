import { describe,expect,it } from "vitest";
import { isoWithOffset,sanitizeErpError } from "./erp-sync.js";

describe("ERP synchronization helpers",()=>{
  it("preserves the clinic timezone as an explicit offset",()=>{
    expect(isoWithOffset(new Date("2026-09-24T04:30:00.000Z"),"Asia/Kolkata")).toBe("2026-09-24T10:00:00+05:30");
  });

  it("redacts credentials from safe errors",()=>{
    const safe=sanitizeErpError(new Error("x-api-key: cferp_superSecret123 server failed"));
    expect(safe).not.toContain("superSecret123");
    expect(safe).toContain("[REDACTED]");
  });
});
