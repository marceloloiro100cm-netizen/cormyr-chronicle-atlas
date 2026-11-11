import {describe,expect,it} from 'vitest';
import {
 createNewspaperLayout,makeNewspaperBlock,newspaperIsUnread,newspaperResize,
 safeNewspaperBlocks,validateNewspaperEdition,type NewspaperEdition,
} from './model';

const published={
 id:'00000000-0000-4000-8000-000000000001',edition_no:1,
 campaign_date:'1522-01-01',title:'Gazeta de Cormyr',subtitle:'',
 template:'classico',font_style:'classico',state:'published',blocks:[],
 pdf_path:null,version:2,created_by:'user',updated_at:'',published_at:'',
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
 it('notifica nova edição e alterações até leitura da versão atual',()=>{
  expect(newspaperIsUnread(published)).toBe(true);
  expect(newspaperIsUnread(published,{newspaper_id:published.id,user_id:'u',read_version:1,read_at:''})).toBe(true);
  expect(newspaperIsUnread(published,{newspaper_id:published.id,user_id:'u',read_version:2,read_at:''})).toBe(false);
  expect(newspaperIsUnread({...published,state:'cancelled'})).toBe(false);
  expect(newspaperIsUnread({...published,state:'archived'})).toBe(true);
 });
 it('exige data oficial válida e conteúdo editorial para publicar',()=>{
  expect(validateNewspaperEdition({...published,campaign_date:'1522-99-42'})).toMatch(/data/);
  expect(validateNewspaperEdition(published)).toMatch(/Adicione/);
  expect(validateNewspaperEdition({...published,blocks:createNewspaperLayout('classico')})).toBeNull();
 });
});
