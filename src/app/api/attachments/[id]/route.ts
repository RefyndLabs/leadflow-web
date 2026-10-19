import type { NextRequest } from "next/server";
import { proxyDownload } from "@/lib/server/files";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return proxyDownload(req, (await ctx.params).id);
}
