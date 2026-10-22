/**
 * Pure authorisation rules. Every server action and service calls these with facts loaded
 * from the database — never with role claims sent by the browser. Unit tested in tests/unit.
 */
import type { BookingRelation } from "@/features/bookings/state-machine";
import { canTransition } from "@/features/bookings/state-machine";
import { cancellationPolicy } from "@/lib/config/site";
import type { Actor, BookingAccessFacts, BookingStatus, MemberRole, Role } from "@/types/domain";

export interface MembershipFacts {
  propertyId: string;
  memberRole: MemberRole;
  unitId: string | null;
  approvalLimitPaise: number | null;
}

/** A landlord invited to approve costs on one booking. */
export interface ApproverFacts {
  approvalLimitPaise: number | null;
}

/** The actor is a household member of the booking's requester. */
export interface HouseholdFacts {
  access: "VIEW" | "MANAGE";
  approvalLimitPaise: number | null;
}

export function hasRole(actor: Actor | null, role: Role): boolean {
  return Boolean(actor?.roles.includes(role));
}

export function isApprovedTechnician(actor: Actor | null): boolean {
  return hasRole(actor, "TECHNICIAN") && actor?.technicianStatus === "APPROVED";
}

export interface BookingContext {
  /** Membership of the actor in the booking's property, if any. */
  membership?: MembershipFacts | null;
  /** True when the booking is an open offer the actor is eligible for (category, area, not declined). */
  isEligibleOffer?: boolean;
  /** The actor was invited as cost approver (landlord) for this booking. */
  approver?: ApproverFacts | null;
  /** The actor is a household member of the requester (personal bookings only). */
  household?: HouseholdFacts | null;
}

function propertyMembership(booking: BookingAccessFacts, m?: MembershipFacts | null): MembershipFacts | null {
  if (!m || !booking.propertyId || m.propertyId !== booking.propertyId) return null;
  if (m.memberRole === "TENANT" && m.unitId !== booking.unitId) return null; // tenants: own unit only
  return m;
}

function householdFor(booking: BookingAccessFacts, h?: HouseholdFacts | null): HouseholdFacts | null {
  return h && !booking.propertyId ? h : null;
}

export function relationsTo(actor: Actor, booking: BookingAccessFacts, ctx: BookingContext = {}): BookingRelation[] {
  const relations: BookingRelation[] = [];
  const m = propertyMembership(booking, ctx.membership);
  const h = householdFor(booking, ctx.household);
  if (
    booking.customerId === actor.userId ||
    (m && (m.memberRole === "OWNER" || m.memberRole === "MANAGER")) ||
    h?.access === "MANAGE"
  ) {
    relations.push("requester");
  }
  if (ctx.approver) relations.push("cost_approver");
  if (booking.technicianId === actor.userId && isApprovedTechnician(actor)) relations.push("assigned_technician");
  if (ctx.isEligibleOffer && isApprovedTechnician(actor) && booking.technicianId === null) relations.push("eligible_technician");
  if (hasRole(actor, "ADMIN")) relations.push("admin");
  return relations;
}

/** Full view of a booking (address, history, estimates). Open offers get a limited view only. */
export function canViewBookingDetails(actor: Actor, booking: BookingAccessFacts, ctx: BookingContext = {}): boolean {
  return (
    booking.customerId === actor.userId ||
    booking.technicianId === actor.userId ||
    Boolean(propertyMembership(booking, ctx.membership)) ||
    Boolean(householdFor(booking, ctx.household)) ||
    Boolean(ctx.approver) ||
    hasRole(actor, "ADMIN")
  );
}

export function canViewOffer(actor: Actor, booking: BookingAccessFacts, ctx: BookingContext = {}): boolean {
  return Boolean(ctx.isEligibleOffer) && isApprovedTechnician(actor) && booking.status === "CONFIRMED" && !booking.technicianId;
}

export function canChangeStatus(actor: Actor, booking: BookingAccessFacts, to: BookingStatus, ctx: BookingContext = {}): boolean {
  return canTransition(booking.status, to, relationsTo(actor, booking, ctx));
}

export type Payer = "REQUESTER" | "LANDLORD" | "PROPERTY" | "HOUSEHOLD";

export interface ApprovalAuthority {
  allowed: boolean;
  payer: Payer | null;
  roleLabel: string;
  reason?: string;
}

const within = (limit: number | null | undefined, total: number) => limit !== null && limit !== undefined && total <= limit;

/**
 * Who may approve an estimate of `totalPaise`, and who pays if they do. Rules depend on the
 * booking's cost-approval mode:
 *  - REQUESTER: the customer; a MANAGE household member up to their limit.
 *  - LANDLORD:  the invited landlord (up to their limit, if any); the tenant only up to the
 *               self-approval limit they chose when booking.
 *  - PROPERTY:  owners; managers and tenants of the unit up to their limit. Viewers never.
 */
