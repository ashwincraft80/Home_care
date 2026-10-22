import { WorkspaceShell } from "@/components/domain/workspace-shell";
import { requireActor } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/server";
import { customerNav } from "@/features/account/nav";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const [actor, dict] = await Promise.all([requireActor(), getDictionary()]);
  return (
    <WorkspaceShell actor={actor} title={dict.nav.myHome} nav={customerNav(dict)}>
      {children}
    </WorkspaceShell>
  );
}
