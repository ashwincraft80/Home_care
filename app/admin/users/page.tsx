import type { Metadata } from "next";
import { getDb } from "@/lib/database";
import { requireActor } from "@/lib/auth/session";
import { listUsers } from "@/features/admin/service";
import { Badge, Card, PageHeader } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { fmt } from "@/lib/time";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const actor = await requireActor("ADMIN");
  const users = await listUsers(await getDb(), actor, q);
  return (
    <>
      <PageHeader title="Users" description="Roles are granted on the server only. Admin access is granted by an existing admin or the seed script — never at sign-up." />
      <form className="mb-5 flex gap-2" role="search">
        <label htmlFor="uq" className="sr-only">
          Search users
        </label>
        <Input id="uq" name="q" defaultValue={q ?? ""} placeholder="Name or email" className="max-w-sm" />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line text-left text-ink-muted">
            <tr>
              <th className="px-5 py-3 font-semibold">Name</th>
              <th className="px-5 py-3 font-semibold">Roles</th>
              <th className="px-5 py-3 font-semibold">Contact</th>
              <th className="px-5 py-3 text-right font-semibold">Bookings</th>
              <th className="px-5 py-3 font-semibold">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-5 py-3 font-semibold">{u.name}</td>
                <td className="px-5 py-3">
                  <span className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <Badge key={r} tone={r === "ADMIN" ? "danger" : "neutral"}>
                        {r.replace("_", " ").toLowerCase()}
                      </Badge>
                    ))}
                  </span>
                </td>
                <td className="px-5 py-3 text-ink-muted">{u.email ?? u.phone ?? "—"}</td>
                <td className="px-5 py-3 text-right tabular-nums">{u.bookings}</td>
                <td className="px-5 py-3 text-ink-muted">{fmt.date(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
