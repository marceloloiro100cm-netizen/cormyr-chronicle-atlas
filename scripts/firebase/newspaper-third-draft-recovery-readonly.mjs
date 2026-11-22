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
const [stageRoot,runtimeRoot,imported,live,audits]=await Promise.all([
 stage.get(),runtime.get(),stage.collection('editions').limit(501).get(),
 runtime.collection('publishedNewspapers').limit(501).get(),
 runtime.collection('newspaperAudits').limit(501).get(),
]);
if(!stageRoot.exists||stageRoot.data()?.private!==true||
 stageRoot.data()?.status!=='complete'||!runtimeRoot.exists||
 runtimeRoot.data()?.private!==true||runtimeRoot.data()?.status!=='active'||
 runtimeRoot.data()?.sourceSnapshotId!==snapshot||
 imported.size>500||live.size>500||audits.size>500)
 throw Error('source_or_history_unverified');
const issued=v=>v?.state==='published'||v?.state==='archived'||typeof v?.publishedAt==='string';
const archived=imported.docs.map(d=>d.data()),cloud=live.docs.map(d=>d.data());
const published=[...archived,...cloud].filter(issued);
const drafts=cloud.filter(v=>v?.state==='draft'&&v?.publishedAt==null);
const prior=audits.docs.map(d=>d.data()).filter(v=>
 v?.action==='save_edition'&&v?.before&&v?.after);
const hasText=v=>Array.isArray(v?.blocks)&&v.blocks.some(b=>
 typeof b?.text==='string'&&b.text.trim().length>0);
const afterSecondDrafts=drafts.filter(v=>
 v?.editionNo>=3||v?.editionNo===undefined);
console.log(JSON.stringify({
 scope:'FOLHA_THIRD_EDITION_READ_ONLY',writes:0,
 issuesPublished:published.length,officialIssuedNumbers:[...new Set(published.map(v=>v.editionNo))]
  .filter(n=>Number.isSafeInteger(n)).sort((a,b)=>a-b).slice(0,20),
 cloudDraftCount:drafts.length,cloudDraftsAfterTwoIssued:afterSecondDrafts.length,
 draftsWithPersistedText:afterSecondDrafts.filter(hasText).length,
 previousSaveRevisions:prior.filter(v=>afterSecondDrafts.some(x=>x.id===v.editionId)).length,
 importedDraftCount:archived.filter(v=>v?.state==='draft').length,
 recoveryRoute:'Editor-Chefe > Arquivo > selecionar rascunho > Histórico de revisões',
 textNotLogged:true,
}));
