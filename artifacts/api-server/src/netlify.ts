import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { HealthCheckResponse } from "@workspace/api-zod";

type JsonRecord = Record<string, unknown>;

type Order = {
  id: string;
  token: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  occasion: string;
  date: string;
  price: number;
  advanceAmount: number;
  remainingAmount: number;
  advancePaid: boolean;
  remainingPaid: boolean;
  status: string;
  notes: string;
  finalProjectLink: string;
  mediaUploads: JsonRecord[];
  createdAt?: string;
  updatedAt?: string;
};

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
};

const serviceKey =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;
const supabaseUrl =
  normalizeSupabaseUrl(process.env.SUPABASE_URL) ||
  normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
  normalizeSupabaseUrl(process.env.VITE_SUPABASE_URL) ||
  getSupabaseUrlFromJwt(anonKey);
const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || "momenta-uploads";

const supabase =
  supabaseUrl && serviceKey
    ? createSupabaseClient(supabaseUrl, serviceKey)
    : null;

const supabaseAnon =
  supabaseUrl && anonKey
    ? createSupabaseClient(supabaseUrl, anonKey)
    : null;

function createSupabaseClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
}

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

function errorJson(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Unexpected error";
  return json(500, { error: message });
}

function normalizeSupabaseUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    if (!url.hostname.endsWith(".supabase.co")) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

function getSupabaseUrlFromJwt(token: string | undefined): string | undefined {
  if (!token) {
    return undefined;
  }

  try {
    const [, payload] = token.split(".");
    if (!payload) {
      return undefined;
    }

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(Buffer.from(normalized, "base64").toString("utf8")) as {
      iss?: unknown;
      ref?: unknown;
    };
    const issuer = typeof decoded.iss === "string" ? decoded.iss : undefined;
    const issuerUrl = normalizeSupabaseUrl(issuer?.replace(/\/auth\/v1\/?$/, ""));
    if (issuerUrl) {
      return issuerUrl;
    }

    const ref = typeof decoded.ref === "string" ? decoded.ref : undefined;
    return ref ? `https://${ref}.supabase.co` : undefined;
  } catch {
    return undefined;
  }
}

function normalizeApiPath(pathname: string): string {
  const functionPrefix = "/.netlify/functions/api";
  if (!pathname.startsWith(functionPrefix)) {
    return pathname;
  }

  const suffix = pathname.slice(functionPrefix.length);
  return `/api${suffix.startsWith("/") ? suffix : `/${suffix}`}`;
}

function splitPath(pathname: string): string[] {
  return pathname.split("/").filter(Boolean).map(decodeURIComponent);
}

async function readJson(request: Request): Promise<JsonRecord> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as JsonRecord)
      : {};
  } catch {
    return {};
  }
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function mkToken(): string {
  return `MOM-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
}

function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in Netlify.",
    );
  }
  return supabase;
}

async function requireAdmin(request: Request): Promise<JsonRecord> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const token = authHeader.slice(7);
  if (supabase) {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) {
      throw new Response(
        JSON.stringify({
          error: "Invalid or expired session. Please log in again.",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "content-type": "application/json" },
        },
      );
    }
    return user as unknown as JsonRecord;
  }

  if (token.startsWith("admin-")) {
    return { id: "admin" };
  }

  throw new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function normalizeOrder(row: JsonRecord): Order {
  return {
    id: String(row.id),
    token: String(row.token),
    customerName: String(row.customer_name || ""),
    customerEmail: String(row.customer_email || ""),
    customerPhone: String(row.customer_phone || ""),
    occasion: String(row.occasion || "General"),
    date: String(row.date || ""),
    price: getNumber(row.price),
    advanceAmount: getNumber(row.advance_amount),
    remainingAmount: getNumber(row.remaining_amount),
    advancePaid: Boolean(row.advance_paid),
    remainingPaid: Boolean(row.remaining_paid),
    status: String(row.status || "Pending"),
    notes: String(row.notes || ""),
    finalProjectLink: String(row.final_project_link || ""),
    mediaUploads: Array.isArray(row.media_uploads)
      ? (row.media_uploads as JsonRecord[])
      : [],
    createdAt: getString(row.created_at),
    updatedAt: getString(row.updated_at),
  };
}

function orderUpdateRow(fields: JsonRecord): JsonRecord {
  const row: JsonRecord = {};
  const mappings: Record<string, string> = {
    customerName: "customer_name",
    customerEmail: "customer_email",
    customerPhone: "customer_phone",
    occasion: "occasion",
    date: "date",
    price: "price",
    advanceAmount: "advance_amount",
    remainingAmount: "remaining_amount",
    advancePaid: "advance_paid",
    remainingPaid: "remaining_paid",
    status: "status",
    notes: "notes",
    finalProjectLink: "final_project_link",
    mediaUploads: "media_uploads",
  };

  for (const [from, to] of Object.entries(mappings)) {
    if (fields[from] !== undefined) {
      row[to] = fields[from];
    }
  }

  return row;
}

async function getOrderByIdOrToken(idOrToken: string): Promise<Order | null> {
  const db = requireSupabase();
  const byId = await db
    .from("orders")
    .select("*")
    .eq("id", idOrToken)
    .maybeSingle();
  if (byId.error) {
    throw byId.error;
  }
  if (byId.data) {
    return normalizeOrder(byId.data as JsonRecord);
  }

  const byToken = await db
    .from("orders")
    .select("*")
    .eq("token", idOrToken)
    .maybeSingle();
  if (byToken.error) {
    throw byToken.error;
  }
  return byToken.data ? normalizeOrder(byToken.data as JsonRecord) : null;
}

async function saveFileToStorage(file: File): Promise<{
  filename: string;
  url: string;
  isVideo: boolean;
}> {
  const db = requireSupabase();
  const extension = file.name.includes(".") ? file.name.split(".").pop() : "";
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${
    extension ? `.${extension}` : ""
  }`;
  const key = `uploads/${filename}`;
  const contentType = file.type || "application/octet-stream";
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error } = await db.storage.from(storageBucket).upload(key, bytes, {
    contentType,
    upsert: false,
  });
  if (error) {
    throw error;
  }

  const { data } = db.storage.from(storageBucket).getPublicUrl(key);
  return {
    filename,
    url: data.publicUrl,
    isVideo: contentType.startsWith("video/"),
  };
}

