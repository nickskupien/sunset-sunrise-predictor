import {
  LocationIdParamsSchema,
  PrepareScoresByLocationBodySchema,
} from "@sunset/contracts";
import { proxyApiRequest } from "@/server/upstream-proxy";
import { parseJsonBody } from "@/server/route-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
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
  const bodyParsed = await parseJsonBody(req, PrepareScoresByLocationBodySchema);
  if (!bodyParsed.ok) return bodyParsed.response;

  return proxyApiRequest({
    method: "POST",
    path: `/scores/prepare/${paramsParsed.data.locationId}`,
    body: JSON.stringify(bodyParsed.data),
  });
}
