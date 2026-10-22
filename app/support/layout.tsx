import { WorkspaceShell } from "@/components/domain/workspace-shell";
import { requireActor } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/server";
import { customerNav } from "@/features/account/nav";
import { technicianNav } from "@/features/technicians/nav";
import { pmNav } from "@/features/properties/nav";

export default async function SupportLayout({ children }: { children: React.ReactNode }) {
  const [actor, dict] = await Promise.all([requireActor(), getDictionary()]);
  const nav = actor.roles.includes("TECHNICIAN") ? technicianNav() : actor.roles.includes("PROPERTY_MANAGER") ? pmNav() : customerNav(dict);
  return (
    <WorkspaceShell actor={actor} title={dict.account.support} nav={nav}>
      {children}
    </WorkspaceShell>
  );
}
