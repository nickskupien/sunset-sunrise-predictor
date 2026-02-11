import { getEnv } from "@/config/env";

const UPSTREAM_TIMEOUT_MS = 10_000;

type ProxyRequest = {
  path: string;
  method: "GET" | "POST";
  body?: string;
};

export async function proxyApiRequest(input: ProxyRequest): Promise<Response> {
  const env = getEnv();
  const url = `${env.API_BASE_URL}${input.path}`;

  try {
    const response = await fetch(url, {
      method: input.method,
      headers: { accept: "application/json", "content-type": "application/json" },
      body: input.body,
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    const text = await response.text();

    return new Response(text, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return Response.json(
      { ok: false, error: "upstream_unreachable", message: "Unable to reach API service." },
      { status: 502 },
    );
  }
}
