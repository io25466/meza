import { describe, expect, it } from "vitest";
import { shouldRequireAppLock } from "./app-lock-policy";

describe("app lock policy", () => {
  it("requires the lock by default for existing installations with a PIN", () => {
    expect(shouldRequireAppLock(true, undefined)).toBe(true);
  });

  it("allows direct opening only when explicitly disabled after a PIN exists", () => {
    expect(shouldRequireAppLock(true, false)).toBe(false);
  });

  it("always requires setup when no PIN exists", () => {
    expect(shouldRequireAppLock(false, false)).toBe(true);
  });
});
