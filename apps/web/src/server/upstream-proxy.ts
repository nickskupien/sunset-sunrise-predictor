import { getEnv } from "@/config/env";

const UPSTREAM_TIMEOUT_MS = 10_000;
const PROXY_RESPONSE_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

type ProxyRequest = {
  path: string;
  method: "GET" | "POST";
  body?: string;
};

function hasSafePath(path: string) {
  return path.startsWith("/") && !path.includes("\r") && !path.includes("\n");
}

export async function proxyApiRequest(input: ProxyRequest): Promise<Response> {
  if (!hasSafePath(input.path)) {
    return Response.json(
      {
        ok: false,
        error: "invalid_proxy_path",
        message: "Proxy path must start with '/' and cannot contain control characters.",
      },
      { status: 500, headers: PROXY_RESPONSE_HEADERS },
    );
  }

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
      headers: {
        ...PROXY_RESPONSE_HEADERS,
        "content-type": response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return Response.json(
        { ok: false, error: "upstream_timeout", message: "The API service timed out." },
        { status: 504, headers: PROXY_RESPONSE_HEADERS },
      );
    }

    return Response.json(
      { ok: false, error: "upstream_unreachable", message: "Unable to reach API service." },
      { status: 502, headers: PROXY_RESPONSE_HEADERS },
    );
  }
}
