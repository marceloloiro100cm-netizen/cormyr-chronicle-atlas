/**
 * Public archive vs. private snapshot: READ-ONLY coverage by exact House name.
 *
 * This is not a content review or a House identity join. Names can collide
 * and published archive lore can differ from the migration snapshot. Never
 * use these matches to publish, grant scope or populate Firestore.
 */
import {readFileSync} from 'node:fs';
const HASH=/^[a-f0-9]{64}$/;
const validName=v=>typeof v==='string'&&v.length>0&&v.length<=160&&
  !/[\u0000-\u001f\u007f]/.test(v);
const normalize=v=>v.normalize('NFKC').trim().replace(/\s+/gu,' ')
  .toLocaleLowerCase('pt-BR');
const failed=reason=>{throw Error('public_archive_coverage_'+reason);};
const archiveFile=new URL('../../public/cormyr/data.js',import.meta.url);

/** Parse a fixed public JSON assignment; never eval or execute archive JS. */
export function parsePublicArchivePayload(source){
  if(typeof source!=='string'||source.length<20||source.length>1_000_000)
    failed('file_invalid');
  const prefix=/^\s*window\.CORMYR_DATA\s*=\s*/;
  if(!prefix.test(source))failed('wrapper_invalid');
  const json=source.replace(prefix,'').trim().replace(/;\s*$/u,'');
  let data;
  try{data=JSON.parse(json);}catch{failed('json_invalid');}
  if(!data||typeof data!=='object'||Array.isArray(data)||
     !Array.isArray(data.regions)||data.regions.length===0||
     data.regions.length>30)failed('regions_invalid');
  return data;
}

