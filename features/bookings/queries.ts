import type { Database } from "@/lib/database/types";
import { one } from "@/lib/database/types";
import { completionPolicy } from "@/lib/config/site";
import {
  approvalAuthority,
  canRejectEstimate,
  canSeeAssignedTechnician,
  canSeeCounterpartContact,
  cancellationFeeFor,
  relationsTo,
  type BookingContext,
  type MembershipFacts,
} from "@/lib/permissions";
import { nextStatusesFor, type BookingRelation } from "./state-machine";
import type { Actor, BookingStatus, CostApproval, EstimateStatus, LineItemKind, Occupancy } from "@/types/domain";
import { z } from "zod";

export interface BookingSummary {
  id: string;
  reference: string;
  status: BookingStatus;
  categoryName: string;
  categorySlug: string;
  categoryIcon: string;
  slotStart: Date;
  slotEnd: Date;
  locality: string;
  propertyId: string | null;
  propertyName: string | null;
  unitLabel: string | null;
  technicianName: string | null;
  createdAt: Date;
  visitFeePaise: number;
}

const SUMMARY_SELECT = `
  select b.id, b.reference, b.status, c.name as "categoryName", c.slug as "categorySlug", c.icon as "categoryIcon",
         b.slot_start as "slotStart", b.slot_end as "slotEnd", b.locality, b.property_id as "propertyId", pr.name as "propertyName",
         u.label as "unitLabel",
         case when b.status in ('REQUESTED','CONFIRMED','DECLINED') then null else tp.full_name end as "technicianName",
         b.created_at as "createdAt", b.visit_fee_paise as "visitFeePaise"
  from bookings b
  join service_categories c on c.id = b.category_id
  left join properties pr on pr.id = b.property_id
  left join property_units u on u.id = b.unit_id
  left join profiles tp on tp.id = b.technician_id`;

/** The signed-in customer's personal bookings (property requests are listed in the PM workspace). */
export async function listCustomerBookings(db: Database, actor: Actor): Promise<BookingSummary[]> {
  return db.asUser(actor.userId, (tx) =>
    tx.query<BookingSummary>(`${SUMMARY_SELECT} where b.customer_id = $1 and b.property_id is null order by b.slot_start desc limit 200`, [
      actor.userId,
    ]),
  );
}

export async function listTechnicianJobs(db: Database, actor: Actor): Promise<BookingSummary[]> {
  return db.asUser(actor.userId, (tx) =>
    tx.query<BookingSummary>(`${SUMMARY_SELECT} where b.technician_id = $1 order by b.slot_start desc limit 200`, [actor.userId]),
  );
}

export interface OfferSummary extends BookingSummary {
  problemDescription: string;
  windowKey: string;
}

/** Open jobs offered to this technician. RLS limits rows to eligible offers; the filter makes intent explicit. */
export async function listOpenOffers(db: Database, actor: Actor): Promise<OfferSummary[]> {
  return db.asUser(actor.userId, (tx) =>
    tx.query<OfferSummary>(
      `select b.id, b.reference, b.status, c.name as "categoryName", c.slug as "categorySlug", c.icon as "categoryIcon",
              b.slot_start as "slotStart", b.slot_end as "slotEnd", b.locality, null as "propertyId", null as "propertyName",
              null as "unitLabel", null as "technicianName", b.created_at as "createdAt", b.visit_fee_paise as "visitFeePaise",
              b.problem_description as "problemDescription", b.window_key as "windowKey"
       from bookings b join service_categories c on c.id = b.category_id
       where b.status = 'CONFIRMED' and b.technician_id is null and app.is_open_offer_for_me(b.id)
       order by b.slot_start limit 100`,
    ),
  );
}

export interface AdminBookingFilters {
  status?: string;
  categoryId?: string;
  q?: string;
  unassigned?: boolean;
}

