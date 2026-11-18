/**
 * Build a PRIVATE editorial draft for the ten active Season 2 Houses.
 *
 * This is a name-based *candidate* join, not a verified House identity
 * mapping or authorization to publish. The returned draft contains
 * private snapshot/House references: never log or upload it to GitHub.
 * The summary contains counts ONLY. There are no Cloud writes or CLI.
 */
import {readFileSync} from 'node:fs';
import {parsePublicArchivePayload} from './public-archive-coverage-readonly.mjs';

const HASH=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const CREST=/^assets\/[A-Za-z0-9/_-]+\.(?:webp|png|jpe?g)$/i;
const HISTORY=/^histories\/[A-Za-z0-9/_-]+\.json$/i;
const value=v=>typeof v==='string'&&v.trim().length>0&&
  v.length<=160&&!/[\u0000-\u001f\u007f]/u.test(v);
const normalize=v=>v.normalize('NFKC').trim().replace(/\s+/gu,' ')
  .toLocaleLowerCase('pt-BR');
const archiveFile=new URL('../../public/cormyr/data.js',import.meta.url);
const fail=()=>{throw Error('public_review_candidates_input_invalid');};

export function buildPublicReviewCandidates({
  snapshotId,sourceHouses,archive,expectedActiveHouses=10,
}={}){
  if(!HASH.test(snapshotId??'')||!Array.isArray(sourceHouses)||
     sourceHouses.length===0||sourceHouses.length>250||
     expectedActiveHouses!==10||
     !archive||!Array.isArray(archive.regions)||
     archive.regions.length===0||archive.regions.length>30)fail();
  const byName=new Map(),sourceIds=new Set(),activeNames=new Set();
  for(const region of archive.regions){
    if(!value(region?.name)||!Array.isArray(region.houses)||
       region.houses.length>500)fail();
    for(const h of region.houses){
      if(!value(h?.name))fail();
      const key=normalize(h.name);
      if(!byName.has(key))byName.set(key,[]);
      byName.get(key).push({region,h});
    }
  }
  const active=[];
  for(const house of sourceHouses){
    if(!house||!ID.test(house.sourceId??'')||
       sourceIds.has(house.sourceId)||!value(house.name)||
       typeof house.active!=='boolean'||
       !Number.isSafeInteger(house.season))fail();
    sourceIds.add(house.sourceId);
    if(house.active!==true||house.season!==2)continue;
    const key=normalize(house.name);
    activeNames.add(key);
    active.push({house,key});
  }
  if(active.length!==10)fail();
  let matched=0,missing=0,ambiguous=0,unusableFields=0;
  let crestReferences=0,historyReferences=0;
  const houses=[];
  for(const {house,key} of active){
    const matches=byName.get(key)??[];
    if(matches.length===0){missing++;continue;}
    if(matches.length!==1||active.filter(x=>x.key===key).length!==1){
      ambiguous++;continue;
    }
    const {region,h}=matches[0];
    const regionName=h.region===region.name&&value(h.region)?h.region:null;
    const classification=value(h.hierarchy?.kind)&&
      h.hierarchy.kind.length<=100?h.hierarchy.kind:null;
    if(!regionName||!classification){unusableFields++;continue;}
    matched++;
    const crestCandidate=typeof h.crest==='string'&&
      CREST.test(h.crest)?h.crest:null;
    const historyReference=typeof h.historyPath==='string'&&
      HISTORY.test(h.historyPath)?h.historyPath:null;
    if(crestCandidate)crestReferences++;
    if(historyReference)historyReferences++;
    houses.push({
      id:house.sourceId,name:house.name,region:regionName,classification,
      updated_at:null,narrative_text:null,gallery:[],
      active:true,season:2,publicReviewed:false,
      // Public archive paths are suggestions ONLY, not approved gallery.
      reviewReferences:{crestCandidate,historyReference},
    });
  }
  const complete=matched===10&&missing===0&&ambiguous===0&&
    unusableFields===0;
  const summary={
    scope:'CORMYR_PRIVATE_PUBLIC_REVIEW_CANDIDATES_READ_ONLY',
    checked:true,activeHouses:active.length,matched,
    unmatched:missing,ambiguous,invalidArchiveFields:unusableFields,
    crestReferences,historyReferences,
    candidatePlanComplete:complete,
    editoriallyReviewedHouses:0,reviewApproved:false,
    translatedLocalesApproved:0,
    playerHouseMembershipsApproved:false,
    readyForPublication:false,readyForPlayers:false,
    readyForCutover:false,releaseDecision:'NO_GO',cloudWrites:0,
  };
  return {summary,privateDraft:complete?{
    snapshotId,catalogVersion:1,translationsVersion:1,
    houses,playerHouses:[],
    translationsByLocale:{en:[],es:[],de:[]},
  }:null};
}

export async function inspectPublicReviewCandidates({db,snapshotId}={}){
  if(!HASH.test(snapshotId??'')||typeof db?.collection!=='function')fail();
  const root=db.collection('migrationDomainStage').doc(snapshotId);
  const [stage,items]=await Promise.all([
    root.get(),root.collection('houses').limit(251).get(),
  ]);
  if(stage?.exists!==true||stage.data()?.status!=='complete'||
     stage.data()?.private!==true||
     (stage.data()?.sourceSnapshotId!==undefined&&
      stage.data().sourceSnapshotId!==snapshotId)||
     !Array.isArray(items?.docs)||items.docs.length===0||
     items.docs.length>250)fail();
  const archive=parsePublicArchivePayload(readFileSync(archiveFile,'utf8'));
  // The private draft is intentionally discarded INSIDE this function.
  return buildPublicReviewCandidates({
    snapshotId,archive,sourceHouses:items.docs.map(doc=>doc.data()),
  }).summary;
}

export function safeReviewCandidateSummary(report){
  const n=v=>Number.isSafeInteger(v)&&v>=0&&v<=250?v:'indisponível';
  return [
    '## Preparação editorial de Casas — somente leitura',
    '| Verificação | Resultado |','| --- | --- |',
    '| Casas ativas no snapshot | '+n(report?.activeHouses)+' |',
    '| Correspondências candidatas únicas | '+n(report?.matched)+' |',
    '| Casas sem candidato | '+n(report?.unmatched)+' |',
    '| Candidatos ambíguos | '+n(report?.ambiguous)+' |',
    '| Campos públicos sem qualidade suficiente | '+
      n(report?.invalidArchiveFields)+' |',
    '| Candidatos com referência de brasão | '+n(report?.crestReferences)+' |',
    '| Candidatos com referência de história | '+n(report?.historyReferences)+' |',
    '| Plano editorial preparado | '+
      (report?.candidatePlanComplete===true?'Sim, privado':'Não')+' |',
    '| Revisão individual e traduções | **PENDENTES** |',
    '| Aprovação de publicação no Firebase | **NÃO** |',
    '',
    'Correspondência por nome não confirma identidade ou conteúdo.',
    'Nenhum nome de Casa, UID, ID privado, texto ou caminho é registrado.',
  ].join('\n');
}
