/**
 * Read-only recovery inventory for the Editor-Chefe. This tool deliberately
 * DOES NOT emit article text, drafts IDs, account UIDs, object paths or content
 * fingerprints into public CI logs. The Editor-Chefe reads actual text in the
 * authenticated Jornal > Arquivo / Histórico de revisões UI.
 */
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
const db=getFirestore(initializeApp({projectId:'cormyr',credential:applicationDefault()},'folha-third-draft-audit'));
const roots=await db.collection('campaignWorkspaceImports').limit(7).get();
const snaps=roots.docs.filter(d=>/^[a-f0-9]{64}$/.test(d.id)&&
 d.data()?.private===true&&d.data()?.status==='complete'&&d.data()?.sourceSnapshotId===d.id);
if(snaps.length!==1||roots.size>6)throw Error('snapshot_unverified');
const snapshot=snaps[0].id;
const stage=db.collection('migrationNewspaperRuntimeStage').doc(snapshot);
const runtime=db.collection('campaignCloudRuntime').doc(snapshot);
const [stageRoot,runtimeRoot,imported,live,legacyDrafts,audits]=await Promise.all([
 stage.get(),runtime.get(),stage.collection('editions').limit(501).get(),
 runtime.collection('publishedNewspapers').limit(501).get(),
 runtime.collection('newspaperHistoricalDrafts').limit(501).get(),
 runtime.collection('newspaperAudits').limit(501).get(),
]);
if(!stageRoot.exists||stageRoot.data()?.private!==true||
 stageRoot.data()?.status!=='complete'||!runtimeRoot.exists||
 runtimeRoot.data()?.private!==true||runtimeRoot.data()?.status!=='active'||
 runtimeRoot.data()?.sourceSnapshotId!==snapshot||
 imported.size>500||live.size>500||legacyDrafts.size>500||audits.size>500)
 throw Error('source_or_history_unverified');
const issued=v=>v?.state==='published'||v?.state==='archived'||typeof v?.publishedAt==='string';
const archived=imported.docs.map(d=>d.data()),cloud=live.docs.map(d=>d.data()),
 overlays=legacyDrafts.docs.map(d=>d.data());
const published=[...archived,...cloud].filter(issued);
const drafts=cloud.filter(v=>v?.state==='draft'&&v?.publishedAt==null);
const prior=audits.docs.map(d=>d.data()).filter(v=>
 ['save_edition','save_historical_draft'].includes(v?.action)&&v?.before&&v?.after);
const hasText=v=>Array.isArray(v?.blocks)&&v.blocks.some(b=>
 typeof b?.text==='string'&&b.text.trim().length>0);
const afterSecondDrafts=drafts.filter(v=>
 v?.editionNo>=3||v?.editionNo===undefined);
// Aggregate forensic counters only. Never print edition IDs, article text or UIDs.
const localDay=value=>{
 if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return null;
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',
  year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
};
const auditDay='2026-11-24';
const expectedSubtitle=v=>typeof v?.subtitle==='string'&&
 v.subtitle.trim().toLocaleLowerCase('pt-BR')==='a verdade bem servida';
const textFrom=v=>Array.isArray(v?.blocks)?v.blocks.map(b=>
 typeof b?.text==='string'?b.text:'').join('\n'):'';
const allAudits=audits.docs.map(d=>d.data());
const todayAudits=allAudits.filter(v=>localDay(v?.occurredAt)===auditDay);
const todaySaves=todayAudits.filter(v=>
 ['save_edition','save_historical_draft'].includes(v?.action));
const subtitleDrafts=drafts.filter(expectedSubtitle);
const subtitleHistorical=overlays.filter(expectedSubtitle);
const todayAuditsWithTextChange=todaySaves.filter(v=>
 v?.before&&v?.after&&textFrom(v.before)!==textFrom(v.after));
const boilerplate=new Set([
 'Escreva a manchete principal','A GAZETA DE CORMYR','ÚLTIMA HORA',
 'Linha fina que complementa a manchete',
 'Uma declaração importante ganha destaque aqui.',
 'Notas da Corte\n\nEscreva aqui o comunicado ou anúncio.',
 'Título da notícia\n\nEscreva aqui o conteúdo da reportagem. As colunas se ajustam conforme o espaço disponível.',
]);
const authoredBlockCount=v=>Array.isArray(v?.blocks)?v.blocks.filter(b=>
 typeof b?.text==='string'&&b.text.trim().length>0&&
 !boilerplate.has(b.text.trim())).length:0;
const todaySubtitleDrafts=subtitleDrafts.filter(v=>localDay(v?.updatedAt)===auditDay);
const recentDays=['2026-11-22','2026-11-23','2026-11-24'].map(day=>({
 day,cloudDraftsUpdated:drafts.filter(v=>localDay(v?.updatedAt)===day).length,
 saveOperations:allAudits.filter(v=>localDay(v?.occurredAt)===day&&
 ['save_edition','save_historical_draft'].includes(v?.action)).length,
}));
console.log(JSON.stringify({
 scope:'FOLHA_THIRD_EDITION_READ_ONLY',writes:0,
 issuesPublished:published.length,officialIssuedNumbers:[...new Set(published.map(v=>v.editionNo))]
  .filter(n=>Number.isSafeInteger(n)).sort((a,b)=>a-b).slice(0,20),
 cloudDraftCount:drafts.length,cloudDraftsAfterTwoIssued:afterSecondDrafts.length,
 draftsWithPersistedText:afterSecondDrafts.filter(hasText).length,
 previousSaveRevisions:prior.filter(v=>afterSecondDrafts.some(x=>x.id===v.editionId)).length,
 importedDraftCount:archived.filter(v=>v?.state==='draft').length,
 historicalDraftOverlays:overlays.length,
 historicalDraftOverlaysWithPersistedText:overlays.filter(hasText).length,
 historicalDraftSaveRevisions:prior.filter(v=>v?.action==='save_historical_draft').length,
 auditLocalDay:auditDay,
 cloudDraftsUpdatedToday:drafts.filter(v=>localDay(v?.updatedAt)===auditDay).length,
 subtitleCloudDrafts:subtitleDrafts.length,
 subtitleCloudDraftsUpdatedToday:subtitleDrafts.filter(v=>
  localDay(v?.updatedAt)===auditDay).length,
 subtitleHistoricalDrafts:subtitleHistorical.length,
 todayEditorialSaveOperations:todaySaves.length,
 todayEditorialTextChanges:todayAuditsWithTextChange.length,
 todaySubtitledSaves:todaySaves.filter(v=>expectedSubtitle(v.after)).length,
 todayNewDraftSaveOperations:todaySaves.filter(v=>v?.before==null&&v?.after).length,
 todayExistingDraftSaveOperations:todaySaves.filter(v=>v?.before&&v?.after).length,
 todayCandidateDraftsCreated:todaySubtitleDrafts.filter(v=>localDay(v?.createdAt)===auditDay).length,
 todayCandidateDraftsWithCustomText:todaySubtitleDrafts.filter(v=>authoredBlockCount(v)>0).length,
 todayCandidateDraftVersions:todaySubtitleDrafts.map(v=>v.version).filter(Number.isSafeInteger).sort((a,b)=>a-b),
 recentDays,
 recoveryRoute:'Editor-Chefe > Arquivo > selecionar rascunho > Histórico de revisões',
 textNotLogged:true,
}));
