import { proxyApiRequest } from "@/server/upstream-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const incomingUrl = new URL(req.url);
  const rawLimit = incomingUrl.searchParams.get("limit") ?? "200";
  const parsedLimit = Number(rawLimit);
  const safeLimit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(Math.trunc(parsedLimit), 1), 500)
    : 200;

  return proxyApiRequest({
    method: "GET",
    path: `/locations?limit=${safeLimit}`,
  });
}
