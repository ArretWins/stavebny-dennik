import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const owner = "11111111-1111-4111-8111-111111111111";
const workerUser = "22222222-2222-4222-8222-222222222222";
const outsider = "33333333-3333-4333-8333-333333333333";
const project = "44444444-4444-4444-8444-444444444444";
const worker = "55555555-5555-4555-8555-555555555555";
const prelude = `create schema auth;create role authenticated;create role anon;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table projects(id uuid primary key,owner_id uuid references auth.users);create function owns_project(pid uuid,uid uuid)returns boolean language sql stable as $$select exists(select 1 from projects where id=pid and owner_id=uid)$$;create table project_workers(id uuid primary key,owner_id uuid references auth.users,project_id uuid references projects on delete cascade,auth_user_id uuid references auth.users,first_name text,last_name text,position text,status text);create table material_requests(id text primary key,owner_id uuid references auth.users,project_id uuid references projects on delete cascade,worker_id uuid references project_workers,desired_date date,status text);create table material_request_items(id text primary key,request_id text references material_requests on delete cascade,name text,quantity numeric,unit text,created_at timestamptz default now());create table material_supplier_quotes(id text primary key,owner_id uuid references auth.users,project_id uuid references projects on delete cascade,request_id text references material_requests,status text,supplier_name text,total_amount_cents bigint,delivery_date date,valid_until date,note text,selected_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());create table attachments(id text primary key,owner_id uuid references auth.users,project_id uuid references projects on delete cascade,related_entity_type text constraint attachments_related_entity_type_check check(related_entity_type in('diary_entry','delay_event','worker_checkin','attachment','weather_snapshot','site_task','project_rfi','worker_credential','site_incident')),related_entity_id text);create table notifications(id uuid default gen_random_uuid()primary key,recipient_user_id uuid,worker_id uuid,notification_type text constraint notifications_notification_type_check check(notification_type in('worker_join','material_request','request_status','site_task','task_review','task_assignment','task_comment','client_decision','change_order_decision','supplier_quote','site_incident')),title text,body text,data jsonb);grant select on projects,project_workers,material_requests,material_request_items,material_supplier_quotes,attachments,notifications to authenticated;create function audit_row()returns trigger language plpgsql as $$begin return coalesce(new,old);end$$;create function export_my_data()returns jsonb language sql stable as $$select jsonb_build_object('schemaVersion',22)$$;`;

describe("material stock migration", () => {
  it("keeps worker reports pending, owner decisions immutable and stock isolated", async () => {
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
        readFileSync(
          "supabase/migrations/202608080003_material_stock.sql",
          "utf8",
        ),
      );
      await db.exec(
        `insert into auth.users values('${owner}'),('${workerUser}'),('${outsider}');insert into projects values('${project}','${owner}');insert into project_workers values('${worker}','${owner}','${project}','${workerUser}','Jan','Novak','Murar','active');insert into material_requests values('req-1','${owner}','${project}','${worker}',current_date+1,'approved');insert into material_request_items values('item-1','req-1','Cement',10,'ks',now());set request.jwt.claim.sub='${owner}';`,
      );
      const lines = `'[{"requestItemId":"item-1","itemName":"Cement","unit":"ks","expectedQuantity":10,"deliveredQuantity":10,"damagedQuantity":0}]'::jsonb`;
      await db.query(
        `select save_material_delivery('del-1','req-1','Stavmat',null,now(),null,'Majster',null,null,${lines},true)`,
      );
      await db.query(
        `select review_material_delivery('del-1','accepted',true)`,
      );
      await expect(
        db.query(
          `select save_material_stock_movement('stock-1','item-1','usage',2,now(),null,null,false)`,
        ),
      ).rejects.toThrow(/CONFIRMATION_REQUIRED/);
      await db.query(
        `select save_material_stock_movement('stock-1','item-1','usage',2,now(),null,'Prve vydanie',true)`,
      );
      await expect(
        db.exec(`update material_stock_movements set quantity=9`),
      ).rejects.toThrow(/RPC_REQUIRED/);
      await db.exec(
        `set request.jwt.claim.sub='${workerUser}';set role authenticated;`,
      );
      expect(
        (
          await db.query<{ request_item_id: string }>(
            `select request_item_id from my_material_stock_options('${worker}')`,
          )
        ).rows[0].request_item_id,
      ).toBe("item-1");
      await expect(
        db.query(
          `select report_my_material_stock_movement('${worker}','item-1','usage',1,now(),null,false)`,
        ),
      ).rejects.toThrow(/CONFIRMATION_REQUIRED/);
      const reported = await db.query<{ id: string }>(
        `select id from report_my_material_stock_movement('${worker}','item-1','waste',1,now(),'Poskodene pri praci',true)`,
      );
      expect(
        (
          await db.query<{ count: number }>(
            `select count(*)::int count from material_stock_movements`,
          )
        ).rows[0].count,
      ).toBe(1);
      await db.exec(`reset role;set request.jwt.claim.sub='${owner}';`);
      await expect(
        db.query(
          `select review_material_stock_movement('${reported.rows[0].id}','rejected','x',true)`,
        ),
      ).rejects.toThrow(/INVALID_MATERIAL_STOCK_DECISION/);
      await db.query(
        `select review_material_stock_movement('${reported.rows[0].id}','confirmed',null,true)`,
      );
      await expect(
        db.exec(`update material_stock_movement_events set body='changed'`),
      ).rejects.toThrow(/IMMUTABLE/);
      expect(
        (
          await db.query<{ count: number }>(
            `select count(*)::int count from notifications where notification_type='material_stock'`,
          )
        ).rows[0].count,
      ).toBe(1);
      expect(
        (
          await db.query<{ payload: { schemaVersion: number } }>(
            `select export_my_data()payload`,
          )
        ).rows[0].payload.schemaVersion,
      ).toBe(24);
      await db.exec(
        `set request.jwt.claim.sub='${outsider}';set role authenticated;`,
      );
      expect(
        (
          await db.query<{ count: number }>(
            `select count(*)::int count from material_stock_movements`,
          )
        ).rows[0].count,
      ).toBe(0);
    } finally {
      await db.close();
    }
  }, 15000);
});
