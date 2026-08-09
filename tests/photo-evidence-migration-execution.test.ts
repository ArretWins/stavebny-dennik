import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const owner = "11111111-1111-4111-8111-111111111111";
const workerUser = "22222222-2222-4222-8222-222222222222";
const project = "33333333-3333-4333-8333-333333333333";
const worker = "worker-1";

describe("photo evidence integrity migration", () => {
  it("seals metadata, prevents overwrite and accepts hashed worker evidence", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create schema auth; create schema storage;
        create role authenticated; create role anon;
        create table auth.users(id uuid primary key);
        create function auth.uid() returns uuid language sql stable as $$
          select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
        $$;
        create function storage.foldername(text) returns text[] language sql immutable as $$
          select string_to_array($1,'/')
        $$;
        create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));
        create table projects(id uuid primary key,owner_id uuid references auth.users);
        create function owns_project(pid uuid,uid uuid) returns boolean language sql stable as $$
          select exists(select 1 from projects where id=pid and owner_id=uid)
        $$;
        create table project_workers(
          id text primary key,owner_id uuid,project_id uuid,auth_user_id uuid,status text
        );
        create table site_tasks(
          id text primary key,owner_id uuid,project_id uuid,assigned_worker_id text,
          title text,status text,submitted_at timestamptz,reviewed_at timestamptz,
          reviewed_by uuid,review_note text,completed_at timestamptz
        );
        create table notifications(
          id bigint generated always as identity primary key,
          recipient_user_id uuid,worker_id text,notification_type text,title text,
          body text,data jsonb
        );
        create table attachments(
          id text primary key,owner_id uuid,project_id uuid,related_entity_type text,
          related_entity_id text,local_uri text,storage_path text,file_size bigint,
          mime_type text,thumbnail_path text,upload_status text,created_at timestamptz default now(),
          evidence_role text,created_by_worker_id text
        );
        alter table storage.objects enable row level security;
        create policy attachments_storage_owner on storage.objects for all
          using(bucket_id='attachments') with check(bucket_id='attachments');
        create function export_my_data() returns jsonb language sql stable as $$
          select jsonb_build_object('schemaVersion',28)
        $$;
      `);
      await db.exec(
        readFileSync(
          "supabase/migrations/202608080008_photo_evidence_integrity_v29.sql",
          "utf8",
        ),
      );
      await db.exec(`
        insert into auth.users values('${owner}'),('${workerUser}');
        insert into projects values('${project}','${owner}');
        insert into project_workers values('${worker}','${owner}','${project}','${workerUser}','active');
        insert into site_tasks values('task-1','${owner}','${project}','${worker}','Murivo','open');
        insert into storage.objects values(
          'attachments','${owner}/${project}/site-tasks/task-1/${workerUser}/attachment_worker.jpg'
        );
        set request.jwt.claim.sub='${workerUser}';
      `);
      const digest = "a".repeat(64);
      await db.query(`select submit_my_site_task('task-1',$1::jsonb)`, [
        JSON.stringify([
          {
            id: "attachment_worker",
            storagePath: `${owner}/${project}/site-tasks/task-1/${workerUser}/attachment_worker.jpg`,
            fileSize: 1234,
            mimeType: "image/jpeg",
            captureSource: "worker_portal",
            capturedAt: "2026-08-08T14:05:06.000Z",
            contentSha256: digest,
            integrityVersion: "sha256-v1",
          },
        ]),
      ]);
      const stored = await db.query<{
        content_sha256: string;
        capture_source: string;
        status: string;
      }>(`
        select a.content_sha256,a.capture_source,t.status
        from attachments a cross join site_tasks t
        where a.id='attachment_worker' and t.id='task-1'
      `);
      expect(stored.rows[0]).toEqual({
        content_sha256: digest,
        capture_source: "worker_portal",
        status: "review",
      });
      await expect(
        db.exec(
          `update attachments set content_sha256='${"b".repeat(64)}' where id='attachment_worker'`,
        ),
      ).rejects.toThrow(/ATTACHMENT_EVIDENCE_IMMUTABLE/);
      await expect(
        db.exec(`insert into attachments(
          id,owner_id,project_id,related_entity_type,file_size,mime_type,upload_status,
          capture_source,captured_at,latitude,content_sha256,integrity_version
        ) values('bad','${owner}','${project}','attachment',1,'image/jpeg','synced',
          'camera',now(),48,'${digest}','sha256-v1')`),
      ).rejects.toThrow();
      const exported = await db.query<{ payload: { schemaVersion: number } }>(
        "select export_my_data() payload",
      );
      expect(exported.rows[0].payload.schemaVersion).toBe(29);
    } finally {
      await db.close();
    }
  });
});
