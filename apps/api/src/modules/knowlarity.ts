import { timingSafeEqual, randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { AppError, asyncRoute, auth, ok, prisma, tenantId, audit } from "../lib.js";
import { config } from "../config.js";

export const knowlarityRouter = Router();

const text = (value: unknown) =>
  value === undefined || value === null ? undefined : String(value).trim() || undefined;
const pick = (body: any, keys: string[]) => {
  for (const key of keys) {
    const value = key.split(".").reduce((node, part) => node?.[part], body);
    if (value !== undefined && value !== null && value !== "") return value;
  }
};
const date = (value: unknown) => {
  if (!value) return undefined;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};
const phone = (value: unknown) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
};
const callStatus = (value: unknown) => {
  const status = String(value ?? "").toUpperCase().replace(/[ -]/g, "_");
  if (/ABANDON/.test(status)) return "ABANDONED" as const;
  if (/MISS|NO_ANSWER/.test(status)) return "MISSED" as const;
  if (/ANSWER|CONNECT/.test(status)) return "ANSWERED" as const;
  if (/COMPLETE|HANGUP|DISCONNECT/.test(status)) return "COMPLETED" as const;
  if (/RING|INITIAT/.test(status)) return "RINGING" as const;
  if (/FAIL|BUSY|REJECT/.test(status)) return "FAILED" as const;
  return "UNKNOWN" as const;
};
const documentedStatus = (body: any) => {
  const event = String(pick(body, ["event_type", "event", "type"]) ?? "").toUpperCase();
  const business = String(pick(body, ["business_call_type", "destination", "events.New_Hangup_Cause"]) ?? "").toUpperCase();
  if (/MISSED CALL|AGENT MISSED|CUSTOMER MISSED|UNANSWERED|ABANDON/.test(business)) return /ABANDON/.test(business) ? "ABANDONED" as const : "MISSED" as const;
  if (event === "HANGUP" || event === "CDR") return /MISSED|UNANSWERED/.test(business) ? "MISSED" as const : "COMPLETED" as const;
  if (event === "BRIDGE" || event === "AGENT_ANSWER" || event === "CUSTOMER_ANSWER") return "ANSWERED" as const;
  if (event === "ORIGINATE" || event === "AGENT_CALL" || event === "CUSTOMER_CALL") return "RINGING" as const;
  return callStatus(pick(body, ["call_status", "callStatus", "status", "event", "event_type"]));
};
const validSecret = (provided: string | undefined) => {
  const expected = config.KNOWLARITY_WEBHOOK_SECRET;
  if (!provided || !expected) return false;
  const a = Buffer.from(provided), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

// Register this URL in Knowlarity Notifications/Post Call Hook:
// POST /api/integrations/knowlarity/webhook
knowlarityRouter.post("/webhook", asyncRoute(async (req, res) => {
  const provided = text(req.headers["x-webhook-secret"] ?? req.headers["x-knowlarity-secret"] ?? req.query.secret);
  if (!validSecret(provided)) throw new AppError(401, "Invalid webhook secret", "INVALID_WEBHOOK_SECRET");
  if (!config.KNOWLARITY_TENANT_ID) throw new AppError(503, "Knowlarity tenant mapping is not configured", "INTEGRATION_NOT_CONFIGURED");

  const body: any = req.body?.data ?? req.body;
  const externalId = text(pick(body, ["call_id", "callId", "uuid", "call_uuid", "id", "resource_id"]));
  const incoming = !String(pick(body, ["Call_Type", "call_type", "call_direction", "direction"]) ?? "Inbound").toUpperCase().includes("OUT");
  const callerNumber = phone(pick(body, incoming
    ? ["customer_number", "caller_id", "caller_number", "callerNumber", "customerNumber", "from", "source", "caller"]
    : ["customer_number", "destination", "called", "caller_number", "callerNumber"]));
  if (!externalId || !callerNumber) throw new AppError(400, "Call ID and caller number are required", "INVALID_CALL_EVENT");

  const tid = config.KNOWLARITY_TENANT_ID;
  const tenant = await prisma.tenant.findUnique({ where: { id: tid }, select: { id: true } });
  if (!tenant) throw new AppError(503, "Configured Knowlarity tenant does not exist", "INVALID_TENANT_MAPPING");

  const eventId = text(pick(body, ["event_id", "eventId", "notification_id"])) ?? `${externalId}:${text(pick(body, ["event", "event_type", "status", "call_status"])) ?? "update"}:${date(pick(body, ["end_time", "ended_at", "updated_at"]))?.toISOString() ?? randomUUID()}`;
  const priorEvent = await prisma.webhookEvent.findUnique({ where: { provider_externalId: { provider: "KNOWLARITY", externalId: eventId } } });
  if (priorEvent) return ok(res, { accepted: true, duplicate: true });

  let patient = await prisma.patient.findFirst({ where: { tenantId: tid, mobile: { endsWith: callerNumber } } });
  let lead = patient?.leadId ? await prisma.lead.findUnique({ where: { id: patient.leadId } }) : await prisma.lead.findFirst({ where: { tenantId: tid, mobile: { endsWith: callerNumber } } });
  if (!patient && !lead) {
    const creator = await prisma.user.findFirst({ where: { tenantId: tid, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
    if (!creator) throw new AppError(503, "Tenant has no active user for IVR lead creation", "NO_INTEGRATION_USER");
    const source = await prisma.leadSource.upsert({
      where: { tenantId_code: { tenantId: tid, code: "KNOWLARITY_IVR" } },
      create: { tenantId: tid, name: "Knowlarity IVR", code: "KNOWLARITY_IVR" },
      update: { status: "ACTIVE" },
    });
    lead = await prisma.lead.create({ data: { tenantId: tid, leadNumber: `LD-IVR-${Date.now().toString(36).toUpperCase()}`, name: `IVR Caller ${callerNumber.slice(-4)}`, mobile: callerNumber, sourceId: source.id, createdById: creator.id, remarks: "Automatically created from a Knowlarity incoming call" } });
  }

  const status = documentedStatus(body);
  const startedAt = date(pick(body, ["start_time", "started_at", "startTime", "call_start_time"]));
  const answeredAt = date(pick(body, ["answer_time", "answered_at", "answerTime"]));
  const endedAt = date(pick(body, ["end_time", "ended_at", "endTime", "call_end_time"]));
  const suppliedDuration = Number(pick(body, ["duration", "call_duration", "duration_seconds"]));
  const durationSeconds = Number.isFinite(suppliedDuration) ? suppliedDuration : startedAt && endedAt ? Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)) : undefined;

  const record = await prisma.$transaction(async (tx) => {
    await tx.webhookEvent.create({ data: { provider: "KNOWLARITY", externalId: eventId, payload: req.body, processedAt: new Date() } });
    return tx.callRecord.upsert({
      where: { provider_externalId: { provider: "KNOWLARITY", externalId } },
      create: {
        tenantId: tid, externalId, callerNumber,
        destinationNumber: phone(pick(body, ["destination_number", "destinationNumber", "destination", "agent_number", "to"])) || undefined,
        virtualNumber: phone(pick(body, ["knowlarity_number", "dispnumber", "k_number", "virtual_number", "virtualNumber", "business_number", "did"])) || undefined,
        direction: incoming ? "INBOUND" : "OUTBOUND",
        status, leadId: lead?.id, patientId: patient?.id,
        agentExternalId: text(pick(body, ["agent_id", "agentId", "agent_number"])), agentName: text(pick(body, ["agent_name", "agentName"])),
        ivrSelection: text(pick(body, ["ivr_selection", "ivrSelection", "dtmf", "keypress"])),
        disposition: text(pick(body, ["disposition", "call_disposition", "business_call_type"])), recordingUrl: text(pick(body, ["resource_url", "call_recording", "recording_url", "recordingUrl", "recording"])),
        startedAt, answeredAt, endedAt, durationSeconds, rawPayload: req.body,
      },
      update: {
        status, leadId: lead?.id, patientId: patient?.id,
        agentExternalId: text(pick(body, ["agent_id", "agentId"])), agentName: text(pick(body, ["agent_name", "agentName"])),
        ivrSelection: text(pick(body, ["ivr_selection", "ivrSelection", "dtmf", "keypress"])),
        disposition: text(pick(body, ["disposition", "call_disposition", "business_call_type"])), recordingUrl: text(pick(body, ["resource_url", "call_recording", "recording_url", "recordingUrl", "recording"])),
        startedAt, answeredAt, endedAt, durationSeconds, rawPayload: req.body,
      },
    });
  });
  return ok(res, { accepted: true, callId: record.id, leadId: lead?.id, patientId: patient?.id }, "Call event processed");
}));

knowlarityRouter.get("/status", auth, asyncRoute(async (req, res) => {
  tenantId(req);
  return ok(res, {
    configured: Boolean(config.KNOWLARITY_WEBHOOK_SECRET && config.KNOWLARITY_TENANT_ID),
    relayWebhookUrl: `${config.APP_URL.replace(/\/$/, "")}/api/integrations/knowlarity/webhook`,
    streamingUrl: config.KNOWLARITY_AUTHORIZATION ? "Configured server-side (credential hidden)" : null,
    callLogsApiConfigured: Boolean(config.KNOWLARITY_AUTHORIZATION && config.KNOWLARITY_API_KEY),
  });
}));

knowlarityRouter.post("/make-call", auth, asyncRoute(async (req, res) => {
  const tid = tenantId(req);
  if (!config.KNOWLARITY_AUTHORIZATION || !config.KNOWLARITY_API_KEY || !config.KNOWLARITY_NUMBER)
    throw new AppError(503, "Knowlarity outbound calling is not configured", "INTEGRATION_NOT_CONFIGURED");
  const body = z.object({ agentNumber: z.string().min(10), customerNumber: z.string().min(10) }).parse(req.body);
  const toE164 = (value: string) => { const digits = value.replace(/\D/g, ""); return `+${digits.length === 10 ? `91${digits}` : digits}`; };
  const response = await fetch(`${config.KNOWLARITY_API_BASE_URL.replace(/\/$/, "")}/${config.KNOWLARITY_CHANNEL}/v1/account/call/makecall`, {
    method: "POST",
    headers: { authorization: config.KNOWLARITY_AUTHORIZATION, "x-api-key": config.KNOWLARITY_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ k_number: toE164(config.KNOWLARITY_NUMBER), agent_number: toE164(body.agentNumber), customer_number: toE164(body.customerNumber) }),
  });
  const result: any = await response.json().catch(() => ({}));
  if (!response.ok || result.error) throw new AppError(502, result.error?.message || "Knowlarity could not place the call", "KNOWLARITY_CALL_FAILED");
  await audit(req, "knowlarity.outbound.requested", "CallRecord", undefined, { tenantId: tid, agentNumber: phone(body.agentNumber), customerNumber: phone(body.customerNumber) });
  return ok(res, result, "Outbound call requested");
}));

knowlarityRouter.get("/calls", auth, asyncRoute(async (req, res) => {
  const tid = tenantId(req);
  const query = z.object({ status: z.string().optional(), direction: z.string().optional(), search: z.string().optional(), page: z.coerce.number().min(1).default(1), limit: z.coerce.number().min(1).max(100).default(25) }).parse(req.query);
  const where: any = { tenantId: tid };
  if (query.status) where.status = query.status;
  if (query.direction) where.direction = query.direction;
  if (query.search) where.OR = [{ callerNumber: { contains: query.search } }, { agentName: { contains: query.search, mode: "insensitive" } }, { externalId: { contains: query.search } }];
  const [items, total] = await Promise.all([
    prisma.callRecord.findMany({ where, include: { lead: { select: { id: true, name: true, leadNumber: true } }, patient: { select: { id: true, name: true, patientNumber: true } } }, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.callRecord.count({ where }),
  ]);
  return ok(res, { items, total, page: query.page, limit: query.limit });
}));

knowlarityRouter.patch("/calls/:id", auth, asyncRoute(async (req, res) => {
  const tid = tenantId(req);
  const body = z.object({ disposition: z.string().max(100).optional(), notes: z.string().max(1000).optional() }).parse(req.body);
  const found = await prisma.callRecord.findFirst({ where: { id: req.params.id, tenantId: tid } });
  if (!found) throw new AppError(404, "Call not found", "NOT_FOUND");
  const updated = await prisma.callRecord.update({ where: { id: found.id }, data: body });
  await audit(req, "knowlarity.call.updated", "CallRecord", updated.id, body);
  return ok(res, updated, "Call updated");
}));
