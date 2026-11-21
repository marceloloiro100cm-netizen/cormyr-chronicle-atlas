import test from 'node:test';
import assert from 'node:assert/strict';
import {validateHistoricalDraft} from './cloud-newspaper-legacy-draft.mjs';
const id='aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb';
const source={id,editionNo:2,version:3,state:'draft',blocks:[
 {id:'article-1',type:'article',text:'Antiga matéria',span:6,height:190},
 {id:'image-empty',type:'image',text:'',caption:'Em branco',span:6,height:270},
 {id:'image-legacy',type:'image',text:'',imagePath:'antigo/ilustracao.jpg',span:6,height:270},
 {id:'image-external',type:'image',text:'',imageSrc:'https://historico.example/gravura.jpg',span:6,height:270},
]};
const content=()=>({title:'A Folha Sem Selo',subtitle:'',template:'classico',
 font_style:'classico',campaignDate:'1522-10-11',
 blocks:structuredClone(source.blocks)});
test('working copy preserves imported illustrations, empty slots and source integrity',()=>{
 const old=structuredClone(source),raw=content();
 raw.blocks[0].text='Notícia revisada';
 const result=validateHistoricalDraft(source,raw);
 assert.equal(result.blocks[0].text,'Notícia revisada');
 assert.equal(result.blocks[1].imageSrc,undefined);
 assert.equal(result.blocks[2].imagePath,'antigo/ilustracao.jpg');
 assert.equal(result.blocks[2].imageSrc,undefined);
 assert.equal(result.blocks[3].imageSrc,'https://historico.example/gravura.jpg');
 assert.deepEqual(source,old);
});
test('cannot attach another source image or arbitrarily replace legacy media',()=>{
 const other=content();other.blocks[2].imagePath='outro/segredo.jpg';
 assert.throws(()=>validateHistoricalDraft(source,other),/invalid_historical_draft/);
 const rogue=content();rogue.blocks[3].imageSrc='https://forged.example/ssrf.jpg';
 assert.throws(()=>validateHistoricalDraft(source,rogue),/invalid_historical_draft/);
 const lost=content();lost.campaignDate='not a Harptos date';
 assert.throws(()=>validateHistoricalDraft(source,lost),/invalid_historical_draft/);
 const published={...source,state:'published'};
 assert.throws(()=>validateHistoricalDraft(published,content()),/invalid_historical_draft/);
});
