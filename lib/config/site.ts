/**
 * Single source of truth for brand, contact, launch location and business policy.
 * Change values here to rebrand or relaunch in another city. Nothing in this file
 * is secret — it is safe to import from client components.
 */

export const site = {
  brand: {
    name: "HomeCare",
    tagline: "Your home, taken care of.",
    supporting: "Reliable home services that fit your schedule.",
    valueProposition: "Reliable home maintenance, with clear pricing and a record of every repair.",
    /** Short wordmark shown next to the logo mark. */
    shortName: "HomeCare",
  },
  contact: {
    // Placeholders — replace before launch. Do not publish personal numbers.
    supportPhone: "+91 00000 00000",
    supportEmail: "support@example.com",
    whatsapp: null as string | null,
    supportHours: "8:00 AM – 8:00 PM, all days",
    registeredAddress: "Registered address to be added before launch",
  },
  locale: {
    currency: "INR",
    currencyLocale: "en-IN",
    timeZone: "Asia/Kolkata",
    defaultLanguage: "en" as const,
  },
  /**
   * Cities, service areas and pincodes live in the database (seeded from lib/config/cities.ts) and
   * are managed in the admin console. This is only the default used for display copy.
   */
  launch: {
    defaultCitySlug: "bengaluru",
    pilotDescription: "We're piloting in a few Bengaluru neighbourhoods first, so we can keep our promises before we grow.",
  },
} as const;

/** Appointment windows offered every day, in launch-city local time. */
export const appointmentWindows = [
  { key: "09-11", start: "09:00", end: "11:00" },
  { key: "11-13", start: "11:00", end: "13:00" },
  { key: "14-16", start: "14:00", end: "16:00" },
  { key: "16-18", start: "16:00", end: "18:00" },
  { key: "18-20", start: "18:00", end: "20:00" },
] as const;

export type WindowKey = (typeof appointmentWindows)[number]["key"];

export const schedulingPolicy = {
  /** How many days ahead customers can book. */
  bookingHorizonDays: 7,
  /** Minimum lead time before a window starts for it to be bookable. */
  minLeadMinutes: 120,
  /** Maximum concurrent bookings per category per window (operations capacity). */
  capacityPerCategoryPerWindow: 3,
};

export const cancellationPolicy = {
  /** Free cancellation if cancelled at least this many hours before the window starts. */
  freeCancellationHoursBefore: 2,
  /** Fee recorded for late cancellation or once the professional is on the way. */
  lateCancellationFeePaise: 9900,
  summary:
    "Free cancellation up to 2 hours before your appointment window. After that, or once the professional is on the way, a ₹99 late-cancellation fee applies.",
};

export const completionPolicy = {
  /**
   * After a professional submits completion, the customer confirms or raises a dispute.
   * Operations may confirm on the customer's behalf only after this many hours.
   */
  autoConfirmAfterHours: 48,
};

/**
 * Technician earnings rules. Shown to technicians before they accept a job.
 * Shares are expressed in basis points (8000 = 80%) to keep calculations integer-only.
 */
export const payoutPolicy = {
  visitFeeShareBps: 8000,
  labourShareBps: 8000,
  additionalShareBps: 8000,
  partsReimbursementBps: 10000,
  payoutCycle: "Weekly, every Tuesday, for jobs confirmed complete by the previous Sunday",
  summary:
    "You keep 80% of the visit fee, labour and additional charges. Parts bought for the job are reimbursed at the approved price. There are no other deductions.",
};

export const estimatePolicy = {
  /** Default validity of an estimate, in hours. */
  defaultValidityHours: 48,
  maxLineItems: 25,
};

export const uploadPolicy = {
  maxBytes: 5 * 1024 * 1024,
  maxFilesPerUpload: 4,
  imageTypes: ["image/jpeg", "image/png", "image/webp"],
  documentTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
};

export const metricsPolicy = {
  /** Below this sample size, metrics show "not enough data" instead of a number. */
  minimumSample: 5,
  windowDays: 30,
};
