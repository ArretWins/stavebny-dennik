import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Supabase release contract", () => {
  const sql = readFileSync(
    "supabase/migrations/202607110001_initial_schema.sql",
    "utf8",
  );
  it("contains all MVP entities, RLS, private buckets, audit, and lock guards", () => {
    for (const table of [
      "profiles",
      "projects",
      "daily_logs",
      "diary_entries",
      "delay_events",
      "weather_snapshots",
      "attachments",
      "worker_checkins",
      "checkin_tokens",
      "report_exports",
      "audit_events",
    ])
      expect(sql).toContain(`create table public.${table}`);
    expect(sql).toContain("enable row level security");
    expect(sql).toContain(
      "values ('attachments', 'attachments', false), ('reports', 'reports', false)",
    );
    expect(sql).toContain("reject_locked_update");
    expect(sql).toContain("validate_correction_target");
    expect(sql).toContain("then 'report_generation'");
    expect(sql).toContain("then 'lock'");
    expect(sql).toContain("attachment_ids text[]");
    expect(sql).toContain("audit_row");
    expect(sql).toContain("owns_project(project_id, auth.uid())");
  });
});

describe("Receipts and worker workflow security contract", () => {
  const sql = readFileSync(
    "supabase/migrations/202607140001_receipts_workers_materials.sql",
    "utf8",
  );
  it("contains the complete accounting and materials model", () => {
    for (const table of [
      "expense_categories",
      "receipts",
      "receipt_files",
      "receipt_ocr_jobs",
      "receipt_duplicate_candidates",
      "receipt_export_batches",
      "receipt_export_items",
      "project_workers",
      "project_worker_invites",
      "material_requests",
      "material_request_items",
      "material_request_status_history",
      "receipt_request_links",
      "push_subscriptions",
      "notifications",
    ])
      expect(sql).toContain(`create table public.${table}`);
  });
  it("uses expiring invitations, approval-aware worker access and immutable exports", () => {
    expect(sql).toContain("now() + interval '15 minutes'");
    expect(sql).toContain("w.status = 'active'");
    expect(sql).toContain("guard_immutable_receipt_export");
    expect(sql).toContain("bucket_id = 'receipts'");
    expect(sql).toContain("enable row level security");
  });
});

describe("Approved work shift contract", () => {
  const sql = readFileSync(
    "supabase/migrations/202608010005_work_shifts.sql",
    "utf8",
  );
  it("keeps one active worker shift, immutable events and explicit payroll approval", () => {
    expect(sql).toContain("create table public.work_shifts");
    expect(sql).toContain("create table public.work_shift_events");
    expect(sql).toContain("where status='active'");
    expect(sql).toContain("start_my_work_shift");
    expect(sql).toContain("end_my_work_shift");
    expect(sql).toContain("approve_work_shift");
    expect(sql).toContain("WORK_SHIFT_RPC_REQUIRED");
    expect(sql).toContain("'schemaVersion',19");
  });
});

describe("Personal safety briefing contract", () => {
  const sql = readFileSync(
    "supabase/migrations/202608010006_safety_briefings.sql",
    "utf8",
  );
  it("freezes published content and attributes every worker decision", () => {
    expect(sql).toContain("create table public.safety_briefings");
    expect(sql).toContain("create table public.safety_briefing_recipients");
    expect(sql).toContain("create table public.safety_briefing_events");
    expect(sql).toContain("publish_safety_briefing");
    expect(sql).toContain("acknowledge_my_safety_briefing");
    expect(sql).toContain("SAFETY_BRIEFING_EVENT_IMMUTABLE");
    expect(sql).toContain("'schemaVersion',20");
  });
});

