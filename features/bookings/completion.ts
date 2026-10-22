import { completionPolicy } from "@/lib/config/site";
import type { Database, Queryable } from "@/lib/database/types";
import { one } from "@/lib/database/types";
import { withDbErrors } from "@/lib/database/errors";
import { DomainError, forbidden, notFound } from "@/lib/errors";
import { complaintReference } from "@/lib/ids";
import { recordAudit } from "@/lib/audit";
import { track } from "@/lib/analytics";
import { canChangeStatus, canSubmitCompletion, hasRole, relationsTo } from "@/lib/permissions";
import { completionInputSchema, parseOrThrow } from "@/lib/validation";
import { localDateKey, addDays } from "@/lib/time";
import { adminIds, notify, propertyManagerIds } from "@/features/notifications/service";
import { computeInvoiceAmounts, computePayout, type ApprovedEstimateAmounts } from "@/features/estimates/calc";
import { bookingContextFor, lockBooking, moveStatus, type BookingFacts } from "./service";
import type { Actor, ComplaintCategory } from "@/types/domain";
import { complaintCategories } from "@/types/domain";

export async function submitCompletion(db: Database, actor: Actor, rawInput: unknown): Promise<void> {
  const input = parseOrThrow(completionInputSchema, rawInput);
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const b = await lockBooking(tx, input.bookingId);
      if (!canSubmitCompletion(actor, b)) {
        if (b.technicianId !== actor.userId) throw notFound("Job not found.");
        throw new DomainError("INVALID_TRANSITION", "Finish any pending estimate before marking the work complete.");
      }
      await tx.query(
        `insert into job_completions (booking_id, technician_id, checklist, work_summary, submitted_at)
         values ($1, $2, $3::jsonb, $4, now())
         on conflict (booking_id) do update set checklist = excluded.checklist, work_summary = excluded.work_summary,
           submitted_at = now(), confirmed_by = null, confirmed_by_role = null, confirmed_at = null`,
        [b.id, actor.userId, JSON.stringify(input.checklist), input.workSummary],
      );
      await moveStatus(tx, b, "COMPLETION_PENDING", actor, "ASSIGNED_TECHNICIAN", "Professional marked work complete");
      await notify(tx, [b.customerId, ...(await propertyManagerIds(tx, b.propertyId))], {
        kind: "completion_submitted",
        title: `Please confirm ${b.reference} is complete`,
        body: "Check the work, then confirm or raise an issue. Your invoice is issued after confirmation.",
        link: b.propertyId ? `/pm/requests/${b.id}` : `/account/bookings/${b.id}`,
      });
    }),
  );
}