/** Only fixed aggregate counts are returned: no names, IDs or source rows. */
export function summarizePublicArchiveCoverage({
  archive,sourceHouses,assetChecks=null,
}={}){
  if(!archive||!Array.isArray(archive.regions)||
     !Array.isArray(sourceHouses)||sourceHouses.length===0||
     sourceHouses.length>250)failed('source_unverified');
  if(assetChecks!==null&&
     (typeof assetChecks?.crest!=='function'||
      typeof assetChecks?.history!=='function'))failed('asset_checks_invalid');
  const publicCounts=new Map(),publicByName=new Map();
  let archivedHouses=0;
  for(const region of archive.regions){
    if(!region||!validName(region.name)||
       !Array.isArray(region.houses)||region.houses.length>500)
      failed('public_region_invalid');
    for(const house of region.houses){
      if(!house||!validName(house.name))failed('public_house_invalid');
      const name=normalize(house.name);
      publicCounts.set(name,(publicCounts.get(name)??0)+1);
      if(!publicByName.has(name))publicByName.set(name,{
        region:house.region===region.name&&validName(house.region),
        classification:validName(house.hierarchy?.kind)&&
          house.hierarchy.kind.length<=100,
        crest:typeof house.crest==='string'&&
          /^assets\/[A-Za-z0-9/_-]+\.(webp|png|jpe?g)$/i.test(house.crest),
        history:typeof house.historyPath==='string'&&
          /^histories\/[A-Za-z0-9/_-]+\.json$/i.test(house.historyPath),
        directDescription:validName(house.description),
        crestReference:house.crest,
        historyReference:house.historyPath,
      });
      archivedHouses++;
    }
  }
  if(archivedHouses===0||archivedHouses>5000)
    failed('public_inventory_invalid');
  const sourceIds=new Set(),sourceCounts=new Map();
  for(const h of sourceHouses){
    if(!h||!validName(h.name)||typeof h.sourceId!=='string'||
       h.sourceId.length<1||h.sourceId.length>128||
       sourceIds.has(h.sourceId)||typeof h.active!=='boolean'||
       !Number.isSafeInteger(h.season))
      failed('private_source_invalid');
    sourceIds.add(h.sourceId);
    if(h.active===true&&h.season===2){
      const name=normalize(h.name);
      sourceCounts.set(name,(sourceCounts.get(name)??0)+1);
    }
  }
  let active=0,exact=0,ambiguous=0,unmatched=0;
  const candidateFields={region:0,classification:0,crest:0,
    historyReference:0,directDescription:0};
  const assetVerification={
    checked:assetChecks!==null,
    uniqueSeason2MatchesWithValidCrests:assetChecks?0:null,
    uniqueSeason2MatchesWithValidHistories:assetChecks?0:null,
    uniqueSeason2MatchesWithBothValid:assetChecks?0:null,
    uniqueSeason2MatchesWithUnverifiedAssets:assetChecks?0:null,
  };
  const safeCheck=(fn,path)=>{
    try{return fn(path)===true;}catch{return false;}
  };
  for(const house of sourceHouses){
    if(house.active!==true||house.season!==2)continue;
    active++;
    const name=normalize(house.name);
    const matches=publicCounts.get(name)??0;
    if(matches===0){unmatched++;continue;}
    // A name is a candidate ONLY when unique on BOTH sides.
    if(matches!==1||sourceCounts.get(name)!==1){
      ambiguous++;continue;
    }
    exact++;
    const fields=publicByName.get(name);
    if(fields.region)candidateFields.region++;
    if(fields.classification)candidateFields.classification++;
    if(fields.crest)candidateFields.crest++;
    if(fields.history)candidateFields.historyReference++;
    if(fields.directDescription)candidateFields.directDescription++;
    if(assetChecks){
      const crestOk=fields.crest&&
        safeCheck(assetChecks.crest,fields.crestReference);
      const historyOk=fields.history&&
        safeCheck(assetChecks.history,fields.historyReference);
      if(crestOk)assetVerification.uniqueSeason2MatchesWithValidCrests++;
      if(historyOk)assetVerification.uniqueSeason2MatchesWithValidHistories++;
      if(crestOk&&historyOk)
        assetVerification.uniqueSeason2MatchesWithBothValid++;
      else assetVerification.uniqueSeason2MatchesWithUnverifiedAssets++;
    }
  }
  return {
    scope:'FIREBASE_PUBLIC_ARCHIVE_NAME_COVERAGE_READ_ONLY',
    checked:true,archivedRegions:archive.regions.length,archivedHouses,
    sourceHouses:sourceHouses.length,activeSourceHouses:active,
    exactMatches:exact,ambiguousMatches:ambiguous,unmatchedActive:unmatched,
    // Published archive fields available for manual review, NOT approved data.
    candidateFields,assetVerification,
    // Verified files are still only public archive candidates, not
    // reviewed/private-identity-approved game data.
    reviewApproved:false,ready:false,cloudWrites:0,
    readyForPlayers:false,releaseDecision:'NO_GO',
  };
}

export async function inspectPublicArchiveCoverage({db,snapshotId}={}){
  if(!HASH.test(snapshotId??'')||typeof db?.collection!=='function')
    failed('configuration_invalid');
  const root=db.collection('migrationDomainStage').doc(snapshotId);
  const meta=await root.get();
  if(meta?.exists!==true||meta.data()?.status!=='complete'||
     meta.data()?.private!==true||
     (meta.data()?.sourceSnapshotId!==undefined&&
      meta.data()?.sourceSnapshotId!==snapshotId))
    failed('source_stage_unverified');
  const query=await root.collection('houses').limit(251).get();
  if(!Array.isArray(query?.docs)||query.docs.length===0||
     query.docs.length>250)failed('source_inventory_unverified');
  const archive=parsePublicArchivePayload(readFileSync(archiveFile,'utf8'));
  // Lazy import breaks the integrity module's parser dependency cycle.
  // Both checks inspect only files in the checked-in public archive.
  const {verifyPublicHistoryAsset,verifyPublicCrestAsset}
    =await import('./public-archive-asset-integrity.mjs');
  return summarizePublicArchiveCoverage({
    archive,sourceHouses:query.docs.map(doc=>doc.data()),
    assetChecks:{
      crest:verifyPublicCrestAsset,
      history:verifyPublicHistoryAsset,
    },
  });
}