export async function listBookingsAdmin(db: Database, actor: Actor, f: AdminBookingFilters = {}): Promise<BookingSummary[]> {
  return db.asUser(actor.userId, (tx) =>
    tx.query<BookingSummary>(
      `${SUMMARY_SELECT}
       where app.is_admin()
         and ($1::text is null or b.status = $1)
         and ($2::uuid is null or b.category_id = $2)
         and ($3::text is null or b.reference ilike '%' || $3 || '%' or b.locality ilike '%' || $3 || '%')
         and (not $4 or (b.technician_id is null and b.status in ('REQUESTED','CONFIRMED')))
       order by case b.status when 'REQUESTED' then 0 when 'DISPUTED' then 1 when 'RESCHEDULE_REQUESTED' then 2 when 'CONFIRMED' then 3 else 4 end,
                b.slot_start
       limit 300`,
      [
        f.status && f.status !== "ALL" ? f.status : null,
        f.categoryId && z.uuid().safeParse(f.categoryId).success ? f.categoryId : null,
        f.q?.trim() ? f.q.trim().slice(0, 40) : null,
        Boolean(f.unassigned),
      ],
    ),
  );
}

export interface EstimateView {
  id: string;
  version: number;
  kind: "INITIAL" | "SUPPLEMENTARY";
  diagnosis: string;
  visitFeePaise: number;
  labourPaise: number;
  partsPaise: number;
  additionalPaise: number;
  totalPaise: number;
  validUntil: Date;
  notes: string | null;
  exclusions: string | null;
  status: EstimateStatus;
  createdAt: Date;
  decidedAt: Date | null;
  items: { id: string; kind: LineItemKind; description: string; quantity: number; unitPricePaise: number; totalPaise: number }[];
  approval: { decision: string; decidedByName: string | null; decidedByRole: string; payer: string; reason: string | null; createdAt: Date; totalPaiseAtDecision: number } | null;
  viewerCanApprove: boolean;
  viewerCanReject: boolean;
  /** Why the viewer can't approve (e.g. "Your landlord needs to approve this estimate."). */
  viewerApprovalNote: string | null;
  isExpired: boolean;
}

export interface BookingDetail {
  access: "full" | "offer";
  booking: {
    id: string;
    reference: string;
    status: BookingStatus;
    problemDescription: string;
    locality: string;
    city: string;
    windowKey: string;
    slotStart: Date;
    slotEnd: Date;
    requestedSlotStart: Date | null;
    requestedSlotEnd: Date | null;
    visitFeePaise: number;
    indicativeMinPaise: number | null;
    indicativeMaxPaise: number | null;
    cancellationTerms: string;
    paymentMethod: string;
    cancellationReason: string | null;
    cancellationFeePaise: number | null;
    customerId: string;
    technicianId: string | null;
    propertyId: string | null;
    unitId: string | null;
    assetId: string | null;
    createdAt: Date;
    completedAt: Date | null;
    occupancy: Occupancy;
    costApproval: CostApproval;
    requesterApprovalLimitPaise: number | null;
    serviceAreaId: string;
  };
  category: { id: string; name: string; slug: string; icon: string; warrantyDays: number; warrantyExclusions: string };
  location: { line1: string; landmark: string | null; pincode: string } | null;
  customer: { name: string | null; phone: string | null } | null;
  technician: { id: string; name: string; phone: string | null; yearsExperience: number | null; reviewCount: number; averageRating: number | null } | null;
  property: { id: string; name: string; unitLabel: string | null } | null;
  asset: { id: string; nickname: string; assetType: string; brand: string | null; model: string | null } | null;
  history: { id: string; fromStatus: BookingStatus | null; toStatus: BookingStatus; actorRole: string | null; note: string | null; createdAt: Date }[];
  estimates: EstimateView[];
  completion: { checklist: Record<string, boolean>; workSummary: string; submittedAt: Date; confirmedAt: Date | null; confirmedByRole: string | null } | null;
  invoice: {
    id: string;
    number: string;
    visitFeePaise: number;
    labourPaise: number;
    partsPaise: number;
    additionalPaise: number;
    totalPaise: number;
    paymentStatus: string;
    warrantyDays: number;
    warrantyExpiresOn: string | null;
    warrantyTerms: string;
    issuedAt: Date;
  } | null;
  payout: { amountPaise: number; status: string; breakdown: Record<string, unknown> } | null;
  attachments: { id: string; purpose: string; mimeType: string; createdAt: Date }[];
  complaints: { id: string; reference: string; status: string; category: string; createdAt: Date }[];
  review: { rating: number; comment: string | null } | null;
  approvers: { name: string | null; relation: string }[];
  pendingApproverInvite: { id: string; expiresAt: Date } | null;
  viewer: {
    relations: BookingRelation[];
    membership: MembershipFacts | null;
    context: BookingContext;
    allowedTransitions: BookingStatus[];
    cancellationFeePaise: number;
    adminCanCloseAfter: Date | null;
    adminCanCloseNow: boolean;
    isCustomer: boolean;
    isAssignedTechnician: boolean;
    isAdmin: boolean;
  };
}

