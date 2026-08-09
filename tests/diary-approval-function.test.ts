import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public diary approval page", () => {
  const source = readFileSync(
    "supabase/functions/diary-approval/index.ts",
    "utf8",
  );
  const config = readFileSync("supabase/config.toml", "utf8");

  it("uses only a hashed temporary token and the service-role RPC boundary", () => {
    expect(config).toMatch(
      /\[functions\.diary-approval\][\s\S]*?verify_jwt\s*=\s*false/,
    );
    expect(source).toContain('/^[0-9a-f]{64}$/');
    expect(source).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(source).toContain('client.rpc("resolve_diary_approval"');
    expect(source).toContain('client.rpc("submit_diary_approval_decision"');
  });

  it("requires explicit confirmation and renders the exact closure hash", () => {
    expect(source).toContain('form.get("confirmed") === "yes"');
    expect(source).toContain("closure.contentHash");
    expect(source).toContain("Rozhodnutie je mo\u017en\u00e9 vykona\u0165 iba raz");
    expect(source).toContain("Nie je kvalifikovan\u00fdm elektronick\u00fdm podpisom");
    expect(source).toContain("X-Robots-Tag");
    expect(source).toContain("frame-ancestors 'none'");
  });
});
