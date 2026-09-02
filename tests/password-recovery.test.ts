import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("password recovery", () => {
  it("sends recovery mail to the hosted password page", () => {
    const auth = readFileSync("src/state/auth.tsx", "utf8");
    expect(auth).toContain(
      'const PASSWORD_RECOVERY_URL = "https://stavuno.pages.dev/reset-password"',
    );
    expect(auth).toContain("resetPasswordForEmail(");
    expect(auth).toContain("{ redirectTo: PASSWORD_RECOVERY_URL }");
  });

  it("validates and changes the password from a recovery session", () => {
    const page = readFileSync("worker-portal/src/reset-password.html", "utf8");
    const script = readFileSync("worker-portal/src/reset-password.js", "utf8");
    expect(page).toContain('autocomplete="new-password"');
    expect(page).toContain('type="module" src="/reset-password.js"');
    expect(script).toContain("detectSessionInUrl: true");
    expect(script).toContain('recoveryParameters.get("type") === "recovery"');
    expect(script).toContain("client.auth.updateUser({ password })");
    expect(script).toContain('history.replaceState({}, "", location.pathname)');
  });

  it("provides Slovak, Ukrainian and Russian recovery copy", () => {
    const script = readFileSync("worker-portal/src/reset-password.js", "utf8");
    expect(script).toContain("sk: {");
    expect(script).toContain("uk: {");
    expect(script).toContain("ru: {");
  });

  it("serves the extensionless recovery page without a redirect loop", () => {
    const worker = readFileSync("worker-portal/src/_worker.js", "utf8");
    expect(worker).toContain("url.pathname === '/reset-password'");
    expect(worker).toContain("const response = await env.ASSETS.fetch(request)");
  });
});
