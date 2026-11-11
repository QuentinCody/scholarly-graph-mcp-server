import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {createCrossrefReader} from "./crossref";
import {createScholarlyGraphApiFetch} from "./api-adapter";

const page = (items: unknown[] = [{DOI: "10.1/a"}], cursor = "next+/=") => ({status: "ok", "message-type": "work-list", message: {items, "next-cursor": cursor, "total-results": 123}});
const call = (params = {}, path = "/works") => ({method: "GET" as const, path, params});
const headers = {"x-rate-limit-limit": "1", "x-rate-limit-interval": "1s", "x-rate-limit-type": "list"};
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
  fetchMock = vi.fn().mockImplementation(async () => Response.json(page()));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {vi.useRealTimers(); vi.unstubAllGlobals();});

it("preserves native observations, headers, and every query parameter while replacing the cursor", async () => {
  const native = page([{DOI: "10.1/a", title: ["α"], relation: {custom: [1]}}]);
  fetchMock.mockResolvedValueOnce(Response.json(native, {headers}));
  const read = createCrossrefReader();
  const params = {rows: 1, cursor: "*", filter: "from-created-date:2026-09-01,until-created-date:2026-09-02", select: "DOI,title", query: "DNA & RNA"};
  const result = await read(call(params));
  expect(result.data).toMatchObject(native);
  const meta = (result.data as {_crossref: {next_request: {path: string; params: typeof params}}})._crossref;
  expect(meta).toMatchObject({headers, snapshot_is_atomic: false, completeness: "not_established", returned: 1,
    next_request: {path: "/crossref/works", params: {...params, cursor: "next+/="}}});
  const second = read(call(meta.next_request.params));
  await vi.advanceTimersByTimeAsync(1000); await second;
  expect(Object.fromEntries(new URL(fetchMock.mock.calls[1][0]).searchParams)).toEqual({...params, rows: "1", cursor: "next+/="});
});

it("routes the Crossref namespace through the bounded reader", async () => {
  const result = await createScholarlyGraphApiFetch()({...call({cursor: "*", rows: 1}), path: "/crossref/works"});
  expect(result.data).toMatchObject({_crossref: {next_request: {path: "/crossref/works"}}});
  expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.crossref.org/works?cursor=*&rows=1");
});

it.each(["issued", "published", "published-print", "published-online"])("rejects cursor sort %s before sending", async sort => {
  await expect(createCrossrefReader()(call({cursor: "*", sort}))).rejects.toMatchObject({status: 400});
  expect(fetchMock).not.toHaveBeenCalled();
});
it.each([{cursor: ""}, {cursor: "*", offset: 1}, {rows: 1001}, {rows: -1}, {rows: 0.1}, {rows: Number.NaN}, {query: {}}, {query: "x".repeat(16001)}])("rejects invalid parameters %j", async params => {
  await expect(createCrossrefReader()(call(params))).rejects.toMatchObject({status: 400});
  expect(fetchMock).not.toHaveBeenCalled();
});
it("rejects request bodies, writes, and embedded query strings", async () => {
  const read = createCrossrefReader();
  await expect(read({...call(), body: {x: 1}})).rejects.toMatchObject({status: 405});
  await expect(read({...call(), method: "POST"})).rejects.toMatchObject({status: 405});
  await expect(read(call({}, "/works?rows=1"))).rejects.toMatchObject({status: 400});
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([
  {items: [], rows: 1, cursor: "next", stalled: false},
  {items: [{DOI: "a"}], rows: 2, cursor: "next", stalled: false},
  {items: [{DOI: "a"}], rows: 0, cursor: "next", stalled: false},
  {items: [{DOI: "a"}], rows: 1, cursor: "*", stalled: true},
])("stops bounded or stalled pages without claiming completeness: %j", async ({items, rows, cursor, stalled}) => {
  fetchMock.mockResolvedValueOnce(Response.json(page(items, cursor)));
  expect((await createCrossrefReader()(call({rows, cursor: "*"}))).data).toMatchObject({_crossref: {
    next_request: null, cursor_stalled: stalled, completeness: "not_established", snapshot_is_atomic: false,
  }});
});

it("paces concurrent public lists and applies slower observed limits", async () => {
  fetchMock.mockImplementation(async () => Response.json(page(), {headers: {...headers, "x-rate-limit-interval": "2s"}}));
  const read = createCrossrefReader();
  await read(call());
  const second = read(call()); const third = read(call());
  await vi.advanceTimersByTimeAsync(1999); expect(fetchMock).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); await second; expect(fetchMock).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(2000); await third; expect(fetchMock).toHaveBeenCalledTimes(3);
});
it.each([
  ["/works", {}, 1000], ["/journals", {}, 1000], ["/works/10.1/foo/works", {}, 200],
  ["/funders/100/works", {mailto: "researcher@example.org"}, 334],
  ["/works/10.1/a", {mailto: "researcher@example.org"}, 100],
] as const)("paces %s with its request type and supplied contact", async (path, params, interval) => {
  const read = createCrossrefReader(); await read(call(params, path));
  const second = read(call(params, path));
  await vi.advanceTimersByTimeAsync(interval - 1); expect(fetchMock).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); await second; expect(fetchMock).toHaveBeenCalledTimes(2);
});
it.each(["2", "Wed, 30 Sep 2026 12:00:02 GMT"])("honors Retry-After %s without automatic retries", async retryAfter => {
  fetchMock.mockResolvedValueOnce(Response.json({error: "slow down"}, {status: 429, headers: {"retry-after": retryAfter}}));
  const read = createCrossrefReader();
  await expect(read(call())).rejects.toMatchObject({status: 429, data: {response: {error: "slow down"}, _crossref: {headers: {"retry-after": retryAfter}}}});
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const retry = read(call());
  await vi.advanceTimersByTimeAsync(1999); expect(fetchMock).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); await retry; expect(fetchMock).toHaveBeenCalledTimes(2);
});
it("returns a bounded wait error for a long provider cooldown", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({}, {status: 429, headers: {"retry-after": "60"}}));
  const read = createCrossrefReader();
  await expect(read(call())).rejects.toMatchObject({status: 429});
  await expect(read(call())).rejects.toMatchObject({status: 429, data: {retry_after_seconds: 60}});
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it.each(["not JSON", "[]", '{"status":"failed"}'])("rejects malformed successful envelopes: %s", async body => {
  fetchMock.mockResolvedValueOnce(new Response(body));
  await expect(createCrossrefReader()(call())).rejects.toMatchObject({status: 502});
});
it("bounds upstream bytes and cancels oversized streams", async () => {
  const cancel = vi.fn();
  fetchMock.mockResolvedValueOnce(new Response(new ReadableStream({start(controller) {controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 1));}, cancel})));
  await expect(createCrossrefReader()(call())).rejects.toThrow("exceeds 4 MiB");
  expect(cancel).toHaveBeenCalled();
});