/** Loads a booking as the signed-in user. Returns null if RLS hides it (not found or not permitted). */
export async function getBookingDetail(db: Database, actor: Actor, bookingId: string, now: Date = new Date()): Promise<BookingDetail | null> {
  if (!z.uuid().safeParse(bookingId).success) return null;
  return db.asUser(actor.userId, async (tx) => {
    const b = await one<BookingDetail["booking"]>(
      tx,
      `select id, reference, status, problem_description as "problemDescription", locality, city, window_key as "windowKey",
              slot_start as "slotStart", slot_end as "slotEnd", requested_slot_start as "requestedSlotStart",
              requested_slot_end as "requestedSlotEnd", visit_fee_paise as "visitFeePaise",
              indicative_min_paise as "indicativeMinPaise", indicative_max_paise as "indicativeMaxPaise",
              cancellation_terms as "cancellationTerms", payment_method as "paymentMethod",
              cancellation_reason as "cancellationReason", cancellation_fee_paise as "cancellationFeePaise",
              customer_id as "customerId", technician_id as "technicianId", property_id as "propertyId", unit_id as "unitId",
              asset_id as "assetId", created_at as "createdAt", completed_at as "completedAt",
              occupancy, cost_approval as "costApproval", requester_approval_limit_paise as "requesterApprovalLimitPaise",
              service_area_id as "serviceAreaId"
       from bookings where id = $1`,
      [bookingId],
    );
    if (!b) return null;
    const category = (await one<BookingDetail["category"]>(
      tx,
      `select id, name, slug, icon, warranty_days as "warrantyDays", warranty_exclusions as "warrantyExclusions"
       from service_categories where id = (select category_id from bookings where id = $1)`,
      [bookingId],
    ))!;
    const membershipRow = b.propertyId
      ? await one<MembershipFacts>(
          tx,
          `select property_id as "propertyId", member_role as "memberRole", unit_id as "unitId", approval_limit_paise as "approvalLimitPaise"
           from property_memberships where property_id = $1 and profile_id = $2`,
          [b.propertyId, actor.userId],
        )
      : null;
    const membership = membershipRow && (membershipRow.memberRole !== "TENANT" || membershipRow.unitId === b.unitId) ? membershipRow : null;
    const approver = await one<{ approvalLimitPaise: number | null }>(
      tx,
      `select approval_limit_paise as "approvalLimitPaise" from booking_approvers where booking_id = $1 and profile_id = $2`,
      [b.id, actor.userId],
    );
    const household = b.propertyId
      ? null
      : await one<{ access: "VIEW" | "MANAGE"; approvalLimitPaise: number | null }>(
          tx,
          `select access, approval_limit_paise as "approvalLimitPaise" from household_members where owner_id = $1 and member_id = $2`,
          [b.customerId, actor.userId],
        );
    const facts = {
      id: b.id,
      customerId: b.customerId,
      technicianId: b.technicianId,
      propertyId: b.propertyId,
      unitId: b.unitId,
      status: b.status,
      costApproval: b.costApproval,
      requesterApprovalLimitPaise: b.requesterApprovalLimitPaise,
    };
    const isParty =
      b.customerId === actor.userId ||
      b.technicianId === actor.userId ||
      Boolean(membership) ||
      Boolean(approver) ||
      Boolean(household) ||
      actor.roles.includes("ADMIN");
    const isEligibleOffer = !isParty;
    const context: BookingContext = { membership, approver, household, isEligibleOffer };
    const relations = relationsTo(actor, facts, context);

    const viewerBase = {
      relations,
      membership,
      context,
      allowedTransitions: nextStatusesFor(b.status, relations),
      cancellationFeePaise: relations.includes("requester") ? cancellationFeeFor({ status: b.status, slotStart: new Date(b.slotStart) }, now) : 0,
      adminCanCloseAfter: null as Date | null,
      adminCanCloseNow: false,
      isCustomer: b.customerId === actor.userId,
      isAssignedTechnician: relations.includes("assigned_technician"),
      isAdmin: relations.includes("admin"),
    };

    if (!isParty) {
      // Open offer: locality and problem only. No address, history or customer identity.
      return {
        access: "offer",
        booking: b,
        category,
        location: null,
        customer: null,
        technician: null,
        property: null,
        asset: null,
        history: [],
        estimates: [],
        completion: null,
        invoice: null,
        payout: null,
        attachments: [],
        complaints: [],
        review: null,
        approvers: [],
        pendingApproverInvite: null,
        viewer: viewerBase,
      };
    }

    const location = await one<BookingDetail["location"]>(
      tx,
      `select line1, landmark, pincode from booking_locations where booking_id = $1`,
      [bookingId],
    );
    const contactVisible = canSeeCounterpartContact(b.status);
    const customerRow = await one<{ name: string | null; phone: string | null }>(
      tx,
      `select p.full_name as name, c.phone from profiles p left join profile_contacts c on c.profile_id = p.id where p.id = $1`,
      [b.customerId],
    );
    const customer = customerRow ? { name: customerRow.name, phone: contactVisible || viewerBase.isAdmin ? customerRow.phone : null } : null;

    let technician: BookingDetail["technician"] = null;
    if (b.technicianId && (canSeeAssignedTechnician(b.status) || viewerBase.isAdmin || b.technicianId === actor.userId)) {
      const t = await one<{ id: string; name: string; phone: string | null; yearsExperience: number | null }>(
        tx,
        `select p.id, p.full_name as name, c.phone, tp.years_experience as "yearsExperience"
         from profiles p left join profile_contacts c on c.profile_id = p.id
         left join technician_profiles tp on tp.profile_id = p.id where p.id = $1`,
        [b.technicianId],
      );
      const rating = await one<{ review_count: number; average_rating: string | null }>(tx, `select * from technician_rating_summary($1)`, [b.technicianId]);
      if (t) {
        technician = {
          ...t,
          phone: contactVisible || viewerBase.isAdmin ? t.phone : null,
          reviewCount: rating?.review_count ?? 0,
          averageRating: rating?.average_rating != null ? Number(rating.average_rating) : null,
        };
      }
    }

    const property = b.propertyId
      ? await one<BookingDetail["property"]>(
          tx,
          `select p.id, p.name, u.label as "unitLabel" from properties p left join property_units u on u.id = $2 where p.id = $1`,
          [b.propertyId, b.unitId],
        )
      : null;
    const asset = b.assetId
      ? await one<BookingDetail["asset"]>(tx, `select id, nickname, asset_type as "assetType", brand, model from assets where id = $1`, [b.assetId])
      : null;

    const history = await tx.query<BookingDetail["history"][number]>(
      `select id, from_status as "fromStatus", to_status as "toStatus", actor_role as "actorRole", note, created_at as "createdAt"
       from booking_status_history where booking_id = $1 order by created_at, id`,
      [bookingId],
    );

    const estimateRows = await tx.query<Omit<EstimateView, "items" | "approval" | "viewerCanApprove">>(
      `select id, version, kind, diagnosis, visit_fee_paise as "visitFeePaise", labour_paise as "labourPaise", parts_paise as "partsPaise",
              additional_paise as "additionalPaise", total_paise as "totalPaise", valid_until as "validUntil", notes, exclusions,
              status, created_at as "createdAt", decided_at as "decidedAt"
       from estimates where booking_id = $1 order by version desc`,
      [bookingId],
    );
    const estimates: EstimateView[] = [];
    for (const e of estimateRows) {
      const items = await tx.query<EstimateView["items"][number]>(
        `select id, kind, description, quantity, unit_price_paise as "unitPricePaise", total_paise as "totalPaise"
         from estimate_line_items where estimate_id = $1 order by position`,
        [e.id],
      );
      const approval = await one<NonNullable<EstimateView["approval"]>>(
        tx,
        `select a.decision, p.full_name as "decidedByName", a.decided_by_role as "decidedByRole", a.payer, a.reason, a.created_at as "createdAt",
                a.total_paise_at_decision as "totalPaiseAtDecision"
         from estimate_approvals a left join profiles p on p.id = a.decided_by where a.estimate_id = $1`,
        [e.id],
      );
      const authority = approvalAuthority(actor, facts, e.totalPaise, context);
      const open = e.status === "SUBMITTED";
      estimates.push({
        ...e,
        items,
        approval,
        viewerCanApprove: open && authority.allowed,
        viewerCanReject: open && (canRejectEstimate(actor, facts, context) || b.customerId === actor.userId),
        viewerApprovalNote: open && !authority.allowed ? (authority.reason ?? null) : null,
        isExpired: open && new Date(e.validUntil).getTime() < now.getTime(),
      });
    }

    const completion = await one<BookingDetail["completion"]>(
      tx,
      `select checklist, work_summary as "workSummary", submitted_at as "submittedAt", confirmed_at as "confirmedAt",
              confirmed_by_role as "confirmedByRole" from job_completions where booking_id = $1`,
      [bookingId],
    );
    if (completion && b.status === "COMPLETION_PENDING") {
      viewerBase.adminCanCloseAfter = new Date(new Date(completion.submittedAt).getTime() + completionPolicy.autoConfirmAfterHours * 3600000);
      viewerBase.adminCanCloseNow = viewerBase.adminCanCloseAfter.getTime() <= now.getTime();
    }
    const invoice = await one<BookingDetail["invoice"]>(
      tx,
      `select id, number, visit_fee_paise as "visitFeePaise", labour_paise as "labourPaise", parts_paise as "partsPaise",
              additional_paise as "additionalPaise", total_paise as "totalPaise", payment_status as "paymentStatus",
              warranty_days as "warrantyDays", warranty_expires_on::text as "warrantyExpiresOn", warranty_terms as "warrantyTerms",
              issued_at as "issuedAt"
       from invoices where booking_id = $1`,
      [bookingId],
    );
    const payout = await one<BookingDetail["payout"]>(
      tx,
      `select amount_paise as "amountPaise", status, breakdown from technician_payouts where booking_id = $1`,
      [bookingId],
    );
    const attachments = await tx.query<BookingDetail["attachments"][number]>(
      `select id, purpose, mime_type as "mimeType", created_at as "createdAt" from attachments where booking_id = $1 order by created_at`,
      [bookingId],
    );
    const complaints = await tx.query<BookingDetail["complaints"][number]>(
      `select id, reference, status, category, created_at as "createdAt" from complaints where booking_id = $1 order by created_at desc`,
      [bookingId],
    );
    const review = await one<BookingDetail["review"]>(tx, `select rating, comment from reviews where booking_id = $1`, [bookingId]);
    const approvers = await tx.query<BookingDetail["approvers"][number]>(
      `select p.full_name as name, a.relation from booking_approvers a left join profiles p on p.id = a.profile_id where a.booking_id = $1`,
      [bookingId],
    );
    const pendingApproverInvite =
      b.customerId === actor.userId
        ? await one<NonNullable<BookingDetail["pendingApproverInvite"]>>(
            tx,
            `select id, expires_at as "expiresAt" from invitations
             where booking_id = $1 and kind = 'BOOKING_APPROVER' and status = 'PENDING' and expires_at > now() and created_by = $2
             order by created_at desc limit 1`,
            [bookingId, actor.userId],
          )
        : null;

    return {
      access: "full",
      booking: b,
      category,
      location,
      customer,
      technician,
      property,
      asset,
      history,
      estimates,
      completion,
      invoice,
      payout,
      attachments,
      complaints,
      review,
      approvers,
      pendingApproverInvite,
      viewer: viewerBase,
    };
  });
}

