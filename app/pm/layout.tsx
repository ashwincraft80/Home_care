import { WorkspaceShell } from "@/components/domain/workspace-shell";
import { requireActor } from "@/lib/auth/session";
import { pmNav } from "@/features/properties/nav";

export default async function PmLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor("PROPERTY_MANAGER");
  return (
    <WorkspaceShell actor={actor} title="Properties" nav={pmNav()}>
      {children}
    </WorkspaceShell>
  );
}
