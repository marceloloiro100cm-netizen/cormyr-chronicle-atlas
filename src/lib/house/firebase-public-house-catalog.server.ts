/**
 * Explicitly approved, minimal public House catalogue from Firebase Cloud.
 *
 * The source espionage catalogue is a PRIVATE historical stage even if
 * individual source rows have publicReviewed=true. Firebase Admin bypasses
 * Firestore Security Rules; a separate Cloud publication approval is
 * mandatory before any anonymous projection can be returned.
 */
import type {Firestore} from 'firebase-admin/firestore';

const SNAPSHOT=/^[a-f0-9]{64}$/;
const ID=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const TEXT=/^[^\u0000-\u001f\u007f]{1,240}$/;
const CLASSIFICATIONS=new Set(['noble','major','royal']);
const MAX_CATALOG=250;
const MAX_PLAYER_HOUSES=25;

export class PublicFirebaseCatalogUnavailable extends Error {
  constructor(){
    super('firebase_public_catalog_unavailable');
    this.name='PublicFirebaseCatalogUnavailable';
  }
}
const unavailable=():never=>{throw new PublicFirebaseCatalogUnavailable();};
const validId=(v:unknown):v is string=>typeof v==='string'&&ID.test(v);
const validName=(v:unknown):v is string=>typeof v==='string'&&TEXT.test(v)&&
  v.trim()===v&&v.trim().length>0;
const validCount=(v:unknown,min:number,max:number):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;

export type PublicHouseCatalog={
  houses:Array<{
    id:string;name:string;region:string|null;classification:string;
    updated_at:null;gallery:[];narrative_text:null;
  }>;
  playerHouses:Array<{house_id:string}>;
};

export async function readApprovedFirebaseHouseCatalog({
  db,snapshotId,projectId,enabled,env=process.env,
}:{
  db:Firestore;
  snapshotId:string;
  projectId:string;
  enabled:boolean;
  env?:NodeJS.ProcessEnv;
}):Promise<PublicHouseCatalog>{
  if(enabled!==true||projectId!=='cormyr'||!SNAPSHOT.test(snapshotId)||
     env['FIRESTORE_EMULATOR_HOST']||env['FIREBASE_AUTH_EMULATOR_HOST']||
     !db||typeof db.collection!=='function')return unavailable();

  const cloud=db.collection('campaignCloudRuntime').doc(snapshotId);
  const runtime=await cloud.get();
  const c=runtime.exists?runtime.data():null;
  const playerIds=c?.['publicCatalogPlayerHouseIds'];
  const publishedCount=c?.['publicCatalogExpectedReviewedCount'];
  const playerCount=c?.['publicCatalogExpectedPlayerHouseCount'];
  if(!c||c['status']!=='active'||c['private']!==true||
     c['sourceSnapshotId']!==snapshotId||
     c['sourceSnapshotReconciled']!==true||
     c['applicationEnabled']!==true||
     c['publicCatalogApproved']!==true||
     !validCount(c['publicCatalogVersion'],1,2147483647)||
     !validCount(publishedCount,1,MAX_CATALOG)||
     !validCount(playerCount,1,MAX_PLAYER_HOUSES)||
     !Array.isArray(playerIds)||playerIds.length!==playerCount||
     new Set(playerIds).size!==playerIds.length||
     !playerIds.every(validId)||playerIds.includes('espiao'))
    return unavailable();

  // Verify BOTH private stages before consulting their collections.
  // Import completion is necessary but never sufficient for publication.
  const spyStage=db.collection('migrationSpyStage').doc(snapshotId);
  const domainStage=db.collection('migrationDomainStage').doc(snapshotId);
  const [spyRoot,domainRoot]=await Promise.all([spyStage.get(),domainStage.get()]);
  const spy=spyRoot.exists?spyRoot.data():null;
  const domain=domainRoot.exists?domainRoot.data():null;
  const sourceCount=spy?.['counts']?.['catalog'];
  const domainCount=domain?.['counts']?.['houses'];
  if(!spy||spy['status']!=='complete'||spy['private']!==true||
     !domain||domain['status']!=='complete'||domain['private']!==true||
     !validCount(sourceCount,publishedCount,MAX_CATALOG)||
     !validCount(domainCount,playerCount,MAX_CATALOG))
    return unavailable();

  // Queries are capped: do not scan arbitrary private Firestore collections.
  const [catalogSnapshot,houseSnapshot]=await Promise.all([
    spyStage.collection('catalog').limit(MAX_CATALOG+1).get(),
    domainStage.collection('houses').limit(MAX_CATALOG+1).get(),
  ]);
  if(catalogSnapshot.size!==sourceCount||houseSnapshot.size!==domainCount)
    return unavailable();

  const houses:PublicHouseCatalog['houses']=[];
  const seen=new Set<string>();
  for(const item of catalogSnapshot.docs){
    const d=item.data();
    const id=d?.['id'];
    const name=d?.['name'];
    const region=d?.['region'];
    const classification=d?.['classification'];
    if(!validId(id)||item.id!==id||seen.has(id)||
       !validName(name)||
       (region!==null&&region!==undefined&&!validName(region))||
       !CLASSIFICATIONS.has(classification)||
       typeof d?.['publicReviewed']!=='boolean')
      return unavailable();
    seen.add(id);
    if(d['publicReviewed']!==true)continue;
    houses.push({
      id,name,region:region??null,classification,
      // The imported minimal catalogue contains no reviewed media/text.
      // Omission is safer than publishing a private archive or inventing it.
      updated_at:null,gallery:[],narrative_text:null,
    });
  }
  if(houses.length!==publishedCount)return unavailable();

  const approvedIds=new Set(houses.map(h=>h.id));
  const availableSeasonHouses=new Set<string>();
  for(const entry of houseSnapshot.docs){
    const d=entry.data();
    const id=d?.['sourceId'];
    if(!validId(id)||!validName(d?.['name'])||
       typeof d?.['active']!=='boolean'||!Number.isSafeInteger(d?.['season']))
      return unavailable();
    if(d['active']===true&&d['season']===2)availableSeasonHouses.add(id);
  }
  if(playerIds.some(id=>!approvedIds.has(id)||!availableSeasonHouses.has(id)))
    return unavailable();

  houses.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')||a.id.localeCompare(b.id));
  const playerHouses=houses.filter(h=>playerIds.includes(h.id))
    .map(h=>({house_id:h.id}));
  if(playerHouses.length!==playerCount)return unavailable();
  return {houses,playerHouses};
}
