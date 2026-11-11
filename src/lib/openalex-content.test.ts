import {createHash} from "node:crypto";
import {gzipSync} from "node:zlib";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {createScholarlyGraphApiFetch} from "./api-adapter";

const key = "fixture-private-key";
const storage = "https://a452eddbbe06eb7d02f4879cee70d29c.r2.cloudflarestorage.com/openalex-pdfs/file?X-Amz-Signature=fixture-signed-token";
const request = (format = "pdf", params = {}) => ({method: "GET", path: `/openalex/content/works/W3038568908.${format}`, params});
const xml = '<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body><p>DNA α🙂</p></body></text></TEI>';
const bytesOf = (text: string) => new TextEncoder().encode(text);
type Artifact = {_openalex_content: {sha256: string; byte_length: number}; chunks: {chunk_index: number; base64: string; text?: string}[]};
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);});
afterEach(() => {vi.unstubAllGlobals(); vi.useRealTimers();});

it("authenticates only the content host and follows its signed storage hop without exposing credentials", async () => {
  const bytes = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from([0, 255, 128, 13, 10])]);
  fetchMock.mockResolvedValueOnce(new Response(null, {status: 302, headers: {location: storage, "x-credits-cost": "100"}}))
    .mockResolvedValueOnce(new Response(bytes, {headers: {"content-type": "application/pdf"}}));
  const result = await createScholarlyGraphApiFetch(key)(request());
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("https://content.openalex.org/works/W3038568908.pdf");
  expect(options).toMatchObject({headers: {Authorization: `Bearer ${key}`}, redirect: "manual"});
  expect(String(fetchMock.mock.calls[1][0])).toBe(storage);
  expect(fetchMock.mock.calls[1][1].headers).toBeUndefined();
  const data = result.data as Artifact;
  expect(Buffer.concat(data.chunks.map(chunk => Buffer.from(chunk.base64, "base64")))).toEqual(bytes);
  expect(data._openalex_content).toMatchObject({byte_length: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex")});
  expect(result.data).toMatchObject({headers: {"x-credits-cost": "100"}});
  expect(JSON.stringify(result)).not.toContain(key); expect(JSON.stringify(result)).not.toContain("fixture-signed-token");
});

