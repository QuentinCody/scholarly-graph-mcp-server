import type {ApiFetchFn} from "@bio-mcp/shared/codemode/catalog";

const MAX_BYTES = 16 * 1024 * 1024;
const STORAGE_HOST = "a452eddbbe06eb7d02f4879cee70d29c.r2.cloudflarestorage.com";
class ContentError extends Error {
  constructor(message: string, public status: number, public data?: unknown) {super(message);}
}
function fail(message: string, status = 400, data?: unknown): never {throw new ContentError(message, status, data);}

async function readBytes(response: Response, limit: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return fail("OpenAlex content has no body", 502);
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > limit) fail("OpenAlex content exceeds max_bytes; no partial file returned", 413);
      parts.push(part.value);
    }
  } finally {void reader.cancel().catch(() => {});}
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {bytes.set(part, offset); offset += part.byteLength;}
  return bytes;
}

function quotaHeaders(headers: Headers, key: string) {
  return Object.fromEntries(["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-credits-used", "x-ratelimit-credits-required", "x-ratelimit-reset", "x-credits-cost", "retry-after",
    "x-ratelimit-cost-usd", "x-ratelimit-limit-usd", "x-ratelimit-remaining-usd", "x-ratelimit-prepaid-remaining-usd", "x-ratelimit-onetime-remaining"]
    .map(name => [name, headers.get(name)?.split(key).join("[redacted]").slice(0, 200) ?? null]));
}

function storageUrl(location: string | null): URL {
  let url: URL;
  try {url = new URL(location ?? "");} catch {return fail("OpenAlex content redirect has no valid storage URL", 502);}
  const hosts = [STORAGE_HOST, `openalex-pdfs.${STORAGE_HOST}`, `openalex-grobid-xml.${STORAGE_HOST}`];
  if (url.protocol !== "https:" || url.username || url.password || url.port || !hosts.includes(url.hostname)) {
    fail("OpenAlex content redirect is outside the documented storage host", 502);
  }
  return url;
}

async function chunksFor(bytes: Uint8Array, xml: boolean) {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const decoder = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true});
  const chunks = [];
  for (let start = 0; start < bytes.length; start += 12288) {
    const part = bytes.subarray(start, start + 12288);
    chunks.push({chunk_index: chunks.length, byte_offset: start, byte_length: part.length,
      base64: btoa(String.fromCharCode(...part)),
      ...(xml ? {text: decoder.decode(part, {stream: start + part.length < bytes.length})} : {})});
  }
  return {sha256, chunks};
}

/** Content API auth and one signed R2 hop match the official OpenAlex CLI. */
export function createOpenAlexContentFetch(apiKey?: string): ApiFetchFn {
  return async request => {
    const match = /^\/openalex\/content\/works\/(W\d{1,20})\.(pdf|grobid-xml)$/.exec(request.path);
    if (!match) return fail("Use /openalex/content/works/W<digits>.pdf or .grobid-xml");
    if (request.method !== "GET" || request.body !== undefined) fail("OpenAlex content supports bodyless GET only", 405);
    const params = request.params ?? {};
    if (Object.keys(params).some(key => key !== "max_bytes")) fail("Only max_bytes is accepted; credentials come from OPENALEX_API_KEY");
    const limit = params.max_bytes ?? 8 * 1024 * 1024;
    if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BYTES) fail("max_bytes must be an integer from 1 to 16777216");
    const key = apiKey?.trim();
    if (!key) return fail("OpenAlex content requires OPENALEX_API_KEY in the Worker environment", 401);
    const [, workId, format] = match;
    const sourceUrl = `https://content.openalex.org/works/${workId}.${format}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    let headers: ReturnType<typeof quotaHeaders> = {};
    try {
      let response = await fetch(sourceUrl, {method: "GET", headers: {Authorization: `Bearer ${key}`}, redirect: "manual", signal: controller.signal});
      headers = quotaHeaders(response.headers, key);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        void response.body?.cancel().catch(() => {});
        const url = storageUrl(location);
        // A signed storage URL already authorizes this file. Never forward the API key.
        response = await fetch(url, {method: "GET", redirect: "manual", signal: controller.signal});
      }
      return await readOpenAlexContent(response, workId, headers, limit, format, sourceUrl);
    } catch (error) {
      if (error instanceof ContentError) throw error;
      // Fetch errors can contain signed URLs; do not echo them or provider error bodies.
      return fail(controller.signal.aborted ? "OpenAlex content request timed out" : "OpenAlex content download or decoding failed", controller.signal.aborted ? 504 : 502, {work_id: workId, headers});
    } finally {clearTimeout(timer);}
  };
}

async function readOpenAlexContent(response: Response, workId: string, headers: { [k: string]: string | null; }, limit: number, format: string, sourceUrl: string) {
  if (response.status !== 200) {
    void response.body?.cancel().catch(() => { });
    fail(`OpenAlex content HTTP ${response.status}`, response.status >= 400 ? response.status : 502, { work_id: workId, headers });
  }
  let bytes = await readBytes(response, limit);
  const xml = format === "grobid-xml";
  if (xml && bytes[0] === 31 && bytes[1] === 139) {
    bytes = await readBytes(new Response(new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream("gzip"))), limit);
  }
  const prefix = new TextDecoder().decode(bytes.subarray(0, 32768));
  if (xml ? !/<(?:[\w.-]+:)?tei(?:\s|>)/i.test(prefix) : !prefix.startsWith("%PDF-")) fail("OpenAlex returned an unexpected content format", 502);
  const { sha256, chunks } = await chunksFor(bytes, xml);
  return {
    status: 200, data: {
      _openalex_content: {
        work_id: workId, format, source_url: sourceUrl,
        byte_length: bytes.length, sha256, chunk_count: chunks.length, observed_at: new Date().toISOString()
      },
      headers, chunks,
      reconstruction: "Order chunks by chunk_index, decode each base64 value separately and concatenate bytes; verify byte_length and sha256. XML text chunks concatenate in the same order. The checksum covers decompressed content bytes.",
      validation: "Format prefix checked only; PDF structure and TEI XML parsing/completeness are not validated. GROBID output is preserved, including extraction errors. Content retains its original rights; consult the Work metadata license."
    }
  };
}
