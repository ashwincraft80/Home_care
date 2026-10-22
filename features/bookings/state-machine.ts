import type { BookingStatus } from "@/types/domain";

/**
 * How the acting user relates to a specific booking. Derived on the server from the
 * booking row and the actor's identity — never from anything the browser sends.
 */
export type BookingRelation =
  | "requester" // the customer who booked, a property owner/manager, or a household member with MANAGE access
  | "cost_approver" // a landlord invited to approve costs on this booking
  | "assigned_technician"
  | "eligible_technician" // approved technician for whom the job is an open offer
  | "admin";

type TransitionTable = Partial<Record<BookingStatus, Partial<Record<BookingStatus, BookingRelation[]>>>>;

/**
 * Allowed status transitions and who may perform each one.
 * The SQL function app.booking_transition_allowed mirrors the (from, to) pairs.
 */
export const transitions: TransitionTable = {
  REQUESTED: {
    CONFIRMED: ["admin"],
    DECLINED: ["admin"],
    ASSIGNED: ["admin"],
    CANCELLED: ["requester", "admin"],
    RESCHEDULE_REQUESTED: ["requester"],
  },
  CONFIRMED: {
    ASSIGNED: ["admin", "eligible_technician"],
    CANCELLED: ["requester", "admin"],
    RESCHEDULE_REQUESTED: ["requester"],
    DECLINED: ["admin"],
  },
  ASSIGNED: {
    EN_ROUTE: ["assigned_technician"],
    CONFIRMED: ["assigned_technician", "admin"], // technician withdraws / admin unassigns
    CANCELLED: ["requester", "admin"],
    RESCHEDULE_REQUESTED: ["requester"],
  },
  EN_ROUTE: {
    IN_PROGRESS: ["assigned_technician"],
    CONFIRMED: ["admin"],
    CANCELLED: ["requester", "admin"],
  },
  IN_PROGRESS: {
    AWAITING_APPROVAL: ["assigned_technician"],
    COMPLETION_PENDING: ["assigned_technician"],
    DISPUTED: ["requester"],
    CANCELLED: ["admin"],
  },
  AWAITING_APPROVAL: {
    IN_PROGRESS: ["requester", "cost_approver"],
    DISPUTED: ["requester"],
    CANCELLED: ["admin"],
  },
  COMPLETION_PENDING: {
    COMPLETED: ["requester", "admin"],
    DISPUTED: ["requester"],
    IN_PROGRESS: ["admin"],
  },
  RESCHEDULE_REQUESTED: {
    CONFIRMED: ["admin"],
    ASSIGNED: ["admin"],
    CANCELLED: ["requester", "admin"],
  },
  DISPUTED: {
    COMPLETED: ["admin"],
    IN_PROGRESS: ["admin"],
    CANCELLED: ["admin"],
  },
  COMPLETED: {},
  CANCELLED: {},
  DECLINED: {},
};

export function isTransitionDefined(from: BookingStatus, to: BookingStatus): boolean {
  return Boolean(transitions[from]?.[to]);
}

export function canTransition(from: BookingStatus, to: BookingStatus, relations: BookingRelation[]): boolean {
  const allowed = transitions[from]?.[to];
  if (!allowed) return false;
  return relations.some((r) => allowed.includes(r));
}

export function nextStatusesFor(from: BookingStatus, relations: BookingRelation[]): BookingStatus[] {
  const row = transitions[from] ?? {};
  return (Object.keys(row) as BookingStatus[]).filter((to) => canTransition(from, to, relations));
}

/** Human-facing progress steps shown on the booking timeline. */
export const progressSteps: { status: BookingStatus; label: string }[] = [
  { status: "REQUESTED", label: "Requested" },
  { status: "CONFIRMED", label: "Confirmed" },
  { status: "ASSIGNED", label: "Professional assigned" },
  { status: "EN_ROUTE", label: "On the way" },
  { status: "IN_PROGRESS", label: "Work in progress" },
  { status: "COMPLETION_PENDING", label: "Awaiting your confirmation" },
  { status: "COMPLETED", label: "Completed" },
];

const progressRank: Partial<Record<BookingStatus, number>> = {
  REQUESTED: 0,
  RESCHEDULE_REQUESTED: 0,
  CONFIRMED: 1,
  ASSIGNED: 2,
  EN_ROUTE: 3,
  IN_PROGRESS: 4,
  AWAITING_APPROVAL: 4,
  DISPUTED: 5,
  COMPLETION_PENDING: 5,
  COMPLETED: 6,
};

export function progressIndex(status: BookingStatus): number {
  return progressRank[status] ?? -1;
}
