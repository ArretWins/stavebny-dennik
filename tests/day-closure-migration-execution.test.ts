import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { describe, expect, it } from "vitest";

const ownerId = "11111111-1111-4111-8111-111111111111";
const otherOwnerId = "22222222-2222-4222-8222-222222222222";
const projectId = "33333333-3333-4333-8333-333333333333";

const prelude = `
  create extension if not exists pgcrypto;
  create schema auth;
  create role authenticated;
  create role anon;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
  $$;
  create table public.projects(
    id uuid primary key,
    owner_id uuid not null references auth.users(id)
  );
  create function public.owns_project(pid uuid,uid uuid)
  returns boolean language sql stable as $$
    select exists(
      select 1 from public.projects where id=pid and owner_id=uid
    )
  $$;
  create function public.audit_row() returns trigger language plpgsql as $$
  begin return coalesce(new,old); end
  $$;
  create function public.export_my_data() returns jsonb
  language sql stable security definer set search_path=public,auth as $$
    select case when auth.uid() is null then null
      else jsonb_build_object('schemaVersion',13) end
  $$;
  create table public.diary_entries(
    id text primary key,
    owner_id uuid not null references auth.users(id),
    project_id uuid not null references public.projects(id),
    log_date date not null,
    work_description text not null,
    worker_count integer not null default 0,
    note text,
    evidence_json jsonb not null default '{}'::jsonb,
    locked_at timestamptz,
    locked_by uuid references auth.users(id),
    correction_of_id text references public.diary_entries(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create function public.reject_locked_update() returns trigger
  language plpgsql as $$
  begin
    if old.locked_at is not null and new is distinct from old
    then raise exception 'LOCKED_RECORD'; end if;
    return new;
  end
  $$;
  create trigger diary_lock_guard before update on public.diary_entries
    for each row execute function public.reject_locked_update();
  create table public.worker_checkins(
    id text primary key,
    project_id uuid not null references public.projects(id),
    worker_name text not null,
    checked_in_at timestamptz not null
  );
  create table public.attachments(
    id text primary key,
    owner_id uuid not null references auth.users(id),
    project_id uuid not null references public.projects(id),
    created_at timestamptz not null
  );
  create table public.site_tasks(
    id text primary key,
    owner_id uuid not null references auth.users(id),
    project_id uuid not null references public.projects(id),
    status text not null,
    completed_at timestamptz,
    submitted_at timestamptz
  );
  create table public.receipts(
    id text primary key,
    owner_id uuid not null references auth.users(id),
    project_id uuid not null references public.projects(id),
    status text not null,
    created_at timestamptz not null
  );
`;

