import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { pathToFileURL } from 'node:url';

async function files(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.sort((a,b) => a.name.localeCompare(b.name)).map(e =>
    e.isDirectory() ? files(join(root, e.name)) : e.isFile() ? [join(root, e.name)] : []));
  return nested.flat();
}
const unique = values => [...new Set(values)].sort();
export function inspectSql(sql) {
  // Static candidates only: comments, dynamic SQL and later DROP statements require DB reconciliation.
  const text = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
  const names = pattern => unique([...text.matchAll(pattern)].map(m => m[1].replaceAll('"', '')));
  return {
    tables: names(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"?\w+"?\.)?"?\w+"?)/gi),
    functions: names(/\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+((?:"?\w+"?\.)?"?\w+"?)/gi),
  };
}
export async function inventory(root) {
  const migrations = (await files(join(root, 'drizzle/migrations'))).filter(p => p.endsWith('.sql'));
  const schema = await Promise.all(migrations.map(async path => ({ path: relative(root,path), ...inspectSql(await readFile(path,'utf8')) })));
  const sources = (await files(join(root,'src'))).filter(p => /\.(tsx?|mjs)$/.test(p) && !/\.(test|spec)\./.test(p) && !p.includes('/test/'));
  const dependencies = [];
  for (const path of sources) {
    const lines = (await readFile(path,'utf8')).split('\n');
    const matches = [];
    lines.forEach((line,i) => {
      const kinds = [
        ['lovable', /@lovable\.dev|connector-gateway\.lovable\.dev|LOVABLE_API_KEY/],
        ['supabase', /supabase|SUPABASE/],
        ['rpc', /\.rpc\s*\(/], ['storage', /\.storage\b/], ['realtime', /\.channel\s*\(/],
      ].filter(([,pattern]) => pattern.test(line)).map(([kind]) => kind);
      if (kinds.length) matches.push({ line: i+1, kinds });
    });
    // Never copy source lines, environment values, user data or credentials into the report.
    if (matches.length) dependencies.push({ path: relative(root,path), matches });
  }
  const pkg = JSON.parse(await readFile(join(root,'package.json'),'utf8'));
  const packages = Object.entries({...pkg.dependencies,...pkg.devDependencies}).filter(([name]) => /lovable|supabase|drizzle|^postgres$/.test(name));
  const tables = unique(schema.flatMap(s => s.tables));
  const functions = unique(schema.flatMap(s => s.functions));
  return { formatVersion: 1, scope: 'static-source-only', productionVerified: false,
    summary: { migrationFiles: migrations.length, tableCandidates: tables.length, functionCandidates: functions.length, coupledSourceFiles: dependencies.length },
    packages: Object.fromEntries(packages), tables, functions, migrations: schema, dependencies,
    limitations: ['Not a live schema or backup. CREATE candidates can include objects later dropped.', 'Dynamic SQL and computed RPC/table names require manual review.', 'Auth users, storage binaries, RLS, triggers, grants and row counts require a private live export.'] };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await inventory(resolve(process.argv[2] || '.')), null, 2));
}
