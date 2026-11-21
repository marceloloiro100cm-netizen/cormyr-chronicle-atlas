import {describe,it,expect} from 'vitest';
import {parseStaffPhotoInput} from './firebase-newspaper-staff-photo.server';
import {commitNewspaperStaffPhoto} from './firebase-newspaper-staff.server';

const snapshotId='a'.repeat(64);
const requestId='22222222-2222-4222-8222-222222222222';
const png=Buffer.from('89504e470d0a1a0a0000000000000000000000','hex');
const raw={action:'saveStaffPhoto',requestId,name:'Marco Licínio Crasso',
 specialty:'Correspondente de Guerra',bio:'',contentType:'image/png',dataBase64:png.toString('base64')};
const path=(id:string)=>`newspaper-staff/${snapshotId}/${id}/${requestId}.png`;

function memoryDb(){
 let stored:Record<string,unknown>|null=null;
 let writes=0,audits=0;
 const ref={key:'staff'};
 const db={
  collection:()=>({doc:()=>({collection:(kind:string)=>({
   doc:()=>kind==='newspaperEditorial'?ref:{key:'audit'},
  })})}),
  runTransaction:async(callback:(tx:Record<string,unknown>)=>Promise<unknown>)=>
   callback({
    get:async()=>({exists:stored!==null,data:()=>stored}),
    set:(_ref:unknown,value:Record<string,unknown>)=>{writes++;stored=value;},
    create:()=>{audits++;},
   }),
 };
 return {db,get state(){return stored;},get writes(){return writes;},get audits(){return audits;}};
}
describe('Fotografias da Redação no Firebase',()=>{
 it('aceita apenas imagem de tipo confirmado pelos bytes e limita tamanho',()=>{
  const photo=parseStaffPhotoInput(raw);
  expect(photo.ext).toBe('png');
  expect(photo.bytes).toEqual(png);
  expect(photo.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(()=>parseStaffPhotoInput({...raw,contentType:'image/jpeg'})).toThrow();
  expect(()=>parseStaffPhotoInput({...raw,dataBase64:Buffer.from('texto').toString('base64')})).toThrow();
  expect(()=>parseStaffPhotoInput({...raw,requestId:'../perigoso'})).toThrow();
  expect(()=>parseStaffPhotoInput({...raw,dataBase64:Buffer.alloc(5*1024*1024+1).toString('base64')})).toThrow();
 });
 it('cria funcionário com retrato, preserva acervo e é idempotente',async()=>{
  const store=memoryDb();
  const imported=[{id:'historico',name:'Funcionário original',specialty:'',bio:'',
   photo_path:'retrato-antigo.jpg',sort_order:0}];
  const input={requestId,photoPath:path(requestId),name:raw.name,specialty:raw.specialty,
   bio:raw.bio,sortOrder:1};
  const create=()=>commitNewspaperStaffPhoto({db:store.db,snapshotId,
   actorUid:'editor',imported,input});
  const first=await create();
  expect(first.id).toBe(requestId);
  expect(first.rows).toHaveLength(2);
  expect(first.rows[0]?.['photo_path']).toBe('retrato-antigo.jpg');
  expect(first.rows[1]?.['photo_path']).toBe(path(requestId));
  await create();
  expect(store.writes).toBe(1);
  expect(store.audits).toBe(1);
  await expect(commitNewspaperStaffPhoto({db:store.db,snapshotId,actorUid:'editor',
   imported,input:{...input,name:'Outro cadastro'}})).rejects.toMatchObject({status:409});
 });
 it('troca foto de funcionário existente sem substituir outros registros',async()=>{
  const store=memoryDb();
  const original=[{id:'historico',name:'Funcionário original',specialty:'Editor',bio:'texto',
   photo_path:'retrato-antigo.jpg',sort_order:0}];
  const saved=await commitNewspaperStaffPhoto({db:store.db,snapshotId,actorUid:'editor',
   imported:original,input:{id:'historico',requestId,photoPath:path('historico'),
    name:'Funcionário editado',specialty:'Editor',bio:'texto'}});
  expect(saved.rows).toHaveLength(1);
  expect(saved.rows[0]).toMatchObject({name:'Funcionário editado',photo_path:path('historico'),sort_order:0});
  await expect(commitNewspaperStaffPhoto({db:store.db,snapshotId,actorUid:'editor',
   imported:original,input:{id:'naoexiste',requestId,photoPath:path('naoexiste'),
    name:'Nome',specialty:'',bio:''}})).rejects.toMatchObject({status:404});
 });
});
