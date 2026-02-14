import { z } from "zod";

const MAX_JSON_BODY_BYTES = 16 * 1024;

type ParseResult<T> = { ok: true; data: T } | { ok: false; response: Response };

function errorResponse(status: number, error: string, message: string) {
  return Response.json(
    {
      ok: false,
      error,
      message,
    },
    { status },
  );
}

export function parseSearchParams<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): ParseResult<z.infer<T>> {
  const url = new URL(req.url);
  const input = Object.fromEntries(url.searchParams.entries());
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      response: errorResponse(400, "invalid_query", "One or more query parameters are invalid."),
    };
  }

  return { ok: true, data: parsed.data };
}

export async function parseJsonBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<ParseResult<z.infer<T>>> {
  const raw = await req.text();
  if (raw.length > MAX_JSON_BODY_BYTES) {
    return {
      ok: false,
      response: errorResponse(413, "payload_too_large", "Request payload is too large."),
    };
  }

  let input: unknown = {};
  if (raw.trim().length > 0) {
    try {
      input = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        response: errorResponse(400, "invalid_json", "Request body must be valid JSON."),
      };
    }
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      response: errorResponse(400, "invalid_body", "Request body contains invalid fields."),
    };
  }

  return { ok: true, data: parsed.data };
}
