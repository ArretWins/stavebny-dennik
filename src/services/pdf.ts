import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import * as Crypto from "expo-crypto";
import type {
  Attachment,
  Project,
  ReportExport,
  WeeklyReport,
} from "@/domain/types";
import type {
  ProjectTool,
  ProjectToolEvent,
  ProjectWorker,
} from "@/domain/types";
import QRCode from "qrcode";
import {
  diaryPdfHtml,
  delayPdfHtml,
  taskEvidencePdfHtml,
  weeklyReportPdfHtml,
  type PdfAttachment,
  type TaskEvidencePdfInput,
} from "@/domain/pdfTemplate";
import {
  canonicalManifestJson,
  taskEvidenceManifest,
} from "@/domain/taskEvidencePack";
import { bytesToHex } from "@/domain/photoEvidence";
import { countPdfPageObjects } from "@/domain/pdfBinary";
import { sk } from "@/i18n/translations";
import { supabase } from "./supabase";
import {
  toolInventoryPdfHtml,
  toolLabelsPdfHtml,
} from "@/domain/toolPdfTemplate";

export { diaryPdfHtml, delayPdfHtml, taskEvidencePdfHtml, weeklyReportPdfHtml };

export async function inlinePdfAttachments(
  attachments: Attachment[],
): Promise<PdfAttachment[]> {
  return Promise.all(
    attachments.map(async (attachment) => {
      try {
        let sourceUri = attachment.localUri;
        let response = sourceUri
          ? await fetch(sourceUri).catch(() => undefined)
          : undefined;
        if ((!response || !response.ok) && supabase && attachment.storagePath) {
          const signed = await supabase.storage
            .from("attachments")
            .createSignedUrl(attachment.storagePath, 10 * 60);
          if (signed.error || !FileSystem.cacheDirectory)
            throw signed.error ?? new Error("CACHE_UNAVAILABLE");
          const destination = `${FileSystem.cacheDirectory}evidence-${attachment.id}.jpg`;
          const downloaded = await FileSystem.downloadAsync(
            signed.data.signedUrl,
            destination,
          );
          sourceUri = downloaded.uri;
          response = await fetch(sourceUri);
        }
        if (!response) throw new Error("ATTACHMENT_READ_FAILED");
        if (!response.ok) throw new Error("ATTACHMENT_READ_FAILED");
        const bytes = await response.arrayBuffer();
        const contentDigest = bytesToHex(
          await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes),
        );
        const base64 = await FileSystem.readAsStringAsync(sourceUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return {
          ...attachment,
          pdfUri: `data:${attachment.mimeType};base64,${base64}`,
          contentDigest,
          integrityStatus: attachment.contentSha256
            ? attachment.contentSha256 === contentDigest
              ? ("verified" as const)
              : ("mismatch" as const)
            : ("unrecorded" as const),
        };
      } catch {
        return {
          ...attachment,
          pdfUri: attachment.localUri,
          integrityStatus: "unavailable" as const,
        };
      }
    }),
  );
}

async function countPdfPages(uri: string, fallback: number): Promise<number> {
  try {
    const response = await fetch(uri);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return countPdfPageObjects(binary) || fallback;
  } catch {
    return fallback;
  }
}
export async function createPdf(
  html: string,
): Promise<{ uri: string; pageCount: number }> {
  const result = await Print.printToFileAsync({ html });
  return {
    uri: result.uri,
    pageCount: await countPdfPages(result.uri, result.numberOfPages),
  };
}
export async function sharePdf(uri: string): Promise<void> {
  if (await Sharing.isAvailableAsync())
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: sk.reports.share,
    });
}
export function reportFromPdf(
  ownerId: string,
  projectId: string,
  type: ReportExport["type"],
  uri: string,
  pageCount: number,
  sourceEntityId?: string,
  attachmentIds: string[] = [],
): ReportExport {
  return {
    id: `report_${Date.now()}`,
    ownerId,
    projectId,
    type,
    sourceEntityId,
    attachmentIds,
    locale: "sk-SK",
    storagePath: uri,
    createdAt: new Date().toISOString(),
    pageCount,
    status: "synced",
  };
}

export async function generateRemoteReport(
  projectId: string,
  type: "diary" | "delay",
  sourceEntityId?: string,
): Promise<ReportExport> {
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const { data, error } = await supabase.functions.invoke("generate-report", {
    body: { projectId, type, sourceEntityId },
  });
  if (error) throw error;
  if (!data?.report?.id || !data.report.storagePath)
    throw new Error("INVALID_REPORT_RESPONSE");
  return data.report as ReportExport;
}

