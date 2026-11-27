import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {newHouseState} from '@/lib/house/types';
import {setCustomImage,customImageFor,CUSTOM_IMAGE_MAX_CHARS} from '@/lib/house/custom-images';
import {applyHouseNonEconomicOperation,HOUSE_NON_ECONOMIC_ACTIONS} from '@/lib/house/operation-core';
import {applyStaffOperation,parseStaffOperation} from '@/lib/newspaper/firebase-newspaper-staff.server';
import {publicBlocks,publicStaff} from '@/lib/newspaper/firebase-public-newspaper.server';
import {parseArchiveHouses,resolveVassalHouse} from '@/lib/house/public-archive-houses';

const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('Ajustes de 20/11/2026: imagens próprias de espiões e unidades',()=>{
 it('grava e remove o retrato do espião sem tocar em recursos',()=>{
  const state=newHouseState('casa-a');
  const next=setCustomImage(state,{target:'spy',id:'5d3c9a8e-1111-4c4c-8888-aaaaaaaaaaaa',image:PNG});
  expect(customImageFor(next,'spy','5d3c9a8e-1111-4c4c-8888-aaaaaaaaaaaa')).toBe(PNG);
  expect(next.base).toEqual(state.base);
  expect(state.customImages).toBeUndefined();
  const cleared=setCustomImage(next,{target:'spy',id:'5d3c9a8e-1111-4c4c-8888-aaaaaaaaaaaa',image:''});
  expect(customImageFor(cleared,'spy','5d3c9a8e-1111-4c4c-8888-aaaaaaaaaaaa')).toBeNull();
 });
 it('recusa imagens fora do formato, grandes demais ou de unidade inexistente',()=>{
  const state=newHouseState('casa-a');
  expect(()=>setCustomImage(state,{target:'spy',id:'x1',image:'javascript:alert(1)'})).toThrow();
  expect(()=>setCustomImage(state,{target:'spy',id:'x1',image:'data:image/svg+xml;base64,AAAA'})).toThrow();
  expect(()=>setCustomImage(state,{target:'spy',id:'x1',
   image:'data:image/png;base64,'+'A'.repeat(CUSTOM_IMAGE_MAX_CHARS)})).toThrow();
  expect(()=>setCustomImage(state,{target:'unit',id:'nao-existe',image:PNG})).toThrow(/Unidade/);
 });
 it('é uma operação não econômica da Ficha',()=>{
  expect(HOUSE_NON_ECONOMIC_ACTIONS).toContain('custom_image');
  const r=applyHouseNonEconomicOperation(newHouseState('casa-a'),'custom_image',
   {target:'spy',id:'agente-1',image:PNG},'');
  expect(customImageFor(r.state,'spy','agente-1')).toBe(PNG);
 });
});

describe('Ajustes de 20/11/2026: Redação da Folha no Firebase',()=>{
 const rows=[
  {id:'a',name:'Ana',specialty:'Repórter',bio:'',photo_path:'foto-a.jpg',sort_order:0,created_at:'',updated_at:''},
  {id:'b',name:'Bia',specialty:'Gravurista',bio:'',photo_path:null,sort_order:1,created_at:'',updated_at:''},
  {id:'c',name:'Caio',specialty:'',bio:'',photo_path:null,sort_order:2,created_at:'',updated_at:''},
 ];
 it('reordena a equipe inteira de uma vez',()=>{
  const op=parseStaffOperation('newspaper_staff_reorder',{p_ids:['c','a','b']});
  const next=applyStaffOperation(rows,op,'2026-11-20T00:00:00Z');
  expect(next.map(r=>[r['id'],r['sort_order']])).toEqual([['c',0],['a',1],['b',2]]);
 });
 it('recusa ordem incompleta ou com repetidos',()=>{
  expect(()=>parseStaffOperation('newspaper_staff_reorder',{p_ids:['a','a']})).toThrow();
  const op=parseStaffOperation('newspaper_staff_reorder',{p_ids:['a','b']});
  expect(()=>applyStaffOperation(rows,op,'x')).toThrow();
 });
 it('edita texto preservando a foto e cria funcionário sem foto',()=>{
  const edit=parseStaffOperation('newspaper_staff_save',{p_id:'a',p_name:'Ana Lúcia',p_specialty:'Editora',
   p_bio:'Texto',p_photo_path:'foto-a.jpg'});
  expect(applyStaffOperation(rows,edit,'t').find(r=>r['id']==='a')).toMatchObject({name:'Ana Lúcia',photo_path:'foto-a.jpg'});
  const add=parseStaffOperation('newspaper_staff_save',{p_name:'Duda',p_specialty:'',p_bio:'',p_photo_path:null});
  const next=applyStaffOperation(rows,add,'t',()=>'novo');
  expect(next.at(-1)).toMatchObject({id:'novo',name:'Duda',sort_order:3,photo_path:null});
 });
});

