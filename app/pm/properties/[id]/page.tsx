import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { getPropertyDetail, listPropertyRequests } from "@/features/properties/service";
import { listPropertyAssets } from "@/features/assets/service";
import { addUnitAction, removeUnitAction } from "@/features/properties/actions";
import { invitePropertyMemberAction, removePropertyMemberAction, revokeInviteAction } from "@/features/account/actions";
import { PropertyForm } from "@/features/properties/components/property-form";
import { PropertyRequestList } from "@/features/properties/components/request-list";
import { AssetForm } from "@/features/assets/components/asset-form";
import { InviteLinkForm } from "@/components/domain/invite-link-form";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/surface";
import { IllustratedEmpty } from "@/components/motion/illustrations";
import { buttonClass } from "@/components/ui/button";
import { assetTypeLabels } from "@/lib/config/catalog";
import { formatMoney } from "@/lib/money";
import { fmt } from "@/lib/time";

export const metadata: Metadata = { title: "Property" };

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor("PROPERTY_MANAGER");
  const db = await getDb();
  const detail = await getPropertyDetail(db, actor, id);
  if (!detail || !detail.membership || detail.membership.memberRole === "TENANT") notFound();
  const [requests, assets] = await Promise.all([listPropertyRequests(db, actor, { propertyId: id }), listPropertyAssets(db, actor, id)]);
  const { property, membership, units, members, monthly, invites } = detail;
  const canManage = membership.memberRole === "OWNER" || membership.memberRole === "MANAGER";
  const isOwner = membership.memberRole === "OWNER";
  const maxSpend = Math.max(1, ...monthly.map((m) => m.spendPaise));

  return (
    <>
      <Link href="/pm" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Properties
      </Link>
      <PageHeader
        title={property.name}
        description={`${property.line1}, ${property.locality}, ${property.city} ${property.pincode}`}
        actions={
          canManage && (
            <Link href={`/book?property=${property.id}`} className={buttonClass("primary", "md")}>
              New request
            </Link>
          )
        }
      />
      <div className="mb-6 flex flex-wrap gap-2">
        <Badge tone="neutral">Your role: {membership.memberRole.toLowerCase()}</Badge>
        {membership.memberRole === "MANAGER" && <Badge tone="info">You approve up to {formatMoney(membership.approvalLimitPaise ?? 0)}</Badge>}
        {!property.serviceAreaId && <Badge tone="warning">Outside our current service areas</Badge>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <section className="space-y-3" aria-labelledby="req">
            <h2 id="req" className="text-lg font-bold">
              Requests
            </h2>
            {requests.length ? <PropertyRequestList items={requests} /> : <IllustratedEmpty scene="bookings" title="No requests yet" body="Raise a request for a unit or a common area." />}
          </section>

          <Card>
            <CardHeader title="Monthly summary" description="Requests raised, jobs completed and invoiced spend (last 6 months)." />
            <CardBody>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-muted">
                    <th className="pb-2 font-semibold">Month</th>
                    <th className="pb-2 text-right font-semibold">Requests</th>
                    <th className="pb-2 text-right font-semibold">Completed</th>
                    <th className="pb-2 pl-4 font-semibold">Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.map((m) => (
                    <tr key={m.month} className="border-t border-line">
                      <td className="py-2">{fmt.date(`${m.month}-01`).replace(/^\d+ /, "")}</td>
                      <td className="py-2 text-right tabular-nums">{m.requests}</td>
                      <td className="py-2 text-right tabular-nums">{m.completed}</td>
                      <td className="py-2 pl-4">
                        <div className="flex items-center gap-2">
                          <div className="h-2 rounded-full bg-sage" style={{ width: `${(m.spendPaise / maxSpend) * 100}px` }} aria-hidden />
                          <span className="tabular-nums">{formatMoney(m.spendPaise)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Appliances & systems" description="Property-level passport: geysers, solar, pumps and more." />
            <CardBody className="space-y-3">
              {assets.length === 0 ? (
                <p className="text-sm text-ink-muted">No appliances recorded yet.</p>
              ) : (
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {assets.map((a) => (
                    <li key={a.id}>
                      <Link href={`/pm/assets/${a.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-surface-muted">
                        <span>
                          <span className="font-semibold">{a.nickname}</span>
                          <span className="text-sm text-ink-muted">
                            {" "}
                            · {assetTypeLabels[a.assetType]}
                            {a.unitLabel ? ` · ${a.unitLabel}` : ""}
                          </span>
                        </span>
                        <span className="text-sm text-ink-muted">{a.lastServicedOn ? `Serviced ${fmt.date(a.lastServicedOn)}` : "No service record"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {canManage && (
                <details className="rounded-xl border border-line">
                  <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-semibold">
                    <Plus className="size-4" aria-hidden /> Add an appliance
                  </summary>
                  <div className="border-t border-line p-4">
                    <AssetForm propertyId={property.id} units={units.map((u) => ({ id: u.id, label: u.label }))} />
                  </div>
                </details>
              )}
            </CardBody>
          </Card>

          {canManage && (
            <Card>
              <CardHeader title="Property details" />
              <CardBody>
                <PropertyForm values={{ id: property.id, name: property.name, propertyType: property.propertyType, line1: property.line1, pincode: property.pincode }} />
              </CardBody>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader title="Units" />
            <CardBody className="space-y-2">
              {units.length === 0 && <p className="text-sm text-ink-muted">No units yet. Requests can still be raised for the whole property.</p>}
              {units.map((u) => (
                <div key={u.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                  <span>
                    <span className="font-semibold">{u.label}</span> <span className="text-sm text-ink-muted">· {u.openRequests} open</span>
                  </span>
                  {canManage && (
                    <ActionForm action={removeUnitAction as never} className="space-y-0">
                      <input type="hidden" name="unitId" value={u.id} />
                      <SubmitButton variant="ghost" size="sm" pendingLabel="…">
                        Remove
                      </SubmitButton>
                    </ActionForm>
                  )}
                </div>
              ))}
              {canManage && (
                <ActionForm action={addUnitAction as never} className="flex items-end gap-2 space-y-0 pt-2">
                  <input type="hidden" name="propertyId" value={property.id} />
                  <Field label="New unit" htmlFor="unit-label" className="flex-1">
                    <Input id="unit-label" name="label" placeholder="e.g. B-302" required />
                  </Field>
                  <SubmitButton variant="secondary" pendingLabel="Adding…">
                    Add
                  </SubmitButton>
                </ActionForm>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="People" description="Tenants only see their own unit. Managers approve within their limit." />
            <CardBody className="space-y-2">
              {members.map((m) => (
                <div key={m.profileId} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{m.name}</span>
                    <span className="text-sm text-ink-muted">
                      {m.memberRole.toLowerCase()}
                      {m.unitLabel ? ` · ${m.unitLabel}` : ""}
                      {m.memberRole !== "OWNER" && m.memberRole !== "VIEWER" ? ` · up to ${formatMoney(m.approvalLimitPaise ?? 0)}` : ""}
                    </span>
                  </span>
                  {isOwner && m.profileId !== actor.userId && (
                    <ActionForm action={removePropertyMemberAction as never} className="space-y-0">
                      <input type="hidden" name="propertyId" value={property.id} />
                      <input type="hidden" name="profileId" value={m.profileId} />
                      <SubmitButton variant="ghost" size="sm" className="text-danger" pendingLabel="…">
                        Remove
                      </SubmitButton>
                    </ActionForm>
                  )}
                </div>
              ))}
              {invites.length > 0 && (
                <div className="pt-2">
                  <p className="text-xs font-bold tracking-wide text-ink-subtle uppercase">Pending invitations</p>
                  {invites.map((i) => (
                    <div key={i.id} className="mt-2 flex items-center justify-between text-sm">
                      <span>
                        {i.memberRole.toLowerCase()}
                        {i.unitLabel ? ` · ${i.unitLabel}` : ""} · expires {fmt.date(i.expiresAt)}
                      </span>
                      <ActionForm action={revokeInviteAction as never} className="space-y-0">
                        <input type="hidden" name="invitationId" value={i.id} />
                        <SubmitButton variant="ghost" size="sm" pendingLabel="…">
                          Cancel
                        </SubmitButton>
                      </ActionForm>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {isOwner ? (
            <Card>
              <CardHeader title="Invite someone" description="Single-use link, valid for 7 days." />
              <CardBody>
                <InviteLinkForm action={invitePropertyMemberAction} submitLabel="Create invite link" shareText={`You're invited to ${property.name} on HomeCare:`}>
                  <input type="hidden" name="propertyId" value={property.id} />
                  <Field label="Role" htmlFor="memberRole">
                    <Select id="memberRole" name="memberRole" defaultValue="TENANT">
                      <option value="TENANT">Tenant (one unit)</option>
                      <option value="MANAGER">Co-manager</option>
                      <option value="VIEWER">Viewer (read-only)</option>
                    </Select>
                  </Field>
                  <Field label="Unit (required for tenants)" htmlFor="unitId">
                    <Select id="unitId" name="unitId" defaultValue="">
                      <option value="">—</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Approval limit in ₹" htmlFor="approvalLimit" hint="Tenants pay and approve small repairs up to this. Managers approve up to this.">
                    <Input id="approvalLimit" name="approvalLimit" inputMode="numeric" placeholder="e.g. 500" />
                  </Field>
                </InviteLinkForm>
              </CardBody>
            </Card>
          ) : (
            <Alert tone="info">Only the property owner can invite or remove people.</Alert>
          )}
        </aside>
      </div>
    </>
  );
}
