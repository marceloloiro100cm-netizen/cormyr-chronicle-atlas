import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const tracked=new Set(execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean));
const privatePaths=[
 '.env', 'src/server/gm-content.json', 'src/server/everet-workbook.ts',
 'src/server/qazir-workbook.ts', 'public/cormyr/JOGADORES-1522.md',
 'scripts/import-harcourt-historical-letters.sql',
 'scripts/import-harcourt-holdings-20261030.sql',
 'scripts/reconcile-harcourt-week1-20261030.sql',
 'scripts/fix-harcourt-scouts-equipment-20261030.sql',
 'scripts/test-house-workbook-import.sql',
 'scripts/test-house-linked-workbooks.sql',
 'bun_output.txt', 'css_extract.txt', 'page_content.html',
];
const violations=privatePaths.filter(path=>tracked.has(path));
for(const path of tracked){
 if(/(^|\/)\.env(?:\.[^/]*)?$/.test(path)&&path!=='.env.example')violations.push(path);
 if(/\.(?:pem|p12|pfx|private\.key)$/.test(path))violations.push(path);
}
const admin=readFileSync('scripts/setup-admin.ts','utf8');
if(/updateUserById\s*\(|createUser\s*\(|signInWithPassword\s*\(/.test(admin))
 violations.push('scripts/setup-admin.ts may change or authenticate real users');
if(!admin.includes('ADMIN_SETUP_USER_ID'))
 violations.push('scripts/setup-admin.ts lacks explicit existing-account identifier');
const gm=readFileSync('src/routes/api/public/gm-content.ts','utf8');
if(gm.includes('gm-content.json')||!gm.includes('campaign_private_gm_content'))
 violations.push('GM endpoint is not exclusively backed by private storage');
const source=readFileSync('drizzle/migrations/0042_reconcile_house_workbooks.sql','utf8');
if(!source.includes('$workbooks$[]$workbooks$'))
 violations.push('Historical migration still contains actual house state');
const nobleStats=readFileSync('docs/espionage/sql/0087_import_cormyr_noble_stats_2026_11_03.sql','utf8');
if(nobleStats.includes('jsonb_to_recordset($cca_noble_stat_source_2026_11_03$['))
 violations.push('Private 170-house statistical snapshots appear in public SQL');
if(violations.length){
 console.error('Security gate failed. Tracked private files or unsafe patterns:');
 for(const v of violations)console.error('- '+v);
 process.exitCode=1;
}else console.log('Public repository privacy gate passed; source tree contains no listed private payloads.');
