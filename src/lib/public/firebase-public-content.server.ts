/**
 * Firebase-only public catalog and approved translations.
 *
 * Admin SDK ignores Firestore Rules. A private migration snapshot is never
 * a license to publish its content: require an independent, reconciled
 * public-content stage AND explicit per-dataset approvals in Cloud runtime.
 * No import, mutation, authentication or Supabase fallback happens here.
 */
import type {Firestore} from 'firebase-admin/firestore';
import {PUBLIC_TRANSLATION_ENTITY_TYPES} from '@/lib/i18n/public-translations';

const SHA=/^[a-f0-9]{64}$/;
const KEY=/^[A-Za-z0-9_-]{1,128}$/;
const LOCALES=['en','es','de'] as const;
type Locale=typeof LOCALES[number];

export class PublicFirebaseContentUnavailable extends Error{
  constructor(){super('firebase_public_content_unavailable');this.name='PublicFirebaseContentUnavailable';}
}
const unavailable=():never=>{throw new PublicFirebaseContentUnavailable();};
const object=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const safeId=(v:unknown)=>typeof v==='string'&&KEY.test(v);
const safeText=(v:unknown,max=4000):v is string=>
  typeof v==='string'&&v.length>0&&v.length<=max&&
  !/[\u0000-\u0008\u000b\u000e-\u001f]/.test(v);
const version=(v:unknown)=>Number.isSafeInteger(v)&&
  typeof v==='number'&&v>=1;
const maxPayload=650_000;
const withinBudget=(v:unknown)=>Buffer.byteLength(JSON.stringify(v),'utf8')<=maxPayload;
const baseOptions=(args:Options)=>{
  const env=args.env??process.env;
  return args.enabled===true&&
    args.projectId==='cormyr'&&SHA.test(args.snapshotId)&&
    !env['FIRESTORE_EMULATOR_HOST']&&!env['FIREBASE_AUTH_EMULATOR_HOST']&&
    !!args.db&&typeof args.db.collection==='function';
};

type Options={
  db:Firestore;
  snapshotId:string;
  projectId:string;
  enabled:boolean;
  env?:NodeJS.ProcessEnv;
};
type PublicHouse={
  id:string;
  name:string;
  region:string;
  classification:string;
  updated_at:string|null;
  gallery:string[];
  narrative_text:string|null;
};
type PublicCatalog={
  houses:PublicHouse[];
  playerHouses:{house_id:string}[];
};
type PublicTranslations={translations:Record<string,string>};

async function publishedStage(args:Options,dataset:'catalog'|'translations'){
  if(!baseOptions(args))return unavailable();
  const runtimeRef=args.db.collection('campaignCloudRuntime').doc(args.snapshotId);
  const runtime=await runtimeRef.get();
  const control=runtime.exists?runtime.data():null;
  if(!control||control['status']!=='active'||control['private']!==true||
     control['sourceSnapshotId']!==args.snapshotId||
     control['sourceSnapshotReconciled']!==true||
     control['applicationEnabled']!==true)return unavailable();
  const approved=dataset==='catalog'?'publicCatalogApproved':'publicTranslationsApproved';
  const published=dataset==='catalog'?'publishedCatalogVersion':'publishedTranslationsVersion';
  const current=dataset==='catalog'?'catalogVersion':'translationsVersion';
  if(control[approved]!==true||!version(control[published])||
     control[published]!==control[current])return unavailable();

  const stageRef=args.db.collection('migrationPublicContentStage').doc(args.snapshotId);
  const stage=await stageRef.get();
  const data=stage.exists?stage.data():null;
  // A complete migration marker is not itself editorial approval.
  // Require the exact reviewed publication marker and matching stage
  // version, independently of the runtime's feature and dataset flags.
  const stageVersion=dataset==='catalog'?'catalogVersion':'translationsVersion';
  if(!data||data['status']!=='complete'||data['private']!==true||
     data['sourceSnapshotId']!==args.snapshotId||
     data['publicReviewApproved']!==true||
     typeof data['reviewDigest']!=='string'||!SHA.test(data['reviewDigest'])||
     !version(data[stageVersion])||
     data[stageVersion]!==control[published])
    return unavailable();
  return {root:stageRef,approvedVersion:control[published] as number};
}

/**
 * This stage is deliberately new: the existing migrationDomainStage/houses
 * omits classification, region, narrative and review decisions. Do NOT
 * conflate its historical minimal House view with an approved public catalog.
 */
