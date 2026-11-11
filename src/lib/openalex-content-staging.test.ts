import {DatabaseSync, type SQLInputValue} from "node:sqlite";
import {afterEach, expect, it, vi} from "vitest";
import {createApiProxyTool} from "@bio-mcp/shared/tools/api-proxy";
import {detectArrays, inferSchema, materializeSchema, type SchemaHints} from "@bio-mcp/shared/staging/schema-inference";
import {createScholarlyGraphApiFetch} from "./api-adapter";
import {scholarlyGraphCatalog} from "../spec/catalog";
vi.mock("@bio-mcp/shared/staging/rest-staging-do", () => ({RestStagingDO: class {}}));
import {ScholarlyGraphDataDO} from "../do";

afterEach(() => vi.unstubAllGlobals());
it("stages all XML chunks, keeps file provenance inline and materializes the advertised columns", async () => {
  const xml = `<TEI><text>${"α🙂".repeat(12000)}</text></TEI>`;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(xml)));
  const stored: unknown[] = [];
  const namespace = {idFromName: (name: string) => name, get: () => ({fetch: async (request: Request) => {
    if (new URL(request.url).pathname === "/process") {
      const payload = await request.json() as {data: unknown}; stored.push(payload.data);
      return Response.json({success: true, tables_created: ["openalex_content_chunks"], total_rows: 6});
    }
    return Response.json({success: true, schema: {tables: {openalex_content_chunks: {columns: [{name: "chunk_index"}, {name: "base64"}, {name: "text"}]}}}});
  }})} as unknown as DurableObjectNamespace;
  const proxy = createApiProxyTool({apiFetch: createScholarlyGraphApiFetch("fixture-key"), catalog: scholarlyGraphCatalog, doNamespace: namespace, stagingPrefix: "scholarly_graph", maxInlineBytes: 30 * 1024});
  const result = await proxy.handler({method: "GET", path: "/openalex/content/works/W3038568908.grobid-xml"}, {sql: () => []});
  expect(result).toMatchObject({__staged: true, data_access_id: expect.any(String), _openalex_content: {work_id: "W3038568908", byte_length: new TextEncoder().encode(xml).length}});
  const native = typeof stored[0] === "string" ? JSON.parse(stored[0]) : stored[0];
  const artifact = native as {chunks: {base64: string; text: string}[]};
  expect(artifact.chunks.map(chunk => chunk.text).join("")).toBe(xml);
  expect(Buffer.concat(artifact.chunks.map(chunk => Buffer.from(chunk.base64, "base64")))).toEqual(Buffer.from(xml));
  const hints = (ScholarlyGraphDataDO.prototype as unknown as {getSchemaHints: (data: unknown) => SchemaHints}).getSchemaHints(native);
  const schema = inferSchema(detectArrays(native), hints);
  expect(schema.tables.map(table => table.name)).toEqual(["openalex_content_chunks"]);
  expect(schema.tables[0].columns.map(column => column.name)).toEqual(expect.arrayContaining(["chunk_index", "byte_offset", "byte_length", "base64", "text"]));
  const database = new DatabaseSync(":memory:");
  try {
    const materialized = materializeSchema(schema, new Map([["openalex_content_chunks", artifact.chunks]]), {
      exec: (query, ...bindings) => database.prepare(query).run(...bindings as SQLInputValue[]),
    }, hints);
    expect(materialized.failedRows).toBe(0);
    const rows = database.prepare("SELECT base64, text FROM openalex_content_chunks ORDER BY chunk_index").all();
    expect(rows.map(row => row.text).join("")).toBe(xml);
    expect(Buffer.concat(rows.map(row => Buffer.from(String(row.base64), "base64")))).toEqual(Buffer.from(xml));
  } finally {database.close();}
  expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(30000);
});
