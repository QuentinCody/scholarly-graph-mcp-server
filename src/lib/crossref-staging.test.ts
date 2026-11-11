import {afterEach, expect, it, vi} from "vitest";
import {createApiProxyTool} from "@bio-mcp/shared/tools/api-proxy";
import {createCrossrefReader} from "./crossref";
import {scholarlyGraphCatalog} from "../spec/catalog";

afterEach(() => vi.unstubAllGlobals());
it.each(["next", "x".repeat(3000)])("stages complete native data and continuation even when cursor metadata is large", async cursor => {
  const native = {status: "ok", message: {items: [{DOI: "10.1/a", title: ["α".repeat(20000)]}], "next-cursor": cursor}};
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(native)));
  const stored: unknown[] = [];
  const namespace = {idFromName: (name: string) => name, get: () => ({fetch: async (request: Request) => {
    if (new URL(request.url).pathname === "/process") {
      const payload = await request.json() as {data: unknown}; stored.push(payload.data);
      return Response.json({success: true, tables_created: ["payloads", "crossref_items"], total_rows: 1});
    }
    return Response.json({success: true, schema: {tables: {payloads: {columns: [{name: "root_json"}]}}}});
  }})} as unknown as DurableObjectNamespace;
  const read = createCrossrefReader();
  const proxy = createApiProxyTool({apiFetch: request => read({...request, path: "/works"}), catalog: scholarlyGraphCatalog, doNamespace: namespace, stagingPrefix: "scholarly_graph", maxInlineBytes: 30 * 1024});
  const result = await proxy.handler({method: "GET", path: "/crossref/works", params: {cursor: "*", rows: 1, filter: "has-abstract:true"}}, {sql: () => []});
  expect(result).toMatchObject({__staged: true, data_access_id: expect.any(String)});
  const payloads = stored.map(value => typeof value === "string" ? JSON.parse(value) : value);
  expect(payloads).toEqual(expect.arrayContaining([expect.objectContaining({...native, _crossref: expect.objectContaining({next_request: {path: "/crossref/works", params: {cursor, rows: 1, filter: "has-abstract:true"}}})})]));
  expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(100000);
});
