import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
const owner = "11111111-1111-4111-8111-111111111111",
  workerUser = "22222222-2222-4222-8222-222222222222",
  outsider = "33333333-3333-4333-8333-333333333333",
  project = "44444444-4444-4444-8444-444444444444",
  worker = "55555555-5555-4555-8555-555555555555";
const prelude = `create schema auth;create role authenticated;create role anon;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table projects(id uuid primary key,owner_id uuid references auth.users);create function owns_project(pid uuid,uid uuid)returns boolean language sql stable as $$select exists(select 1 from projects where id=pid and owner_id=uid)$$;create table project_workers(id uuid primary key,owner_id uuid references auth.users,project_id uuid references projects on delete cascade,auth_user_id uuid references auth.users,first_name text,last_name text,position text,status text);create table material_requests(id text primary key,owner_id uuid references auth.users,project_id uuid references projects on delete cascade,worker_id uuid references project_workers,desired_date date,status text);create table material_request_items(id text primary key,request_id text references material_requests on delete cascade,name text,quantity numeric,unit text,created_at timestamptz default now());create table material_supplier_quotes(id text primary key,owner_id uuid references auth.users,project_id uuid references projects on delete cascade,request_id text references material_requests,status text,supplier_name text,total_amount_cents bigint,delivery_date date,valid_until date,note text,selected_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());create table attachments(id text primary key,owner_id uuid references auth.users,project_id uuid references projects on delete cascade,related_entity_type text constraint attachments_related_entity_type_check check(related_entity_type in('diary_entry','delay_event','worker_checkin','attachment','weather_snapshot','site_task','project_rfi','worker_credential','site_incident')),related_entity_id text);create table notifications(id uuid default gen_random_uuid()primary key,recipient_user_id uuid,worker_id uuid,notification_type text constraint notifications_notification_type_check check(notification_type in('worker_join','material_request','request_status','site_task','task_review','task_assignment','task_comment','client_decision','change_order_decision','supplier_quote','site_incident')),title text,body text,data jsonb);grant select on projects,project_workers,material_requests,material_request_items,material_supplier_quotes,attachments,notifications to authenticated;create function audit_row()returns trigger language plpgsql as $$begin return coalesce(new,old);end$$;create function export_my_data()returns jsonb language sql stable as $$select jsonb_build_object('schemaVersion',22)$$;`;
describe("material delivery migration", () => {
  it("reconciles quantities with owner review and personal worker isolation", async () => {
    const db = new PGlite();
    try {
      await db.exec(prelude);
      await db.exec(
        readFileSync(
          "supabase/migrations/202608080002_material_deliveries.sql",
          "utf8",
        ),
      );
      await db.exec(
        `insert into auth.users values('${owner}'),('${workerUser}'),('${outsider}');insert into projects values('${project}','${owner}');insert into project_workers values('${worker}','${owner}','${project}','${workerUser}','Jan','Novak','Murar','active');insert into material_requests values('req-1','${owner}','${project}','${worker}',current_date+1,'approved');insert into material_request_items values('item-1','req-1','Cement',10,'ks',now());insert into material_supplier_quotes values('quote-1','${owner}','${project}','req-1','selected','Stavmat',10000,current_date,current_date+2,null,now(),now(),now());set request.jwt.claim.sub='${owner}';`,
      );
      const good = `'[{"requestItemId":"item-1","itemName":"Cement","unit":"ks","expectedQuantity":10,"deliveredQuantity":10,"damagedQuantity":0}]'::jsonb`;
      await db.query(
        `select save_material_delivery('del-1','req-1','Stavmat','DL-1',now(),null,'Majster',null,null,${good},true)`,
      );
      await expect(
        db.exec(`update material_deliveries set supplier_name='x'`),
      ).rejects.toThrow(/RPC_REQUIRED/);
      await db.query(
        `select review_material_delivery('del-1','accepted',true)`,
      );
      const bad = `'[{"requestItemId":"item-1","itemName":"Cement","unit":"ks","expectedQuantity":10,"deliveredQuantity":8,"damagedQuantity":1}]'::jsonb`;
      await db.exec(
        `set request.jwt.claim.sub='${workerUser}';set role authenticated;`,
      );
      await expect(
        db.query(
          `select report_my_material_delivery('${worker}','req-1','Stavmat','DL-2',now(),null,${bad},false)`,
        ),
      ).rejects.toThrow(/CONFIRMATION_REQUIRED/);
      const own = await db.query<{ id: string }>(
        `select id from report_my_material_delivery('${worker}','req-1','Stavmat','DL-2',now(),'Jedno vrece poskodene',${bad},true)`,
      );
      expect(own.rows[0].id).toBeTruthy();
      expect(
        (
          await db.query<{ count: number }>(
            `select count(*)::int count from material_deliveries`,
          )
        ).rows[0].count,
      ).toBe(1);
      await db.exec(`reset role;set request.jwt.claim.sub='${owner}';`);
      const workerDelivery = (
        await db.query<{ id: string }>(
          `select id from material_deliveries where receiver_worker_id='${worker}'`,
        )
      ).rows[0].id;
      await expect(
        db.query(
          `select review_material_delivery('${workerDelivery}','accepted',true)`,
        ),
      ).rejects.toThrow(/DECISION_MISMATCH/);
      await db.query(
        `select review_material_delivery('${workerDelivery}','discrepancy',true)`,
      );
      await expect(
        db.query(
          `select resolve_material_delivery('${workerDelivery}','x',true)`,
        ),
      ).rejects.toThrow(/RESOLUTION_REQUIRED/);
      await db.query(
        `select resolve_material_delivery('${workerDelivery}','Dodavatel vystavil dobropis',true)`,
      );
      await expect(
        db.exec(`update material_delivery_events set body='x'`),
      ).rejects.toThrow(/IMMUTABLE/);
      expect(
        (
          await db.query<{ count: number }>(
            `select count(*)::int count from notifications where notification_type='material_delivery'`,
          )
        ).rows[0].count,
      ).toBe(1);
      expect(
        (
          await db.query<{
            payload: { schemaVersion: number; materialDeliveries: unknown[] };
          }>(`select export_my_data()payload`)
        ).rows[0].payload,
      ).toMatchObject({ schemaVersion: 23 });
      await db.exec(
        `set request.jwt.claim.sub='${outsider}';set role authenticated;`,
      );
      expect(
        (
          await db.query<{ count: number }>(
            `select count(*)::int count from material_deliveries`,
          )
        ).rows[0].count,
      ).toBe(0);
      await db.exec(
        `reset role;set request.jwt.claim.sub='${owner}';delete from projects where id='${project}'`,
      );
      expect(
        (
          await db.query<{ count: number }>(
            `select count(*)::int count from material_deliveries`,
          )
        ).rows[0].count,
      ).toBe(0);
    } finally {
      await db.close();
    }
  }, 15000);
});
