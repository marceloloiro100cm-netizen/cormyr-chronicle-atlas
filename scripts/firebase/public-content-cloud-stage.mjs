/**
 * Atomic publication of an ALREADY REVIEWED public-content stage.
 * There is deliberately no CLI/automatic invocation: an independent protected
 * operator must supply reviewed source, the matching digest and explicit approval.
 * This does not enable public routes, player access or the campaign runtime.
 */
import {createHash} from 'node:crypto';
import {planReviewedPublicContent} from './public-content-review-plan.mjs';

const HASH=/^[a-f0-9]{64}$/;
const safe=code=>{throw Error('reviewed_public_stage_'+code);};
const short=v=>typeof v==='string'&&v.length>0&&v.length<=160;
const CATALOG_FIELDS=new Set(['snapshotId','houses','playerHouses','catalogVersion']);
const requiredCatalogCoverage=summary=>
  summary?.reviewPlanValid===true&&summary.reviewedHouses===10;
function reviewedPlan(source,mode){
  if(mode!=='catalog-only')return planReviewedPublicContent(source);
  // Catalog-only is a distinct publication with a different digest namespace.
  // It cannot smuggle translations into a partial approval.
  if(!source||typeof source!=='object'||Array.isArray(source)||
     Object.keys(source).some(field=>!CATALOG_FIELDS.has(field)))
    safe('catalog_only_scope_invalid');
  return planReviewedPublicContent({...source,translationsVersion:1,
    translationsByLocale:{en:[],es:[],de:[]}});
}
const requiredEditorialCoverage=summary=>
  summary?.reviewPlanValid===true&&summary.reviewedHouses===10&&
  ['en','es','de'].every(locale=>
    Number.isSafeInteger(summary.reviewedTranslationsByLocale?.[locale])&&
    summary.reviewedTranslationsByLocale[locale]>0);
const rootComplete=(doc,snapshotId)=>doc?.exists===true&&
  doc.data()?.status==='complete'&&doc.data()?.private===true&&
  (doc.data()?.sourceSnapshotId===undefined||
   doc.data()?.sourceSnapshotId===snapshotId);

function preflight(source,mode){
  const reviewed=reviewedPlan(source,mode);
  const ready=mode==='catalog-only'?
    requiredCatalogCoverage(reviewed.summary):
    requiredEditorialCoverage(reviewed.summary);
  if(!ready||!reviewed.privatePlan)
    return {summary:reviewed.summary,approvalDigest:null};
  // Catalog-only approvals are intentionally incompatible with full
  // catalog+translation approvals.
  const prefix=mode==='catalog-only'?
    'cormyr/public-catalog-stage/reviewed/v1\n':
    'cormyr/public-content-stage/reviewed/v1\n';
  const approvalDigest=createHash('sha256').update(
    prefix,'utf8').update(JSON.stringify(reviewed.privatePlan),'utf8')
    .digest('hex');
  return {summary:reviewed.summary,approvalDigest};
}
export const preflightReviewedPublicStage=source=>preflight(source,'full');
export const preflightReviewedPublicCatalogStage=source=>
  preflight(source,'catalog-only');

