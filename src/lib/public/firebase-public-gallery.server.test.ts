import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import type {Firestore} from 'firebase-admin/firestore';
import {
  PublicGalleryError,galleryDocId,readApprovedPublicGalleryImage,
  validPublicGalleryPath,type PublicGalleryBucket,
} from './firebase-public-gallery.server';

const SNAP='a'.repeat(64);
const PATH='public-house/house-a/portrait_01';
const BUCKET='cormyr-migration-homolog-477785088395';
const B=Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/n4sAAAAASUVORK5CYII=',
  'base64',
);
const DIGEST=createHash('sha256').update(B).digest('hex');
const runtime='campaignCloudRuntime/'+SNAP;
const stage='migrationPublicContentStage/'+SNAP;
const image=stage+'/gallery/'+galleryDocId(PATH);

type FixtureChanges={
  docs?:Record<string,unknown>;
  bytes?:Uint8Array;
  metadata?:{size:string|number;contentType:string};
  enabled?:boolean;
  bucketName?:string;
  env?:NodeJS.ProcessEnv;
};
function fixture(changes:FixtureChanges={}){
  const docs:Record<string,unknown>={
    [runtime]:{
      status:'active',private:true,sourceSnapshotId:SNAP,
      sourceSnapshotReconciled:true,applicationEnabled:true,
      publicGalleryApproved:true,publicGalleryBucket:BUCKET,
      galleryVersion:3,publishedGalleryVersion:3,
      accountUID:'DO_NOT_LEAK',
    },
    [stage]:{status:'complete',private:true,sourceSnapshotId:SNAP},
    [image]:{
      status:'approved',publicReviewed:true,sourceSnapshotId:SNAP,
      version:3,path:PATH,bucketName:BUCKET,
      storagePath:'campaign-images/'+PATH,
      sha256:DIGEST,sizeBytes:B.length,contentType:'image/png',
      privateNotes:'DO_NOT_LEAK',
    },
    ...(changes.docs??{}),
  };
  const reads:string[]=[];
  const objects:string[]=[];
  let downloads=0;
  const doc=(path:string):any=>({
    get:async()=>{
      reads.push(path);
      return {exists:docs[path]!=null,data:()=>docs[path]??undefined};
    },
    collection:(name:string)=>({doc:(id:string)=>doc(path+'/'+name+'/'+id)}),
  });
  const db={collection:(name:string)=>({
    doc:(id:string)=>doc(name+'/'+id),
  })} as unknown as Firestore;
  const bytes=changes.bytes??B;
  const storage:PublicGalleryBucket={
    file:(path:string)=>{
      objects.push(path);
      return {
        getMetadata:async()=>[changes.metadata??{
          size:B.length,contentType:'image/png',
        }],
        download:async()=>{downloads++;return [bytes];},
      };
    },
  };
  const opts={
    db,bucket:storage,enabled:changes.enabled??true,
    bucketName:changes.bucketName??BUCKET,
    snapshotId:SNAP,projectId:'cormyr',env:changes.env??{},
  };
  return {
    reads,objects,docs,opts,
    downloads:()=>downloads,
    run:(path:unknown=PATH)=>readApprovedPublicGalleryImage(opts,path),
  };
}
async function denied(p:Promise<unknown>,status:404|503){
  await expect(p).rejects.toMatchObject({
    name:'PublicGalleryError',status,
  } satisfies Partial<PublicGalleryError>);
}

describe('Firebase-only public gallery image policy',()=>{
  it('serves only reviewed, verified bytes from the exact migrated path',async()=>{
    const f=fixture();
    const result=await f.run();
    expect(result.contentType).toBe('image/png');
    expect(Buffer.from(result.data)).toEqual(B);
    expect(f.objects).toEqual(['campaign-images/'+PATH]);
    expect(f.reads).toEqual([runtime,stage,image]);
    expect(JSON.stringify(result)).not.toContain('DO_NOT_LEAK');
  });

  it('denies invalid or traversing paths before reading any data',async()=>{
    for(const path of ['',undefined,'public-house/house-a/../secret',
      'public-house/%2e%2e/asset','public-house/h/a.svg',
      'public-house/h/a/b','public-house/h/é']){
      const f=fixture();
      await denied(f.run(path),404);
      expect(f.reads).toHaveLength(0);
      expect(f.objects).toHaveLength(0);
    }
    expect(validPublicGalleryPath(PATH)).toBe(true);
  });

  it('does not access Firestore without explicit enablement',async()=>{
    const f=fixture({enabled:false});
    await denied(f.run(),503);
    expect(f.reads).toHaveLength(0);
  });

  it('never uses emulator credentials in a Cloud reader',async()=>{
    const f=fixture({env:{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'}});
    await denied(f.run(),503);
    expect(f.reads).toHaveLength(0);
  });

  it('requires exact runtime publication and bucket agreement',async()=>{
    for(const patch of [
      {publicGalleryApproved:false},
      {sourceSnapshotReconciled:false},
      {applicationEnabled:false},
      {galleryVersion:4},
      {publicGalleryBucket:'cormyr-other-private'},
      {private:false},
    ]){
      const baseline=fixture();
      const f=fixture({docs:{[runtime]:{...(baseline.docs[runtime] as object),...patch}}});
      await denied(f.run(),503);
      expect(f.objects).toHaveLength(0);
    }
  });

  it('rejects incomplete public staging or missing image documents',async()=>{
    const f=fixture({docs:{[stage]:{status:'pending',private:true,
      sourceSnapshotId:SNAP}}});
    await denied(f.run(),503);
    const g=fixture({docs:{[image]:null}});
    await denied(g.run(),404);
    expect(g.objects).toHaveLength(0);
  });

  it('rejects unreviewed, remapped, stale or oversized image metadata',async()=>{
    for(const patch of [
      {publicReviewed:false},
      {version:2},
      {path:'public-house/other/portrait_01'},
      {storagePath:'private/accounts'},
      {sha256:'wrong'},
      {sizeBytes:4*1024*1024+1},
      {contentType:'image/svg+xml'},
      {bucketName:'cormyr-other-private'},
    ]){
      const baseline=fixture();
      const f=fixture({docs:{[image]:{...(baseline.docs[image] as object),...patch}}});
      await denied(f.run(),404);
      expect(f.objects).toHaveLength(0);
    }
  });

  it('rejects object size, mime, magic bytes and integrity mismatches',async()=>{
    const f=fixture({metadata:{size:4*1024*1024+1,contentType:'image/png'}});
    await denied(f.run(),503);
    expect(f.downloads()).toBe(0);
    const wrongMime=fixture({metadata:{size:B.length,contentType:'image/svg+xml'}});
    await denied(wrongMime.run(),503);
    const html=fixture({bytes:Buffer.from('<html>attack</html>')});
    await denied(html.run(),503);
    const changed=Buffer.from(B);
    changed[changed.length-1]^=1;
    const wrongHash=fixture({bytes:changed});
    await denied(wrongHash.run(),503);
  });

  it('does not reintroduce the Supabase gallery RPC or direct origin download',()=>{
    const route=readFileSync(new URL('../../routes/api/public/gallery-image.ts',import.meta.url),'utf8');
    expect(route).not.toMatch(/supabase|can_read_public_gallery_image|\/storage\/v1\//i);
    expect(route).toContain('readApprovedPublicGalleryImage');
    expect(route).toContain('CORMYR_FIREBASE_PUBLIC_GALLERY_ENABLED');
  });
});
