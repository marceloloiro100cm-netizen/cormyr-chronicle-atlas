/* Server-owned release of scheduled issues. A reader may trigger the check,
 * but can never supply the date or issue IDs. Each publication is a Firestore
 * transaction with the SAME weekly and commission gates as manual publishing.
 */
import {createHash} from 'node:crypto';
import {effectiveCloudCalendar} from '../../../scripts/firebase/cloud-operational-calendar.mjs';
import {validateHarptosDate,harptosKey} from '../../../scripts/firebase/stage-temporal-emulator.mjs';
import {validateEditorialContent} from '../../../scripts/firebase/cloud-editorial-content.mjs';
import {commissionIdsOf} from '../../../scripts/firebase/newspaper-core.mjs';
import {dateOrdinal} from './editing';

const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
export async function releaseDueNewspapers(db:any,snapshotId:string):Promise<number>{
 if(!/^[a-f0-9]{64}$/.test(snapshotId)||!db?.runTransaction)return 0;
 const runtime=db.collection('campaignCloudRuntime').doc(snapshotId);
 const stage=db.collection('migrationNewspaperRuntimeStage').doc(snapshotId);
 const time=db.collection('migrationTimeEngineStage').doc(snapshotId).collection('calendar').doc('current');
 const [root,source,clock]=await Promise.all([runtime.get(),stage.get(),time.get()]);
 const config=root.data();
 if(!root.exists||config?.status!=='active'||config.private!==true||
    config.sourceSnapshotId!==snapshotId||config.sourceSnapshotReconciled!==true||
    config.applicationEnabled!==true||config.newspaperWriteApproved!==true||
    !source.exists||source.data()?.status!=='complete'||source.data()?.private!==true||
    !clock.exists)return 0;
 const current=effectiveCloudCalendar(clock.data(),config,snapshotId);
 if(!validateHarptosDate(current?.year,current?.month,current?.day,current?.festival??null))
  return 0;
 const today=harptosKey(current.year,current.month,current.day,current.festival??null);
 const ordinal=dateOrdinal(today);
 if(ordinal===null)return 0;
 const collection=runtime.collection('publishedNewspapers');
 // A single-field Firestore index suffices; strict cap avoids expensive public reads.
 if(typeof collection.where!=='function')return 0;
 const due=await collection.where('state','==','draft').limit(101).get();
 if(due.docs.length>100)return 0;
 const candidates=due.docs.map((d:any)=>d.data())
  .filter((v:any)=>v?.source==='firebase-cloud'&&v.sourceSnapshotId===snapshotId&&
    typeof v.publishOn==='string'&&
    dateOrdinal(v.publishOn)!==null&&dateOrdinal(v.publishOn)!<=ordinal)
  .sort((a:any,b:any)=>String(a.publishOn).localeCompare(String(b.publishOn))||
    a.editionNo-b.editionNo).slice(0,30);
 let released=0;
 for(const candidate of candidates){
  const ref=collection.doc(candidate.id);
  const ok=await db.runTransaction(async(tx:any)=>{
   const [live,calendar,entry]=await Promise.all([
    tx.get(runtime),tx.get(time),tx.get(ref),
   ]);
   const settings=live.data(),v=entry.data();
   if(!live.exists||settings?.status!=='active'||settings.private!==true||
      settings.sourceSnapshotId!==snapshotId||settings.applicationEnabled!==true||
      settings.newspaperWriteApproved!==true||
      !entry.exists||v?.source!=='firebase-cloud'||v.sourceSnapshotId!==snapshotId||
      v.state!=='draft'||!v.publishOn)return false;
   const d=effectiveCloudCalendar(calendar.data(),settings,snapshotId);
   if(!validateHarptosDate(d?.year,d?.month,d?.day,d?.festival??null))
    return false;
   const nowOrdinal=dateOrdinal(harptosKey(d.year,d.month,d.day,d.festival??null));
   if(nowOrdinal===null||dateOrdinal(v.publishOn)===null||
      dateOrdinal(v.publishOn)!>nowOrdinal)return false;
   const round=Number.isSafeInteger(settings.openRound)?settings.openRound:null;
   if(settings.newspaperOneEditionPerWeek===true&&round!==null&&
      settings.newspaperLastPublishedRound===round)return false;
   // A draft with blank images or incomplete content must not circulate.
   try{validateEditorialContent({
    title:v.title,subtitle:v.subtitle,template:v.template,font_style:v.font_style,
    blocks:v.blocks,...(v.pdfPath?{pdfPath:v.pdfPath}:{}),
   });}catch{return false;}
   const commissions=commissionIdsOf(v.blocks);
   if(commissions.length>20||commissions.length&&
     (settings.newspaperCommissionsReadApproved!==true||
      settings.newspaperCommissionsWriteApproved!==true))return false;
   const refs=commissions.map((id:string)=>runtime.collection('newspaperCommissions').doc(id));
   const docs=await Promise.all(refs.map((r:any)=>tx.get(r)));
   if(docs.some((doc:any,i:number)=>!doc.exists||doc.data()?.id!==commissions[i]||
     !['pending','published'].includes(doc.data()?.state)||
     doc.data()?.sourceSnapshotId!==snapshotId||
     doc.data()?.state==='published'&&doc.data()?.newspaperId!==candidate.id))
    return false;
   const now=new Date().toISOString();
   const audit=runtime.collection('newspaperAudits')
    .doc('scheduled-'+digest(candidate.id+':'+v.publishOn));
   const existing=await tx.get(audit);
   if(existing.exists)return false;
   for(let i=0;i<docs.length;i++)if(docs[i].data().state==='pending'){
    tx.update(refs[i],{state:'published',newspaperId:v.id,publishedAt:now,seenAt:null});
    tx.create(runtime.collection('newspaperCommissionAudits')
      .doc(digest('published:'+v.id+':'+commissions[i])),{
       action:'newspaper_commission_published',
       commissionId:commissions[i],houseId:docs[i].data().houseId,
       editionId:v.id,actorUid:v.createdBy,occurredAt:now,
       sourceSnapshotId:snapshotId,
      });
   }
   const next={...v,state:'published',publishOn:null,publishedAt:now,
    version:v.version+1,updatedAt:now,
    ...(round!==null?{publishedRound:round}:{})};
   tx.update(ref,next);
   tx.create(audit,{action:'scheduled_publication',editionId:v.id,
    actorUid:v.createdBy,occurredAt:now,before:v,after:next,
    sourceSnapshotId:snapshotId});
   if(round!==null)tx.update(runtime,{newspaperLastPublishedRound:round});
   return true;
  });
  if(ok)released++;
 }
 return released;
}