describe('Ajustes de 20/11/2026: jornal no site aberto',()=>{
 it('remove caminhos privados de imagem e mantém só imagens públicas do site',()=>{
  const blocks=publicBlocks([
   {id:'1',type:'article',text:'Notícia',imagePath:'privado/foto.png'},
   {id:'2',type:'image',imageSrc:'/newspaper/gravuras/porto.webp'},
   {id:'3',type:'image',imageSrc:'https://exemplo.com/x.png'},
  ]);
  expect(blocks[0]).not.toHaveProperty('imagePath');
  expect(blocks[1]?.['imageSrc']).toBe('/newspaper/gravuras/porto.webp');
  expect(blocks[2]).not.toHaveProperty('imageSrc');
 });
 it('não revela o caminho privado de gravuras da edição ao público',()=>{
  const blocks=publicBlocks([
   {type:'headline',text:'Folha Sem Selo'},
   {type:'image',imagePath:'editor/archive/gravura.png',caption:'Gravura'},
  ],'edition-one');
  expect(blocks[1]?.['imageSrc'])
   .toBe('/api/public/newspaper-image?edition=edition-one&index=1');
  expect(JSON.stringify(blocks)).not.toContain('editor/archive');
  expect(blocks[1]).not.toHaveProperty('imagePath');
 });
 it('a equipe pública não expõe fotos privadas e respeita a ordem',()=>{
  const staff=publicStaff([{id:'b',name:'Bia',specialty:'',bio:'',photo_path:'x.jpg',sort_order:1},
   {id:'a',name:'Ana',specialty:'',bio:'',sort_order:0}]);
  expect(staff.map(s=>s.id)).toEqual(['a','b']);
  expect(staff[0]).not.toHaveProperty('photo_path');
 });
 it('o site aberto tem o item Jornal acima da Constituição e se chama Atlas de Cormyr',()=>{
  const html=readFileSync('public/cormyr/index.html','utf8');
  expect(html.indexOf('data-view="jornal"')).toBeGreaterThan(0);
  expect(html.indexOf('data-view="jornal"')).toBeLessThan(html.indexOf('data-view="constituicao"'));
  expect(html).toContain('<title>Atlas de Cormyr</title>');
  expect(html).not.toContain('Cormyr <em>Web</em>');
 });
});

describe('Ajustes de 20/11/2026: brasão da vassala pelo cadastro público',()=>{
 const archive=parseArchiveHouses('window.CORMYR_DATA = '+JSON.stringify({regions:[{name:'Dragon Coast',houses:[
  {name:'Qazir',region:'Dragon Coast',crest:'assets/dragoncoast-qazir.webp',castle:'Torre',leader:'Lady Q',nobleId:'qazir'},
 ]}]})+';');
 it('lê nome, brasão, sede e titular do cadastro público',()=>{
  expect(archive).toEqual([{id:'qazir',name:'Qazir',region:'Dragon Coast',
   crest:'/cormyr/assets/dragoncoast-qazir.webp',castle:'Torre',lord_name:'Lady Q'}]);
 });
 it('completa a vassala quando a sessão não traz a Casa (por id ou por nome)',()=>{
  expect(resolveVassalHouse('qazir','Qazir',[],archive)?.crest).toBe('/cormyr/assets/dragoncoast-qazir.webp');
  expect(resolveVassalHouse('id-legado','Casa Qazir',[],archive)?.name).toBe('Qazir');
  expect(resolveVassalHouse('qazir','Qazir',[{id:'qazir',name:'Qazir',crest:null}],archive)?.crest)
   .toBe('/cormyr/assets/dragoncoast-qazir.webp');
 });
});
