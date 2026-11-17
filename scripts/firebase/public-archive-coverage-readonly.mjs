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
export function summarizePublicArchiveCoverage({archive,sourceHouses}={}){
  if(!archive||!Array.isArray(archive.regions)||
     !Array.isArray(sourceHouses)||sourceHouses.length===0||
     sourceHouses.length>250)failed('source_unverified');
  const publicCounts=new Map();
  let archivedHouses=0;
  for(const region of archive.regions){
    if(!region||!validName(region.name)||
       !Array.isArray(region.houses)||region.houses.length>500)
      failed('public_region_invalid');
    for(const house of region.houses){
      if(!house||!validName(house.name))failed('public_house_invalid');
      const name=normalize(house.name);
      publicCounts.set(name,(publicCounts.get(name)??0)+1);
      archivedHouses++;
    }
  }
  if(archivedHouses===0||archivedHouses>5000)
    failed('public_inventory_invalid');
  const sourceIds=new Set();
  let active=0,exact=0,ambiguous=0,unmatched=0;
  for(const house of sourceHouses){
    if(!house||!validName(house.name)||
       typeof house.sourceId!=='string'||house.sourceId.length<1||
       house.sourceId.length>128||sourceIds.has(house.sourceId)||
       typeof house.active!=='boolean'||
       !Number.isSafeInteger(house.season))
      failed('private_source_invalid');
    sourceIds.add(house.sourceId);
    if(house.active!==true||house.season!==2)continue;
    active++;
    const matches=publicCounts.get(normalize(house.name))??0;
    if(matches===1)exact++;
    else if(matches>1)ambiguous++;
    else unmatched++;
  }
  return {
    scope:'FIREBASE_PUBLIC_ARCHIVE_NAME_COVERAGE_READ_ONLY',
    checked:true,archivedRegions:archive.regions.length,archivedHouses,
    sourceHouses:sourceHouses.length,activeSourceHouses:active,
    exactMatches:exact,ambiguousMatches:ambiguous,unmatchedActive:unmatched,
    // Coverage is NOT review or evidence of matching public/private fields.
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
  return summarizePublicArchiveCoverage({
    archive,sourceHouses:query.docs.map(doc=>doc.data()),
  });
}
