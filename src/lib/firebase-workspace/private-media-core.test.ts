import {describe,it,expect} from 'vitest';
import {privateMediaHash,privateMediaRef,privateMediaTokens,
 privateMediaType,authorizeMediaTokens} from './private-media-core';
import {projectPrivateMailGallery} from './private-media-gallery';
const snap='a'.repeat(64);
const path='private/'+snap+'/alice/11111111-1111-4111-8111-111111111111.png';
const token='[cormyr-image:'+path+'|Retrato da corte]';
const root={
 collection:(_n:string)=>({doc:(id:string)=>({id})}),
};
const tx=(owner='alice')=>({
 get:async(ref:{id:string})=>({exists:ref.id===privateMediaHash('private-media:'+path),
  data:()=>({path,ownerUid:owner,sourceSnapshotId:snap,status:'ready',
   contentType:'image/png'})}),
});
describe('Item 11, isolamento de anexos privados',()=>{
 it('valida token sem URL arbitrária e reconhece MIME por assinatura',()=>{
  expect(privateMediaTokens('Texto\n'+token)).toEqual([path]);
  expect(privateMediaTokens('[cormyr-image:https://evil.test/x|bad]')).toEqual([]);
  const png=Buffer.from('89504e470d0a1a0a000000','hex');
  expect(privateMediaType('image/png')?.magic(png)).toBe(true);
  expect(privateMediaType('image/png')?.magic(Buffer.from('evil'))).toBe(false);
  expect(privateMediaType('image/svg+xml')).toBe(null);
  expect(privateMediaRef(root,path).id).toBe(privateMediaHash('private-media:'+path));
 });
 it('recusa token roubado, caminho externo e metadado não conciliado',async()=>{
  await authorizeMediaTokens(tx(),root,snap,'alice',token);
  await expect(authorizeMediaTokens(tx(),root,snap,'bob',token))
   .rejects.toThrow('private_media_path_invalid');
  await expect(authorizeMediaTokens(tx('bob'),root,snap,'alice',token))
   .rejects.toThrow('private_media_reference_denied');
  await expect(authorizeMediaTokens(tx(),root,snap,'alice',
   '[cormyr-image:https://evil.test/x|bad]')).resolves.toBeUndefined();
  await expect(authorizeMediaTokens(tx(),root,snap,'alice',
   '[cormyr-image:foreign/strange.png|bad]'))
   .rejects.toThrow('private_media_path_invalid');
 });
 it('permite manter a referência antiga durante revisão sem substituir arquivo',async()=>{
  await expect(authorizeMediaTokens(tx('bob'),root,snap,'alice',
   token,token)).resolves.toBeUndefined();
 });
 it('a galeria não cruza Casas nem mostra carta ainda não entregue',()=>{
  const input={id:'l1',origin_house_id:'house-a',recipient_house_id:'house-b',
   subject:'Torneio',content:token,publication_state:'delivered',
   delivered_at:'2026-11-20T02:00:00Z',deleted_at:null};
  const pending={...input,id:'l2',publication_state:'scheduled'};
  const other={...input,id:'l3',origin_house_id:'house-c',
   recipient_house_id:'house-d'};
  const reply={id:'r1',letter_id:'l1',author_user_id:'alice',
   content:token,publication_state:'delivered',
   delivered_at:'2026-11-20T02:03:00Z',deleted_at:null};
  const a=projectPrivateMailGallery('house-a',[input,pending,other],[reply],'alice');
  expect(a).toHaveLength(2);
  expect(a[0]).toMatchObject({sourceKind:'reply',direction:'sent'});
  expect(a[1]).toMatchObject({sourceKind:'letter',caption:'Retrato da corte',
   direction:'sent',subject:'Torneio'});
  expect(projectPrivateMailGallery('house-c',[input,pending,other],[],'alice'))
   .toHaveLength(1);
  expect(projectPrivateMailGallery('house-a',[pending,other],[],'alice'))
   .toEqual([]);
  const missingDeletedAt={...input};
  delete (missingDeletedAt as {deleted_at?:null}).deleted_at;
  expect(projectPrivateMailGallery('house-a',[missingDeletedAt],[],'alice'))
   .toHaveLength(1);
 });
 it('inclui imagens históricas entregues na galeria, sem cruzar Casas ou aceitar URLs',()=>{
   const legacy='legacy-owner/old-folder/portrait.png';
   const letter={id:'legacy-letter',origin_house_id:'house-a',
     recipient_house_id:'house-b',subject:'Correspondência',
     publication_state:'delivered',deleted_at:null,
     content:'[cormyr-image:'+legacy+'|Retrato histórico]',
     delivered_at:'2026-11-20T00:00:00Z'};
   const bad={...letter,id:'bad',content:'[cormyr-image:../../evil.png|x]'};
   expect(projectPrivateMailGallery('house-a',[letter,bad],[],'alice'))
     .toMatchObject([{path:legacy,sourceKind:'letter',caption:'Retrato histórico'}]);
   expect(projectPrivateMailGallery('house-c',[letter],[],'alice')).toEqual([]);
   expect(projectPrivateMailGallery('house-b',[{...letter,publication_state:'scheduled'}],[],'bob'))
     .toEqual([]);
 });

});
