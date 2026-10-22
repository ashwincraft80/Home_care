import { DomainError } from "@/lib/errors";

interface PgLikeError {
  code?: string;
  constraint?: string;
  constraint_name?: string;
  message?: string;
}

const constraintMessages: Record<string, string> = {
  bookings_technician_window_unique: "That professional already has a job in this time window.",
  bookings_customer_category_window_unique:
    "You already have an open booking for this service in that time window.",
  estimates_one_open_per_booking: "There is already an estimate waiting for a decision on this job.",
  estimate_approvals_estimate_id_key: "A decision has already been recorded for this estimate.",
  reviews_booking_id_key: "You have already reviewed this job.",
  invoices_booking_id_key: "An invoice already exists for this job.",
  property_units_property_id_label_key: "A unit with that name already exists in this property.",
};

/** Converts known Postgres errors into user-safe DomainErrors; rethrows anything else. */
export function mapDbError(err: unknown): never {
  if (err instanceof DomainError) throw err;
  const e = err as PgLikeError;
  if (e && typeof e === "object" && typeof e.code === "string") {
    const constraint = e.constraint ?? e.constraint_name ?? "";
    if (e.code === "23505") {
      throw new DomainError("CONFLICT", constraintMessages[constraint] ?? "This was already recorded.");
    }
    if (e.code === "23514") {
      throw new DomainError("INVALID_TRANSITION", "That change isn't allowed in the current state. Please refresh.");
    }
    if (e.code === "23503") {
      throw new DomainError("VALIDATION", "A referenced record no longer exists. Please refresh and try again.");
    }
  }
  throw err;
}

export async function withDbErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    mapDbError(err);
  }
}
