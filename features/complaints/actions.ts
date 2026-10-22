"use server";

import { redirect } from "next/navigation";
import { withActor, str } from "@/lib/actions";
import { limits } from "@/lib/rate-limit";
import type { ActionResult } from "@/lib/errors";
import { addComplaintUpdate, createComplaint } from "./service";

export async function createComplaintAction(_prev: ActionResult<{ id: string; reference: string }> | null, fd: FormData) {
  const res = await withActor(
    ({ actor, db }) => createComplaint(db, actor, { bookingId: str(fd, "bookingId") || undefined, category: str(fd, "category"), description: str(fd, "description") }),
    { rate: { key: "complaint", ...limits.complaint } },
  );
  if (res.ok) redirect(`/support/${res.data.id}?created=1`);
  return res;
}

export async function complaintUpdateAction(_prev: ActionResult | null, fd: FormData) {
  return withActor(
    ({ actor, db }) =>
      addComplaintUpdate(db, actor, {
        complaintId: str(fd, "complaintId"),
        message: str(fd, "message"),
        status: str(fd, "status") || undefined,
        isInternal: fd.get("isInternal") === "on",
        resolution: str(fd, "resolution") || undefined,
      }),
    { success: "Update posted." },
  );
}