describe("Plans, pins and task security contract", () => {
  const sql = readFileSync(
    "supabase/migrations/202607230001_plans_pins_tasks.sql",
    "utf8",
  );
  it("creates private plans and location-aware tasks with owner RLS", () => {
    expect(sql).toContain("create table public.project_plans");
    expect(sql).toContain("create table public.site_tasks");
    expect(sql).toContain("site_task_pin_complete");
    expect(sql).toContain("x_ratio between 0 and 1");
    expect(sql).toContain("project_plans_owner");
    expect(sql).toContain("site_tasks_owner");
    expect(sql).toContain("bucket_id = 'plans'");
    expect(sql).toContain("'projectPlans'");
    expect(sql).toContain("'siteTasks'");
  });
  it("adds task evidence, immutable plan history and worker-only task access", () => {
    const workflow = readFileSync(
      "supabase/migrations/202607230005_task_evidence_plan_versions_worker_tasks.sql",
      "utf8",
    );
    expect(workflow).toContain(
      "evidence_role in ('before', 'after', 'general')",
    );
    expect(workflow).toContain("project_plans_series_version_idx");
    expect(workflow).toContain("project_plans_current_series_idx");
    expect(workflow).toContain("save_project_plan_version");
    expect(workflow).toContain("site_tasks_assigned_worker_read");
    expect(workflow).toContain("set_my_site_task_status");
  });
  it("requires photo-backed worker submission and an explicit foreman review", () => {
    const review = readFileSync(
      "supabase/migrations/202607250001_task_completion_review.sql",
      "utf8",
    );
    expect(review).toContain("'review','done'");
    expect(review).toContain("submit_my_site_task");
    expect(review).toContain("review_site_task");
    expect(review).toContain("TASK_REWORK_NOTE_REQUIRED");
    expect(review).toContain("SITE_TASK_REVIEW_WORKFLOW_REQUIRED");
    expect(review).toContain("attachments_storage_worker_task_insert");
    expect(review).toContain("worker.auth_user_id = auth.uid()");
    expect(review).toContain("evidence_role = 'after'");
    expect(review).toContain(
      "jsonb_array_length(p_evidence) not between 1 and 6",
    );
  });
});

