import { db } from "@/lib/db";
import { json, err } from "../session";

const TARGETS = ["activity", "post", "comment", "athlete", "club"] as const;
const REASONS = ["spam", "harassment", "inappropriate", "fake", "privacy", "other"];

async function targetExists(type: (typeof TARGETS)[number], id: string): Promise<boolean> {
  const where = { where: { id }, select: { id: true } };
  switch (type) {
    case "activity": return !!(await db.activity.findUnique(where));
    case "post": return !!(await db.post.findUnique(where));
    case "comment": return !!(await db.comment.findUnique(where));
    case "athlete": return !!(await db.athlete.findUnique(where));
    case "club": return !!(await db.club.findUnique(where));
  }
}

// POST /api/reports { targetType, targetId, reason, details? }
// Queues a report for the operator. Reporting the same thing twice updates the
// first report instead of piling up duplicates.
export async function createReport(viewerId: string | null, body: any): Promise<Response> {
  if (!viewerId) return err(401, "Sign in required");
  const targetType = TARGETS.find((t) => t === body?.targetType);
  const targetId = String(body?.targetId ?? "").trim();
  const reason = REASONS.includes(body?.reason) ? body.reason : null;
  if (!targetType || !targetId) return err(400, "What are you reporting?");
  if (!reason) return err(400, "Choose a reason for the report");
  if (targetType === "athlete" && targetId === viewerId) return err(400, "You can't report yourself");
  if (!(await targetExists(targetType, targetId))) return err(404, "That no longer exists");
  const details = body?.details ? String(body.details).trim().slice(0, 1000) || null : null;
  await db.report.upsert({
    where: { reporterId_targetType_targetId: { reporterId: viewerId, targetType, targetId } },
    create: { reporterId: viewerId, targetType, targetId, reason, details },
    update: { reason, details, status: "open", resolvedAt: null },
  });
  console.info(`[report] ${targetType} ${targetId} reported for ${reason}`);
  return json({ ok: true });
}
