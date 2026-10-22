"use server";

import { withActor, str } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { updateTechnicianProfile } from "./service";

export async function updateTechnicianProfileAction(_prev: ActionResult | null, fd: FormData) {
  return withActor(
    ({ actor, db }) =>
      updateTechnicianProfile(db, actor, {
        bio: str(fd, "bio"),
        yearsExperience: str(fd, "yearsExperience"),
        phone: str(fd, "phone"),
        categoryIds: fd.getAll("categoryIds").map(String),
        serviceAreaIds: fd.getAll("serviceAreaIds").map(String),
        availability: fd.getAll("availability").map(String),
      }),
    { success: "Profile saved." },
  );
}
