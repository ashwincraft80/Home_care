import type { Database } from "@/lib/database/types";
import { one } from "@/lib/database/types";
import { withDbErrors } from "@/lib/database/errors";
import { DomainError, conflict, forbidden, notFound } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { recordAudit } from "@/lib/audit";
import { track } from "@/lib/analytics";
import { rupeesToPaise } from "@/lib/money";
import { approvalAuthority, canRejectEstimate, canSubmitEstimate, relationsTo } from "@/lib/permissions";
import { estimateDecisionSchema, estimateInputSchema, parseOrThrow } from "@/lib/validation";
import { bookingContextFor, lockBooking, moveStatus } from "@/features/bookings/service";
import { notify, propertyManagerIds } from "@/features/notifications/service";
import { computeEstimate } from "./calc";
import type { Actor } from "@/types/domain";
import { z } from "zod";

export async function submitEstimate(
  db: Database,
  actor: Actor,
  rawInput: unknown,
  now: Date = new Date(),
): Promise<{ estimateId: string; totalPaise: number }> {
  const input = parseOrThrow(estimateInputSchema, rawInput);
  const items = input.items.map((i) => ({
    kind: i.kind,
    description: i.description,
    quantity: i.quantity,
    unitPricePaise: rupeesToPaise(i.unitPrice),
  }));

  return withDbErrors(() =>
    db.transaction(async (tx) => {
      const b = await lockBooking(tx, input.bookingId);
      if (!canSubmitEstimate(actor, b)) {
        if (b.technicianId !== actor.userId) throw notFound("Job not found.");
        throw new DomainError("INVALID_TRANSITION", "You can send an estimate only while work is in progress.");
      }
      const prior = await one<{ has_initial: boolean; max_version: number }>(
        tx,
        `select coalesce(bool_or(kind = 'INITIAL' and status = 'APPROVED'), false) as has_initial,
                coalesce(max(version), 0)::int as max_version
         from estimates where booking_id = $1`,
        [b.id],
      );
      const kind = prior?.has_initial ? "SUPPLEMENTARY" : "INITIAL";
      // The visit fee was agreed at booking; technicians cannot change it. Supplementary estimates exclude it.
      const visitFee = kind === "INITIAL" ? b.visitFeePaise : 0;
      if (items.length === 0 && kind === "SUPPLEMENTARY") {
        throw new DomainError("VALIDATION", "Add at least one item for additional work.");
      }
      const totals = computeEstimate(visitFee, items);
      const estimateId = newId();
      const validUntil = new Date(now.getTime() + input.validityHours * 3600000);
      await tx.query(
        `insert into estimates (id, booking_id, version, kind, technician_id, diagnosis, visit_fee_paise, labour_paise, parts_paise,
           additional_paise, total_paise, valid_until, notes, exclusions, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'SUBMITTED')`,
        [
          estimateId,
          b.id,
          (prior?.max_version ?? 0) + 1,
          kind,
          actor.userId,
          input.diagnosis,
          totals.visitFeePaise,
          totals.labourPaise,
          totals.partsPaise,
          totals.additionalPaise,
          totals.totalPaise,
          validUntil,
          input.notes ?? null,
          input.exclusions ?? null,
        ],
      );
      let position = 0;
      for (const line of totals.lines) {
        await tx.query(
          `insert into estimate_line_items (estimate_id, kind, description, quantity, unit_price_paise, total_paise, position)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [estimateId, line.kind, line.description, line.quantity, line.unitPricePaise, line.totalPaise, position++],
        );
      }
      await moveStatus(tx, b, "AWAITING_APPROVAL", actor, "ASSIGNED_TECHNICIAN", `Estimate v${(prior?.max_version ?? 0) + 1} sent`);
      await recordAudit(tx, actor, "estimate.submitted", "estimate", estimateId, { bookingId: b.id, totalPaise: totals.totalPaise, kind }, "TECHNICIAN");
      const approvers = await tx.query<{ profile_id: string }>(`select profile_id from booking_approvers where booking_id = $1`, [b.id]);
      await notify(tx, [b.customerId, ...approvers.map((a) => a.profile_id), ...(await propertyManagerIds(tx, b.propertyId))], {
        kind: "estimate_submitted",
        title: `Estimate ready for ${b.reference}`,
        body: "Review the itemised estimate. No extra work starts until you approve.",
        link: b.propertyId ? `/pm/requests/${b.id}` : `/account/bookings/${b.id}`,
      });
      await track(tx, "estimate_submitted", { category: b.categorySlug, kind, line_items: items.length });
      return { estimateId, totalPaise: totals.totalPaise };
    }),
  );
}

export async function decideEstimate(
  db: Database,
  actor: Actor,
  rawInput: unknown,
  now: Date = new Date(),
): Promise<{ decision: "APPROVED" | "REJECTED" | "EXPIRED" }> {
  const input = parseOrThrow(estimateDecisionSchema, rawInput);
  return withDbErrors(() =>
    db.transaction(async (tx) => {
      const est = await one<{ id: string; booking_id: string; status: string; total_paise: number; valid_until: Date; technician_id: string; version: number }>(
        tx,
        `select id, booking_id, status, total_paise, valid_until, technician_id, version from estimates where id = $1 for update`,
        [input.estimateId],
      );
      if (!est) throw notFound("Estimate not found.");
      const b = await lockBooking(tx, est.booking_id);
      const ctx = await bookingContextFor(tx, b, actor.userId);
      const relations = relationsTo(actor, b, ctx);
      const isTenantRequester = b.customerId === actor.userId;
      if (!relations.includes("requester") && !relations.includes("cost_approver") && !isTenantRequester) {
        if (relations.length === 0 && !ctx.membership && !ctx.household) throw notFound("Estimate not found.");
        throw forbidden("You can follow this job, but you can't decide on its estimates.");
      }
      if (est.status !== "SUBMITTED" || b.status !== "AWAITING_APPROVAL") {
        throw conflict("This estimate has already been decided.");
      }
      if (est.total_paise !== input.expectedTotalPaise) {
        throw conflict("The estimate changed since you opened it. Please review it again.");
      }

      if (new Date(est.valid_until).getTime() < now.getTime()) {
        await tx.query(`update estimates set status = 'EXPIRED', decided_at = now() where id = $1`, [est.id]);
        await moveStatus(tx, b, "IN_PROGRESS", actor, "REQUESTER", `Estimate v${est.version} expired before a decision`);
        await notify(tx, [est.technician_id], {
          kind: "estimate_expired",
          title: `Estimate for ${b.reference} expired`,
          body: "Please send a fresh estimate.",
          link: `/tech/jobs/${b.id}`,
        });
        return { decision: "EXPIRED" as const };
      }

      const authority = approvalAuthority(actor, b, est.total_paise, ctx);
      if (input.decision === "APPROVED" && !authority.allowed) throw forbidden(authority.reason);
      if (input.decision === "REJECTED" && !canRejectEstimate(actor, b, ctx) && !isTenantRequester) throw forbidden();

      const roleLabel =
        authority.roleLabel ||
        (ctx.approver ? "LANDLORD" : b.customerId === actor.userId ? (b.costApproval === "REQUESTER" ? "CUSTOMER" : "TENANT") : `PROPERTY_${ctx.membership?.memberRole ?? "MEMBER"}`);
      await tx.query(
        `insert into estimate_approvals (estimate_id, decision, decided_by, decided_by_role, payer, total_paise_at_decision, reason)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [est.id, input.decision, actor.userId, roleLabel, authority.payer ?? "REQUESTER", est.total_paise, input.reason ?? null],
      );
      await tx.query(`update estimates set status = $2, decided_at = now() where id = $1`, [est.id, input.decision]);
      await moveStatus(
        tx,
        b,
        "IN_PROGRESS",
        actor,
        roleLabel,
        input.decision === "APPROVED" ? `Estimate v${est.version} approved` : `Estimate v${est.version} declined${input.reason ? `: ${input.reason}` : ""}`,
      );
      await recordAudit(tx, actor, `estimate.${input.decision.toLowerCase()}`, "estimate", est.id, { totalPaise: est.total_paise }, roleLabel);
      await notify(tx, [est.technician_id], {
        kind: input.decision === "APPROVED" ? "estimate_approved" : "estimate_rejected",
        title: input.decision === "APPROVED" ? `Estimate approved: ${b.reference}` : `Estimate declined: ${b.reference}`,
        body:
          input.decision === "APPROVED"
            ? "You can go ahead with the approved scope."
            : "Do not start extra work. You can send a revised estimate or close the visit with the visit fee only.",
        link: `/tech/jobs/${b.id}`,
      });
      await track(tx, input.decision === "APPROVED" ? "estimate_approved" : "estimate_rejected", { category: b.categorySlug });
      return { decision: input.decision };
    }),
  );
}

export async function withdrawEstimate(db: Database, actor: Actor, estimateId: string): Promise<void> {
  if (!z.uuid().safeParse(estimateId).success) throw notFound();
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const est = await one<{ booking_id: string; status: string; technician_id: string; version: number }>(
        tx,
        `select booking_id, status, technician_id, version from estimates where id = $1 for update`,
        [estimateId],
      );
      if (!est || est.technician_id !== actor.userId) throw notFound("Estimate not found.");
      if (est.status !== "SUBMITTED") throw conflict("This estimate has already been decided.");
      const b = await lockBooking(tx, est.booking_id);
      await tx.query(`update estimates set status = 'WITHDRAWN', decided_at = now() where id = $1`, [estimateId]);
      // AWAITING_APPROVAL -> IN_PROGRESS is a requester transition; a withdrawal is recorded explicitly instead.
      const rows = await tx.query(`update bookings set status = 'IN_PROGRESS' where id = $1 and status = 'AWAITING_APPROVAL' returning id`, [b.id]);
      if (rows.length) {
        await tx.query(
          `insert into booking_status_history (booking_id, from_status, to_status, actor_id, actor_role, note)
           values ($1, 'AWAITING_APPROVAL', 'IN_PROGRESS', $2, 'ASSIGNED_TECHNICIAN', $3)`,
          [b.id, actor.userId, `Estimate v${est.version} withdrawn by professional`],
        );
      }
      await recordAudit(tx, actor, "estimate.withdrawn", "estimate", estimateId, {}, "TECHNICIAN");
    }),
  );
}
