import { proxyApiRequest } from "@/server/upstream-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: Request,
  context: { params: Promise<{ locationId: string }> },
) {
  const { locationId } = await context.params;
  const incomingUrl = new URL(req.url);
  const forecastDays = incomingUrl.searchParams.get("forecastDays");
  const kinds = incomingUrl.searchParams.get("kinds");
  const minComputedAtMs = incomingUrl.searchParams.get("minComputedAtMs");

  const params = new URLSearchParams();
  if (forecastDays) params.set("forecastDays", forecastDays);
  if (kinds) params.set("kinds", kinds);
  if (minComputedAtMs) params.set("minComputedAtMs", minComputedAtMs);

  const suffix = params.size > 0 ? `?${params.toString()}` : "";

  return proxyApiRequest({
    method: "GET",
    path: `/scores/status/${encodeURIComponent(locationId)}${suffix}`,
  });
}