export async function readApprovedFirebasePublicCatalog(args:Options):Promise<PublicCatalog>{
  const {root,approvedVersion}=await publishedStage(args,'catalog');
  const d=await root.collection('catalog').doc('published').get();
  const data=d.exists?d.data():null;
  if(!data||data['version']!==approvedVersion||
     !Array.isArray(data['houses'])||data['houses'].length>250||
     !Array.isArray(data['playerHouses'])||data['playerHouses'].length>250)
    return unavailable();

  const houses:PublicHouse[]=[];
  const seen=new Set<string>();
  for(const h of data['houses'] as unknown[]){
    if(!object(h)||h['publicReviewed']!==true||h['active']!==true||
       h['season']!==2||!safeId(h['id'])||seen.has(h['id'] as string)||
       !safeText(h['name'],160)||!safeText(h['region'],160)||
       !safeText(h['classification'],100)||
       !(h['updated_at']===null||
         (typeof h['updated_at']==='string'&&
          /^\d{4}-\d\d-\d\dT/.test(h['updated_at'])&&h['updated_at'].length<=40))||
       !(h['narrative_text']===null||safeText(h['narrative_text'],15000))||
       !Array.isArray(h['gallery'])||h['gallery'].length>25||
       !h['gallery'].every((v:unknown)=>typeof v==='string'&&
         v.length<=1024&&
         (v.startsWith('https://')||(v.startsWith('/')&&!v.startsWith('//')))))
      return unavailable();
    seen.add(h['id'] as string);
    houses.push({
      id:h['id'] as string,name:h['name'] as string,
      region:h['region'] as string,classification:h['classification'] as string,
      updated_at:h['updated_at'] as string|null,
      gallery:[...h['gallery']] as string[],
      narrative_text:h['narrative_text'] as string|null,
    });
  }
  const playerHouses:{house_id:string}[]=[];
  const roster=new Set<string>();
  for(const item of data['playerHouses'] as unknown[]){
    if(!object(item)||!safeId(item['house_id'])||
       !seen.has(item['house_id'] as string)||
       roster.has(item['house_id'] as string))return unavailable();
    roster.add(item['house_id'] as string);
    playerHouses.push({house_id:item['house_id'] as string});
  }
  houses.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')||
    a.id.localeCompare(b.id));
  const result={houses,playerHouses};
  return withinBudget(result)?result:unavailable();
}

/**
 * The imported translation collection is NOT publicly enumerable.
 * Every row must be explicitly reviewed and belong to the exact approved
 * public-version contract; private types fail the entire dataset closed.
 */
export async function readApprovedFirebasePublicTranslations(
  args:Options&{locale:string},
):Promise<PublicTranslations>{
  if(!LOCALES.includes(args.locale as Locale))return unavailable();
  const {root,approvedVersion}=await publishedStage(args,'translations');
  const doc=await root.collection('translations').doc(args.locale).get();
  const data=doc.exists?doc.data():null;
  if(!data||data['version']!==approvedVersion||
     data['locale']!==args.locale||
     !Array.isArray(data['rows'])||data['rows'].length>5000)
    return unavailable();
  const translations:Record<string,string>=Object.create(null);
  for(const item of data['rows'] as unknown[]){
    if(!object(item)||item['publicReviewed']!==true||
       typeof item['entity_type']!=='string'||
       !PUBLIC_TRANSLATION_ENTITY_TYPES.some(t=>t===item['entity_type'])||
       !safeId(item['entity_id'])||!safeId(item['field_name'])||
       !safeText(item['translated_text'],12000))
      return unavailable();
    // Duplicate dictionary keys could hide a private/unreviewed overwrite.
    const key=[item['entity_type'],item['entity_id'],item['field_name']].join(':');
    if(Object.hasOwn(translations,key))return unavailable();
    translations[key]=item['translated_text'] as string;
  }
  // The stage is intended to contain only translations pre-vetted for public
  // visibility. House translations additionally require the exact house to
  // occur in the separately approved public catalog for this same snapshot.
  if(Object.keys(translations).some(key=>key.startsWith('house:'))){
    const catalog=await readApprovedFirebasePublicCatalog(args);
    const allowed=new Set(catalog.houses.map(h=>h.id));
    for(const item of data['rows'] as unknown[]){
      if(object(item)&&item['entity_type']==='house'&&
         !allowed.has(item['entity_id'] as string))return unavailable();
    }
  }
  // Serialize to an ordinary JSON object without inherited prototype keys.
  const result={translations:{...translations}};
  return withinBudget(result)?result:unavailable();
}
