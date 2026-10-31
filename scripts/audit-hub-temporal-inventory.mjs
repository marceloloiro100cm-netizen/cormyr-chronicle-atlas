// Auditoria somente de leitura: nenhum arquivo ou dado de campanha é alterado.
// Execute na raiz do repositório: node scripts/audit-hub-temporal-inventory.mjs --json
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve('.');
const roots = ['src', 'public/cormyr', 'drizzle/migrations'];
const extensions = new Set(['.ts', '.tsx', '.js', '.html', '.json', '.sql', '.md']);
const maxBytes = 3_000_000;
const patterns = {
  calendar: /\b(campaign_calendar|campaign-calendar|published_week|get_campaign_calendar|publish_campaign_schedule|set_campaign_calendar|advance_calendar_round|calendar_mail_events)\b/gi,
  timeMutation: /\b(set_letter_round|set_campaign_calendar|publish_campaign_schedule_confirmed|advance_calendar_round|apply_calendar_months)\b/gi,
  hardcoded1522: /\b1522\b/g,
  ageAndBirth: /\b(idade|nascimento|birthYear|birth_year|baseline_age|age_policy|age)\b/gi,
  monthState: /\b(state\.month|campaignMonth|calendarMonthIndex|houseSeason|duration\.months)\b/g,
  historicalEra: /(?:antes|depois|p[oó]s|post)[-\s]*(?:de[-\s]*)?1522/gi
};
const files = [];
const skipped = [];
const extOf = path => path.substring(path.lastIndexOf('.')).toLowerCase();
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (!entry.isFile() || !extensions.has(extOf(entry.name))) continue;
    const path = relative(root, full).replaceAll('\\', '/');
    const size = statSync(full).size;
    if (size > maxBytes) { skipped.push({ path, reason: 'Arquivo acima do limite de leitura' }); continue; }
    const text = readFileSync(full, 'utf8');
    const matches = Object.fromEntries(Object.entries(patterns).map(([kind, regex]) => [kind, Array.from(text.matchAll(regex)).length]));
    if (Object.values(matches).some(Boolean)) files.push({ path, matches });
  }
}
for (const path of roots) walk(resolve(root, path));
files.sort((a, b) => a.path.localeCompare(b.path));
const catalog = JSON.parse(readFileSync(resolve(root, 'public/cormyr/data.js'), 'utf8')
  .replace(/^\s*window\.CORMYR_DATA\s*=\s*/, '').replace(/;\s*$/, ''));
const houses = (catalog.regions ?? []).flatMap(region => region.houses ?? []);
const histories = readdirSync(resolve(root, 'public/cormyr/histories')).filter(x => x.endsWith('.json'));
const totals = Object.fromEntries(Object.keys(patterns).map(k => [k, files.reduce((sum, row) => sum + row.matches[k], 0)]));
const result = {
  mode: 'read-only',
  note: 'Ocorrências são pistas para revisão; não significam erros. Dados privados e conteúdo das linhas não são publicados.',
  catalog: { regions: (catalog.regions ?? []).length, houses: houses.length, housesWithAgeField: houses.filter(h => h.age != null && String(h.age).trim() !== '').length, historyFiles: histories.length },
  filesScannedWithHits: files.length, totals, skipped, files
};
if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
else {
  console.log('Hub Temporal · inventário de referências (somente leitura)');
  console.log(JSON.stringify({ catalog: result.catalog, filesScannedWithHits: files.length, totals, skipped: skipped.length }, null, 2));
  for (const row of files) console.log(row.path + ' | ' + Object.entries(row.matches).filter(([, n]) => n).map(([k, n]) => k + ':' + n).join(' '));
}