async function deleteStoredFile(filename: string | undefined): Promise<void> {
  if (!filename || !supabase) {
    return;
  }
  await supabase.storage.from(storageBucket).remove([`uploads/${filename}`]);
}

async function handleSamples(request: Request, parts: string[]): Promise<Response> {
  const db = requireSupabase();

  if (request.method === "GET" && parts.length === 2) {
    const { data, error } = await db
      .from("samples")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const samples = ((data || []) as JsonRecord[]).map((row) => ({
      ...(row as JsonRecord),
      isVideo: Boolean((row as JsonRecord).is_video),
    }));
    return json(200, { success: true, samples });
  }

  if (request.method === "POST" && parts.length === 2) {
    await requireAdmin(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return json(400, { error: "No file uploaded" });
    }

    const uploaded = await saveFileToStorage(file);
    const sample = {
      id: uid(),
      title: getString(form.get("title")) || "Sample Work",
      description: getString(form.get("description")) || "",
      category: getString(form.get("category")) || "General",
      filename: uploaded.filename,
      url: uploaded.url,
      is_video: uploaded.isVideo,
    };
    const { data, error } = await db.from("samples").insert([sample]).select().single();
    if (error) throw error;
    return json(200, {
      success: true,
      sample: { ...(data as JsonRecord), isVideo: Boolean(sample.is_video) },
    });
  }

  if (request.method === "DELETE" && parts.length === 3) {
    await requireAdmin(request);
    const id = parts[2];
    const { data } = await db.from("samples").select("filename").eq("id", id).single();
    const { error } = await db.from("samples").delete().eq("id", id);
    if (error) throw error;
    await deleteStoredFile(getString((data as JsonRecord | null)?.filename));
    return json(200, { success: true });
  }

  return json(404, { error: "Not found" });
}

