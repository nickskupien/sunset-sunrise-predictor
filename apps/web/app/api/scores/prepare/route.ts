import { proxyApiRequest } from "@/server/upstream-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  return proxyApiRequest({
    method: "POST",
    path: "/scores/prepare",
    body: await req.text(),
  });
}
