import type { Metadata } from "next";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { getHousehold } from "@/features/invitations/service";
import { inviteHouseholdAction, removeHouseholdAction } from "@/features/account/actions";
import { InviteLinkForm } from "@/components/domain/invite-link-form";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Input, Select } from "@/components/ui/form";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/surface";
import { IllustratedEmpty } from "@/components/motion/illustrations";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Household" };

export default async function HouseholdPage() {
  const actor = await requireActor();
  const { members, memberOf } = await getHousehold(await getDb(), actor);
  return (
    <>
      <PageHeader
        title="Household"
        description="Share your bookings with a partner or family member so whoever is home knows what's happening. They never see property or other people's data."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="People who can see your bookings" />
          <CardBody className="space-y-3">
            {members.length === 0 ? (
              <IllustratedEmpty scene="household" title="Only you for now" body="Invite someone with a private link." className="border-0 py-4" />
            ) : (
              members.map((m) => (
                <div key={m.memberId} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
                  <div>
                    <p className="font-semibold text-ink">{m.name}</p>
                    <p className="text-sm text-ink-muted">
                      {m.access === "MANAGE" ? `Can manage${m.approvalLimitPaise != null ? ` · approves up to ${formatMoney(m.approvalLimitPaise)}` : " · can't approve estimates"}` : "Can view"}
                    </p>
                  </div>
                  <ActionForm action={removeHouseholdAction as never} className="space-y-0">
                    <input type="hidden" name="ownerId" value={actor.userId} />
                    <input type="hidden" name="memberId" value={m.memberId} />
                    <SubmitButton variant="ghost" size="sm" className="text-danger" pendingLabel="Removing…">
                      Remove
                    </SubmitButton>
                  </ActionForm>
                </div>
              ))
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Invite someone" description="They need a HomeCare account. The link works once and expires in 7 days." />
          <CardBody>
            <InviteLinkForm action={inviteHouseholdAction} submitLabel="Create invite link" shareText="Join my HomeCare household to follow our home bookings:">
              <Field label="Access" htmlFor="access">
                <Select id="access" name="access" defaultValue="VIEW">
                  <option value="VIEW">View bookings and updates</option>
                  <option value="MANAGE">View and manage (reschedule, cancel, approve)</option>
                </Select>
              </Field>
              <Field label="Approval limit in ₹ (manage only)" htmlFor="approvalLimit" hint="Estimates above this still need you. Leave empty for no approvals.">
                <Input id="approvalLimit" name="approvalLimit" inputMode="numeric" className="max-w-40" />
              </Field>
            </InviteLinkForm>
          </CardBody>
        </Card>
      </div>
      {memberOf.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Households you belong to" />
          <CardBody className="space-y-3">
            {memberOf.map((h) => (
              <div key={h.ownerId} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
                <p>
                  <span className="font-semibold">{h.name}</span> <span className="text-sm text-ink-muted">· {h.access === "MANAGE" ? "you can manage" : "you can view"}</span>
                </p>
                <ActionForm action={removeHouseholdAction as never} className="space-y-0">
                  <input type="hidden" name="ownerId" value={h.ownerId} />
                  <input type="hidden" name="memberId" value={actor.userId} />
                  <SubmitButton variant="ghost" size="sm" pendingLabel="Leaving…">
                    Leave
                  </SubmitButton>
                </ActionForm>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </>
  );
}
