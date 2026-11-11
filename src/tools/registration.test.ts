import {expect, it} from "vitest";
import {McpServer} from "@bio-mcp/shared/mcp";
import {registerCodeMode} from "./code-mode";
import {registerQueryData} from "./query-data";
import {registerGetSchema} from "./get-schema";

it("keeps discovery, execution, SQL and schema available under both aliases", async () => {
  const server = new McpServer({name: "fixture", version: "1"});
  registerCodeMode(server, {CODE_MODE_LOADER: {get: () => ({})}} as unknown as Parameters<typeof registerCodeMode>[1]);
  registerQueryData(server, {}); registerGetSchema(server, {});
  const tools = (server as unknown as {_registeredTools: Record<string, {handler: (args: unknown, extra: unknown) => Promise<unknown>}>})._registeredTools;
  for (const suffix of ["search", "execute", "query_data", "get_schema"]) {
    const name = `scholarly_graph_${suffix}`;
    expect(tools[name]).toBeDefined(); expect(tools[`mcp_${name}`]).toBeDefined();
  }
  for (const prefix of ["", "mcp_"]) {
    for (const suffix of ["query_data", "get_schema"]) {
      expect(await tools[`${prefix}scholarly_graph_${suffix}`].handler({data_access_id: "scholarly_graph_fixture", sql: "SELECT 1"}, {}))
        .toMatchObject({isError: true, content: expect.any(Array), structuredContent: expect.any(Object)});
    }
    const discovery = await tools[`${prefix}scholarly_graph_search`].handler({query: "crossref cursor"}, {});
    expect(discovery).toMatchObject({content: expect.any(Array), structuredContent: expect.any(Object)});
    expect(JSON.stringify(discovery)).toContain("unchanged filters");
  }
});
