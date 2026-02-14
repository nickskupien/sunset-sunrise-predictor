import { ForecastCloudMapQuerySchema } from "@sunset/contracts";
import { proxyApiRequest } from "@/server/upstream-proxy";
import { parseSearchParams } from "@/server/route-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const parsed = parseSearchParams(req, ForecastCloudMapQuerySchema);
  if (!parsed.ok) return parsed.response;

  const params = new URLSearchParams();
  params.set("locationId", String(parsed.data.locationId));
  params.set("day", parsed.data.day);
  params.set("kind", parsed.data.kind);
  if (parsed.data.targetMs != null) params.set("targetMs", String(parsed.data.targetMs));

  return proxyApiRequest({
    method: "GET",
    path: `/forecast/cloud-map?${params.toString()}`,
  });
}
