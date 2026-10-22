import type { ComplaintDetail } from "@/features/complaints/service";
import { complaintUpdateAction } from "@/features/complaints/actions";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/form";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/surface";
import { fmt } from "@/lib/time";

export const complaintCategoryText: Record<string, string> = {
  QUALITY: "Work quality",
  PRICING: "Pricing",
  BEHAVIOUR: "Behaviour",
  NO_SHOW: "No-show",
  DAMAGE: "Damage",
  WARRANTY_CLAIM: "Warranty claim",
  PAYOUT: "Payout",
  SAFETY: "Safety",
  OTHER: "Other",
};
export const complaintStatusTone = { OPEN: "warning", IN_REVIEW: "info", ESCALATED: "danger", RESOLVED: "success", CLOSED: "neutral" } as const;

export function ComplaintThread({ c, admin }: { c: ComplaintDetail; admin: boolean }) {
  const closed = c.status === "RESOLVED" || c.status === "CLOSED";
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader title="Conversation" description="Updates from you and the HomeCare team." />
        <CardBody>
          <ol className="space-y-4">
            <li className="rounded-xl bg-surface-muted p-4">
              <p className="text-xs font-semibold text-ink-subtle">
                {c.raisedByName ?? "You"} · {fmt.dateTime(c.createdAt)}
              </p>
              <p className="mt-1 whitespace-pre-line text-[15px] text-ink">{c.description}</p>
            </li>
            {c.updates.map((u) => (
              <li key={u.id} className={`rounded-xl p-4 ${u.isInternal ? "border border-dashed border-warning/40 bg-warning-soft" : u.authorRole === "ADMIN" ? "bg-brand-soft" : "bg-surface-muted"}`}>
                <p className="text-xs font-semibold text-ink-subtle">
                  {u.authorRole === "ADMIN" ? "HomeCare support" : (u.authorName ?? "You")} · {fmt.dateTime(u.createdAt)}
                  {u.isInternal && " · internal note"}
                  {u.statusChange && ` · status → ${u.statusChange.replace("_", " ").toLowerCase()}`}
                </p>
                <p className="mt-1 whitespace-pre-line text-[15px] text-ink">{u.message}</p>
              </li>
            ))}
          </ol>
          {(!closed || admin) && (
            <ActionForm action={complaintUpdateAction as never} className="mt-6">
              <input type="hidden" name="complaintId" value={c.id} />
              <Field label={admin ? "Reply or note" : "Add a reply"} htmlFor="message">
                <Textarea id="message" name="message" rows={3} required />
              </Field>
              {admin && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Change status" htmlFor="status">
                    <Select id="status" name="status" defaultValue="">
                      <option value="">No change</option>
                      <option value="IN_REVIEW">In review</option>
                      <option value="ESCALATED">Escalated</option>
                      <option value="RESOLVED">Resolved</option>
                      <option value="CLOSED">Closed</option>
                    </Select>
                  </Field>
                  <Field label="Resolution (required to resolve)" htmlFor="resolution">
                    <Textarea id="resolution" name="resolution" rows={2} className="min-h-0" />
                  </Field>
                  <Checkbox name="isInternal" label="Internal note (not visible to the customer)" className="sm:col-span-2" />
                </div>
              )}
              <SubmitButton pendingLabel="Posting…">Post</SubmitButton>
            </ActionForm>
          )}
        </CardBody>
      </Card>
      <Card className="h-fit">
        <CardHeader title={c.reference} action={<Badge tone={complaintStatusTone[c.status]}>{c.status.replace("_", " ").toLowerCase()}</Badge>} />
        <CardBody className="space-y-2 text-sm">
          <p>
            <span className="text-ink-muted">Type:</span> {complaintCategoryText[c.category]}
          </p>
          <p>
            <span className="text-ink-muted">Priority:</span> {c.priority.toLowerCase()}
          </p>
          {c.bookingReference && (
            <p>
              <span className="text-ink-muted">Booking:</span> {c.bookingReference}
            </p>
          )}
          <p>
            <span className="text-ink-muted">Raised:</span> {fmt.dateTime(c.createdAt)}
          </p>
          {c.resolution && (
            <div className="mt-3 rounded-lg bg-success-soft p-3 text-[#115430]">
              <p className="font-semibold">Resolution</p>
              <p>{c.resolution}</p>
            </div>
          )}
          {!admin && !closed && <p className="pt-2 text-ink-muted">Not resolved in time? Reply here asking to escalate — operations reviews escalations first.</p>}
        </CardBody>
      </Card>
    </div>
  );
}
