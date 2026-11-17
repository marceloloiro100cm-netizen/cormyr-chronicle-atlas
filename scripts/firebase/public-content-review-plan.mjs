/**
 * Offline-only reviewed public catalog and translation plan.
 * Pure function: no network, file reads, SDK, cloud writes or Supabase.
 * Output contains private draft content. Never log the full privatePlan.
 */
const HASH=/^[a-f0-9]{64}$/;
const KEY=/^[A-Za-z0-9_-]{1,128}$/;
const LOCALES=Object.freeze(['en','es','de']);
const TYPES=Object.freeze(['region','house','constitution']);
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const safeId=v=>typeof v==='string'&&KEY.test(v);
const safeText=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&
  !/[\u0000-\u0008\u000b\u000e-\u001f]/.test(v);
const positive=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=1;
const bytes=v=>Buffer.byteLength(JSON.stringify(v),'utf8');
const MAX_BYTES=650000;
const summary=(issues,counts)=>({
  scope:'FIREBASE_PUBLIC_CONTENT_REVIEW_PLAN_OFFLINE',
  formatVersion:1,...counts,issueCounts:{...issues},
  reviewPlanValid:Object.values(issues).every(n=>n===0),
  cloudWrites:0,authWrites:0,runtimeWrites:0,
  publicEndpointsEnabled:false,sourceLiveReconciled:false,
  releaseDecision:'NO_GO',readyForCutover:false,
});

/** Require explicit public review for every record, never infer approval. */
export function planReviewedPublicContent({
  snapshotId,houses,playerHouses,translationsByLocale,
  catalogVersion=1,translationsVersion=1,
}={}){
  const issues={
    invalidInput:0,unreviewedHouses:0,invalidHouses:0,
    duplicateHouses:0,invalidMemberships:0,invalidTranslations:0,
    unreviewedTranslations:0,privateTranslationTypes:0,
    duplicateTranslations:0,unpublishedHouseTranslations:0,
    oversizedDocuments:0,
  };
  const counts={
    reviewedHouses:0,reviewedPlayerHouseReferences:0,
    reviewedTranslationsByLocale:{en:0,es:0,de:0},
  };
  if(!HASH.test(snapshotId??'')||!positive(catalogVersion)||
     !positive(translationsVersion)||!Array.isArray(houses)||
     !Array.isArray(playerHouses)||!record(translationsByLocale)||
     houses.length===0||houses.length>250||playerHouses.length>250||
     Object.keys(translationsByLocale).sort().join(',')!=='de,en,es'||
     !LOCALES.every(locale=>Array.isArray(translationsByLocale[locale])&&
       translationsByLocale[locale].length<=5000)){
    issues.invalidInput++;
    return {summary:summary(issues,counts),privatePlan:null};
  }

  const projectedHouses=[],seenHouses=new Set();
  for(const h of houses){
    if(!record(h)){issues.invalidHouses++;continue;}
    if(h.publicReviewed!==true){issues.unreviewedHouses++;continue;}
    if(h.active!==true||h.season!==2||
       !safeId(h.id)||!safeText(h.name,160)||
       !safeText(h.region,160)||!safeText(h.classification,100)||
       !(h.updated_at===null||(typeof h.updated_at==='string'&&
         /^\d{4}-\d\d-\d\dT/.test(h.updated_at)&&
         h.updated_at.length<=40))||
       !(h.narrative_text===null||safeText(h.narrative_text,15000))||
       !Array.isArray(h.gallery)||h.gallery.length>25||
       !h.gallery.every(src=>typeof src==='string'&&
         src.length<=1024&&(src.startsWith('https://')||
         src.startsWith('/')&&!src.startsWith('//')))){
      issues.invalidHouses++;continue;
    }
    if(seenHouses.has(h.id)){issues.duplicateHouses++;continue;}
    seenHouses.add(h.id);
    projectedHouses.push({
      id:h.id,name:h.name,region:h.region,classification:h.classification,
      updated_at:h.updated_at,gallery:[...h.gallery],
      narrative_text:h.narrative_text,publicReviewed:true,
      active:true,season:2,
    });
  }
  counts.reviewedHouses=projectedHouses.length;
  const seenMemberships=new Set(),projectedMemberships=[];
  for(const row of playerHouses){
    if(!record(row)||!safeId(row.house_id)||
       !seenHouses.has(row.house_id)||seenMemberships.has(row.house_id)){
      issues.invalidMemberships++;continue;
    }
    seenMemberships.add(row.house_id);
    projectedMemberships.push({house_id:row.house_id});
  }
  counts.reviewedPlayerHouseReferences=projectedMemberships.length;
  const translations=Object.create(null);
  for(const locale of LOCALES){
    const seenKeys=new Set(),rows=[];
    for(const row of translationsByLocale[locale]){
      if(!record(row)){issues.invalidTranslations++;continue;}
      if(row.publicReviewed!==true){issues.unreviewedTranslations++;continue;}
      if(typeof row.entity_type!=='string'||
         !TYPES.includes(row.entity_type)){
        issues.privateTranslationTypes++;continue;
      }
      if(!safeId(row.entity_id)||!safeId(row.field_name)||
         !safeText(row.translated_text,12000)){
        issues.invalidTranslations++;continue;
      }
      if(row.entity_type==='house'&&!seenHouses.has(row.entity_id)){
        issues.unpublishedHouseTranslations++;continue;
      }
      const key=[row.entity_type,row.entity_id,row.field_name].join(':');
      if(seenKeys.has(key)){issues.duplicateTranslations++;continue;}
      seenKeys.add(key);
      rows.push({
        entity_type:row.entity_type,entity_id:row.entity_id,
        field_name:row.field_name,translated_text:row.translated_text,
        publicReviewed:true,
      });
    }
    counts.reviewedTranslationsByLocale[locale]=rows.length;
    translations[locale]={version:translationsVersion,locale,rows};
  }
  const catalog={
    version:catalogVersion,houses:projectedHouses,
    playerHouses:projectedMemberships,
  };
  if(bytes(catalog)>MAX_BYTES)issues.oversizedDocuments++;
  for(const locale of LOCALES)
    if(bytes(translations[locale])>MAX_BYTES)issues.oversizedDocuments++;
  const reviewSummary=summary(issues,counts);
  if(!reviewSummary.reviewPlanValid)
    return {summary:reviewSummary,privatePlan:null};
  // Deliberately pending and offline. This is never a Cloud publish decision.
  return {
    summary:reviewSummary,
    privatePlan:{
      stage:{status:'pending',private:true,sourceSnapshotId:snapshotId,
        formatVersion:1,reviewRequired:true},
      catalog,translations,
    },
  };
}
