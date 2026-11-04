import {describe,it,expect} from 'vitest';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {acquiredFirst} from '@/lib/house/acquired-first';
import {spyPortraitManifest,resolveSpyPortraitImageUrl} from '@/lib/espionage/spy-portrait-manifest';
const src=(name:string)=>readFileSync(resolve(name),'utf8');
describe('Galeria do Drive, criação de unidades e construções adquiridas primeiro',()=>{
 it('mantém ordem original entre adquiridas e não adquiridas',()=>{
  const items=[{id:'a'},{id:'b'},{id:'c'},{id:'d'},{id:'e'}];
  expect(acquiredFirst(items,new Set(['d','b'])).map(x=>x.id))
   .toEqual(['b','d','a','c','e']);
  expect(items.map(x=>x.id)).toEqual(['a','b','c','d','e']);
  expect(acquiredFirst(items,new Set()).map(x=>x.id)).toEqual(['a','b','c','d','e']);
  expect(acquiredFirst(items,new Set(items.map(x=>x.id))).map(x=>x.id))
   .toEqual(['a','b','c','d','e']);
 });
 it('aplica a mesma ordenação a todos os catálogos e instalações militares',()=>{
  const catalog=src('src/components/house/asset-catalog.tsx');
  const military=src('src/components/house/military-assets.tsx');
  expect(catalog).toContain('acquiredFirst(visible,acquiredIds)');
  expect(catalog).toContain('for(const domain of state.domains)');
  expect(catalog).toContain('acquiredIds.add(domain.terrain)');
  expect(catalog).toContain('acquiredIds.add(domain.community)');
  expect(catalog).toContain('acquiredIds.add(feature)');
  expect(military).toContain('acquiredFirst(militaryItems,acquiredIds)');
  expect(military).toContain('orderedItems.map(item');
 });
 it('Criar unidade abre modal centralizado sem formulário no final da página',()=>{
  const army=src('src/components/house/army.tsx');
  expect(army).toContain('<Dialog open={open}');
  expect(army).toContain('<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">');
  expect(army).toContain('<DialogTitle>Criar unidade</DialogTitle>');
  expect(army).toContain('<Button onClick={()=>setOpen(true)}>');
  expect(army).toContain('onSubmit={async e=>{e.preventDefault();const first=UNIT_TYPES');
  expect(army).toContain('if(await onCreate({unit})){setOpen(false)');
  expect(army).toContain('Cancelar');
 });
 it('configura 20 profissões, sem incluir a imagem de referência',()=>{
  expect(spyPortraitManifest).toHaveLength(20);
  expect(new Set(spyPortraitManifest.map(p=>p.id)).size).toBe(20);
  expect(spyPortraitManifest.some(p=>/referencia/i.test(p.label))).toBe(false);
  expect(spyPortraitManifest.every(p=>p.src.startsWith('https://'))).toBe(true);
  expect(spyPortraitManifest.map(p=>p.sort))
   .toEqual(Array.from({length:20},(_,i)=>i+1));
  const sql=src('docs/espionage/sql/0098_populate_spy_portraits_from_drive.sql');
  for(const p of spyPortraitManifest){
   expect(sql).toContain("'"+p.id+"'");
   expect(sql).toContain(p.src);
  }
 });
 it('hospeda os vinte retratos no próprio site e preserva a seleção por Casa',()=>{
  const local=spyPortraitManifest.filter(p=>p.kind==='local');
  expect(local).toHaveLength(20);
  expect(local.some(p=>p.src.includes('drive.google.com'))).toBe(false);
  for(const p of local){
   expect(p.src).toBe('https://cormyr-chronicle-atlas.lovable.app/spy-portraits/'+p.id.slice('espiao-'.length)+'.jpg');
   expect(existsSync(resolve('public/spy-portraits/'+p.id.slice('espiao-'.length)+'.jpg'))).toBe(true);
  }
  const picker=src('src/components/house/espionage/spy-portrait-picker.tsx');
  expect(picker).toContain("onError={()=>setAttempt");
  expect(picker).toContain("if(!source)return <UserRound");
  expect(picker).toContain("disabled={used}");
 });
 it('substitui os cinco links legados pelo arquivo local sem mexer nos retratos personalizados',()=>{
  const legacy='https://drive.google.com/thumbnail?id=legacy&sz=w400';
  for(const id of ['espiao-tillet','espiao-cortesa','espiao-vigia','espiao-guarda','espiao-ladrao']){
   expect(resolveSpyPortraitImageUrl(id,legacy)).toBe(spyPortraitManifest.find(p=>p.id===id)?.src);
  }
  expect(resolveSpyPortraitImageUrl('espiao-personalizado',legacy)).toBe(legacy);
  const server=src('src/lib/espionage/spy-management.functions.ts');
  const browser=src('src/lib/espionage/spy-browser-client.ts');
  expect(server).toContain('imageUrl:resolveSpyPortraitImageUrl(p.id,p.imageUrl)');
  expect(browser).toContain('imageUrl:resolveSpyPortraitImageUrl(p.id,p.imageUrl)');
 });
});