export async function listInvoicesForCustomer(db: Database, actor: Actor) {
  return db.asUser(actor.userId, (tx) =>
    tx.query<{
      id: string;
      number: string;
      bookingId: string;
      bookingReference: string;
      categoryName: string;
      totalPaise: number;
      paymentStatus: string;
      issuedAt: Date;
      warrantyExpiresOn: string | null;
      warrantyDays: number;
      warrantyTerms: string;
    }>(
      `select i.id, i.number, i.booking_id as "bookingId", b.reference as "bookingReference", c.name as "categoryName",
              i.total_paise as "totalPaise", i.payment_status as "paymentStatus", i.issued_at as "issuedAt",
              i.warranty_expires_on::text as "warrantyExpiresOn", i.warranty_days as "warrantyDays", i.warranty_terms as "warrantyTerms"
       from invoices i join bookings b on b.id = i.booking_id join service_categories c on c.id = b.category_id
       where i.customer_id = $1 and i.property_id is null order by i.issued_at desc`,
      [actor.userId],
    ),
  );
}

/** Bookings shared with the actor: a household member's bookings, or bookings they approve as landlord. */
export async function listSharedBookings(db: Database, actor: Actor): Promise<(BookingSummary & { sharedAs: "HOUSEHOLD" | "LANDLORD"; ownerName: string })[]> {
  return db.asUser(actor.userId, (tx) =>
    tx.query(
      `select s.*, case when exists (select 1 from booking_approvers a where a.booking_id = s.id and a.profile_id = $1) then 'LANDLORD' else 'HOUSEHOLD' end as "sharedAs",
              (select full_name from profiles where id = s."customerId") as "ownerName"
       from (${SUMMARY_SELECT.replace("b.created_at as \"createdAt\"", "b.created_at as \"createdAt\", b.customer_id as \"customerId\"")}
             where b.customer_id <> $1
               and (exists (select 1 from booking_approvers a where a.booking_id = b.id and a.profile_id = $1)
                    or (b.property_id is null and exists (select 1 from household_members h where h.owner_id = b.customer_id and h.member_id = $1)))) s
       order by s."slotStart" desc limit 100`,
      [actor.userId],
    ),
  );
}

/** What needs the customer's attention right now (estimates to approve, completions to confirm). */
export async function listNeedsAttention(db: Database, actor: Actor): Promise<BookingSummary[]> {
  return db.asUser(actor.userId, (tx) =>
    tx.query<BookingSummary>(
      `${SUMMARY_SELECT} where b.status in ('AWAITING_APPROVAL','COMPLETION_PENDING')
         and (b.customer_id = $1 or exists (select 1 from booking_approvers a where a.booking_id = b.id and a.profile_id = $1)
              or (b.property_id is null and exists (select 1 from household_members h where h.owner_id = b.customer_id and h.member_id = $1 and h.access = 'MANAGE')))
       order by b.slot_start`,
      [actor.userId],
    ),
  );
}
