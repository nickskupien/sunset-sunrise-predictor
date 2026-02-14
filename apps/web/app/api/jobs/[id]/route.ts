import { JobIdParamsSchema } from "@sunset/contracts";
import { proxyApiRequest } from "@/server/upstream-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const parsed = JobIdParamsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "invalid_job_id", message: "Job id must be a positive integer." },
      { status: 400 },
    );
  }

  return proxyApiRequest({
    method: "GET",
    path: `/jobs/${parsed.data.id}`,
  });
}
