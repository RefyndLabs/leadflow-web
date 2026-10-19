import type { NextRequest } from "next/server";
import { proxyUpload } from "@/lib/server/files";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return proxyUpload(req, (await ctx.params).id, "card-back");
}
