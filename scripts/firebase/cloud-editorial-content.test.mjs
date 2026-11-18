import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEditorialContent} from './cloud-editorial-content.mjs';
const base=()=>({title:'A Folha Sem Selo',subtitle:'Crônicas',blocks:[
  {id:'a',type:'article',text:'Notícia\nTexto',titleFont:'old-english',bodyFont:'garamond',span:6,height:190}]});
test('editorial content retains plain text, typography, layout and approved images',()=>{
  const v=base();v.blocks.push({id:'b',type:'image',text:'',
    imageSrc:'/newspaper/gravuras/castelo_cormyr.jpg',span:6,height:190});
  assert.deepEqual(validateEditorialContent(v),v);
});
test('reject forged fields, remote media, duplicate ids and oversized content',()=>{
  for(const change of [
    v=>({...v,createdBy:'forged'}),
    v=>({...v,blocks:[{...v.blocks[0],imagePath:'private/asset'}]}),
    v=>({...v,blocks:[{...v.blocks[0],imageSrc:'https://example.invalid/x'}]}),
    v=>({...v,blocks:[{...v.blocks[0],bodyFont:'url(https://example.invalid)'}]}),
    v=>({...v,blocks:[v.blocks[0],v.blocks[0]]}),
    v=>({...v,blocks:[{...v.blocks[0],text:'a'.repeat(16001)}]}),
    v=>({...v,blocks:[{...v.blocks[0],span:100}]}),
    v=>({...v,blocks:[]}),
  ])assert.throws(()=>validateEditorialContent(change(base())),/invalid_editorial_content/);
});