export function approvalAuthority(actor: Actor, booking: BookingAccessFacts, totalPaise: number, ctx: BookingContext = {}): ApprovalAuthority {
  const deny = (reason: string): ApprovalAuthority => ({ allowed: false, payer: null, roleLabel: "", reason });
  const mode = booking.costApproval ?? "REQUESTER";

  if (mode === "REQUESTER") {
    if (booking.customerId === actor.userId) return { allowed: true, payer: "REQUESTER", roleLabel: "CUSTOMER" };
    const h = householdFor(booking, ctx.household);
    if (h?.access === "MANAGE") {
      return within(h.approvalLimitPaise, totalPaise)
        ? { allowed: true, payer: "HOUSEHOLD", roleLabel: "HOUSEHOLD_MEMBER" }
        : deny("This estimate is above your household approval limit.");
    }
    return deny("Only the person who booked can approve this estimate.");
  }

  if (mode === "LANDLORD") {
    if (ctx.approver) {
      return ctx.approver.approvalLimitPaise === null || totalPaise <= ctx.approver.approvalLimitPaise
        ? { allowed: true, payer: "LANDLORD", roleLabel: "LANDLORD" }
        : deny("This estimate is above your approval limit.");
    }
    if (booking.customerId === actor.userId) {
      return within(booking.requesterApprovalLimitPaise ?? null, totalPaise)
        ? { allowed: true, payer: "REQUESTER", roleLabel: "TENANT" }
        : deny("Your landlord needs to approve this estimate.");
    }
    return deny("Only the landlord can approve this estimate.");
  }

  // PROPERTY
  const m = propertyMembership(booking, ctx.membership);
  if (!m) return deny("You can't approve estimates for this property.");
  if (m.memberRole === "OWNER") return { allowed: true, payer: "PROPERTY", roleLabel: "PROPERTY_OWNER" };
  if (m.memberRole === "VIEWER") return deny("Viewers can't approve estimates.");
  if (within(m.approvalLimitPaise, totalPaise)) {
    return { allowed: true, payer: m.memberRole === "TENANT" ? "REQUESTER" : "PROPERTY", roleLabel: m.memberRole === "TENANT" ? "TENANT" : "PROPERTY_MANAGER" };
  }
  return deny("This estimate is above your approval limit. The property owner needs to approve it.");
}

export function canApproveEstimate(actor: Actor, booking: BookingAccessFacts, estimateTotalPaise: number, ctx: BookingContext = {}): boolean {
  return approvalAuthority(actor, booking, estimateTotalPaise, ctx).allowed;
}

/** Declining needs no limit: the requester, tenant who booked, landlord approver or property staff. */
export function canRejectEstimate(actor: Actor, booking: BookingAccessFacts, ctx: BookingContext = {}): boolean {
  const r = relationsTo(actor, booking, ctx);
  return r.includes("requester") || r.includes("cost_approver");
}

export function canSubmitEstimate(actor: Actor, booking: BookingAccessFacts): boolean {
  return booking.status === "IN_PROGRESS" && relationsTo(actor, booking).includes("assigned_technician");
}

export function canSubmitCompletion(actor: Actor, booking: BookingAccessFacts): boolean {
  return canChangeStatus(actor, booking, "COMPLETION_PENDING");
}

export function canManageProperty(membership: MembershipFacts | null | undefined): boolean {
  return Boolean(membership && (membership.memberRole === "OWNER" || membership.memberRole === "MANAGER"));
}

/** Owners and managers can request work anywhere in the property; tenants only for their unit. */
export function canRequestForProperty(membership: MembershipFacts | null | undefined, unitId: string | null | undefined): boolean {
  if (!membership) return false;
  if (canManageProperty(membership)) return true;
  return membership.memberRole === "TENANT" && Boolean(unitId) && membership.unitId === unitId;
}

export function canManagePropertyMembers(membership: MembershipFacts | null | undefined): boolean {
  return membership?.memberRole === "OWNER";
}

export interface AssetFacts {
  ownerId: string | null;
  propertyId: string | null;
  unitId?: string | null;
}

export function canEditAsset(actor: Actor, asset: AssetFacts, membership?: MembershipFacts | null): boolean {
  if (asset.ownerId) return asset.ownerId === actor.userId;
  if (asset.propertyId) return Boolean(membership && membership.propertyId === asset.propertyId && canManageProperty(membership));
  return false;
}

export function canRaiseComplaint(actor: Actor, booking: BookingAccessFacts | null, ctx: BookingContext = {}): boolean {
  if (!booking) return true; // general support request
  const relations = relationsTo(actor, booking, ctx);
  return relations.includes("requester") || relations.includes("cost_approver") || booking.technicianId === actor.userId;
}

/** Late cancellation fee per the configured policy. Returns 0 when free. */
export function cancellationFeeFor(booking: { status: BookingStatus; slotStart: Date }, now: Date = new Date()): number {
  if (booking.status === "REQUESTED" || booking.status === "RESCHEDULE_REQUESTED") return 0;
  if (booking.status === "EN_ROUTE") return cancellationPolicy.lateCancellationFeePaise;
  const hoursBefore = (booking.slotStart.getTime() - now.getTime()) / 3600000;
  return hoursBefore >= cancellationPolicy.freeCancellationHoursBefore ? 0 : cancellationPolicy.lateCancellationFeePaise;
}

/** Contact details (phone) are only shown while a job is active. */
export function canSeeCounterpartContact(status: BookingStatus): boolean {
  return ["ASSIGNED", "EN_ROUTE", "IN_PROGRESS", "AWAITING_APPROVAL", "COMPLETION_PENDING"].includes(status);
}

/** Technician identity is shown to the customer once assigned. */
export function canSeeAssignedTechnician(status: BookingStatus): boolean {
  return !["REQUESTED", "CONFIRMED", "DECLINED"].includes(status);
}
