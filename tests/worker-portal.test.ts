import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("passwordless worker portal contract", () => {
  const source = readFileSync(
    "supabase/functions/worker-portal/index.ts",
    "utf8",
  );
  const staticSource = readFileSync("worker-portal/src/app.js", "utf8");
  const migration = readFileSync(
    "supabase/migrations/202607140001_receipts_workers_materials.sql",
    "utf8",
  );
  it("uses an anonymous persistent browser session and pending approval", () => {
    expect(source).toContain("signInAnonymously");
    expect(source).toContain("rpc('join_project_as_worker'");
    expect(source).toContain("worker.status==='pending'");
    expect(migration).toContain("now() + interval '15 minutes'");
    expect(migration).toContain(
      "status in ('pending', 'active', 'rejected', 'revoked')",
    );
  });
  it("redirects old QR links to the independently hosted static portal", () => {
    expect(source).toContain("Deno.env.get('WORKER_PORTAL_PUBLIC_URL')");
    expect(source).toContain("destination.searchParams.set('token', token)");
    expect(staticSource).toContain("signInAnonymously");
  });
  it("creates material requests transactionally and only lists the current worker requests", () => {
    expect(source).toContain("rpc('create_material_request'");
    expect(source).toContain(".eq('worker_id',worker.id)");
    expect(migration).toContain("create_material_request");
    expect(migration).toContain("WORKER_ACCESS_DENIED");
    expect(migration).toContain("INVALID_MATERIAL_STATUS_TRANSITION");
  });
  it("asks explicitly before registering standards-based web push", () => {
    expect(source).toContain("Notification.requestPermission");
    expect(source).toContain("scope:location.pathname");
    expect(source).toContain("channel:'web'");
    expect(source).toContain("url.searchParams.get('asset') === 'sw'");
  });
  it("refreshes manager workforce independently and polls for pending joins", () => {
    const appState = readFileSync("src/state/app.tsx", "utf8");
    const manager = readFileSync("src/screens/WorkforceScreen.tsx", "utf8");
    expect(appState).toContain("const refreshWorkforce = useCallback");
    expect(appState).toContain("const workforce = await listProjectWorkforce(projectId)");
    expect(manager).toContain("setInterval");
    expect(manager).toContain("5_000");
    expect(manager).toContain("https://stavebny-dennik-worker.pages.dev");
  });
});
