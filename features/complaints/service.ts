import type { Database } from "@/lib/database/types";
import { one } from "@/lib/database/types";
import { withDbErrors } from "@/lib/database/errors";
import { DomainError, forbidden, notFound } from "@/lib/errors";
import { complaintReference } from "@/lib/ids";
import { recordAudit } from "@/lib/audit";
import { track } from "@/lib/analytics";
import { canRaiseComplaint, hasRole } from "@/lib/permissions";
import { complaintInputSchema, complaintUpdateSchema, parseOrThrow, reviewInputSchema } from "@/lib/validation";
import { adminIds, notify } from "@/features/notifications/service";
import { bookingContextFor, isEligibleOffer, lockBooking } from "@/features/bookings/service";
import type { Actor, ComplaintCategory, ComplaintStatus } from "@/types/domain";
import { z } from "zod";

export async function createComplaint(db: Database, actor: Actor, rawInput: unknown): Promise<{ id: string; reference: string }> {
  const input = parseOrThrow(complaintInputSchema, rawInput);
  return withDbErrors(() =>
    db.transaction(async (tx) => {
      let roleLabel = actor.roles.includes("TECHNICIAN") && !actor.roles.includes("ADMIN") ? "TECHNICIAN" : "CUSTOMER";
      if (input.bookingId) {
        const b = await lockBooking(tx, input.bookingId);
        const ctx = await bookingContextFor(tx, b, actor.userId);
        const eligible = actor.roles.includes("TECHNICIAN") ? await isEligibleOffer(tx, b.id, actor.userId) : false;
        if (!canRaiseComplaint(actor, b, { ...ctx, isEligibleOffer: eligible })) throw notFound("Booking not found.");
        roleLabel =
          b.technicianId === actor.userId ? "TECHNICIAN" : ctx.approver ? "LANDLORD" : ctx.membership && b.customerId !== actor.userId ? "PROPERTY_MANAGER" : "CUSTOMER";
        if (input.category === "PAYOUT" && roleLabel !== "TECHNICIAN") {
          throw new DomainError("VALIDATION", "Payout issues can only be raised by the professional.");
        }
        if (input.category === "WARRANTY_CLAIM") {
          const inv = await one<{ expired: boolean }>(
            tx,
            `select (warranty_expires_on is null or warranty_expires_on < current_date) as expired from invoices where booking_id = $1`,
            [b.id],
          );
          if (!inv) throw new DomainError("VALIDATION", "Warranty claims apply to completed jobs only.");
          if (inv.expired) throw new DomainError("VALIDATION", "The workmanship warranty for this job has expired. You can still raise a quality issue.");
        }
      }
      const reference = complaintReference();
      const priority = input.category === "SAFETY" ? "URGENT" : input.category === "DAMAGE" ? "HIGH" : "NORMAL";
      const row = await one<{ id: string }>(
        tx,
        `insert into complaints (reference, booking_id, raised_by, raised_by_role, category, description, priority)
         values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [reference, input.bookingId ?? null, actor.userId, roleLabel, input.category, input.description, priority],
      );
      await recordAudit(tx, actor, "complaint.created", "complaint", row!.id, { category: input.category, bookingId: input.bookingId ?? null }, roleLabel);
      await notify(tx, await adminIds(tx), {
        kind: "complaint_created",
        title: `${priority === "URGENT" ? "URGENT: " : ""}New complaint ${reference}`,
        body: `${input.category.replace("_", " ").toLowerCase()} — raised by ${roleLabel.toLowerCase().replace("_", " ")}`,
        link: `/admin/complaints/${row!.id}`,
      });
      await track(tx, "complaint_created", { category: input.category, source: "support", role: roleLabel });
      return { id: row!.id, reference };
    }),
  );
}

export async function addComplaintUpdate(db: Database, actor: Actor, rawInput: unknown): Promise<void> {
  const input = parseOrThrow(complaintUpdateSchema, rawInput);
  const isAdmin = hasRole(actor, "ADMIN");
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const c = await one<{ id: string; raised_by: string; status: ComplaintStatus; reference: string }>(
        tx,
        `select id, raised_by, status, reference from complaints where id = $1 for update`,
        [input.complaintId],
      );
      if (!c) throw notFound("Complaint not found.");
      if (!isAdmin && c.raised_by !== actor.userId) throw notFound("Complaint not found.");
      if (!isAdmin && (input.status || input.isInternal || input.resolution)) throw forbidden("Only operations can change status.");
      if (!isAdmin && (c.status === "CLOSED" || c.status === "RESOLVED")) {
        throw new DomainError("VALIDATION", "This complaint is closed. Raise a new one if the problem continues.");
      }
      if (input.status === "RESOLVED" && !input.resolution) {
        throw new DomainError("VALIDATION", "Record the resolution before marking it resolved.", { resolution: ["Required"] });
      }
      await tx.query(
        `insert into complaint_updates (complaint_id, author_id, author_role, message, status_change, is_internal)
         values ($1,$2,$3,$4,$5,$6)`,
        [c.id, actor.userId, isAdmin ? "ADMIN" : "RAISER", input.message, input.status ?? null, isAdmin && input.isInternal],
      );
      if (isAdmin && (input.status || input.resolution)) {
        await tx.query(
          `update complaints set status = coalesce($2, status), resolution = coalesce($3, resolution),
             assigned_admin = coalesce(assigned_admin, $4),
             resolved_at = case when $2 in ('RESOLVED','CLOSED') then now() else resolved_at end
           where id = $1`,
          [c.id, input.status ?? null, input.resolution ?? null, actor.userId],
        );
        await recordAudit(tx, actor, "complaint.updated", "complaint", c.id, { from: c.status, to: input.status ?? c.status }, "ADMIN");
      }
      if (isAdmin && !input.isInternal) {
        await notify(tx, [c.raised_by], {
          kind: "complaint_update",
          title: `Update on ${c.reference}`,
          body: input.message.slice(0, 140),
          link: `/support/${c.id}`,
        });
      } else if (!isAdmin) {
        await notify(tx, await adminIds(tx), { kind: "complaint_reply", title: `Reply on ${c.reference}`, body: input.message.slice(0, 140), link: `/admin/complaints/${c.id}` });
      }
    }),
  );
}

export interface ComplaintSummary {
  id: string;
  reference: string;
  category: ComplaintCategory;
  status: ComplaintStatus;
  priority: string;
  bookingId: string | null;
  bookingReference: string | null;
  raisedByRole: string;
  raisedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const SUMMARY_SELECT = `
  select c.id, c.reference, c.category, c.status, c.priority, c.booking_id as "bookingId", b.reference as "bookingReference",
         c.raised_by_role as "raisedByRole", p.full_name as "raisedByName", c.created_at as "createdAt", c.updated_at as "updatedAt"
  from complaints c left join bookings b on b.id = c.booking_id left join profiles p on p.id = c.raised_by`;

export async function listMyComplaints(db: Database, actor: Actor): Promise<ComplaintSummary[]> {
  return db.asUser(actor.userId, (tx) =>
    tx.query<ComplaintSummary>(`${SUMMARY_SELECT} where c.raised_by = $1 order by c.created_at desc`, [actor.userId]),
  );
}

export async function listComplaintsAdmin(db: Database, actor: Actor, status?: string): Promise<ComplaintSummary[]> {
  if (!hasRole(actor, "ADMIN")) throw forbidden();
  return db.asUser(actor.userId, (tx) =>
    tx.query<ComplaintSummary>(
      `${SUMMARY_SELECT} where ($1::text is null or c.status = $1)
       order by case c.priority when 'URGENT' then 0 when 'HIGH' then 1 else 2 end,
                case when c.status in ('RESOLVED','CLOSED') then 1 else 0 end, c.created_at`,
      [status && status !== "ALL" ? status : null],
    ),
  );
}

export interface ComplaintDetail extends ComplaintSummary {
  description: string;
  resolution: string | null;
  raisedBy: string;
  updates: { id: string; authorRole: string; authorName: string | null; message: string; statusChange: string | null; isInternal: boolean; createdAt: Date }[];
}

export async function getComplaint(db: Database, actor: Actor, id: string): Promise<ComplaintDetail | null> {
  if (!z.uuid().safeParse(id).success) return null;
  return db.asUser(actor.userId, async (tx) => {
    const c = await one<ComplaintDetail>(
      tx,
      `select c.id, c.reference, c.category, c.status, c.priority, c.booking_id as "bookingId", b.reference as "bookingReference",
              c.raised_by_role as "raisedByRole", p.full_name as "raisedByName", c.created_at as "createdAt", c.updated_at as "updatedAt",
              c.description, c.resolution, c.raised_by as "raisedBy"
       from complaints c left join bookings b on b.id = c.booking_id left join profiles p on p.id = c.raised_by
       where c.id = $1`,
      [id],
    );
    if (!c) return null;
    c.updates = await tx.query(
      `select u.id, u.author_role as "authorRole", p.full_name as "authorName", u.message, u.status_change as "statusChange",
              u.is_internal as "isInternal", u.created_at as "createdAt"
       from complaint_updates u left join profiles p on p.id = u.author_id
       where u.complaint_id = $1 order by u.created_at`,
      [id],
    );
    return c;
  });
}

export async function submitReview(db: Database, actor: Actor, rawInput: unknown): Promise<void> {
  const input = parseOrThrow(reviewInputSchema, rawInput);
  await withDbErrors(() =>
    db.transaction(async (tx) => {
      const b = await lockBooking(tx, input.bookingId);
      if (b.customerId !== actor.userId) throw notFound("Booking not found.");
      if (b.status !== "COMPLETED" || !b.technicianId) throw new DomainError("VALIDATION", "You can review a job once it's completed.");
      await tx.query(`insert into reviews (booking_id, author_id, technician_id, rating, comment) values ($1,$2,$3,$4,$5)`, [
        b.id,
        actor.userId,
        b.technicianId,
        input.rating,
        input.comment ?? null,
      ]);
      await recordAudit(tx, actor, "review.created", "booking", b.id, { rating: input.rating }, "CUSTOMER");
    }),
  );
}