describe("Selective client progress sharing contract", () => {
  const sharing = readFileSync(
    "supabase/migrations/202607270001_client_progress_sharing.sql",
    "utf8",
  );

  it("stores only hashed, expiring and revocable links behind owner RLS", () => {
    expect(sharing).toContain("create table public.project_share_links");
    expect(sharing).toContain("token_hash text not null unique");
    expect(sharing).toContain("expires_at <= created_at + interval '30 days'");
    expect(sharing).toContain("project_share_links_owner");
    expect(sharing).toContain("create_project_share_link");
    expect(sharing).toContain("revoke_project_share_link");
    expect(sharing).toContain("to_jsonb(x) - 'token_hash'");
    expect(sharing).toContain("set search_path = public, auth, extensions");
  });

  it("publishes only explicitly selected accepted tasks and hides reopened work", () => {
    expect(sharing).toContain("check (not client_visible or status = 'done')");
    expect(sharing).toContain("hide_non_completed_task_from_client");
    expect(sharing).toContain("new.status <> 'done'");
    expect(sharing).toContain("and visible.client_visible");
    expect(sharing).toContain("and visible.status = 'done'");
    expect(sharing).toContain("and attachment.evidence_role = 'after'");
    expect(sharing).toContain(
      "grant execute on function public.resolve_project_share_snapshot(text)",
    );
    expect(sharing).toContain("to service_role");
  });

  it("records immutable client acceptance through expiring links", () => {
    const acceptance = readFileSync(
      "supabase/migrations/202607280003_client_task_acceptance.sql",
      "utf8",
    );
    expect(acceptance).toContain("create table public.client_task_decisions");
    expect(acceptance).toContain("submit_project_share_task_decision");
    expect(acceptance).toContain("CLIENT_CONFIRMATION_REQUIRED");
    expect(acceptance).toContain("CLIENT_REWORK_COMMENT_REQUIRED");
    expect(acceptance).toContain("CLIENT_TASK_DECISION_IMMUTABLE");
    expect(acceptance).toContain("event_type,body,metadata,created_at");
    expect(acceptance).toContain("'client_decision'");
    expect(acceptance).toContain("set status='in_progress'");
  });

  it("requires formal approval for additional price and schedule changes", () => {
    const changes = readFileSync(
      "supabase/migrations/202607280004_change_orders.sql",
      "utf8",
    );
    expect(changes).toContain("create table public.change_orders");
    expect(changes).toContain("create table public.change_order_events");
    expect(changes).toContain("save_change_order");
    expect(changes).toContain("submit_project_share_change_order_decision");
    expect(changes).toContain("CHANGE_ORDER_IMMUTABLE");
    expect(changes).toContain("CHANGE_ORDER_REJECTION_COMMENT_REQUIRED");
    expect(changes).toContain("pg_advisory_xact_lock");
    expect(changes).toContain("'changeOrderEvents'");
  });

  it("isolates project budgets and exports the financial frame", () => {
    const finance = readFileSync(
      "supabase/migrations/202607280005_project_financial_control.sql",
      "utf8",
    );
    expect(finance).toContain("create table public.project_budgets");
    expect(finance).toContain("project_budgets_owner_select");
    expect(finance).toContain("project_budgets_owner_insert");
    expect(finance).toContain("project_budgets_owner_update");
    expect(finance).toContain("contingency_cents <= baseline_budget_cents");
    expect(finance).toContain("project_budgets_audit");
    expect(finance).toContain("'projectBudgets'");
    expect(finance).toContain("'schemaVersion',9");
  });

  it("isolates schedule baselines and exports them with the account", () => {
    const schedule = readFileSync(
      "supabase/migrations/202607280006_project_schedule_forecast.sql",
      "utf8",
    );
    expect(schedule).toContain("create table public.project_schedules");
    expect(schedule).toContain("project_schedules_owner_select");
    expect(schedule).toContain("project_schedules_owner_insert");
    expect(schedule).toContain("project_schedules_owner_update");
    expect(schedule).toContain("check (target_completion_date >= start_date)");
    expect(schedule).toContain("project_schedules_audit");
    expect(schedule).toContain("'projectSchedules'");
    expect(schedule).toContain("'schemaVersion',10");
  });

  it("publishes immutable weekly snapshots to temporary client links", () => {
    const weekly = readFileSync(
      "supabase/migrations/202607280007_weekly_client_reports.sql",
      "utf8",
    );
    expect(weekly).toContain("create table public.weekly_reports");
    expect(weekly).toContain("weekly_reports_owner_select");
    expect(weekly).toContain("save_weekly_report");
    expect(weekly).toContain("WEEKLY_REPORT_CONFIRMATION_REQUIRED");
    expect(weekly).toContain("WEEKLY_REPORT_IMMUTABLE");
    expect(weekly).toContain("resolve_project_share_weekly_reports");
    expect(weekly).toContain(
      "alter type public.report_type add value if not exists 'weekly'",
    );
    expect(weekly).toContain("'weeklyReports'");
    expect(weekly).toContain("'schemaVersion',11");
  });

  it("stores bounded future commitments for cost-to-complete forecasting", () => {
    const forecast = readFileSync(
      "supabase/migrations/202607280008_cost_completion_forecast.sql",
      "utf8",
    );
    expect(forecast).toContain(
      "add column remaining_commitment_cents bigint not null default 0",
    );
    expect(forecast).toContain(
      "remaining_commitment_cents between 0 and 1000000000",
    );
    expect(forecast).toContain("'projectBudgets'");
    expect(forecast).toContain("'weeklyReports'");
    expect(forecast).toContain("'schemaVersion',12");
  });

  it("stores immutable daily control decisions with owner isolation", () => {
    const actions = readFileSync(
      "supabase/migrations/202607290001_daily_control_actions.sql",
      "utf8",
    );
    expect(actions).toContain("create table public.daily_control_actions");
    expect(actions).toContain("daily_control_actions_owner_select");
    expect(actions).toContain("save_daily_control_action");
    expect(actions).toContain("DAILY_CONTROL_ACTION_CONFIRMATION_REQUIRED");
    expect(actions).toContain("DAILY_CONTROL_ACTION_IMMUTABLE");
    expect(actions).toContain("'dailyControlActions'");
    expect(actions).toContain("'schemaVersion',13");
  });

  it("atomically seals versioned diary days with attributable corrections", () => {
    const closures = readFileSync(
      "supabase/migrations/202607290002_legal_day_closures.sql",
      "utf8",
    );
    expect(closures).toContain("create table public.day_closures");
    expect(closures).toContain("confirm_day_closure");
    expect(closures).toContain("DAY_CLOSURE_CONFIRMATION_REQUIRED");
    expect(closures).toContain("DAY_CLOSURE_CORRECTION_REASON_REQUIRED");
    expect(closures).toContain("DAY_CLOSURE_IMMUTABLE");
    expect(closures).toContain(
      "digest(convert_to(snapshot::text,'UTF8'),'sha256')",
    );
    expect(closures).toContain(
      "locked_at=coalesce(locked_at,result.confirmed_at)",
    );
    expect(closures).toContain("'dayClosures'");
    expect(closures).toContain("'schemaVersion',14");
  });

  it("records recipient-specific decisions for an exact closed diary version", () => {
    const approvals = readFileSync(
      "supabase/migrations/202608080009_diary_approval_workflow_v30.sql",
      "utf8",
    );
    expect(approvals).toContain("create table public.diary_approval_requests");
    expect(approvals).toContain("create table public.diary_approval_events");
    expect(approvals).toContain("create_diary_approval_request");
    expect(approvals).toContain("submit_diary_approval_decision");
    expect(approvals).toContain("DIARY_APPROVAL_SIGNER_MISMATCH");
    expect(approvals).toContain("DIARY_APPROVAL_EVENT_IMMUTABLE");
    expect(approvals).toContain("to_jsonb(x)-'token_hash'");
    expect(approvals).toContain("'schemaVersion',30");
  });

  it("records supplier comparisons, one audited selection and receipt coverage", () => {
    const procurement = readFileSync(
      "supabase/migrations/202607290003_material_procurement_quotes.sql",
      "utf8",
    );
    expect(procurement).toContain(
      "create table public.material_supplier_quotes",
    );
    expect(procurement).toContain(
      "create table public.material_supplier_quote_decisions",
    );
    expect(procurement).toContain("material_supplier_quotes_one_selected_idx");
    expect(procurement).toContain("select_material_supplier_quote");
    expect(procurement).toContain("recompute_material_request_purchase_status");
    expect(procurement).toContain("'materialSupplierQuotes'");
    expect(procurement).toContain("'schemaVersion',15");
  });

  it("accepts bounded supplier offers through hashed temporary links", () => {
    const rfq = readFileSync(
      "supabase/migrations/202608010001_public_supplier_quote_requests.sql",
      "utf8",
    );
    expect(rfq).toContain(
      "create table public.material_supplier_quote_invites",
    );
    expect(rfq).toContain(
      "create table public.material_supplier_quote_submissions",
    );
    expect(rfq).toContain("token_hash text not null unique");
    expect(rfq).toContain("max_submissions integer not null default 25");
    expect(rfq).toContain("material_supplier_quote_invites_one_active_idx");
    expect(rfq).toContain("create_material_supplier_quote_invite");
    expect(rfq).toContain("resolve_material_supplier_quote_invite");
    expect(rfq).toContain("submit_material_supplier_quote");
    expect(rfq).toContain("idempotency_key uuid not null");
    expect(rfq).toContain("'supplier_quote'");
    expect(rfq).toContain("to service_role");
    expect(rfq).toContain("to_jsonb(item)-'token_hash'");
    expect(rfq).toContain("'schemaVersion',16");
  });

  it("keeps formal RFI questions tied to exact drawing revisions", () => {
    const rfi = readFileSync(
      "supabase/migrations/202608010002_project_rfi_register.sql",
      "utf8",
    );
    expect(rfi).toContain("create table public.project_rfis");
    expect(rfi).toContain("create table public.project_rfi_events");
    expect(rfi).toContain("unique(project_id,rfi_number)");
    expect(rfi).toContain("validate_rfi_plan_pin");
    expect(rfi).toContain("OPEN_PROJECT_RFI_IMMUTABLE");
    expect(rfi).toContain("RFI_OPEN_CONFIRMATION_REQUIRED");
    expect(rfi).toContain("RFI_CLOSE_CONFIRMATION_REQUIRED");
    expect(rfi).toContain("PROJECT_RFI_EVENT_IMMUTABLE");
    expect(rfi).toContain("'project_rfi'");
    expect(rfi).toContain("'projectRfis'");
    expect(rfi).toContain("'projectRfiEvents'");
    expect(rfi).toContain("'schemaVersion',17");
  });

  it("keeps tool custody transitions guarded and auditable", () => {
    const tools = readFileSync(
      "supabase/migrations/202608010003_project_tool_register.sql",
      "utf8",
    );
    expect(tools).toContain("create table public.project_tools");
    expect(tools).toContain("create table public.project_tool_events");
    expect(tools).toContain("unique(project_id,asset_number)");
    expect(tools).toContain("PROJECT_TOOL_RPC_REQUIRED");
    expect(tools).toContain("PROJECT_TOOL_EVENT_IMMUTABLE");
    expect(tools).toContain("issue_project_tool");
    expect(tools).toContain("return_project_tool");
    expect(tools).toContain("report_project_tool_issue");
    expect(tools).toContain("complete_project_tool_maintenance");
    expect(tools).toContain("retire_project_tool");
    expect(tools).toContain("'projectTools'");
    expect(tools).toContain("'projectToolEvents'");
    expect(tools).toContain("'schemaVersion',18");
  });

  it("stores tool inventory exports in the private report registry", () => {
    const reports = readFileSync(
      "supabase/migrations/202608010004_tool_inventory_reports.sql",
      "utf8",
    );
    expect(reports).toContain(
      "alter type public.report_type add value if not exists 'tool_inventory'",
    );
  });
  it("guards worker qualifications and exports their immutable history", () => {
    const credentials = readFileSync(
      "supabase/migrations/202608010007_worker_credentials.sql",
      "utf8",
    );
    expect(credentials).toContain("create table public.worker_credentials");
    expect(credentials).toContain(
      "create table public.worker_credential_events",
    );
    expect(credentials).toContain("WORKER_CREDENTIAL_RPC_REQUIRED");
    expect(credentials).toContain("WORKER_CREDENTIAL_EVENT_IMMUTABLE");
    expect(credentials).toContain("save_worker_credential");
    expect(credentials).toContain("revoke_worker_credential");
    expect(credentials).toContain("restore_worker_credential");
    expect(credentials).toContain("'worker_credential'");
    expect(credentials).toContain("'schemaVersion',21");
  });
  it("guards HSE incidents and exports their immutable investigation history", () => {
    const incidents = readFileSync(
      "supabase/migrations/202608080001_site_incidents.sql",
      "utf8",
    );
    expect(incidents).toContain("create table public.site_incidents");
    expect(incidents).toContain("create table public.site_incident_events");
    expect(incidents).toContain("SITE_INCIDENT_EVENT_IMMUTABLE");
    expect(incidents).toContain("report_my_site_incident");
    expect(incidents).toContain("'schemaVersion',22");
  });
  it("guards delivery reconciliation and exports its immutable review history", () => {
    const sql = readFileSync(
      "supabase/migrations/202608080002_material_deliveries.sql",
      "utf8",
    );
    expect(sql).toContain("create table public.material_deliveries");
    expect(sql).toContain("create table public.material_delivery_lines");
    expect(sql).toContain("MATERIAL_DELIVERY_EVENT_IMMUTABLE");
    expect(sql).toContain("report_my_material_delivery");
    expect(sql).toContain("review_material_delivery");
    expect(sql).toContain("'schemaVersion',23");
  });
  it("guards the site stock ledger and exports immutable worker decisions", () => {
    const sql = readFileSync(
      "supabase/migrations/202608080003_material_stock.sql",
      "utf8",
    );
    expect(sql).toContain("create table public.material_stock_movements");
    expect(sql).toContain("create table public.material_stock_movement_events");
    expect(sql).toContain("MATERIAL_STOCK_RPC_REQUIRED");
    expect(sql).toContain("MATERIAL_STOCK_EVENT_IMMUTABLE");
    expect(sql).toContain("my_material_stock_options");
    expect(sql).toContain("report_my_material_stock_movement");
    expect(sql).toContain("review_material_stock_movement");
    expect(sql).toContain("'schemaVersion',24");
  });
});

