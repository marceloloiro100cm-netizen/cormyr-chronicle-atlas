import {createFileRoute} from '@tanstack/react-router';
import {publicContentFirestore}
  from '@/lib/public/firebase-public-content-admin.server';
import {readApprovedFirebasePublicCatalog}
  from '@/lib/public/firebase-public-content.server';

const HEADERS={
  'Cache-Control':'no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
};

/** Only a separately approved and reconciled Firebase public projection. */
async function readPublicCatalog():Promise<Response>{
  const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
  if(process.env['CORMYR_FIREBASE_PUBLIC_CATALOG_ENABLED']!=='true'||
     !/^[a-f0-9]{64}$/.test(snapshotId)||
     process.env['FIRESTORE_EMULATOR_HOST']||
     process.env['FIREBASE_AUTH_EMULATOR_HOST'])
    return Response.json({error:'Catálogo temporariamente indisponível'},
      {status:503,headers:HEADERS});
  try{
    const result=await readApprovedFirebasePublicCatalog({
      db:await publicContentFirestore(),snapshotId,
      enabled:true,projectId:'cormyr',
    });
    return Response.json(result,{status:200,headers:HEADERS});
  }catch{
    return Response.json({error:'Catálogo temporariamente indisponível'},
      {status:503,headers:HEADERS});
  }
}
export const Route=createFileRoute('/api/public/catalog')({
  server:{handlers:{GET:async()=>readPublicCatalog()}},
});
