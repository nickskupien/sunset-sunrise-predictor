import { proxyApiRequest } from "@/server/upstream-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  return proxyApiRequest({
    method: "GET",
    path: `/jobs/${encodeURIComponent(id)}`,
  });
}