export async function uploadPrivateReport(
  report: ReportExport,
  localUri: string,
): Promise<ReportExport> {
  if (!supabase) return report;
  const response = await fetch(localUri);
  if (!response.ok) throw new Error("REPORT_READ_FAILED");
  const bytes = await response.arrayBuffer();
  const storagePath = `${report.ownerId}/${report.projectId}/${Date.now()}.pdf`;
  const upload = await supabase.storage
    .from("reports")
    .upload(storagePath, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (upload.error) throw upload.error;
  const { data, error } = await supabase
    .from("report_exports")
    .insert({
      owner_id: report.ownerId,
      project_id: report.projectId,
      report_type: report.type,
      source_entity_id: report.sourceEntityId ?? null,
      attachment_ids: report.attachmentIds ?? [],
      locale: report.locale,
      storage_path: storagePath,
      page_count: report.pageCount,
      status: "synced",
    })
    .select("id, created_at")
    .single();
  if (error) throw error;
  return {
    ...report,
    id: String(data.id),
    storagePath,
    createdAt: String(data.created_at),
    status: "synced",
  };
}

export async function shareReport(report: ReportExport): Promise<void> {
  if (
    supabase &&
    report.storagePath &&
    !report.storagePath.startsWith("file://")
  ) {
    const { data, error } = await supabase.storage
      .from("reports")
      .createSignedUrl(report.storagePath, 60 * 60);
    if (error) throw error;
    const destination = `${FileSystem.cacheDirectory}report-${report.id}.pdf`;
    const download = await FileSystem.downloadAsync(
      data.signedUrl,
      destination,
    );
    await sharePdf(download.uri);
    return;
  }
  if (report.storagePath) await sharePdf(report.storagePath);
}

export async function createTaskEvidencePdf(
  input: Omit<
    TaskEvidencePdfInput,
    "attachments" | "generatedAt" | "manifestDigest"
  > & { attachments: Attachment[] },
): Promise<{
  uri: string;
  pageCount: number;
  manifestDigest: string;
  attachmentIds: string[];
}> {
  const generatedAt = new Date().toISOString();
  const inline = await inlinePdfAttachments(input.attachments);
  const attachments = inline;
  const manifest = taskEvidenceManifest({
    project: input.project,
    task: input.task,
    events: input.events,
    checklist: input.checklist,
    attachments,
    generatedAt,
  });
  const manifestDigest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    canonicalManifestJson(manifest),
  );
  const pdf = await createPdf(
    taskEvidencePdfHtml({
      ...input,
      attachments,
      generatedAt,
      manifestDigest,
    }),
  );
  return {
    ...pdf,
    manifestDigest,
    attachmentIds: attachments.map((item) => item.id),
  };
}

export async function createWeeklyReportPdf(input: {
  ownerId: string;
  project: Project;
  report: WeeklyReport;
  attachments: Attachment[];
}): Promise<ReportExport> {
  const selected = new Set(input.report.snapshot.attachmentIds);
  const inline = await inlinePdfAttachments(
    input.attachments.filter((attachment) => selected.has(attachment.id)),
  );
  const pdf = await createPdf(
    weeklyReportPdfHtml({
      project: input.project,
      report: input.report,
      attachments: inline,
    }),
  );
  return reportFromPdf(
    input.ownerId,
    input.project.id,
    "weekly",
    pdf.uri,
    pdf.pageCount,
    input.report.id,
    inline.map((attachment) => attachment.id),
  );
}

export async function createToolRegisterPdf(input: {
  ownerId: string;
  project: Project;
  tools: ProjectTool[];
  workers: ProjectWorker[];
  events: ProjectToolEvent[];
  mode: "inventory" | "labels";
}): Promise<ReportExport> {
  const generatedAt = new Date().toISOString();
  let html: string;
  if (input.mode === "labels") {
    const pairs = await Promise.all(
      input.tools.map(
        async (tool) =>
          [
            tool.id,
            await QRCode.toString(
              `stavebnydennik://tools/${encodeURIComponent(tool.id)}`,
              {
                type: "svg",
                errorCorrectionLevel: "M",
                margin: 0,
                color: { dark: "#1F2A30", light: "#FFFFFF" },
              },
            ),
          ] as const,
      ),
    );
    html = toolLabelsPdfHtml({
      ...input,
      generatedAt,
      qrSvgByToolId: Object.fromEntries(pairs),
    });
  } else {
    html = toolInventoryPdfHtml({ ...input, generatedAt });
  }
  const pdf = await createPdf(html);
  const local = reportFromPdf(
    input.ownerId,
    input.project.id,
    "tool_inventory",
    pdf.uri,
    pdf.pageCount,
    input.mode === "labels" ? "tool_labels" : "tool_inventory",
  );
  if (!supabase) return local;
  try {
    return await uploadPrivateReport(local, pdf.uri);
  } catch {
    return local;
  }
}
