import {createFileRoute} from '@tanstack/react-router';
import {publicContentFirestore}
  from '@/lib/public/firebase-public-content-admin.server';
import {readApprovedFirebasePublicTranslations}
  from '@/lib/public/firebase-public-content.server';

const SUPPORTED=['en','es','de'];
const HEADERS={
  'Cache-Control':'no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
};

/** Firebase-only; no archive, narrator text or translation DB is public by default. */
async function readPublicTranslations(request:Request):Promise<Response>{
  const params=new URL(request.url).searchParams;
  const locale=params.get('locale');
  if(params.size!==1||!locale||!SUPPORTED.includes(locale))
    return Response.json({error:'Idioma inválido'},
      {status:400,headers:HEADERS});
  const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
  if(process.env['CORMYR_FIREBASE_PUBLIC_TRANSLATIONS_ENABLED']!=='true'||
     !/^[a-f0-9]{64}$/.test(snapshotId)||
     process.env['FIRESTORE_EMULATOR_HOST']||
     process.env['FIREBASE_AUTH_EMULATOR_HOST'])
    return Response.json({error:'Traduções indisponíveis'},
      {status:503,headers:HEADERS});
  try{
    const result=await readApprovedFirebasePublicTranslations({
      db:await publicContentFirestore(),snapshotId,
      enabled:true,projectId:'cormyr',locale,
    });
    return Response.json(result,{status:200,headers:HEADERS});
  }catch{
    return Response.json({error:'Traduções indisponíveis'},
      {status:503,headers:HEADERS});
  }
}
export const Route=createFileRoute('/api/public/translations')({
  server:{handlers:{GET:async({request})=>readPublicTranslations(request)}},
});