async function handleReviews(request: Request, parts: string[]): Promise<Response> {
  const db = requireSupabase();

  if (request.method === "GET" && parts.length === 2) {
    const { data, error } = await db
      .from("reviews")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return json(200, { success: true, reviews: data || [] });
  }

  if (request.method === "POST" && parts.length === 2) {
    await requireAdmin(request);
    const body = await readJson(request);
    const name = getString(body.name);
    const text = getString(body.text);
    if (!name || !text) {
      return json(400, { error: "Name and text required" });
    }

    const rating = Math.min(5, Math.max(1, Math.trunc(getNumber(body.rating, 5))));
    const review = {
      id: uid(),
      name,
      text,
      rating,
      occasion: getString(body.occasion) || "",
      avatar: name
        .split(" ")
        .map((word) => word[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    };
    const { data, error } = await db.from("reviews").insert([review]).select().single();
    if (error) throw error;
    return json(200, { success: true, review: data });
  }

  if (request.method === "DELETE" && parts.length === 3) {
    await requireAdmin(request);
    const { error } = await db.from("reviews").delete().eq("id", parts[2]);
    if (error) throw error;
    return json(200, { success: true });
  }

  return json(404, { error: "Not found" });
}

async function handleOrders(request: Request, parts: string[]): Promise<Response> {
  const db = requireSupabase();

  if (request.method === "GET" && parts.length === 2) {
    await requireAdmin(request);
    const { data, error } = await db
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return json(200, {
      success: true,
      orders: ((data || []) as JsonRecord[]).map((row) => normalizeOrder(row)),
    });
  }

  if (request.method === "POST" && parts.length === 2) {
    await requireAdmin(request);
    const body = await readJson(request);
    const customerName = getString(body.customerName);
    const price = getNumber(body.price);
    if (!customerName || !price) {
      return json(400, { error: "Name and price required" });
    }

    const advanceAmount = getNumber(body.advanceAmount, price * 0.5);
    const remainingAmount = getNumber(body.remainingAmount, price * 0.5);
    const row = {
      id: uid(),
      token: mkToken(),
      customer_name: customerName,
      customer_email: getString(body.customerEmail) || "",
      customer_phone: getString(body.customerPhone) || "",
      occasion: getString(body.occasion) || "General",
      date: getString(body.date) || new Date().toISOString().split("T")[0],
      price,
      advance_amount: advanceAmount,
      remaining_amount: remainingAmount,
      advance_paid: false,
      remaining_paid: false,
      status: "Pending",
      notes: getString(body.notes) || "",
      final_project_link: "",
      media_uploads: [],
    };
    const { data, error } = await db.from("orders").insert([row]).select().single();
    if (error) throw error;
    return json(200, { success: true, order: normalizeOrder(data as JsonRecord) });
  }

  if (parts.length === 3) {
    const id = parts[2];

    if (request.method === "GET") {
      const order = await getOrderByIdOrToken(id);
      if (!order) return json(404, { error: "Order not found" });
      return json(200, { success: true, order });
    }

    if (request.method === "PUT") {
      await requireAdmin(request);
      const body = await readJson(request);
      const allowed = [
        "customerName",
        "customerEmail",
        "customerPhone",
        "occasion",
        "date",
        "price",
        "advanceAmount",
        "remainingAmount",
        "advancePaid",
        "remainingPaid",
        "status",
        "notes",
        "finalProjectLink",
      ];
      const fields = Object.fromEntries(
        allowed
          .filter((key) => body[key] !== undefined)
          .map((key) => [key, body[key]]),
      );
      const { data, error } = await db
        .from("orders")
        .update(orderUpdateRow(fields))
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return json(200, { success: true, order: normalizeOrder(data as JsonRecord) });
    }

    if (request.method === "DELETE") {
      await requireAdmin(request);
      const { error } = await db.from("orders").delete().eq("id", id);
      if (error) throw error;
      return json(200, { success: true });
    }
  }

  return json(404, { error: "Not found" });
}

async function handleCustomer(request: Request, parts: string[]): Promise<Response> {
  if (request.method === "POST" && parts[2] === "login") {
    const body = await readJson(request);
    const token = getString(body.token);
    if (!token) return json(400, { error: "Token required" });
    const order = await getOrderByIdOrToken(token.toUpperCase());
    if (!order) {
      return json(404, { error: "Invalid token. Please check and try again." });
    }
    return json(200, { success: true, order });
  }

  if (request.method === "POST" && parts[2] === "upload") {
    const form = await request.formData();
    const token = getString(form.get("token"));
    if (!token) return json(400, { error: "Token required" });

    const order = await getOrderByIdOrToken(token.toUpperCase());
    if (!order) return json(404, { error: "Invalid token" });

    const files = form.getAll("files").filter((file): file is File => file instanceof File);
    if (!files.length) return json(400, { error: "No files uploaded" });

    const uploads = await Promise.all(
      files.map(async (file) => {
        const uploaded = await saveFileToStorage(file);
        return {
          id: uid(),
          filename: uploaded.filename,
          originalName: file.name,
          url: uploaded.url,
          isVideo: uploaded.isVideo,
          uploadedAt: new Date().toISOString(),
        };
      }),
    );

    const mediaUploads = [...(order.mediaUploads || []), ...uploads];
    const db = requireSupabase();
    const { error } = await db
      .from("orders")
      .update({ media_uploads: mediaUploads })
      .eq("id", order.id);
    if (error) throw error;
    return json(200, { success: true, uploads });
  }

  return json(404, { error: "Not found" });
}

async function handlePayment(request: Request): Promise<Response> {
  const body = await readJson(request);
  const token = getString(body.token);
  const type = getString(body.type);
  if (!token || !type) return json(400, { error: "Token and type required" });

  const order = await getOrderByIdOrToken(token.toUpperCase());
  if (!order) return json(404, { error: "Invalid token" });

  const fields: JsonRecord = {};
  if (type === "advance") fields.advancePaid = true;
  if (type === "remaining") fields.remainingPaid = true;

  const advancePaid = type === "advance" ? true : order.advancePaid;
  const remainingPaid = type === "remaining" ? true : order.remainingPaid;
  if (advancePaid && remainingPaid) fields.status = "Paid";
  else if (advancePaid) fields.status = "In Progress";

  const db = requireSupabase();
  const { data, error } = await db
    .from("orders")
    .update(orderUpdateRow(fields))
    .eq("id", order.id)
    .select()
    .single();
  if (error) throw error;
  return json(200, { success: true, order: normalizeOrder(data as JsonRecord) });
}

async function handleAdmin(request: Request, parts: string[]): Promise<Response> {
  if (request.method === "POST" && parts[2] === "login") {
    const body = await readJson(request);
    const loginEmail = getString(body.email) || getString(body.username);
    const password = getString(body.password);
    if (!loginEmail || !password) {
      return json(400, { error: "Email and password required" });
    }

    if (supabaseUrl && !anonKey) {
      return json(500, {
        error:
          "Supabase admin login is missing SUPABASE_ANON_KEY in Netlify environment variables.",
      });
    }

    if (supabaseAnon) {
      const { data, error } = await supabaseAnon.auth
        .signInWithPassword({
          email: loginEmail,
          password,
        })
        .catch((error: unknown) => ({
          data: { session: null },
          error:
            error instanceof Error
              ? error
              : new Error("Supabase authentication request failed"),
        }));
      if (error || !data.session) {
        return json(401, { error: "Invalid credentials" });
      }
      return json(200, {
        success: true,
        token: data.session.access_token,
        refreshToken: data.session.refresh_token,
      });
    }

    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminUsername || !adminPassword) {
      return json(500, { error: "Admin login is not configured" });
    }
    if (loginEmail === adminUsername && password === adminPassword) {
      return json(200, { success: true, token: `admin-${Date.now()}` });
    }
    return json(401, { error: "Invalid credentials" });
  }

  if (request.method === "GET" && parts[2] === "me") {
    const user = await requireAdmin(request);
    return json(200, { success: true, user });
  }

  return json(404, { error: "Not found" });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return empty(204);
  }

  try {
    const url = new URL(request.url);
    const pathname = normalizeApiPath(url.pathname);
    const parts = splitPath(pathname);

    if (request.method === "GET" && pathname === "/api/healthz") {
      return json(200, HealthCheckResponse.parse({ status: "ok" }));
    }

    if (parts[0] !== "api") {
      return json(404, { error: "Not found" });
    }

    if (parts[1] === "samples") return await handleSamples(request, parts);
    if (parts[1] === "reviews") return await handleReviews(request, parts);
    if (parts[1] === "orders") return await handleOrders(request, parts);
    if (parts[1] === "customer") return await handleCustomer(request, parts);
    if (parts[1] === "payment" && request.method === "POST") {
      return await handlePayment(request);
    }
    if (parts[1] === "admin") return await handleAdmin(request, parts);

    if (parts[1] === "storage" && parts[2] === "upload-url") {
      const body = await readJson(request);
      const key = getString(body.key);
      const contentType = getString(body.contentType);
      if (!key || !contentType) {
        return json(400, { error: "key and contentType are required" });
      }
      const { getUploadUrl } = await import("./lib/storage");
      const uploadUrl = await getUploadUrl(key, contentType);
      return json(200, { url: uploadUrl, key });
    }

    if (parts[1] === "storage" && parts[2] === "download-url") {
      const key = getString(url.searchParams.get("key"));
      if (!key) return json(400, { error: "key is required" });
      const { getDownloadUrl } = await import("./lib/storage");
      const downloadUrl = await getDownloadUrl(key);
      return json(200, { url: downloadUrl, key });
    }

    if (parts[1] === "storage" && parts[2] === "object") {
      const body = await readJson(request);
      const key = getString(body.key);
      if (!key) return json(400, { error: "key is required" });
      const { deleteObject } = await import("./lib/storage");
      await deleteObject(key);
      return json(200, { success: true, key });
    }

    if (parts[1] === "storage" && parts[2] === "list") {
      const prefix = getString(url.searchParams.get("prefix"));
      const { listObjects } = await import("./lib/storage");
      const objects = await listObjects(prefix);
      return json(200, { objects });
    }

    return json(404, { error: "Not found" });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return errorJson(error);
  }
}
