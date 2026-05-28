import { HealthCheckResponse } from "@workspace/api-zod";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json",
    },
  });
}

function empty(status: number): Response {
  return new Response(null, { status, headers: corsHeaders });
}

function normalizeApiPath(pathname: string): string {
  const functionPrefix = "/.netlify/functions/api";
  if (!pathname.startsWith(functionPrefix)) {
    return pathname;
  }

  const suffix = pathname.slice(functionPrefix.length);
  return `/api${suffix.startsWith("/") ? suffix : `/${suffix}`}`;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return empty(204);
  }

  const url = new URL(request.url);
  const pathname = normalizeApiPath(url.pathname);

  if (request.method === "GET" && pathname === "/api/healthz") {
    return json(200, HealthCheckResponse.parse({ status: "ok" }));
  }

  if (request.method === "POST" && pathname === "/api/storage/upload-url") {
    const body = await readJson(request);
    const key = getString(body["key"]);
    const contentType = getString(body["contentType"]);

    if (!key || !contentType) {
      return json(400, { error: "key and contentType are required" });
    }

    const { getUploadUrl } = await import("./lib/storage");
    const uploadUrl = await getUploadUrl(key, contentType);
    return json(200, { url: uploadUrl, key });
  }

  if (request.method === "GET" && pathname === "/api/storage/download-url") {
    const key = getString(url.searchParams.get("key"));

    if (!key) {
      return json(400, { error: "key is required" });
    }

    const { getDownloadUrl } = await import("./lib/storage");
    const downloadUrl = await getDownloadUrl(key);
    return json(200, { url: downloadUrl, key });
  }

  if (request.method === "DELETE" && pathname === "/api/storage/object") {
    const body = await readJson(request);
    const key = getString(body["key"]);

    if (!key) {
      return json(400, { error: "key is required" });
    }

    const { deleteObject } = await import("./lib/storage");
    await deleteObject(key);
    return json(200, { success: true, key });
  }

  if (request.method === "GET" && pathname === "/api/storage/list") {
    const prefix = getString(url.searchParams.get("prefix"));
    const { listObjects } = await import("./lib/storage");
    const objects = await listObjects(prefix);
    return json(200, { objects });
  }

  return json(404, { error: "Not found" });
}
