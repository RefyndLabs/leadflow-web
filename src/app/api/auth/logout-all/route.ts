import type { NextRequest } from "next/server";
import { handleLogout } from "@/lib/server/logout";

export const dynamic = "force-dynamic";

export const POST = (req: NextRequest) => handleLogout(req, "/auth/logout-all");
