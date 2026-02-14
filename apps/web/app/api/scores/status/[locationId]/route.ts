import {
  LocationIdParamsSchema,
  ScoresStatusByLocationQuerySchema,
} from "@sunset/contracts";
import { proxyApiRequest } from "@/server/upstream-proxy";
import { parseSearchParams } from "@/server/route-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: Request,
  context: { params: Promise<{ locationId: string }> },
) {
  const paramsParsed = LocationIdParamsSchema.safeParse(await context.params);
  if (!paramsParsed.success) {
    return Response.json(
      { ok: false, error: "invalid_location_id", message: "Location id must be a positive integer." },
      { status: 400 },
    );
  }
  const queryParsed = parseSearchParams(req, ScoresStatusByLocationQuerySchema);
  if (!queryParsed.ok) return queryParsed.response;

  const params = new URLSearchParams();
  params.set("forecastDays", String(queryParsed.data.forecastDays));
  if (queryParsed.data.kinds?.length) params.set("kinds", queryParsed.data.kinds.join(","));
  if (queryParsed.data.minComputedAtMs != null) {
    params.set("minComputedAtMs", String(queryParsed.data.minComputedAtMs));
  }

  const suffix = params.size > 0 ? `?${params.toString()}` : "";

  return proxyApiRequest({
    method: "GET",
    path: `/scores/status/${paramsParsed.data.locationId}${suffix}`,
  });
}
