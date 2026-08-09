import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("authenticated report generation boundary", () => {
  const source = readFileSync(
    "supabase/functions/generate-report/index.ts",
    "utf8",
  );
  const config = readFileSync("supabase/config.toml", "utf8");

  it("requires a user JWT and scopes project data through RLS", () => {
    expect(config).toContain("[functions.generate-report]");
    expect(config).toContain("verify_jwt = true");
    expect(source).toContain("client.auth.getUser()");
    expect(source).toContain("project.owner_id !== user.id");
    expect(source).toMatch(/\.from\(["']diary_entries["']\)/);
    expect(source).toMatch(/\.from\(["']delay_events["']\)/);
  });

  it("embeds Slovak-capable fonts and photos, stores privately, and records metadata", () => {
    expect(source).toContain("vfs_fonts.js");
    expect(source).toMatch(/font:\s*["']Roboto["']/);
    expect(source).toMatch(
      /storage\s*\.from\(["']attachments["']\)\s*\.download/,
    );
    expect(source).toMatch(/storage\s*\.from\(["']reports["']\)\s*\.upload/);
    expect(source).toMatch(/\.from\(["']report_exports["']\)\s*\.insert/);
    expect(source).toMatch(/locale:\s*["']sk-SK["']/);
    expect(source).toContain("attachment_ids: attachmentIds");
    expect(source).toContain("technical_records_json");
    expect(source).toContain("workforce_json");
    expect(source).toContain('crypto.subtle.digest("SHA-256"');
    expect(source).toContain("content_sha256");
    expect(source).toContain("Kontrola integrity");
    expect(source).toContain('from("diary_approval_requests")');
    expect(source).toContain("Schv\u00e1lenia uzavret\u00fdch dn\u00ed");
    expect(source).toContain("SHA-256 uzavretej verzie");
  });
});
