/**
 * ScholarlyGraphDataDO — Durable Object for staging large scholarly graph responses.
 *
 * Extends RestStagingDO with source-aware schema hints for works, people,
 * organizations, and projects across multiple APIs.
 */

import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

export class ScholarlyGraphDataDO extends RestStagingDO {
	protected getSchemaHints(data: unknown): SchemaHints | undefined {
		if (!data || typeof data !== "object") return undefined;

		const obj = data as Record<string, unknown>;

		// OpenAlex / Crossref style wrapper — { results: [...] } or { message: { items: [...] } }
		if (Array.isArray(obj.results)) {
			const sample = obj.results[0];
			if (sample && typeof sample === "object" && "id" in sample && "display_name" in sample) {
				return {
					tableName: "openalex_results",
					indexes: ["id", "display_name", "doi"],
				};
			}
		}

        const message = obj.message as Record<string, unknown> | undefined;
        if (message && Array.isArray(message.items)) {
            return {
                tableName: "crossref_items",
                indexes: ["DOI", "title", "type"],
            };
        }

		// Direct arrays of organizations or projects
		if (Array.isArray(data)) {
			const sample = data[0];
			if (sample && typeof sample === "object" && "id" in sample) {
				return {
					tableName: "entities",
					indexes: ["id", "name", "display_name"],
				};
			}
		}

        // ORCID public record
        if ("orcid-identifier" in obj || "orcidIdentifier" in obj) {
            return {
                tableName: "orcid_records",
                indexes: ["path", "uri"],
            };
        }

		return undefined;
	}
}
