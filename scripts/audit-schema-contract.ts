#!/usr/bin/env tsx
// scripts/audit-schema-contract.ts
//
// Executable schema-contract lint (codex Q6 + Q9, 2026-05-12).
//
// What it checks:
//   1. D1 schema columns — derived from bootstrap-schema.sql + all schema-vN*.sql
//      migration files (ALTER TABLE ... ADD COLUMN).
//   2. TABLE_FIELDS in api/routes/mutations.ts — canonical Hub mutation fields.
//   3. Route-level *_ALLOWED_FIELDS in api/routes/*.ts — fields accepted by
//      direct route handlers (handleUpdateTask, handleUpdateProject, etc.).
//   4. SQL strings in route files — column names mentioned in raw SQL INSERT/
//      UPDATE statements.
//
// Gaps reported:
//   - field in ALLOWED_FIELDS but NOT in TABLE_FIELDS and NOT in schema
//     => "allowed_by_route_not_in_TABLE_FIELDS_not_in_schema"
//   - field in ALLOWED_FIELDS but NOT in schema (even if in TABLE_FIELDS —
//     a route that lists a column the DB doesn't have)
//     => "allowed_by_route_not_in_schema"
//   - field in TABLE_FIELDS but NOT in schema
//     => "in_TABLE_FIELDS_not_in_schema"
//
// The phantom tasks.recurrence case (Task 1.6, PB SHA b06ce2b3) would have
// been caught as "referenced_in_route_sql_not_in_TABLE_FIELDS" or
// "allowed_by_route_not_in_schema".
//
// Exit code: 0 if no gaps; 1 if gaps found.
// Usage: npm run audit:schema-contract
// Or:    npx tsx scripts/audit-schema-contract.ts

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// ── 1. Derive D1 schema from source files ────────────────────────────────────

interface TableSchema {
  columns: Set<string>;
}

