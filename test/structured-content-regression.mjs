#!/usr/bin/env node

/**
 * Regression tests for Scholarly Graph MCP server scaffold structure.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assertContains(filePath, haystack, needle, testName) {
  totalTests++;
  if (haystack.includes(needle)) {
    console.log(`${GREEN}✓${RESET} ${testName}`);
    passedTests++;
  } else {
    console.log(`${RED}✗${RESET} ${testName}`);
    console.log(`  Missing: ${needle}`);
    console.log(`  File: ${filePath}`);
    failedTests++;
  }
}

function readFile(relPath) {
  const absPath = path.resolve(SERVER_ROOT, relPath);
  return fs.readFileSync(absPath, 'utf8');
}

console.log(`${BLUE}🧪 Scholarly Graph Scaffold Regression Tests${RESET}`);

const codeModeContent = readFile('src/tools/code-mode.ts');
assertContains('src/tools/code-mode.ts', codeModeContent, 'createSearchTool', 'code-mode imports createSearchTool');
assertContains('src/tools/code-mode.ts', codeModeContent, 'createExecuteTool', 'code-mode imports createExecuteTool');
assertContains('src/tools/code-mode.ts', codeModeContent, 'scholarly_graph', 'code-mode uses scholarly_graph prefix');

const catalogContent = readFile('src/spec/catalog.ts');
assertContains('src/spec/catalog.ts', catalogContent, 'scholarlyGraphCatalog', 'catalog exports scholarlyGraphCatalog');
assertContains('src/spec/catalog.ts', catalogContent, 'openalex.works', 'catalog includes OpenAlex categories');
assertContains('src/spec/catalog.ts', catalogContent, 'crossref.works', 'catalog includes Crossref categories');
assertContains('src/spec/catalog.ts', catalogContent, 'orcid.record', 'catalog includes ORCID categories');
assertContains('src/spec/catalog.ts', catalogContent, 'ror.organizations', 'catalog includes ROR categories');
assertContains('src/spec/catalog.ts', catalogContent, 'openaire.projects', 'catalog includes OpenAIRE categories');

const adapterContent = readFile('src/lib/api-adapter.ts');
assertContains('src/lib/api-adapter.ts', adapterContent, "case \"openalex\"", 'adapter routes OpenAlex paths');
assertContains('src/lib/api-adapter.ts', adapterContent, "case \"crossref\"", 'adapter routes Crossref paths');
assertContains('src/lib/api-adapter.ts', adapterContent, "case \"orcid\"", 'adapter routes ORCID paths');
assertContains('src/lib/api-adapter.ts', adapterContent, "case \"ror\"", 'adapter routes ROR paths');
assertContains('src/lib/api-adapter.ts', adapterContent, "case \"openaire\"", 'adapter routes OpenAIRE paths');

const queryContent = readFile('src/tools/query-data.ts');
assertContains('src/tools/query-data.ts', queryContent, 'scholarly_graph_query_data', 'query-data tool name is correct');
assertContains('src/tools/query-data.ts', queryContent, 'SCHOLARLY_GRAPH_DATA_DO', 'query-data uses scholarly graph DO binding');

const schemaContent = readFile('src/tools/get-schema.ts');
assertContains('src/tools/get-schema.ts', schemaContent, 'scholarly_graph_get_schema', 'get-schema tool name is correct');
assertContains('src/tools/get-schema.ts', schemaContent, 'SCHOLARLY_GRAPH_DATA_DO', 'get-schema uses scholarly graph DO binding');

const indexContent = readFile('src/index.ts');
assertContains('src/index.ts', indexContent, 'ScholarlyGraphDataDO', 'index.ts exports ScholarlyGraphDataDO');
assertContains('src/index.ts', indexContent, 'registerCodeMode', 'index.ts registers code mode');

console.log(`\n${BLUE}📊 Test Results Summary${RESET}`);
console.log(`Total tests: ${totalTests}`);
console.log(`${GREEN}Passed: ${passedTests}${RESET}`);
console.log(`${RED}Failed: ${failedTests}${RESET}`);

if (failedTests > 0) {
  console.log(`\n${RED}❌ Regression tests failed.${RESET}`);
  process.exit(1);
}

console.log(`\n${GREEN}✅ Scholarly Graph scaffold regression tests passed.${RESET}`);
