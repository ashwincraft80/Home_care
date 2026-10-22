import { z } from "zod";
import { appointmentWindows, estimatePolicy } from "@/lib/config/site";
import { assetTypes } from "@/lib/config/catalog";
import { complaintCategories } from "@/types/domain";
import { DomainError } from "@/lib/errors";

const windowKeys = appointmentWindows.map((w) => w.key) as [string, ...string[]];

const trimmed = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(min, min <= 1 ? `${label} is required` : `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const pincodeSchema = z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit PIN code");
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^(\+91)?[6-9][0-9]{9}$/, "Enter a valid 10-digit Indian mobile number"));

/** The service area is derived from the pincode on the server; customers never pick it freely. */
export const addressSchema = z.object({
  line1: trimmed(3, 200, "House / flat and street"),
  landmark: optionalText(120),
  pincode: pincodeSchema,
});

export const bookingInputSchema = z
  .object({
    categoryId: z.uuid({ error: "Choose a service" }),
    problemDescription: trimmed(10, 2000, "Problem description"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
    windowKey: z.enum(windowKeys, { error: "Choose a time window" }),
    address: addressSchema.optional(),
    savedAddressId: z.uuid().optional(),
    saveAddress: z.boolean().default(false),
    propertyId: z.uuid().optional(),
    unitId: z.uuid().optional(),
    assetId: z.uuid().optional(),
    /** "I rent this home": tenants can book without owning the property. */
    occupancy: z.enum(["OWNER", "TENANT"]).default("OWNER"),
    /** Who approves estimate costs for a personal booking. Property requests always use PROPERTY rules. */
    costApproval: z.enum(["REQUESTER", "LANDLORD"]).default("REQUESTER"),
    /** With landlord approval, amounts up to this limit the tenant approves (and pays) themselves. */
    selfApprovalLimit: z
      .string()
      .trim()
      .regex(/^\d{1,6}$/, "Enter a whole rupee amount")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    paymentMethod: z.literal("PAY_AFTER_SERVICE", { error: "Online payment is not available yet" }),
    idempotencyKey: z.string().min(8).max(80),
    acceptPolicy: z.literal(true, { error: "Please confirm you have read the pricing and cancellation terms" }),
    isRepeat: z.boolean().default(false),
  })
  .refine((v) => Boolean(v.address) || Boolean(v.savedAddressId) || Boolean(v.propertyId), {
    message: "Add the address for the visit",
    path: ["address"],
  })
  .refine((v) => !v.unitId || v.propertyId, { message: "Unit requires a property", path: ["unitId"] })
  .refine((v) => v.costApproval !== "LANDLORD" || v.occupancy === "TENANT", {
    message: "Landlord approval applies to rented homes",
    path: ["costApproval"],
  });
export type BookingInput = z.infer<typeof bookingInputSchema>;

export const rupeeAmountSchema = z
  .string()
  .trim()
  .regex(/^\d{1,7}(\.\d{1,2})?$/, "Enter an amount in rupees, e.g. 450 or 450.50");

export const lineItemSchema = z.object({
  kind: z.enum(["LABOUR", "PART", "ADDITIONAL"]),
  description: trimmed(2, 200, "Item description"),
  quantity: z.coerce.number().int("Quantity must be a whole number").min(1).max(1000),
  unitPrice: rupeeAmountSchema,
});

export const estimateInputSchema = z.object({
  bookingId: z.uuid(),
  diagnosis: trimmed(5, 2000, "Diagnosis"),
  items: z.array(lineItemSchema).max(estimatePolicy.maxLineItems),
  validityHours: z.coerce.number().int().min(1).max(168).default(estimatePolicy.defaultValidityHours),
  notes: optionalText(1000),
  exclusions: optionalText(1000),
});
export type EstimateInput = z.infer<typeof estimateInputSchema>;

export const estimateDecisionSchema = z.object({
  estimateId: z.uuid(),
  decision: z.enum(["APPROVED", "REJECTED"]),
  /** The total the user saw on screen; must match the stored total. */
  expectedTotalPaise: z.coerce.number().int().min(0),
  reason: optionalText(500),
});

export const completionInputSchema = z.object({
  bookingId: z.uuid(),
  workSummary: trimmed(5, 2000, "Work summary"),
  checklist: z.object({
    workAreaCleaned: z.boolean(),
    customerShownWork: z.boolean(),
    oldPartsHandedOver: z.boolean(),
    testedAfterRepair: z.boolean(),
  }),
});

export const complaintInputSchema = z.object({
  bookingId: z.uuid().optional(),
  category: z.enum(complaintCategories),
  description: trimmed(10, 2000, "Description"),
});

export const complaintUpdateSchema = z.object({
  complaintId: z.uuid(),
  message: trimmed(1, 2000, "Message"),
  status: z.enum(["OPEN", "IN_REVIEW", "ESCALATED", "RESOLVED", "CLOSED"]).optional(),
  isInternal: z.boolean().default(false),
  resolution: optionalText(2000),
});

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .or(z.literal("").transform(() => undefined));

export const assetInputSchema = z.object({
  assetType: z.enum(assetTypes),
  nickname: trimmed(1, 80, "Name"),
  brand: optionalText(80),
  model: optionalText(80),
  locationInHome: optionalText(80),
  installedOn: isoDate,
  warrantyExpiresOn: isoDate,
  notes: optionalText(1000),
  propertyId: z.uuid().optional(),
  unitId: z.uuid().optional(),
});

export const maintenanceRecordInputSchema = z.object({
  assetId: z.uuid(),
  performedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  title: trimmed(2, 160, "Title"),
  details: optionalText(2000),
  costRupees: rupeeAmountSchema.optional().or(z.literal("").transform(() => undefined)),
});

export const propertyInputSchema = z.object({
  name: trimmed(2, 120, "Property name"),
  propertyType: z.enum(["RESIDENTIAL", "APARTMENT_BLOCK", "COMMERCIAL", "OTHER"]),
  line1: trimmed(3, 200, "Address"),
  pincode: pincodeSchema,
});

export const unitInputSchema = z.object({
  propertyId: z.uuid(),
  label: trimmed(1, 60, "Unit name"),
  notes: optionalText(500),
});

export const technicianProfileSchema = z.object({
  bio: optionalText(600),
  yearsExperience: z.coerce.number().int().min(0).max(60),
  phone: phoneSchema,
  categoryIds: z.array(z.uuid()).min(1, "Choose at least one service"),
  serviceAreaIds: z.array(z.uuid()).min(1, "Choose at least one area"),
  availability: z.array(z.string().regex(/^[0-6]:[0-9]{2}-[0-9]{2}$/)).default([]),
});

export const reviewInputSchema = z.object({
  bookingId: z.uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  comment: optionalText(1000),
});

export const categoryConfigSchema = z
  .object({
    categoryId: z.uuid(),
    visitFee: rupeeAmountSchema,
    indicativeMin: rupeeAmountSchema.optional().or(z.literal("").transform(() => undefined)),
    indicativeMax: rupeeAmountSchema.optional().or(z.literal("").transform(() => undefined)),
    warrantyDays: z.coerce.number().int().min(0).max(365),
    warrantyExclusions: z.string().trim().max(1000),
    shortDescription: trimmed(5, 200, "Short description"),
    isActive: z.boolean(),
  })
  .refine((v) => !v.indicativeMin || !v.indicativeMax || Number(v.indicativeMin) <= Number(v.indicativeMax), {
    message: "Minimum must not exceed maximum",
    path: ["indicativeMax"],
  });

export const profileInputSchema = z.object({
  fullName: trimmed(2, 120, "Name"),
  phone: phoneSchema.optional().or(z.literal("").transform(() => undefined)),
  preferredLanguage: z.enum(["en", "hi"]),
});

/** Parses or throws a DomainError carrying field-level messages for the form. */
export function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  const first = result.error.issues[0]?.message ?? "Please check the form";
  throw new DomainError("VALIDATION", first, fieldErrors);
}
