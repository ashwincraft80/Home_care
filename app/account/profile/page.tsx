import type { Metadata } from "next";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { getProfile } from "@/features/account/service";
import { deleteAddressAction, requestDeletionAction, updateProfileAction } from "@/features/account/actions";
import { integrationStatus } from "@/lib/integrations";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/surface";
import { fmt } from "@/lib/time";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const actor = await requireActor();
  const { profile, contact, addresses } = await getProfile(await getDb(), actor);
  const channels = integrationStatus().filter((i) => ["sms", "email", "whatsapp"].includes(i.key));
  return (
    <>
      <PageHeader title="Profile & privacy" description="We keep only what we need to arrange and record your services." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your details" />
          <CardBody>
            <ActionForm action={updateProfileAction as never}>
              <Field label="Name" htmlFor="fullName">
                <Input id="fullName" name="fullName" defaultValue={profile.fullName} required />
              </Field>
              <Field label="Mobile number" htmlFor="phone" hint="Shared with your assigned professional only while a job is active.">
                <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={contact?.phone ?? ""} />
              </Field>
              {contact?.email && <p className="text-sm text-ink-muted">Email: {contact.email}</p>}
              <Field label="Language" htmlFor="preferredLanguage">
                <Select id="preferredLanguage" name="preferredLanguage" defaultValue={profile.preferredLanguage}>
                  <option value="en">English</option>
                  <option value="hi">हिन्दी (Hindi)</option>
                </Select>
              </Field>
              <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Saved addresses" />
            <CardBody className="space-y-2">
              {addresses.length === 0 ? (
                <p className="text-sm text-ink-muted">Addresses you save while booking appear here.</p>
              ) : (
                addresses.map((a) => (
                  <div key={a.id} className="flex items-start justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
                    <p className="text-sm">
                      <span className="font-semibold">{a.label}</span>
                      <br />
                      <span className="text-ink-muted">
                        {a.line1}, {a.locality}, {a.city} {a.pincode}
                      </span>
                    </p>
                    <ActionForm action={deleteAddressAction as never} className="space-y-0">
                      <input type="hidden" name="addressId" value={a.id} />
                      <SubmitButton variant="ghost" size="sm" className="text-danger" pendingLabel="…">
                        Remove
                      </SubmitButton>
                    </ActionForm>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Notifications" description="Booking updates always appear in the app." />
            <CardBody className="space-y-2">
              {channels.map((c) => (
                <div key={c.key} className="flex items-center justify-between text-sm">
                  <span>{c.label}</span>
                  <Badge tone="neutral">{c.state === "configured" ? "Available" : "Not available yet"}</Badge>
                </div>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Delete my data" />
            <CardBody className="space-y-3">
              {profile.deletionRequestedAt ? (
                <Alert tone="info">Deletion requested on {fmt.date(profile.deletionRequestedAt)}. Operations will confirm before deleting.</Alert>
              ) : (
                <ActionForm action={requestDeletionAction as never}>
                  <p className="text-sm text-ink-muted">
                    We&apos;ll delete your profile, addresses and appliances. Invoices and job records may be kept for the period the law requires — we&apos;ll tell you what is retained and why.
                  </p>
                  <SubmitButton variant="danger" size="sm" pendingLabel="Sending…">
                    Request deletion
                  </SubmitButton>
                </ActionForm>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
