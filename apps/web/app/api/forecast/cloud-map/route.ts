import { proxyApiRequest } from "@/server/upstream-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const incomingUrl = new URL(req.url);
  const locationId = incomingUrl.searchParams.get("locationId");
  const day = incomingUrl.searchParams.get("day");
  const kind = incomingUrl.searchParams.get("kind");
  const targetMs = incomingUrl.searchParams.get("targetMs");

  const params = new URLSearchParams();
  if (locationId) params.set("locationId", locationId);
  if (day) params.set("day", day);
  if (kind) params.set("kind", kind);
  if (targetMs) params.set("targetMs", targetMs);

  return proxyApiRequest({
    method: "GET",
    path: `/forecast/cloud-map?${params.toString()}`,
  });
}
