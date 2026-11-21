/**
 * GET-only smoke check of the already public newspaper API.
 * Reports only HTTP statuses, MIME type and equality to a known published
 * image checksum. Never logs user data, private paths or image bytes.
 */
import {createHash} from 'node:crypto';
const ORIGIN='https://atlas.cormyr.com.br';
const EXPECTED='84fcfd2ce77a34aae2d1b14f58f10053fe732764d6ef56cc8629277e1058b83f';
const request=async path=>{
 if(typeof path!=='string'||!path.startsWith('/api/public/newspaper')||
    path.startsWith('//')||path.includes('#'))throw Error('unexpected_public_path');
 const url=new URL(path,ORIGIN);
 if(url.origin!==ORIGIN)throw Error('unexpected_public_origin');
 return fetch(url,{method:'GET',redirect:'error',headers:{'Cache-Control':'no-cache','Accept':'*/*'},
   signal:AbortSignal.timeout(15000)});
};
const print=(name,value)=>{
 const safe=String(value);
 if(!/^[a-zA-Z0-9_,.:/-]{1,90}$/.test(safe))throw Error('invalid_log_value');
 console.log('PUBLIC_JORNAL_'+name+'='+safe);
};
try{
 const list=await request('/api/public/newspaper');
 print('LIST_HTTP',list.status);
 if(list.status!==200)process.exit(2);
 const catalog=await list.json();
 const issues=Array.isArray(catalog?.items)?catalog.items.filter(x=>x?.editionNo===1):[];
 print('ISSUE_ONE_COUNT',issues.length);
 if(issues.length!==1)process.exit(2);
 const id=issues[0]?.id;
 if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id))process.exit(2);
 const edition=await request('/api/public/newspaper?edicao='+encodeURIComponent(id));
 print('EDITION_HTTP',edition.status);
 if(edition.status!==200)process.exit(2);
 const entry=await edition.json();
 const images=Array.isArray(entry?.blocks)?entry.blocks.filter(b=>b?.type==='image'&&
   typeof b?.imageSrc==='string'&&/^\/api\/public\/newspaper-image\?edition=[A-Za-z0-9_-]{1,128}&index=(?:0|[1-7]?[0-9])$/.test(b.imageSrc)):[];
 print('IMAGE_URL_COUNT',images.length);
 if(images.length!==1)process.exit(2);
 const image=await request(images[0].imageSrc);
 print('IMAGE_HTTP',image.status);
 print('IMAGE_CONTENT_TYPE',image.headers.get('content-type')?.split(';')[0]??'unknown');
 if(image.status!==200)process.exit(2);
 const bytes=Buffer.from(await image.arrayBuffer());
 print('IMAGE_SHA256_MATCH',createHash('sha256').update(bytes).digest('hex')===EXPECTED?'yes':'no');
 if(createHash('sha256').update(bytes).digest('hex')!==EXPECTED)process.exit(2);
 console.log('PUBLIC_JORNAL_RESULT=VERIFIED');
}catch(_){
 console.error('PUBLIC_JORNAL_RESULT=UNAVAILABLE_OR_TIMEOUT');
 process.exitCode=2;
}