/** Creates invoice, maintenance record and payout. Must run in the completing transaction. */
async function finalizeCompletion(tx: Queryable, b: BookingFacts, actor: Actor, roleLabel: string, note: string) {
  const completion = await one<{ work_summary: string; submitted_at: Date }>(
    tx,
    `select work_summary, submitted_at from job_completions where booking_id = $1`,
    [b.id],
  );
  if (!completion) throw new DomainError("INVALID_TRANSITION", "The professional hasn't submitted completion details yet.");

  const approved = await tx.query<ApprovedEstimateAmounts>(
    `select kind, visit_fee_paise as "visitFeePaise", labour_paise as "labourPaise", parts_paise as "partsPaise",
            additional_paise as "additionalPaise"
     from estimates where booking_id = $1 and status = 'APPROVED' order by version`,
    [b.id],
  );
  const amounts = computeInvoiceAmounts(b.visitFeePaise, approved);
  const category = await one<{ warranty_days: number; warranty_exclusions: string; name: string }>(
    tx,
    `select warranty_days, warranty_exclusions, name from service_categories where id = $1`,
    [b.categoryId],
  );
  const now = new Date();
  const today = localDateKey(now);
  const warrantyDays = category?.warranty_days ?? 0;
  const warrantyExpires = warrantyDays > 0 ? addDays(today, warrantyDays) : null;

  await moveStatus(tx, b, "COMPLETED", actor, roleLabel, note, { completed_at: now });
  await tx.query(
    `update job_completions set confirmed_by = $2, confirmed_by_role = $3, confirmed_at = now() where booking_id = $1`,
    [b.id, actor.userId, roleLabel],
  );

  const seq = await one<{ n: number }>(tx, `select nextval('invoice_number_seq')::int as n`);
  const number = `INV-${today.slice(0, 7).replace("-", "")}-${seq!.n}`;
  await tx.query(
    `insert into invoices (booking_id, number, customer_id, property_id, visit_fee_paise, labour_paise, parts_paise,
       additional_paise, total_paise, warranty_days, warranty_expires_on, warranty_terms)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      b.id,
      number,
      b.customerId,
      b.propertyId,
      amounts.visitFeePaise,
      amounts.labourPaise,
      amounts.partsPaise,
      amounts.additionalPaise,
      amounts.totalPaise,
      warrantyDays,
      warrantyExpires,
      category?.warranty_exclusions ?? "",
    ],
  );

  const ownerId = b.propertyId ? null : b.customerId;
  await tx.query(
    `insert into maintenance_records (asset_id, booking_id, owner_id, property_id, source, performed_on, title, details, cost_paise, created_by)
     values ($1, $2, $3, $4, 'JOB', $5, $6, $7, $8, $9)`,
    [
      b.assetId,
      b.id,
      ownerId,
      b.propertyId,
      today,
      `${category?.name ?? "Service"} — ${b.reference}`,
      completion.work_summary,
      amounts.totalPaise,
      actor.userId,
    ],
  );

  if (b.technicianId) {
    const payout = computePayout(amounts);
    await tx.query(
      `insert into technician_payouts (booking_id, technician_id, amount_paise, breakdown) values ($1, $2, $3, $4::jsonb)`,
      [b.id, b.technicianId, payout.amountPaise, JSON.stringify(payout.breakdown)],
    );
    await notify(tx, [b.technicianId], {
      kind: "job_completed",
      title: `${b.reference} confirmed complete`,
      body: "Your payout is now pending in the next cycle.",
      link: `/tech/earnings`,
    });
  }
  await recordAudit(tx, actor, "invoice.issued", "booking", b.id, { number, totalPaise: amounts.totalPaise }, roleLabel);
  await track(tx, "job_completed", { category: b.categorySlug });
}

export async function confirmCompletion(db: Database, actor: Actor, bookingId: string, now: Date = new Date()): Promise<void> {
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const b = await lockBooking(tx, bookingId);
      const ctx = await bookingContextFor(tx, b, actor.userId);
      const relations = relationsTo(actor, b, ctx);
      if (relations.length === 0) throw notFound("Booking not found.");
      if (!canChangeStatus(actor, b, "COMPLETED", ctx)) {
        throw new DomainError("INVALID_TRANSITION", "This job isn't waiting for confirmation.");
      }
      if (relations.includes("requester")) {
        await finalizeCompletion(tx, b, actor, b.customerId === actor.userId ? "CUSTOMER" : "PROPERTY_MANAGER", "Customer confirmed completion");
        return;
      }
      // Operations may confirm on the customer's behalf only after the confirmation window.
      const c = await one<{ submitted_at: Date }>(tx, `select submitted_at from job_completions where booking_id = $1`, [b.id]);
      const allowedAt = c ? new Date(c.submitted_at).getTime() + completionPolicy.autoConfirmAfterHours * 3600000 : Infinity;
      if (now.getTime() < allowedAt) {
        throw new DomainError(
          "INVALID_TRANSITION",
          `The customer has ${completionPolicy.autoConfirmAfterHours} hours to confirm or raise an issue before operations can close this job.`,
        );
      }
      await finalizeCompletion(tx, b, actor, "ADMIN", "Closed by operations after the confirmation window");
    }),
  );
}

export async function disputeBooking(
  db: Database,
  actor: Actor,
  bookingId: string,
  category: ComplaintCategory,
  description: string,
): Promise<{ complaintId: string; reference: string }> {
  const text = description.trim();
  if (text.length < 10) throw new DomainError("VALIDATION", "Please describe the issue (at least 10 characters).", { description: ["Too short"] });
  if (!complaintCategories.includes(category)) throw new DomainError("VALIDATION", "Choose an issue type.");
  return withDbErrors(() =>
    db.transaction(async (tx) => {
      const b = await lockBooking(tx, bookingId);
      const ctx = await bookingContextFor(tx, b, actor.userId);
      if (!canChangeStatus(actor, b, "DISPUTED", ctx)) {
        if (relationsTo(actor, b, ctx).length === 0 && !ctx.approver) throw notFound("Booking not found.");
        throw new DomainError("INVALID_TRANSITION", "Use the support centre to raise an issue for this booking.");
      }
      await moveStatus(tx, b, "DISPUTED", actor, "REQUESTER", "Customer raised an issue");
      const reference = complaintReference();
      const row = await one<{ id: string }>(
        tx,
        `insert into complaints (reference, booking_id, raised_by, raised_by_role, category, description, priority)
         values ($1, $2, $3, 'CUSTOMER', $4, $5, $6) returning id`,
        [reference, b.id, actor.userId, category, text, category === "SAFETY" || category === "DAMAGE" ? "HIGH" : "NORMAL"],
      );
      await recordAudit(tx, actor, "complaint.created", "complaint", row!.id, { bookingId: b.id, category, viaDispute: true });
      await notify(tx, [...(await adminIds(tx)), b.technicianId], {
        kind: "booking_disputed",
        title: `Issue raised on ${b.reference}`,
        body: "Operations will review and contact both sides. Payout is on hold until resolved.",
        link: hasRole(actor, "ADMIN") ? `/admin/bookings/${b.id}` : undefined,
      });
      await track(tx, "complaint_created", { category, source: "dispute" });
      return { complaintId: row!.id, reference };
    }),
  );
}

/** Operations resolves a dispute: close as complete, send back for rework, or cancel. */
export async function resolveDispute(
  db: Database,
  actor: Actor,
  bookingId: string,
  outcome: "COMPLETED" | "IN_PROGRESS" | "CANCELLED",
  note: string,
): Promise<void> {
  if (!hasRole(actor, "ADMIN")) throw forbidden();
  const text = note.trim();
  if (text.length < 5) throw new DomainError("VALIDATION", "Record how this was resolved.");
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const b = await lockBooking(tx, bookingId);
      const allowedFrom = b.status === "DISPUTED" || (b.status === "COMPLETION_PENDING" && outcome === "IN_PROGRESS");
      if (!allowedFrom || !canChangeStatus(actor, b, outcome)) throw new DomainError("INVALID_TRANSITION", "Not available in the current state.");
      if (outcome === "COMPLETED") {
        await finalizeCompletion(tx, b, actor, "ADMIN", `Resolved by operations: ${text}`);
      } else {
        await moveStatus(tx, b, outcome, actor, "ADMIN", `Resolved by operations: ${text}`, outcome === "CANCELLED" ? { cancellation_reason: text, cancelled_by: actor.userId, cancellation_fee_paise: 0 } : {});
      }
      await notify(tx, [b.customerId, b.technicianId, ...(await propertyManagerIds(tx, b.propertyId))], {
        kind: "dispute_resolved",
        title: `Update on ${b.reference}`,
        body: text,
      });
    }),
  );
}
