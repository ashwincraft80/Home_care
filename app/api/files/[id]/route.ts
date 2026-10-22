import { NextResponse } from "next/server";
import { getDb } from "@/lib/database";
import { actorOrNull } from "@/lib/auth/session";
import { attachmentForDownload } from "@/features/uploads/service";
import { getStorage } from "@/lib/integrations/storage";

/**
 * Private file access. The attachment row is read AS THE USER, so RLS decides access; storage
 * paths are never exposed. Responses are private and not cached by shared caches.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const actor = await actorOrNull();
  if (!actor) return new NextResponse("Not found", { status: 404 });
  const db = await getDb();
  const file = await attachmentForDownload(db, actor, id);
  if (!file) return new NextResponse("Not found", { status: 404 });
  const result = await getStorage().read(file.storage_path);
  if ("url" in result) return NextResponse.redirect(result.url, { headers: { "Cache-Control": "private, no-store" } });
  return new NextResponse(Buffer.from(result.bytes), {
    headers: {
      "Content-Type": file.mime_type,
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": `inline; filename="${(file.original_name ?? "file").replace(/[^\w.\- ]/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
