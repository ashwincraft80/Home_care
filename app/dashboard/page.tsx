import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { homePathFor } from "@/lib/auth/actor";

/** Sends each person to the workspace for their primary role. */
export default async function DashboardRedirect() {
  const actor = await requireActor();
  redirect(homePathFor(actor));
}
