import type {ApiFetchFn} from "@bio-mcp/shared/codemode/catalog";
import {crossrefFetch} from "./http";

type Request = Parameters<ApiFetchFn>[0];
const fail = (message: string, status = 400, data?: unknown): never => {
  throw Object.assign(new Error(message), {status, data});
};
const headersOf = (headers: Headers) => Object.fromEntries([
  "x-rate-limit-limit", "x-rate-limit-interval", "x-rate-limit-type",
  "x-concurrency-limit", "retry-after",
].map(name => [name, headers.get(name)]));

function checkedParams(request: Request): Record<string, string | number | boolean> {
  if (request.method !== "GET" || request.body !== undefined) fail("Crossref routes support bodyless GET reads only", 405);
  if (/[?#]/.test(request.path)) fail("Pass Crossref query parameters in params, not the path");
  const params: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(request.params ?? {})) {
    if (value === undefined || value === null) continue;
    if (!["string", "number", "boolean"].includes(typeof value) || (typeof value === "number" && !Number.isFinite(value)) || String(value).length > 16000) fail("Crossref parameters must be bounded scalar values");
    params[key] = value as string | number | boolean;
  }
  if (Object.keys(params).length > 30) fail("Too many Crossref parameters");
  if (params.cursor !== undefined) {
    if (typeof params.cursor !== "string" || !params.cursor) fail("Crossref cursor must be a nonempty string");
    if (params.offset !== undefined) fail("Crossref cursor and offset cannot be combined");
    if (["issued", "published", "published-print", "published-online"].includes(String(params.sort))) fail("Crossref no longer supports this sort with cursors; omit sort or use a bounded non-cursor request");
  }
  if (params.rows !== undefined && (!/^\d+$/.test(String(params.rows)) || !Number.isSafeInteger(Number(params.rows)) || Number(params.rows) > 1000)) fail("Crossref rows must be an integer from 0 to 1000");
  return params;
}

async function bodyText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return fail("Crossref returned an empty body", 502);
  const decoder = new TextDecoder("utf-8", {fatal: true});
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) return text + decoder.decode();
      bytes += next.value.byteLength;
      if (bytes > 4 * 1024 * 1024) fail("Crossref response exceeds 4 MiB; reduce rows or select fewer fields", 502);
      text += decoder.decode(next.value, {stream: true});
    }
  } finally { void reader.cancel().catch(() => {}); }
}

/** A bounded, per-isolate pacing policy; upstream headers remain authoritative across clients. */
export function createCrossrefReader(): ApiFetchFn {
  const nextAt = new Map<string, number>();
  const intervals = new Map<string, number>();
  return async request => {
    const params = checkedParams(request);
    const list = ["/works", "/funders", "/members", "/journals", "/types", "/licenses", "/prefixes"].includes(request.path) || (!request.path.startsWith("/works/") && request.path.endsWith("/works"));
    const polite = typeof params.mailto === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.mailto);
    const bucket = `${polite ? "polite" : "public"}:${list ? "list" : "single"}`;
    const interval = list ? (polite ? 334 : 1000) : (polite ? 100 : 200);
    const { response, retryAt, headers } = await readRateLimitedCrossref(nextAt, bucket, interval, intervals, request, params);
    if (response.status === 429 && Number.isFinite(retryAt)) nextAt.set(bucket, Math.max(nextAt.get(bucket) ?? 0, retryAt));
    const text = await bodyText(response);
    return decodeCrossrefPage(text, response, headers, params, request);
  };
}

function decodeCrossrefPage(text: string, response: Response, headers: { [k: string]: string | null; }, params: Record<string, string | number | boolean>, request: { method: string; path: string; params?: Record<string, unknown>; body?: unknown; }) {
  let native: unknown;
  try { native = JSON.parse(text); } catch { native = text; }
  if (!response.ok) fail(`Crossref HTTP ${response.status}`, response.status, { response: native, _crossref: { headers } });
  if (!native || typeof native !== "object" || Array.isArray(native)) fail("Crossref returned an invalid JSON envelope", 502);
  const value = native as Record<string, unknown>;
  if (value.status !== "ok") fail("Crossref returned an unsuccessful envelope", 502, { response: native, _crossref: { headers } });
  const message = value.message as { items?: unknown[]; "next-cursor"?: unknown; "total-results"?: number; "items-per-page"?: number; } | undefined;
  const items = Array.isArray(message?.items) ? message.items : undefined;
  const rows = Number(params.rows ?? message?.["items-per-page"] ?? 20);
  const cursor = message?.["next-cursor"];
  const next = params.cursor !== undefined && items && rows > 0 && items.length >= rows && typeof cursor === "string" && cursor && cursor !== params.cursor
    ? { path: `/crossref${request.path}`, params: { ...params, cursor } } : null;
  return {
    status: response.status, data: {
      ...value, _crossref: {
        headers, observed_at: new Date().toISOString(), snapshot_is_atomic: false,
        completeness: "not_established", returned: items?.length ?? null,
        total_results: message?.["total-results"] ?? null, next_request: next,
        cursor_stalled: params.cursor !== undefined && Boolean(items?.length) && cursor === params.cursor,
      }
    }
  };
}

async function readRateLimitedCrossref(nextAt: Map<string, number>, bucket: string, interval: number, intervals: Map<string, number>, request: { method: string; path: string; params?: Record<string, unknown>; body?: unknown; }, params: Record<string, string | number | boolean>) {
  const now = Date.now();
  while (true) {
    const wait = (nextAt.get(bucket) ?? 0) - Date.now();
    if (wait > 25000 - (Date.now() - now)) fail("Crossref rate-limit wait exceeds this call's budget; retry later", 429, { retry_after_seconds: Math.max(1, Math.ceil(wait / 1000)) });
    if (wait <= 0) break;
    await new Promise(resolve => setTimeout(resolve, wait));
  }
  const requestedAt = Date.now();
  nextAt.set(bucket, requestedAt + Math.max(interval, intervals.get(bucket) ?? 0));
  // Return 429 and Retry-After to the caller rather than retrying before its deadline.
  const response = await crossrefFetch(request.path, params, { retries: 0, timeout: Math.max(1, 30000 - (Date.now() - now)) });
  const headers = headersOf(response.headers);
  const rateInterval = /^(\d+(?:\.\d+)?)s$/.exec(headers["x-rate-limit-interval"] ?? "");
  const rateLimit = Number(headers["x-rate-limit-limit"]);
  if (rateInterval && rateLimit > 0 && Number.isFinite(rateLimit)) {
    const observed = Math.ceil(Number(rateInterval[1]) * 1000 / rateLimit);
    intervals.set(bucket, observed);
    nextAt.set(bucket, Math.max(nextAt.get(bucket) ?? 0, requestedAt + observed));
  }
  const seconds = headers["retry-after"] === null ? Number.NaN : Number(headers["retry-after"]);
  const retryAt = Number.isFinite(seconds) ? Date.now() + Math.max(0, seconds) * 1000 : Date.parse(headers["retry-after"] ?? "");
  return { response, retryAt, headers };
}
