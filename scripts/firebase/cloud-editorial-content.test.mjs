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
test('autosave may persist an incomplete or empty editorial draft but cannot publish it',()=>{
 const incomplete={title:'',subtitle:'',blocks:[{id:'headline',type:'headline',
  text:'A manchete que ainda estou escrevendo',span:12,height:110}]};
 assert.deepEqual(validateEditorialContent(incomplete,{
  allowEmptyImages:true,allowIncompleteDraft:true}),incomplete);
 assert.throws(()=>validateEditorialContent(incomplete),/invalid_editorial_content/);
 const empty={title:'',subtitle:'',blocks:[]};
 assert.deepEqual(validateEditorialContent(empty,{allowIncompleteDraft:true}),empty);
 assert.throws(()=>validateEditorialContent(empty),/invalid_editorial_content/);
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


test('Firebase preserves the old newspaper editor layout and typography exactly',()=>{
  const value=base();
  value.template='gazeta';
  value.font_style='gotica';
  value.blocks[0]={
    ...value.blocks[0],icon:undefined,
    align:'center',pinned:true,dropCap:true,
  };
  delete value.blocks[0].icon;
  value.blocks.push({
    id:'gravura-1',type:'image',text:'',
    imageSrc:'/newspaper/gravuras/conselho_real.jpg',
    imageStyle:'woodcut',autoHeight:false,imageFocus:'top',
    focusX:39.25,focusY:78.5,cropZoom:2.75,
    align:'center',pinned:false,span:4,height:300,
    caption:'Do arquivo de Cormyr',titleFont:'fraktur',bodyFont:'garamond',
  });
  value.blocks.push({
    id:'aviso',type:'notice',text:'Edital da cidade',
    icon:'⚜',align:'left',span:4,height:180,
  });
  assert.deepEqual(validateEditorialContent(value),value);
});
test('new legacy layout metadata is strictly bounded and rejects privileged fields',()=>{
  const malformed=[
    {imageStyle:'remote'}, {cropZoom:6}, {cropZoom:NaN},
    {focusX:-1},{focusY:101},{autoHeight:'false'},
    {pinned:'yes'},{dropCap:1},{align:'justify'},
    {commissionId:'blindly-forged'},{imagePath:'private/asset'},
  ];
  for(const field of malformed){
    const value=base();value.blocks[0]={...value.blocks[0],...field};
    assert.throws(()=>validateEditorialContent(value),/invalid_editorial_content/,
      'Bad editorial field: '+Object.keys(field).join(','));
  }
  for(const change of [
    {template:'invented'},{font_style:'remote-font'},{publish_on:'1522-01-01'},
    {createdBy:'forged'},
  ]){
    assert.throws(()=>validateEditorialContent({...base(),...change}),
      /invalid_editorial_content/);
  }
  const invalidImage=[
    {id:'i',type:'image',text:'',span:6,height:190,
      imageSrc:'/newspaper/gravuras/conselho_real.jpg',focusX:Infinity},
    {id:'i',type:'image',text:'',span:6,height:190,
      imageSrc:'/newspaper/gravuras/conselho_real.jpg',icon:'⚜'},
  ];
  for(const b of invalidImage){
    assert.throws(()=>validateEditorialContent({...base(),blocks:[...base().blocks,b]}),
      /invalid_editorial_content/);
  }
});

test('commission article and its registered image may share one trusted contract',()=>{
 const cid='11111111-1111-4111-8111-111111111111',snap='a'.repeat(64);
 const path='newspaper-media/'+snap+
  '/editionImage/00000000-0000-4000-8000-000000000001.png';
 const article={...base().blocks[0],commissionId:cid};
 const photo={id:'photo',type:'image',text:'',commissionId:cid,
  imagePath:path,span:6,height:200};
 const pair={...base(),blocks:[article,photo]};
 assert.equal(validateEditorialContent(pair).blocks.length,2);
 assert.throws(()=>validateEditorialContent({...base(),blocks:[photo]}),/invalid_editorial_content/);
 assert.throws(()=>validateEditorialContent({...base(),blocks:[article,article]}),/invalid_editorial_content/);
 assert.throws(()=>validateEditorialContent({...base(),blocks:[article,photo,{...photo,id:'photo2'}]}),
  /invalid_editorial_content/);
});
test('registered Firebase media, future schedule and an attached PDF stay bounded',()=>{
 const snapshot='a'.repeat(64),id='b'.repeat(36);
 const v={...base(),blocks:[...base().blocks,{
  id:'illustration',type:'image',text:'',span:6,height:210,
  imagePath:'newspaper-media/'+snapshot+'/editionImage/'+id+'.png',
 }],pdfPath:'newspaper-media/'+snapshot+'/editionPdf/'+id+'.pdf',
 publishOn:'1522-01-20'};
 assert.deepEqual(validateEditorialContent(v),v);
 assert.throws(()=>validateEditorialContent({...v,publishOn:'bad date'}),/invalid_editorial_content/);
 assert.throws(()=>validateEditorialContent({...v,blocks:[...v.blocks.slice(0,1),
  {...v.blocks[1],imagePath:'newspaper-media/'+snapshot+'/commission/'+id+'.png'}]}),
  /invalid_editorial_content/);
 assert.throws(()=>validateEditorialContent({...v,pdfPath:'legacy/private.pdf'}),
  /invalid_editorial_content/);
});
