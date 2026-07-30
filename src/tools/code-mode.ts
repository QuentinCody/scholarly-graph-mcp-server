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

    const searchTool = createSearchTool({
        prefix: "scholarly_graph",
        catalog: scholarlyGraphCatalog,
    });
    searchTool.register(server as unknown as { tool: (...args: unknown[]) => void });

    const executeTool = createExecuteTool({
        prefix: "scholarly_graph",
        // Verifiable provenance: scholarly_graph_execute results carry a _meta.citation.
        // Primary upstream is OpenAlex (CC0) — carry its url + license so the
        // citation block matches the rest of the fleet (was missing both).
        source: {
            id: "scholarly_graph",
            name: "Scholarly Graph (OpenAlex)",
            url: "https://openalex.org",
            license: "CC0 1.0",
        },
        catalog: scholarlyGraphCatalog,
        apiFetch,
        doNamespace: env.SCHOLARLY_GRAPH_DATA_DO,
        loader: env.CODE_MODE_LOADER,
        // OpenAlex can be slow — match the 60s HTTP timeout
        timeout: 60_000,
    });
    executeTool.register(server as unknown as { tool: (...args: unknown[]) => void });
}