function deriveSchemaFromFiles(): Map<string, TableSchema> {
  const tables = new Map<string, TableSchema>();

  function ensureTable(name: string): TableSchema {
    if (!tables.has(name)) tables.set(name, { columns: new Set() });
    return tables.get(name)!;
  }

  // Parse a CREATE TABLE block for column names.
  // Extracts lines that look like "  colname TYPE..." (indented, not a constraint).
  function parseCreateTable(tableName: string, block: string): void {
    const tbl = ensureTable(tableName);
    const lines = block.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines, comments, constraints, closing paren
      if (!trimmed || trimmed.startsWith('--') || trimmed === ')' || trimmed === ');') continue;
      // Skip SQL keywords that appear as line starters in a CREATE TABLE body.
      // Use \b or full-word anchors so column names like "indexed_at" aren't
      // incorrectly swallowed by the INDEX keyword match.
      if (/^(PRIMARY\s+KEY|UNIQUE\s|CHECK\s*\(|FOREIGN\s+KEY|REFERENCES\s|CREATE\s|INDEX\s|CONSTRAINT\s)/i.test(trimmed)) continue;
      // Column definition: first token is the column name
      const match = trimmed.match(/^([a-z_][a-z0-9_]*)\s/i);
      if (match) tbl.columns.add(match[1].toLowerCase());
    }
  }

  function processFile(content: string): void {
    // Match CREATE TABLE IF NOT EXISTS tableName ( ... )
    // Use a simple state machine — find the opening paren, collect until balanced )
    const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(/gi;
    let m: RegExpExecArray | null;
    while ((m = createRe.exec(content)) !== null) {
      const tableName = m[1].toLowerCase();
      const start = m.index + m[0].length - 1; // position of '('
      let depth = 0;
      let end = start;
      for (let i = start; i < content.length; i++) {
        if (content[i] === '(') depth++;
        else if (content[i] === ')') {
          depth--;
          if (depth === 0) { end = i; break; }
        }
      }
      const block = content.slice(start, end + 1);
      parseCreateTable(tableName, block);
    }

    // Match ALTER TABLE tableName ADD COLUMN colname TYPE
    const alterRe = /ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+([a-z_][a-z0-9_]*)/gi;
    while ((m = alterRe.exec(content)) !== null) {
      const tableName = m[1].toLowerCase();
      const colName = m[2].toLowerCase();
      ensureTable(tableName).columns.add(colName);
    }
  }

  // Process bootstrap schema
  const bootstrapPath = path.join(REPO_ROOT, 'api', 'bootstrap-schema.sql');
  if (fs.existsSync(bootstrapPath)) {
    processFile(fs.readFileSync(bootstrapPath, 'utf8'));
  }

  // Process all versioned schema files
  const apiDir = path.join(REPO_ROOT, 'api');
  const schemaFiles = fs.readdirSync(apiDir)
    .filter((f) => f.match(/^schema-v\d/i) && f.endsWith('.sql'))
    .sort();
  for (const f of schemaFiles) {
    processFile(fs.readFileSync(path.join(apiDir, f), 'utf8'));
  }

  // Also process index.ts for inline ALTER TABLE ADD COLUMN statements (runtime migrations)
  const indexPath = path.join(REPO_ROOT, 'api', 'index.ts');
  if (fs.existsSync(indexPath)) {
    processFile(fs.readFileSync(indexPath, 'utf8'));
  }

  return tables;
}

// ── 2. Parse TABLE_FIELDS from mutations.ts ───────────────────────────────────

function parseTableFields(): Map<string, Set<string>> {
  const mutationsPath = path.join(REPO_ROOT, 'api', 'routes', 'mutations.ts');
  const content = fs.readFileSync(mutationsPath, 'utf8');

  const result = new Map<string, Set<string>>();

  // Find the TABLE_FIELDS const block
  const tfStart = content.indexOf('const TABLE_FIELDS:');
  if (tfStart === -1) throw new Error('TABLE_FIELDS not found in mutations.ts');

  // Find the matching closing brace — scan forward
  let depth = 0;
  let blockStart = -1;
  let blockEnd = -1;
  for (let i = tfStart; i < content.length; i++) {
    if (content[i] === '{') {
      if (depth === 0) blockStart = i;
      depth++;
    } else if (content[i] === '}') {
      depth--;
      if (depth === 0) { blockEnd = i; break; }
    }
  }
  if (blockStart === -1 || blockEnd === -1) throw new Error('Could not delimit TABLE_FIELDS block');

  const block = content.slice(blockStart, blockEnd + 1);

  // Parse table name -> Set([...]) entries.
  // Each entry looks like: tableName: new Set([ 'field1', 'field2', ... ]),
  const tableRe = /(\w+):\s*new\s+Set\s*\(\s*\[([^\]]*(?:\][^)]*\[)*[^\]]*)\]\s*\)/gs;
  let tm: RegExpExecArray | null;
  while ((tm = tableRe.exec(block)) !== null) {
    const tableName = tm[1].toLowerCase();
    const fieldsRaw = tm[2];
    const fields = new Set<string>();
    const fieldRe = /'([^']+)'/g;
    let fm: RegExpExecArray | null;
    while ((fm = fieldRe.exec(fieldsRaw)) !== null) {
      fields.add(fm[1].toLowerCase());
    }
    result.set(tableName, fields);
  }

  return result;
}

// ── 3. Parse route-level *_ALLOWED_FIELDS from all route files ────────────────

interface RouteAllowedFields {
  table: string;
  setName: string;
  fields: Set<string>;
}

