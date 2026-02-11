import { proxyApiRequest } from "@/server/upstream-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: Request,
  context: { params: Promise<{ locationId: string }> },
) {
  const { locationId } = await context.params;
  return proxyApiRequest({
    method: "POST",
    path: `/scores/prepare/${encodeURIComponent(locationId)}`,
    body: await req.text(),
  });
}
