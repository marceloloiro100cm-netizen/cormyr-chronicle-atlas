/**
 * Anonymous calendar projection. Unlike the private Hub and the player's
 * region-scoped calendar, this publishes only events explicitly marked public
 * by the Narrator. A Firestore "published" field alone is NOT public consent.
 * No imported letters, House events, notes, drafts or unpublished snapshots.
 */
import type {Firestore} from 'firebase-admin/firestore';
import {parseEventDate} from '../../../scripts/firebase/cloud-schedule-events-core.mjs';
import {festivalOccurrence,fromAbsoluteDay,dateKeyOf,type HubFestival}
  from '../../../scripts/firebase/hub-temporal-core.mjs';

const HASH=/^[a-f0-9]{64}$/;
const safe=(x:unknown):x is Record<string,unknown>=>Boolean(x)&&typeof x==='object'&&!Array.isArray(x);
const valid=(x:unknown,min:number,max:number)=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=min&&x<=max;
const ready=(x:unknown)=>safe(x)&&x['status']==='complete'&&x['private']===true;
const rejected=():never=>{throw Error('public_calendar_unavailable');};

export type PublicDatedEvent={id:string;date:string;title:string;description?:string;scope:'kingdom'|'region';region:string|null};
type Reader={db:Firestore;projectId:string;snapshotId:string;year:number;enabled:boolean;env?:NodeJS.ProcessEnv};
export async function readApprovedPublicCalendarEvents(args:Reader):Promise<{year:number;events:PublicDatedEvent[]}>{
  const env=args.env??process.env;
  if(!args.enabled||args.projectId!=='cormyr'||!HASH.test(args.snapshotId)||
     !valid(args.year,1,9999)||env['FIRESTORE_EMULATOR_HOST']||env['FIREBASE_AUTH_EMULATOR_HOST'])
    return rejected();
  const db=args.db;
  const [domain,time,runtime]=await Promise.all([
    db.collection('migrationDomainStage').doc(args.snapshotId).get(),
    db.collection('migrationTimeEngineStage').doc(args.snapshotId).get(),
    db.collection('campaignCloudRuntime').doc(args.snapshotId).get(),
  ]);
  const live=runtime.data();
  if(!ready(domain.data())||!ready(time.data())||!runtime.exists||!safe(live)||
     live['status']!=='active'||live['private']!==true||
     live['sourceSnapshotId']!==args.snapshotId||
     live['sourceSnapshotReconciled']!==true||live['applicationEnabled']!==true||
     live['publicTimeApproved']!==true||
     !valid(live['publishedTimeVersion'],1,2147483647)||
     live['publishedTimeVersion']!==live['calendarVersion'])
    return rejected();
  const root=db.collection('campaignCloudRuntime').doc(args.snapshotId);
  const [schedule,festivals]=await Promise.all([
    root.collection('scheduleEvents').limit(1501).get(),
    root.collection('festivals').limit(1501).get(),
  ]);
  if(schedule.size>1500||festivals.size>1500)return rejected();
  const items:PublicDatedEvent[]=[];
  for(const doc of schedule.docs){
    const value=doc.data();
    const published=value?.['published'];
    if(!safe(published)||published['public']!==true||published['deleted']===true)continue;
    const date=parseEventDate(published['date']);
    if(!date||date.year!==args.year)continue;
    if(typeof published['title']!=='string'||!published['title'].trim()||
       published['title'].length>200||typeof value?.['id']!=='string'||
       !/^[A-Za-z0-9_-]{8,128}$/.test(value['id']))continue;
    const scope=published['scope']==='region'?'region':'kingdom';
    const region=scope==='region'?published['region']:null;
    if(scope==='region'&&region!=='1'&&region!=='2')continue;
    const description=published['description'];
    if(description!==undefined&&(typeof description!=='string'||description.length>5000))continue;
    items.push({id:'evento-'+value['id'],date:published['date'] as string,
      title:(published['title'] as string).trim(),...(description?{description:description as string}:{}),
      scope,region:scope==='region'?region as string:null});
  }
  for(const doc of festivals.docs){
    const f=doc.data();
    if(!f||f['public']!==true||f['deleted']===true||typeof f['name']!=='string'||
       f['name'].length>120||!f['name'].trim()||
       !['kingdom','region'].includes(f['scope'])||f['scope']==='region'&&!['1','2'].includes(f['region'])||
       !['yearly','once'].includes(f['repeat'])||!valid(f['durationDays'],1,30)||
       typeof f['id']!=='string'||!/^[A-Za-z0-9_-]{8,128}$/.test(f['id']))continue;
    const occurrence=festivalOccurrence(f as unknown as HubFestival,args.year);
    if(!occurrence)continue;
    for(let abs=occurrence.start;abs<occurrence.end;abs++){
      const date=fromAbsoluteDay(abs);
      if(date.year!==args.year)continue;
      const description=typeof f['description']==='string'&&f['description'].length<=5000?f['description']:'';
      items.push({id:'festival-'+f['id']+'-'+abs,date:dateKeyOf(date),
        title:'Festival · '+f['name'],...(description?{description}:{}),
        scope:f['scope'],region:f['scope']==='region'?f['region']:null});
    }
  }
  if(items.length>3000)return rejected();
  return {year:args.year,events:items};
}
