export const roles = ["CUSTOMER", "TECHNICIAN", "PROPERTY_MANAGER", "ADMIN"] as const;
export type Role = (typeof roles)[number];

export const bookingStatuses = [
  "REQUESTED",
  "CONFIRMED",
  "ASSIGNED",
  "EN_ROUTE",
  "IN_PROGRESS",
  "AWAITING_APPROVAL",
  "COMPLETION_PENDING",
  "COMPLETED",
  "CANCELLED",
  "DECLINED",
  "RESCHEDULE_REQUESTED",
  "DISPUTED",
] as const;
export type BookingStatus = (typeof bookingStatuses)[number];

export const activeTechnicianStatuses: BookingStatus[] = [
  "ASSIGNED",
  "EN_ROUTE",
  "IN_PROGRESS",
  "AWAITING_APPROVAL",
  "COMPLETION_PENDING",
];
export const terminalStatuses: BookingStatus[] = ["COMPLETED", "CANCELLED", "DECLINED"];

export type TechnicianVerification = "PENDING_REVIEW" | "APPROVED" | "SUSPENDED" | "REJECTED";
export type MemberRole = "OWNER" | "MANAGER" | "VIEWER" | "TENANT";
export type CostApproval = "REQUESTER" | "LANDLORD" | "PROPERTY";
export type Occupancy = "OWNER" | "TENANT" | "MANAGER";
export type EstimateStatus = "SUBMITTED" | "APPROVED" | "REJECTED" | "EXPIRED" | "WITHDRAWN";
export type LineItemKind = "LABOUR" | "PART" | "ADDITIONAL";
export type ComplaintStatus = "OPEN" | "IN_REVIEW" | "ESCALATED" | "RESOLVED" | "CLOSED";
export const complaintCategories = [
  "QUALITY",
  "PRICING",
  "BEHAVIOUR",
  "NO_SHOW",
  "DAMAGE",
  "WARRANTY_CLAIM",
  "PAYOUT",
  "SAFETY",
  "OTHER",
] as const;
export type ComplaintCategory = (typeof complaintCategories)[number];
export type PayoutStatus = "PENDING" | "PROCESSING" | "PAID" | "ON_HOLD";

/** The authenticated principal, resolved on the server from the session. Never from the browser. */
export interface Actor {
  userId: string;
  name: string;
  roles: Role[];
  technicianStatus: TechnicianVerification | null;
}

export interface ServiceCategory {
  id: string;
  slug: string;
  name: string;
  nameHi: string | null;
  icon: string;
  shortDescription: string;
  description: string;
  commonJobs: string[];
  assetTypes: string[];
  visitFeePaise: number;
  indicativeMinPaise: number | null;
  indicativeMaxPaise: number | null;
  warrantyDays: number;
  warrantyExclusions: string;
  isActive: boolean;
  sortOrder: number;
}

/** Minimal booking shape needed by permission checks. */
export interface BookingAccessFacts {
  id: string;
  customerId: string;
  technicianId: string | null;
  propertyId: string | null;
  unitId?: string | null;
  status: BookingStatus;
  costApproval?: CostApproval;
  requesterApprovalLimitPaise?: number | null;
}
