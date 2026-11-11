/**
 * Scholarly Graph Code Mode — registers search + execute tools for full API access.
 *
 * search: In-process catalog query.
 * execute: V8 isolate with api.get/api.post + searchSpec/listCategories.
 */

import type { McpServer } from "@bio-mcp/shared/mcp";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { scholarlyGraphCatalog } from "../spec/catalog";
import { createScholarlyGraphApiFetch } from "../lib/api-adapter";
import {scholarlyResponse} from "../lib/tool-result";

interface CodeModeEnv {
    SCHOLARLY_GRAPH_DATA_DO: DurableObjectNamespace;
    CODE_MODE_LOADER: WorkerLoader;
    OPENALEX_API_KEY?: string;
}

export function registerCodeMode(
    server: McpServer,
    env: CodeModeEnv,
): void {
    const apiFetch = createScholarlyGraphApiFetch(env.OPENALEX_API_KEY);
    const registrar = {tool: (...args: unknown[]) => {
        const [name, ...rest] = args;
        const handler = rest.pop() as (args: unknown, extra: unknown) => ReturnType<Parameters<typeof scholarlyResponse>[0]>;
        const respond = (args: unknown, extra: unknown) => scholarlyResponse(() => handler(args, extra), env, String(name), extra);
        // SAFETY: shared tool factories supply the registration signature; only the name changes.
        const register = server.tool.bind(server) as (...values: unknown[]) => void;
        register(name, ...rest, respond); register(`mcp_${String(name)}`, ...rest, respond);
    }};

    const searchTool = createSearchTool({
        prefix: "scholarly_graph",
        catalog: scholarlyGraphCatalog,
    });
    searchTool.register(registrar);

    const executeTool = createExecuteTool({
        prefix: "scholarly_graph",
        // Verifiable provenance: scholarly_graph_execute results carry a _meta.citation.
        // A script can combine providers; attribute the gateway rather than
        // incorrectly labeling every provider's data as OpenAlex/CC0.
        source: {
            id: "scholarly_graph",
            name: "Scholarly Graph (OpenAlex, Crossref, ORCID, ROR, OpenAIRE)",
            url: "https://scholarly-graph-mcp-server.quentincody.workers.dev",
        },
        catalog: scholarlyGraphCatalog,
        apiFetch,
        maxInlineBytes: 30 * 1024,
        stagingThreshold: 30 * 1024,
        doNamespace: env.SCHOLARLY_GRAPH_DATA_DO,
        loader: env.CODE_MODE_LOADER,
        // OpenAlex can be slow — match the 60s HTTP timeout
        timeout: 60_000,
    });
    executeTool.register(registrar);
}
