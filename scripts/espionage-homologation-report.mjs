#!/usr/bin/env node
/** Review-only release readiness report. Never mutates the repository or DB. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateSpyReleaseGate} from './espionage-release-gate.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const release=JSON.parse(fs.readFileSync(path.join(root,'docs/espionage/release-evidence.json'),'utf8'));
const signoff=JSON.parse(fs.readFileSync(path.join(root,'docs/espionage/homologation-signoff.json'),'utf8'));
const result=evaluateSpyReleaseGate(release,signoff);
const scenarios=Array.isArray(signoff.scenarios)?signoff.scenarios:[];
const report={
 module:release.module,
 releaseDecision:result.status,
 reviewedCommit:release.reviewedCommit??null,
 stagingType:signoff.environment??null,
 narratorSigned:signoff.status==='ACCEPTED',
 acceptance:{
  total:20,accepted:scenarios.filter(x=>x.status==='ACCEPTED').length,
  pending:scenarios.filter(x=>x.status==='PENDING').length,
  blocked:scenarios.filter(x=>x.status==='BLOCKED').length,
 },
 unresolved:result.missing,
 recommendedNextAction:'Restaurar backup da produção numa cópia segregada, reconciliar Drizzle e executar H01–H20 com JWT reais; não fazer merge nem publicar.',
};
if(process.argv.includes('--markdown')){
 const lines=[
  '# CCA-ESP-MVP-001 — Liberação de espionagem',
  '',
  '| Verificação | Estado |',
  '|---|---|',
  '| Decisão de publicação | '+report.releaseDecision+' |',
  '| Cenários aceitos | '+report.acceptance.accepted+'/20 |',
  '| Cenários pendentes | '+report.acceptance.pending+' |',
  '| Cenários bloqueados | '+report.acceptance.blocked+' |',
  '| Assinatura do Narrador | '+(report.narratorSigned?'Registrada':'Pendente')+' |',
  '',
  '## Bloqueios pendentes',
  ...report.unresolved.map(x=>'- '+x),
  '',
  report.recommendedNextAction,
 ];
 console.log(lines.join('\n'));
}else console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--enforce')&&report.releaseDecision!=='GO')process.exitCode=1;
