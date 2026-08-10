import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("production authentication configuration", () => {
  it("fails closed when Supabase is not configured", () => {
    const auth = readFileSync("src/state/auth.tsx", "utf8");

    expect(auth).toContain("AUTH_CONFIG_MISSING");
    expect(auth).not.toContain("localUserId");
    expect(auth).not.toContain("LOCAL_SESSION");
    expect(auth).not.toContain("password.length < 6");
  });

  it("requires Supabase public credentials in signed Android builds", () => {
    const workflow = readFileSync(
      ".github/workflows/android-release.yml",
      "utf8",
    );

    expect(workflow).toContain('test -n "$EXPO_PUBLIC_SUPABASE_URL"');
    expect(workflow).toContain('test -n "$anon_key"');
  });
});
