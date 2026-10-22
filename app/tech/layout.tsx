import { WorkspaceShell } from "@/components/domain/workspace-shell";
import { requireActor } from "@/lib/auth/session";
import { technicianNav } from "@/features/technicians/nav";

export default async function TechLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor("TECHNICIAN");
  return (
    <WorkspaceShell actor={actor} title="Professional" nav={technicianNav()}>
      {children}
    </WorkspaceShell>
  );
}
