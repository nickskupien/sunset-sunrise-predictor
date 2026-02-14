import { proxyApiRequest } from "@/server/upstream-proxy";
import { CreateLocationBodySchema, ListLocationsQuerySchema } from "@sunset/contracts";
import { parseJsonBody, parseSearchParams } from "@/server/route-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const parsed = parseSearchParams(req, ListLocationsQuerySchema);
  if (!parsed.ok) return parsed.response;

  return proxyApiRequest({
    method: "GET",
    path: `/locations?limit=${parsed.data.limit}`,
  });
}

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, CreateLocationBodySchema);
  if (!parsed.ok) return parsed.response;

  return proxyApiRequest({
    method: "POST",
    path: "/locations",
    body: JSON.stringify(parsed.data),
  });
}
