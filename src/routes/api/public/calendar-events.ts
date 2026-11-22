import {createFileRoute} from '@tanstack/react-router';
import {readApprovedPublicCalendarEvents} from '@/lib/calendar/firebase-public-events.server';
import {crossOriginRejected} from '@/lib/server/request-origin';

const HEADERS={'Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff'};
const unavailable=()=>Response.json({error:'Calendário público indisponível'},{status:503,headers:HEADERS});
async function handle(request:Request):Promise<Response>{
  const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
  const url=new URL(request.url);
  const value=url.searchParams.get('year');
  if(url.searchParams.size!==1||value===null||!/^[1-9]\d{0,3}$/.test(value)||
     request.headers.has('cookie')||crossOriginRejected(request))
    return Response.json({error:'Consulta inválida'},{status:400,headers:HEADERS});
  const year=Number(value);
  if(process.env['CORMYR_FIREBASE_PUBLIC_TIME_ENABLED']!=='true'||
     !/^[a-f0-9]{64}$/.test(snapshotId)||process.env['FIRESTORE_EMULATOR_HOST']||
     process.env['FIREBASE_AUTH_EMULATOR_HOST'])
    return unavailable();
  try{
    const [{applicationDefault,getApps,initializeApp},{getFirestore}]=await Promise.all([
      import('firebase-admin/app'),import('firebase-admin/firestore')]);
    const name='cormyr-public-calendar';
    const app=getApps().find(x=>x.name===name)??initializeApp({
      credential:applicationDefault(),projectId:'cormyr'},name);
    const value=await readApprovedPublicCalendarEvents({
      db:getFirestore(app),snapshotId,year,projectId:'cormyr',enabled:true});
    return Response.json(value,{status:200,headers:HEADERS});
  }catch{return unavailable();}
}
export const Route=createFileRoute('/api/public/calendar-events')({
  server:{handlers:{GET:async({request})=>handle(request)}},
});
