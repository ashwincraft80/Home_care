export type DomainErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "INVALID_TRANSITION"
  | "RATE_LIMITED"
  | "UNAVAILABLE";

/** Errors that are safe to show to the user. Anything else is logged and replaced by a generic message. */
export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const forbidden = (msg = "You don't have access to this.") => new DomainError("FORBIDDEN", msg);
export const notFound = (msg = "We couldn't find that.") => new DomainError("NOT_FOUND", msg);
export const conflict = (msg: string) => new DomainError("CONFLICT", msg);

export type ActionResult<T = void> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; code?: DomainErrorCode; fieldErrors?: Record<string, string[]> };

export function toActionError(err: unknown): Extract<ActionResult, { ok: false }> {
  if (err instanceof DomainError) {
    return { ok: false, error: err.message, code: err.code, fieldErrors: err.fieldErrors };
  }
  console.error("[action] unexpected error", err);
  return { ok: false, error: "Something went wrong on our side. Please try again." };
}
