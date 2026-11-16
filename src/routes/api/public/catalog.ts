import {createFileRoute} from '@tanstack/react-router';
import {readApprovedFirebaseHouseCatalog}
  from '@/lib/house/firebase-public-house-catalog.server';

const HEADERS={
  'Cache-Control':'no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
};

/**
 * Firebase-only public catalogue. An imported private record is NEVER
 * published merely because its original source was marked public.
 * Publication also requires explicit runtime approval and exact counts.
 */
async function getPublicCatalog(request:Request):Promise<Response>{
  const error=()=>Response.json({error:'Catálogo temporariamente indisponível'},
    {status:503,headers:HEADERS});
  const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
  if(process.env['CORMYR_FIREBASE_PUBLIC_CATALOG_ENABLED']!=='true'||
     !/^[a-f0-9]{64}$/.test(snapshotId)||
     process.env['FIRESTORE_EMULATOR_HOST']||
     process.env['FIREBASE_AUTH_EMULATOR_HOST'])
    return error();
  // A public catalogue has no caller-selected snapshot, House or role.
  // Reject arbitrary query parameters rather than providing a back door.
  if(new URL(request.url).search)return Response.json(
    {error:'Parâmetros não permitidos'},{status:400,headers:HEADERS});
  try{
    const [{initializeApp,getApps,applicationDefault},{getFirestore}]=
      await Promise.all([
        import('firebase-admin/app'),import('firebase-admin/firestore'),
      ]);
    const name='cormyr-public-house-catalog';
    const app=getApps().find(item=>item.name===name)??initializeApp({
      credential:applicationDefault(),projectId:'cormyr',
    },name);
    const catalog=await readApprovedFirebaseHouseCatalog({
      db:getFirestore(app),snapshotId,projectId:'cormyr',enabled:true,
    });
    return Response.json(catalog,{status:200,headers:HEADERS});
  }catch{
    // No IAM details, private stage names, snapshots or identities in errors.
    return error();
  }
}

export const Route=createFileRoute('/api/public/catalog')({
  server:{handlers:{GET:async({request})=>getPublicCatalog(request)}},
});
