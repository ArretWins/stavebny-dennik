import { describe, expect, it } from "vitest";
import { isHealthyPrivacyPage, isHealthyPublicPortal } from "../scripts/smoke-health";

describe("production smoke page checks", () => {
  it("accepts the branded download landing page", () => {
    expect(
      isHealthyPublicPortal(
        '<title>Stavuno</title><script data-version-manifest="/app-version.json"></script>',
      ),
    ).toBe(true);
  });

  it("accepts the branded worker portal", () => {
    expect(
      isHealthyPublicPortal(
        '<p>Stavuno</p><form id="join-form"></form><form id="request-form"></form>',
      ),
    ).toBe(true);
  });

  it("rejects unrelated and incomplete pages", () => {
    expect(isHealthyPublicPortal("Stavuno")).toBe(false);
    expect(
      isHealthyPublicPortal(
        '<form id="join-form"></form><form id="request-form"></form>',
      ),
    ).toBe(false);
  });

  it("checks the branded privacy page", () => {
    expect(isHealthyPrivacyPage("Stavuno — Ochrana súkromia")).toBe(true);
    expect(isHealthyPrivacyPage("Ochrana súkromia")).toBe(false);
  });
});
