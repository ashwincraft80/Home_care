"use server";

import { redirect } from "next/navigation";
import { withActor, str } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { acceptInvite } from "./service";

export async function acceptInviteAction(_prev: ActionResult<{ redirectTo: string }> | null, fd: FormData) {
  const res = await withActor(({ actor, db }) => acceptInvite(db, actor, str(fd, "token")));
  if (res.ok) redirect(res.data.redirectTo);
  return res;
}