describe("legal day closure migration", () => {
  it("atomically seals diary evidence and preserves every correction version", async () => {
    const db = new PGlite({ extensions: { pgcrypto } });
    try {
      await db.exec(prelude);
      await db.exec(
        readFileSync(
          "supabase/migrations/202607290002_legal_day_closures.sql",
          "utf8",
        ),
      );
      await db.exec(`
        insert into auth.users(id) values ('${ownerId}'),('${otherOwnerId}');
        insert into public.projects(id,owner_id)
          values ('${projectId}','${ownerId}');
        set request.jwt.claim.sub='${ownerId}';
        insert into public.diary_entries(
          id,owner_id,project_id,log_date,work_description,worker_count,
          evidence_json
        ) values (
          'entry-1','${ownerId}','${projectId}',current_date,
          'Montáž okien',3,
          '{"capturedAt":"2026-07-29T15:00:00Z","attachmentIds":[]}'
        );
      `);

      await expect(
        db.exec(
          `select public.confirm_day_closure(
            'closure-1','${projectId}',current_date,null,null,'{}',false
          )`,
        ),
      ).rejects.toThrow(/CONFIRMATION_REQUIRED/);

      const first = await db.query<{
        version: number;
        content_hash: string;
        confirmed_by: string;
      }>(
        `select version,content_hash,confirmed_by::text
         from public.confirm_day_closure(
           'closure-1','${projectId}',current_date,null,null,
           array['photos'],true
         )`,
      );
      expect(first.rows[0].version).toBe(1);
      expect(first.rows[0].content_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(first.rows[0].confirmed_by).toBe(ownerId);

      const locked = await db.query<{ locked: boolean }>(
        `select locked_at is not null locked
         from public.diary_entries where id='entry-1'`,
      );
      expect(locked.rows[0].locked).toBe(true);
      await expect(
        db.exec(
          `update public.diary_entries set work_description='Prepísané'
           where id='entry-1'`,
        ),
      ).rejects.toThrow(/LOCKED_RECORD/);
      await expect(
        db.exec(
          `update public.day_closures set correction_reason='Prepísané'
           where id='closure-1'`,
        ),
      ).rejects.toThrow(/IMMUTABLE/);

      await db.exec(`
        insert into public.diary_entries(
          id,owner_id,project_id,log_date,work_description,worker_count,
          evidence_json,correction_of_id,correction_reason
        ) values (
          'entry-2','${ownerId}','${projectId}',current_date,
          'Doplnené meranie',3,'{"capturedAt":"2026-07-29T17:00:00Z","attachmentIds":[]}',
          'entry-1','Doplnený výsledok merania'
        );
      `);
      await expect(
        db.exec(
          `select public.confirm_day_closure(
            'closure-2','${projectId}',current_date,'closure-1',null,'{}',true
          )`,
        ),
      ).rejects.toThrow(/CORRECTION_REASON_REQUIRED/);

      const second = await db.query<{
        version: number;
        supersedes_closure_id: string;
        correction_reason: string;
        entry_count: number;
      }>(
        `select version,supersedes_closure_id,correction_reason,
          jsonb_array_length(snapshot_json->'diaryEntries') entry_count
         from public.confirm_day_closure(
           'closure-2','${projectId}',current_date,'closure-1',
           'Doplnený výsledok merania','{}',true
         )`,
      );
      expect(second.rows[0]).toMatchObject({
        version: 2,
        supersedes_closure_id: "closure-1",
        correction_reason: "Doplnený výsledok merania",
        entry_count: 2,
      });

      const retried = await db.query<{ version: number }>(
        `select version from public.confirm_day_closure(
          'closure-2','${projectId}',current_date,'closure-1',
          'Doplnený výsledok merania','{}',true
        )`,
      );
      expect(retried.rows[0].version).toBe(2);

      const exported = await db.query<{
        payload: { schemaVersion: number; dayClosures: unknown[] };
      }>("select public.export_my_data() payload");
      expect(exported.rows[0].payload.schemaVersion).toBe(14);
      expect(exported.rows[0].payload.dayClosures).toHaveLength(2);

      await db.exec(
        `set request.jwt.claim.sub='${otherOwnerId}'; set role authenticated;`,
      );
      const isolated = await db.query<{ count: string }>(
        "select count(*)::text count from public.day_closures",
      );
      expect(isolated.rows[0].count).toBe("0");
    } finally {
      await db.close();
    }
  }, 15_000);

  it("validates and seals structured Annex 20 technical records", async () => {
    const db = new PGlite({ extensions: { pgcrypto } });
    try {
      await db.exec(prelude);
      await db.exec(
        readFileSync(
          "supabase/migrations/202607290002_legal_day_closures.sql",
          "utf8",
        ),
      );
      await db.exec(
        readFileSync(
          "supabase/migrations/202608080007_legal_diary_records_v28.sql",
          "utf8",
        ),
      );
      await db.exec(`
        insert into auth.users(id) values('${ownerId}');
        insert into projects(id,owner_id) values('${projectId}','${ownerId}');
        set request.jwt.claim.sub='${ownerId}';
      `);
      await expect(
        db.exec(`insert into diary_entries(
          id,owner_id,project_id,log_date,work_description,worker_count,
          workforce_json,evidence_json
        )values(
          'invalid-entry','${ownerId}','${projectId}',current_date,'Práce',3,
          '[{"role":"Murár","count":2}]','{"capturedAt":"2026-08-08T15:00:00Z","attachmentIds":[]}'
        )`),
      ).rejects.toThrow(/WORKFORCE_TOTAL_MISMATCH/);

      await db.exec(`insert into diary_entries(
        id,owner_id,project_id,log_date,work_description,worker_count,
        work_start_time,work_end_time,workforce_json,technical_records_json,
        evidence_json
      )values(
        'legal-entry','${ownerId}','${projectId}',current_date,'Betonáž základov',3,
        '07:00','16:00','[{"role":"Betonár","count":2},{"role":"Strojník","count":1}]',
        '[{"id":"technical-1","category":"test_measurement","description":"Skúška konzistencie betónu vyhovela.","reference":"Protokol B-17"}]',
        '{"capturedAt":"2026-08-08T15:00:00Z","attachmentIds":[]}'
      )`);
      const closure = await db.query<{
        schema_version: number;
        start_time: string;
        role_count: number;
        technical_count: number;
        hash_matches: boolean;
      }>(`select
        (snapshot_json->>'schemaVersion')::int schema_version,
        snapshot_json->'diaryEntries'->0->>'workStartTime' start_time,
        jsonb_array_length(snapshot_json->'diaryEntries'->0->'workforceRoles') role_count,
        jsonb_array_length(snapshot_json->'diaryEntries'->0->'technicalRecords') technical_count,
        content_hash=encode(digest(convert_to(snapshot_json::text,'UTF8'),'sha256'),'hex') hash_matches
        from confirm_day_closure(
          'legal-closure','${projectId}',current_date,null,null,'{}',true
        )`);
      expect(closure.rows[0]).toEqual({
        schema_version: 2,
        start_time: "07:00",
        role_count: 2,
        technical_count: 1,
        hash_matches: true,
      });
      await expect(
        db.exec(
          `update diary_entries set technical_records_json='[]' where id='legal-entry'`,
        ),
      ).rejects.toThrow(/LOCKED_RECORD/);
      const exported = await db.query<{ payload: { schemaVersion: number } }>(
        "select export_my_data() payload",
      );
      expect(exported.rows[0].payload.schemaVersion).toBe(28);
    } finally {
      await db.close();
    }
  }, 15_000);
});
