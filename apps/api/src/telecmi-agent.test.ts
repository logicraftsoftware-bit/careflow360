import { describe, expect, it } from "vitest";
import { isTelecmiAgentAlias, meaningfulTelecmiAgentName, telecmiAgentAliases } from "./telecmi-agent.js";

describe("TeleCMI agent identity", () => {
  it("treats a composite user ID as an alias of its extension", () => {
    expect(telecmiAgentAliases("5001_33338854")).toEqual(["5001_33338854", "5001"]);
    expect(isTelecmiAgentAlias("5001_33338854", "5001")).toBe(true);
  });

  it("does not match different extensions", () => {
    expect(isTelecmiAgentAlias("5001_33338854", "5003")).toBe(false);
  });

  it("rejects provider placeholders as agent names", () => {
    expect(meaningfulTelecmiAgentName("unknown")).toBeUndefined();
    expect(meaningfulTelecmiAgentName(" Unknown ")).toBeUndefined();
    expect(meaningfulTelecmiAgentName("Abhijit Sharma")).toBe("Abhijit Sharma");
  });
});
