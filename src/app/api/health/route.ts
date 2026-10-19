export const dynamic = "force-dynamic";

/** Liveness probe for the container. Deliberately does not touch the API or reveal config. */
export function GET() {
  return Response.json(
    { status: "ok" },
    { headers: { "cache-control": "no-store" } },
  );
}
