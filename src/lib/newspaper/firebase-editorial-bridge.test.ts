import {describe,expect,it} from 'vitest';
import {originalNewspaperEdition} from './firebase-editorial-bridge';
const id='cloud-'+'a'.repeat(64);
const edition={id,editionNo:4,title:'A Folha Sem Selo',subtitle:'Crônicas de Cormyr',
 blocks:[{id:'article-1',type:'article' as const,text:'Crônica',
  span:12,height:190}],version:2,state:'published' as const,
 campaignDate:'1522-01-01',publishedAt:'2026-11-19T14:00:00Z',
 template:'gazeta' as const,font_style:'gotica' as const};
describe('operational Jornal maps to unchanged original edition UI',()=>{
 it('retains title, subtitle, typographic choices, blocks and source ID',()=>{
  expect(originalNewspaperEdition(edition)).toMatchObject({
   id,edition_no:4,title:'A Folha Sem Selo',
   subtitle:'Crônicas de Cormyr',template:'gazeta',font_style:'gotica',
   blocks:[{id:'article-1',text:'Crônica'}],
   version:2,state:'published',pdf_path:null,
  });
 });
 it('rejects malformed and invented editions',()=>{
  expect(()=>originalNewspaperEdition({...edition,id:'another'})).toThrow();
  expect(()=>originalNewspaperEdition({...edition,version:-1})).toThrow();
 });
});
