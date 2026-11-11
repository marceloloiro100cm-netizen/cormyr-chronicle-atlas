import {describe,expect,it} from 'vitest';
import {
 createNewspaperLayout,makeNewspaperBlock,newspaperIsUnread,newspaperResize,
 safeNewspaperBlocks,validateNewspaperEdition,reorderNewspaperBlocks,
 duplicateNewspaperBlock,insertNewspaperBlockBefore,type NewspaperEdition,
} from './model';

const published={
 id:'00000000-0000-4000-8000-000000000001',edition_no:1,
 campaign_date:'1522-01-01',title:'Gazeta de Cormyr',subtitle:'',
 template:'classico',font_style:'classico',state:'published',blocks:[],
 pdf_path:null,version:2,publication_revision:2,created_by:'user',updated_at:'',published_at:'',
 archived_at:null,cancelled_at:null,
} as NewspaperEdition;
describe('Jornal de Cormyr',()=>{
 it('traz três modelos com blocos ajustáveis sem HTML inseguro',()=>{
  for(const layout of ['classico','guerra','gazeta'] as const){
   const blocks=createNewspaperLayout(layout);
   expect(blocks.length).toBeGreaterThanOrEqual(3);
   expect(blocks.every(b=>b.span>=3&&b.span<=12)).toBe(true);
  }
 });
 it('preserva largura e altura dentro dos limites após arrastar a alça',()=>{
  const block=makeNewspaperBlock('image');
  const large=newspaperResize(block,10000,10000,30);
  expect(large).toEqual({span:12,height:800});
  const small=newspaperResize(block,-10000,-10000,30);
  expect(small).toEqual({span:3,height:90});
 });
 it('trata blocos antigos ou inválidos sem executar marcação fornecida',()=>{
  const values=safeNewspaperBlocks([{id:'a',type:'article',text:'<script>texto</script>',span:99,height:-100},
   {type:'desconhecido',text:null,span:NaN,height:0},null]);
  expect(values).toHaveLength(2);
  expect(values[0]?.span).toBe(12);
  expect(values[0]?.height).toBe(90);
  expect(values[0]?.text).toContain('<script>');
  expect(values[1]?.type).toBe('article');
 });
 it('permite arrastar, inserir e duplicar elementos sem modificar o objeto original',()=>{
  const a=makeNewspaperBlock('headline'),b=makeNewspaperBlock('article'),c=makeNewspaperBlock('notice');
  const blocks=[a,b,c];
  const reordered=reorderNewspaperBlocks(blocks,c.id,a.id);
  expect(reordered.map(x=>x.id)).toEqual([c.id,a.id,b.id]);
  expect(blocks.map(x=>x.id)).toEqual([a.id,b.id,c.id]);
  expect(reorderNewspaperBlocks(blocks,'missing',a.id)).toEqual(blocks);
  const inserted=insertNewspaperBlockBefore(blocks,'notice',b.id);
  expect(inserted.map(x=>x.type)).toEqual(['headline','notice','article','notice']);
  const clone=duplicateNewspaperBlock(c);
  expect(clone).toEqual({...c,id:clone.id});
  expect(clone.id).not.toBe(c.id);
 });
 it('reaproveita filtros de gravura, selos e assinatura sem executar HTML',()=>{
  const block=makeNewspaperBlock('notice');
  expect(block.icon).toBe('⚜');
  const image=makeNewspaperBlock('image');
  expect(image.imageStyle).toBe('vintage');
  expect(image.autoHeight).toBe(true);
  const parsed=safeNewspaperBlocks([{id:'a',type:'image',text:'',imageStyle:'woodcut',autoHeight:false,span:5,height:190,
    caption:'Fotografia antiga'},
   {id:'b',type:'article',text:'Crônica',byline:'Escriba de Arabel',span:6,height:190},
   {id:'c',type:'notice',text:'Decreto',icon:'<script>',span:6,height:160}]);
  expect(parsed[0]?.imageStyle).toBe('woodcut');
  expect(parsed[0]?.autoHeight).toBe(false);
  expect(parsed[1]?.byline).toBe('Escriba de Arabel');
  expect(parsed[2]?.icon).toBeUndefined();
 });
 it('notifica nova edição e alterações até leitura da versão atual',()=>{
  expect(newspaperIsUnread(published)).toBe(true);
  expect(newspaperIsUnread(published,{newspaper_id:published.id,user_id:'u',read_version:1,read_at:''})).toBe(true);
  expect(newspaperIsUnread(published,{newspaper_id:published.id,user_id:'u',read_version:2,read_at:''})).toBe(false);
  expect(newspaperIsUnread({...published,version:3},{newspaper_id:published.id,user_id:'u',read_version:2,read_at:''})).toBe(false);
  expect(newspaperIsUnread({...published,state:'cancelled'})).toBe(false);
  expect(newspaperIsUnread({...published,state:'archived'})).toBe(true);
 });
 it('exige data oficial válida e conteúdo editorial para publicar',()=>{
  expect(validateNewspaperEdition({...published,campaign_date:'1522-99-42'})).toMatch(/data/);
  expect(validateNewspaperEdition(published)).toMatch(/Adicione/);
  expect(validateNewspaperEdition({...published,blocks:createNewspaperLayout('classico')})).toBeNull();
  expect(validateNewspaperEdition({...published,blocks:[],pdf_path:'edition/paper.pdf'})).toBeNull();
 });
});
