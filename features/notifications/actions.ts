"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/database";
import { actorOrNull } from "@/lib/auth/session";
import { markAllRead } from "./service";

export async function markNotificationsReadAction(): Promise<void> {
  const actor = await actorOrNull();
  if (!actor) return;
  await markAllRead(await getDb(), actor);
  revalidatePath("/", "layout");
}