function parseRouteAllowedFields(): RouteAllowedFields[] {
  const routesDir = path.join(REPO_ROOT, 'api', 'routes');
  const routeFiles = fs.readdirSync(routesDir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

  const results: RouteAllowedFields[] = [];

  // Heuristic: find consts named *_ALLOWED_FIELDS or similar, extract their string members.
  // We map known set names to tables.
  const knownSets: Record<string, string> = {
    'PROJECT_ALLOWED_FIELDS': 'projects',
    'TASK_ALLOWED_FIELDS': 'tasks',
  };

  for (const f of routeFiles) {
    const content = fs.readFileSync(path.join(routesDir, f), 'utf8');

    for (const [setName, table] of Object.entries(knownSets)) {
      // Find: const SETNAME = new Set([ ... ]) or similar
      const re = new RegExp(`const\\s+${setName}\\s*=\\s*new\\s+Set\\s*\\(\\s*\\[([^\\]]+)\\]\\s*\\)`, 's');
      const m = re.exec(content);
      if (!m) continue;
      const fieldsRaw = m[1];
      const fields = new Set<string>();
      const fieldRe = /'([^']+)'/g;
      let fm: RegExpExecArray | null;
      while ((fm = fieldRe.exec(fieldsRaw)) !== null) {
        fields.add(fm[1].toLowerCase());
      }
      results.push({ table, setName, fields });
    }
  }

  return results;
}

// ── 4. Parse SQL column references from route files ───────────────────────────
// Extract columns mentioned in UPDATE SET col = ? or INSERT INTO t (col, ...) clauses.
// This catches columns referenced in raw SQL that might not be in the allow-lists.

interface SqlColRef {
  table: string;
  col: string;
  file: string;
}

function parseSqlColumnRefs(): SqlColRef[] {
  const routesDir = path.join(REPO_ROOT, 'api', 'routes');
  const routeFiles = fs.readdirSync(routesDir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

  const refs: SqlColRef[] = [];

  // Map table names we care about
  const trackedTables = new Set(['tasks', 'projects']);

  for (const f of routeFiles) {
    const content = fs.readFileSync(path.join(routesDir, f), 'utf8');

    // Match UPDATE tableName SET col1 = ?, col2 = ? ...
    const updateRe = /UPDATE\s+(\w+)\s+SET\s+((?:[a-z_][a-z0-9_]*\s*=\s*[^,\s]+(?:,\s*)?)+)/gi;
    let m: RegExpExecArray | null;
    while ((m = updateRe.exec(content)) !== null) {
      const table = m[1].toLowerCase();
      if (!trackedTables.has(table)) continue;
      const setPart = m[2];
      const colRe = /([a-z_][a-z0-9_]*)\s*=/gi;
      let cm: RegExpExecArray | null;
      while ((cm = colRe.exec(setPart)) !== null) {
        refs.push({ table, col: cm[1].toLowerCase(), file: f });
      }
    }

    // Match INSERT INTO tableName (col1, col2, ...)
    const insertRe = /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)\s*\(([^)]+)\)/gi;
    while ((m = insertRe.exec(content)) !== null) {
      const table = m[1].toLowerCase();
      if (!trackedTables.has(table)) continue;
      const colList = m[2];
      const colRe = /([a-z_][a-z0-9_]*)/gi;
      let cm: RegExpExecArray | null;
      while ((cm = colRe.exec(colList)) !== null) {
        refs.push({ table, col: cm[1].toLowerCase(), file: f });
      }
    }
  }

  return refs;
}

// ── 5. Compare and report ─────────────────────────────────────────────────────

interface Gap {
  table: string;
  field: string;
  kind: string;
  detail: string;
}

