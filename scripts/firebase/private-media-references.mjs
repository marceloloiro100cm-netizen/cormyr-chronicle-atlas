import {createHash} from 'node:crypto';
const pathRe=/^private\/([a-f0-9]{64})\/([^/\u0000-\u001f\u007f]{1,128})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(png|jpg|webp|gif)$/i;
const hash=s=>createHash('sha256').update(s).digest('hex');
export class MediaReferenceError extends Error{
 constructor(code,status=403){super(code);this.code=code;this.status=status;}
}
const fail=(c,status=403)=>{throw new MediaReferenceError(c,status);};
export const imagePaths=content=>{
 if(typeof content!=='string')return [];
 return [...new Set([...content.matchAll(/\[cormyr-image:([A-Za-z0-9_./-]+)\|[^\]\r\n]*\]/g)]
   .map(m=>m[1]))];
};
export async function verifyMediaReferences({tx,root,snapshotId,uid,content,previous=null}){
 const paths=imagePaths(content);
 if(paths.length>16)fail('private_media_too_many',413);
 const old=new Set(imagePaths(previous));
 const fresh=paths.filter(p=>!old.has(p));
 const refs=fresh.map(path=>{
  const m=pathRe.exec(path);
  if(!m||m[1]!==snapshotId||m[2]!==uid)
   fail('private_media_reference_denied');
  return root.collection('privateMedia').doc(hash('private-media:'+path));
 });
 const docs=await Promise.all(refs.map(ref=>tx.get(ref)));
 for(let i=0;i<fresh.length;i++){
  const v=docs[i].data();
  if(!docs[i].exists||v?.path!==fresh[i]||
     v?.ownerUid!==uid||v?.sourceSnapshotId!==snapshotId||
     v?.status!=='ready')
    fail('private_media_reference_denied');
 }
}
