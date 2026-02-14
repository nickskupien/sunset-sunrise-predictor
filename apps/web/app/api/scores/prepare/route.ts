import { PrepareScoresByCoordinatesBodySchema } from "@sunset/contracts";
import { proxyApiRequest } from "@/server/upstream-proxy";
import { parseJsonBody } from "@/server/route-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, PrepareScoresByCoordinatesBodySchema);
  if (!parsed.ok) return parsed.response;

  return proxyApiRequest({
    method: "POST",
    path: "/scores/prepare",
    body: JSON.stringify(parsed.data),
  });
}