function runAudit(): Gap[] {
  const dbSchema = deriveSchemaFromFiles();
  const tableFields = parseTableFields();
  const routeAllowed = parseRouteAllowedFields();
  const sqlRefs = parseSqlColumnRefs();

  const gaps: Gap[] = [];

  // Columns that are system-managed by D1/Hub infrastructure — never in
  // application-level field lists but always in schema. Don't report as gaps.
  const INFRA_COLS = new Set(['id', 'seq', 'last_mutation_id', 'created_at', 'updated_at', 'deleted_at']);

  // Check: TABLE_FIELDS fields exist in D1 schema
  for (const [table, fields] of tableFields.entries()) {
    const schemaTable = dbSchema.get(table);
    if (!schemaTable) {
      gaps.push({ table, field: '*', kind: 'table_in_TABLE_FIELDS_not_in_schema', detail: `table '${table}' has TABLE_FIELDS entries but no schema definition found` });
      continue;
    }
    for (const field of fields) {
      if (INFRA_COLS.has(field)) continue;
      if (!schemaTable.columns.has(field)) {
        gaps.push({ table, field, kind: 'in_TABLE_FIELDS_not_in_schema', detail: `mutations.ts TABLE_FIELDS['${table}'] lists '${field}' but no schema column found` });
      }
    }
  }

  // Check: route ALLOWED_FIELDS fields exist in D1 schema
  for (const { table, setName, fields } of routeAllowed) {
    const schemaTable = dbSchema.get(table);
    const tfFields = tableFields.get(table) ?? new Set<string>();
    for (const field of fields) {
      if (INFRA_COLS.has(field)) continue;
      const inSchema = schemaTable?.columns.has(field) ?? false;
      const inTableFields = tfFields.has(field);
      if (!inSchema && !inTableFields) {
        gaps.push({ table, field, kind: 'allowed_by_route_not_in_TABLE_FIELDS_not_in_schema', detail: `${setName} lists '${field}' but not in TABLE_FIELDS['${table}'] and not in D1 schema` });
      } else if (!inSchema) {
        gaps.push({ table, field, kind: 'allowed_by_route_not_in_schema', detail: `${setName} lists '${field}' but no schema column found (is in TABLE_FIELDS)` });
      } else if (!inTableFields) {
        // Field is in schema and route allow-list but NOT in TABLE_FIELDS.
        // This means the route can update it directly but PB mutations cannot push it.
        // This is a contract asymmetry worth reporting.
        gaps.push({ table, field, kind: 'allowed_by_route_not_in_TABLE_FIELDS', detail: `${setName} lists '${field}' (in schema) but not in TABLE_FIELDS['${table}'] — route can set it, PB mutations cannot` });
      }
    }
  }

  // Check: SQL column refs exist in D1 schema (catches phantom column bugs like tasks.recurrence)
  const seenSqlRef = new Set<string>(); // avoid duplicate reports
  for (const { table, col, file } of sqlRefs) {
    const key = `${table}.${col}`;
    if (seenSqlRef.has(key)) continue;
    seenSqlRef.add(key);
    if (INFRA_COLS.has(col)) continue;
    const schemaTable = dbSchema.get(table);
    if (!schemaTable?.columns.has(col)) {
      // Skip known false positives: datetime() function name matches, etc.
      if (['now', 'ignore', 'replace', 'null', 'true', 'false'].includes(col)) continue;
      const tfFields = tableFields.get(table) ?? new Set<string>();
      const inTableFields = tfFields.has(col);
      gaps.push({
        table,
        col,
        field: col,
        kind: inTableFields ? 'referenced_in_route_sql_not_in_schema_but_in_TABLE_FIELDS' : 'referenced_in_route_sql_not_in_schema',
        detail: `${file}: SQL references ${table}.${col} but no schema column found`,
      } as Gap);
    }
  }

  return gaps;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const gaps = runAudit();

if (gaps.length === 0) {
  console.log('0 phantom fields — schema contract is clean.');
  process.exit(0);
} else {
  console.log(`${gaps.length} schema contract gap(s) found:\n`);
  for (const g of gaps) {
    console.log(`  ${g.table}.${g.field}  [${g.kind}]`);
    console.log(`    ${g.detail}`);
  }
  console.log('\nAction required: either add fields to TABLE_FIELDS + schema, or remove from route allow-lists.');
  console.log('Do NOT auto-fix. Review each gap before changing contracts.');
  process.exit(1);
}
