import {describe,it,expect} from 'vitest';
import {contentParts,imageToken,validateImage} from '@/lib/campaign-content';
import {filterLetters,type LetterRow} from '@/lib/letters';
import {docsText} from '@/lib/drive-library.server';
const letters=[{id:'a',letter_number:1,letter_kind:'geral'},{id:'b',letter_number:2,letter_kind:'reservada'},{id:'c',letter_number:1,letter_kind:'reservada'}] as LetterRow[];
describe('Missivas e imagens',()=>{
  it('filtra pelo número da missiva',()=>expect(filterLetters(letters,[],{number:'1',kind:'',answered:''}).map(l=>l.id)).toEqual(['a','c']));
  it('filtra gerais e reservadas',()=>expect(filterLetters(letters,[],{number:'',kind:'geral',answered:''}).map(l=>l.id)).toEqual(['a']));
  it('filtra respondidas',()=>expect(filterLetters(letters,[{letter_id:'b'}],{number:'',kind:'',answered:'yes'}).map(l=>l.id)).toEqual(['b']));
  it('filtra não respondidas',()=>expect(filterLetters(letters,[{letter_id:'b'}],{number:'',kind:'',answered:'no'}).map(l=>l.id)).toEqual(['a','c']));
  it('preserva texto e referência privada da imagem',()=>expect(contentParts('Carta\n'+imageToken('user/id/0.jpg','Castelo'))).toEqual([{text:'Carta\n'},{path:'user/id/0.jpg',caption:'Castelo'}]));
  it('recusa arquivos executáveis ou SVG',()=>expect(()=>validateImage({type:'image/svg+xml',size:100})).toThrow());
  it('recusa imagem acima de 5 MB',()=>expect(()=>validateImage({type:'image/png',size:5242881})).toThrow());
  it('lê texto em tabelas e abas sem inventar personagens',()=>{const doc={tabs:[{documentTab:{body:{content:[{paragraph:{elements:[{textRun:{content:'Kael Ashkar\n'}}]}}]}}}]};expect(docsText(doc)).toBe('Kael Ashkar\n');});
});