describe("Task timeline and discussion security contract", () => {
  const timeline = readFileSync(
    "supabase/migrations/202607280001_site_task_timeline.sql",
    "utf8",
  );

  it("keeps system history immutable and participant comments attributable", () => {
    expect(timeline).toContain("create table public.site_task_events");
    expect(timeline).toContain("track_site_task_event");
    expect(timeline).toContain("TASK_EVENT_IMMUTABLE");
    expect(timeline).toContain("SYSTEM_TASK_EVENT_REQUIRED");
    expect(timeline).toContain("site_task_events_owner_comment");
    expect(timeline).toContain("site_task_events_worker_comment");
    expect(timeline).toContain("notify_site_task_comment");
    expect(timeline).toContain("'siteTaskEvents'");
    expect(timeline).toContain("'schemaVersion',6");
  });
});

describe("Task evidence report storage contract", () => {
  it("adds evidence packs to the private report enum", () => {
    const evidenceReport = readFileSync(
      "supabase/migrations/202607280002_evidence_pack_reports.sql",
      "utf8",
    );
    expect(evidenceReport).toContain(
      "alter type public.report_type add value if not exists 'evidence_pack'",
    );
  });
});

describe("Photo evidence integrity contract", () => {
  it("records immutable hashes and disables in-place storage overwrite", () => {
    const evidence = readFileSync(
      "supabase/migrations/202608080008_photo_evidence_integrity_v29.sql",
      "utf8",
    );
    expect(evidence).toContain("content_sha256 text");
    expect(evidence).toContain("ATTACHMENT_EVIDENCE_IMMUTABLE");
    expect(evidence).toContain(
      "drop policy if exists attachments_storage_owner",
    );
    expect(evidence).not.toMatch(/on storage\.objects for update/);
    expect(evidence).toContain("evidence->>'contentSha256'");
    expect(evidence).toContain("'schemaVersion',29");
  });
});