it.each([false, true])("preserves multibyte XML exactly, raw gzip=%s", async compressed => {
  const text = '\uFEFF<?xml version="1.0"?><TEI><text>' + "🙂α".repeat(10000) + "</text></TEI>";
  const bytes = bytesOf(text);
  fetchMock.mockResolvedValueOnce(new Response(compressed ? gzipSync(bytes) : bytes, {headers: {"content-type": "application/xml", "content-encoding": "gzip"}}));
  const data = (await createScholarlyGraphApiFetch(key)(request("grobid-xml"))).data as Artifact;
  expect(data.chunks.map(chunk => chunk.text).join("")).toBe(text);
  expect(Buffer.concat(data.chunks.map(chunk => Buffer.from(chunk.base64, "base64")))).toEqual(Buffer.from(bytes));
  expect(data._openalex_content.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
  expect(data.chunks.map(chunk => chunk.chunk_index)).toEqual(data.chunks.map((_, i) => i));
});
it("retains the documented legacy lowercase TEI wrapper", async () => {
  const legacy = "<html><body><tei><text><div>Legacy</div></text></tei></body></html>";
  fetchMock.mockResolvedValueOnce(new Response(legacy));
  const result = await createScholarlyGraphApiFetch(key)(request("grobid-xml"));
  expect((result.data as Artifact).chunks[0].text).toBe(legacy);
});
it("requires the Worker key before network access", async () => {
  await expect(createScholarlyGraphApiFetch()(request())).rejects.toMatchObject({status: 401});
  expect(fetchMock).not.toHaveBeenCalled();
});
it("preserves observed USD usage headers separately from legacy credits on direct content", async () => {
  const headers = {"x-ratelimit-cost-usd": "0.01", "x-ratelimit-limit-usd": "1", "x-ratelimit-remaining-usd": "0.978",
    "x-ratelimit-prepaid-remaining-usd": "0", "x-ratelimit-onetime-remaining": "0", "x-ratelimit-credits-used": "100"};
  fetchMock.mockResolvedValueOnce(new Response("%PDF-1.7\nfixture", {headers}));
  expect((await createScholarlyGraphApiFetch(key)(request())).data).toMatchObject({headers});
});
it("retains the content service's USD headers through a signed storage hop", async () => {
  fetchMock.mockResolvedValueOnce(new Response(null, {status: 302, headers: {location: storage, "x-ratelimit-cost-usd": "0.01", "x-ratelimit-remaining-usd": "0.97"}}))
    .mockResolvedValueOnce(new Response("%PDF-1.7\nfixture", {headers: {"x-ratelimit-cost-usd": "unrelated-storage-value"}}));
  expect((await createScholarlyGraphApiFetch(key)(request())).data).toMatchObject({headers: {"x-ratelimit-cost-usd": "0.01", "x-ratelimit-remaining-usd": "0.97"}});
});
it("redacts configured credentials and bounds newly retained quota headers even on errors", async () => {
  fetchMock.mockResolvedValueOnce(new Response("private error", {status: 429, headers: {"x-ratelimit-remaining-usd": `${key}${"x".repeat(300)}`}}));
  const error = await createScholarlyGraphApiFetch(key)(request()).catch(error => error);
  expect(error).toMatchObject({status: 429, data: {headers: {"x-ratelimit-remaining-usd": `[redacted]${"x".repeat(190)}`}}});
  expect(JSON.stringify(error)).not.toContain(key);
});
it.each([
  {...request(), method: "POST"}, {...request(), body: {}},
  request("pdf", {api_key: "caller-key"}), request("pdf", {max_bytes: 0}), request("pdf", {max_bytes: 16777217}), request("pdf", {max_bytes: "123"}),
  {...request(), path: "/openalex/content/works/https://example.org.pdf"},
  {...request(), path: "/openalex/content/works/W1.pdf?api_key=caller"},
  {...request(), path: "/openalex/content/works/W1%2f..pdf"},
])("rejects invalid or credential-bearing content requests", async input => {
  await expect(createScholarlyGraphApiFetch(key)(input)).rejects.toBeInstanceOf(Error);
  expect(fetchMock).not.toHaveBeenCalled();
});
it.each(["https://example.org/file", "http://127.0.0.1/file", "https://a452eddbbe06eb7d02f4879cee70d29c.r2.cloudflarestorage.com.evil.test/file", "file:///etc/passwd", "https://user:pass@a452eddbbe06eb7d02f4879cee70d29c.r2.cloudflarestorage.com/file"])("rejects unexpected redirect %s", async location => {
  fetchMock.mockResolvedValueOnce(new Response(null, {status: 302, headers: {location}}));
  await expect(createScholarlyGraphApiFetch(key)(request())).rejects.toMatchObject({status: 502});
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("does not follow a second redirect or return its signed Location", async () => {
  fetchMock.mockResolvedValueOnce(new Response(null, {status: 302, headers: {location: storage}}))
    .mockResolvedValueOnce(new Response(null, {status: 302, headers: {location: "https://example.org/sensitive"}}));
  await expect(createScholarlyGraphApiFetch(key)(request())).rejects.toMatchObject({status: 502, message: "OpenAlex content HTTP 302"});
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it.each([401, 403, 404, 429, 500])("preserves HTTP %i and quota headers without retrying or echoing private error bodies", async status => {
  fetchMock.mockResolvedValueOnce(new Response(`Echo ${key} ${storage}`, {status, headers: {"retry-after": "60", "x-ratelimit-remaining": "0"}}));
  const error = await createScholarlyGraphApiFetch(key)(request()).catch(error => error);
  expect(error).toMatchObject({status, data: {headers: {"retry-after": "60", "x-ratelimit-remaining": "0"}}});
  expect(JSON.stringify(error)).not.toContain(key); expect(JSON.stringify(error)).not.toContain("fixture-signed-token");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("bounds streamed bytes and cancels the body", async () => {
  const cancel = vi.fn();
  fetchMock.mockResolvedValueOnce(new Response(new ReadableStream({start(c) {c.enqueue(bytesOf("%PDF-1.7-too-large"));}, cancel})));
  await expect(createScholarlyGraphApiFetch(key)(request("pdf", {max_bytes: 10}))).rejects.toMatchObject({status: 413});
  expect(cancel).toHaveBeenCalled();
});
it("bounds decompressed XML without returning a partial document", async () => {
  fetchMock.mockResolvedValueOnce(new Response(gzipSync(bytesOf(`<TEI>${"a".repeat(10000)}</TEI>`))));
  await expect(createScholarlyGraphApiFetch(key)(request("grobid-xml", {max_bytes: 1000}))).rejects.toMatchObject({status: 413});
});
it.each([["pdf", "<html>login</html>"], ["grobid-xml", "{\"error\":true}"]])("rejects mismatched %s bytes", async (format, body) => {
  fetchMock.mockResolvedValueOnce(new Response(body));
  await expect(createScholarlyGraphApiFetch(key)(request(format))).rejects.toMatchObject({status: 502});
});
it("rejects invalid UTF-8 instead of silently replacing content", async () => {
  fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([...bytesOf(xml), 255])));
  await expect(createScholarlyGraphApiFetch(key)(request("grobid-xml"))).rejects.toMatchObject({status: 502});
});
it("sanitizes network errors which can include signed URLs", async () => {
  fetchMock.mockRejectedValueOnce(new Error(`${key} ${storage}`));
  await expect(createScholarlyGraphApiFetch(key)(request())).rejects.toMatchObject({status: 502, message: "OpenAlex content download or decoding failed"});
});
it("aborts a stalled request within its download deadline", async () => {
  vi.useFakeTimers();
  fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")))));
  const pending = expect(createScholarlyGraphApiFetch(key)(request())).rejects.toMatchObject({status: 504});
  await vi.advanceTimersByTimeAsync(30000); await pending;
});