async function publishStage({
  db,source,expectedSnapshotId,approvalDigest,explicitApproval=false,
  projectId,env=process.env,
}={},mode='full'){
  // Reviewed content alone never authorizes the Cloud environment.
  if(projectId!=='cormyr'||env?.FIRESTORE_EMULATOR_HOST||
     env?.FIREBASE_AUTH_EMULATOR_HOST)
    safe('cloud_environment_unverified');
  // Never invoke an Admin transaction without all independent approvals.
  if(explicitApproval!==true||!HASH.test(expectedSnapshotId??'')||
     !HASH.test(approvalDigest??'')||
     source?.snapshotId!==expectedSnapshotId)
    safe('approval_missing_or_mismatch');
  const reviewed=reviewedPlan(source,mode);
  const valid=mode==='catalog-only'?
    requiredCatalogCoverage(reviewed.summary):
    requiredEditorialCoverage(reviewed.summary);
  if(!valid||!reviewed.privatePlan)
    safe('review_plan_invalid');
  const fingerprint=preflight(source,mode).approvalDigest;
  if(fingerprint!==approvalDigest)safe('review_digest_mismatch');
  if(typeof db?.collection!=='function'||typeof db?.runTransaction!=='function')
    safe('admin_db_unavailable');

  const root=db.collection('migrationPublicContentStage').doc(expectedSnapshotId);
  const domain=db.collection('migrationDomainStage').doc(expectedSnapshotId);
  const storage=db.collection('migrationStorageStage').doc(expectedSnapshotId);
  const houseQuery=domain.collection('houses').limit(251);
  const catalog=reviewed.privatePlan.catalog;
  const translations=reviewed.privatePlan.translations;
  // All source reads and five creates occur within the SAME transaction.
  // No partial marker or publicly available stage can result on failure.
  await db.runTransaction(async tx=>{
    const [domainSnap,storageSnap,existing,houseSnaps]=await Promise.all([
      tx.get(domain),tx.get(storage),tx.get(root),tx.get(houseQuery),
    ]);
    if(!rootComplete(domainSnap,expectedSnapshotId)||
       !rootComplete(storageSnap,expectedSnapshotId))
      safe('source_stages_unverified');
    if(existing?.exists!==false)safe('destination_not_empty');
    if(!Array.isArray(houseSnaps?.docs)||houseSnaps.docs.length===0||
       houseSnaps.docs.length>250)safe('house_inventory_incomplete');

    const sourceHouses=new Map();
    for(const doc of houseSnaps.docs){
      const v=doc.data();
      if(!v||typeof v.sourceId!=='string'||!short(v.name)||
         typeof v.active!=='boolean'||!Number.isSafeInteger(v.season)||
         sourceHouses.has(v.sourceId))safe('house_inventory_invalid');
      sourceHouses.set(v.sourceId,v);
    }
    const active=[...sourceHouses.values()].filter(v=>v.active&&v.season===2);
    // Never publish a subset or fabricated House even if individually reviewed.
    if(active.length!==10||catalog.houses.length!==10||
       catalog.houses.length!==active.length)
      safe('source_catalog_divergent');
    for(const h of catalog.houses){
      const original=sourceHouses.get(h.id);
      if(!original||original.active!==true||original.season!==2||
         original.name!==h.name)safe('source_catalog_divergent');
    }
    tx.create(root,{
      status:'complete',private:true,sourceSnapshotId:expectedSnapshotId,
      formatVersion:1,publicReviewApproved:true,reviewDigest:fingerprint,
      catalogVersion:catalog.version,
      ...(mode==='catalog-only'
        ?{reviewScope:'catalog-only',translationsDeferred:true}
        :{translationsVersion:translations.en.version}),
    });
    tx.create(root.collection('catalog').doc('published'),catalog);
    if(mode!=='catalog-only'){
      for(const locale of ['en','es','de']){
        tx.create(root.collection('translations').doc(locale),translations[locale]);
      }
    }
  });
  return {
    scope:mode==='catalog-only'
      ?'FIREBASE_REVIEWED_PUBLIC_CATALOG_ATOMIC_IMPORT'
      :'FIREBASE_REVIEWED_PUBLIC_STAGE_ATOMIC_IMPORT',
    stageCreated:true,documentsCreated:mode==='catalog-only'?2:5,
    translationsDeferred:mode==='catalog-only',
    reviewedHouses:reviewed.summary.reviewedHouses,
    reviewedPlayerHouseReferences:reviewed.summary.reviewedPlayerHouseReferences,
    reviewedTranslationsByLocale:reviewed.summary.reviewedTranslationsByLocale,
    publicRoutesEnabled:false,cloudRuntimeModified:false,
    authModified:false,readyForPlayers:false,readyForCutover:false,
    releaseDecision:'NO_GO',
  };
}

/** Dedicated Portuguese catalog path; translations require a future project. */
export const publishReviewedPublicCatalogStage=options=>
  publishStage(options,'catalog-only');
export const publishReviewedPublicStage=options=>
  publishStage(options,'full');
