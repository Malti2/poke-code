import { describe, expect, test } from "bun:test";
import { classifyKeyCheck, validateApiKey } from "../src/tui/Onboarding";

describe("onboarding key validation", () => {
  test("rejects empty input", () => {
    expect(validateApiKey("")).not.toBeNull();
    expect(validateApiKey("   ")).not.toBeNull();
  });

  test("rejects V1 keys (pk_ prefix)", () => {
    const msg = validateApiKey("pk_test_1234567890abcdef");
    expect(msg).not.toBeNull();
    expect(msg!).toMatch(/V1/i);
  });

  test("rejects implausibly short keys", () => {
    expect(validateApiKey("abc")).not.toBeNull();
  });

  test("accepts a plausible V2 key (trims whitespace)", () => {
    expect(validateApiKey("  sk-poke-abcdef1234567890  ")).toBeNull();
  });
});

describe("key check classification", () => {
  test("401/403 mean the key is invalid", () => {
    expect(classifyKeyCheck(401)).toBe("invalid");
    expect(classifyKeyCheck(403)).toBe("invalid");
  });

  test("other statuses mean the auth layer let the request through", () => {
    expect(classifyKeyCheck(200)).toBe("ok");
    expect(classifyKeyCheck(404)).toBe("ok");
    expect(classifyKeyCheck(500)).toBe("ok");
  });

  test("network failure is unknown, not invalid", () => {
    expect(classifyKeyCheck(null)).toBe("unknown");
  });
});
