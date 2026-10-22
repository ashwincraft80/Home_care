import { WorkspaceShell } from "@/components/domain/workspace-shell";
import { requireActor } from "@/lib/auth/session";
import { adminNav } from "@/features/admin/nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor("ADMIN");
  return (
    <WorkspaceShell actor={actor} title="Operations" nav={adminNav()}>
      {children}
    </WorkspaceShell>
  );
}
