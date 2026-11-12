import {describe,expect,it} from 'vitest';
import {movePreservingPinned,reorderPreservingPinned,resizeWithReflow,rowsOf} from './layout';
import {duplicateNewspaperBlock,makeNewspaperBlock,safeNewspaperBlocks,type NewspaperBlock} from './model';

const b=(id:string,span:number,extra:Partial<NewspaperBlock>={}):NewspaperBlock=>
 ({id,type:'article',text:id,span,height:190,...extra});
const spans=(list:NewspaperBlock[])=>list.map(x=>x.span);

describe('fileiras da grade',()=>{
 it('agrupa em sequência até fechar 12 colunas',()=>{
  expect(rowsOf([b('a',4),b('b',5),b('c',3),b('d',6),b('e',6)])).toEqual([[0,1,2],[3,4]]);
  expect(rowsOf([b('a',8),b('b',6)])).toEqual([[0],[1]]);
 });
});

describe('redimensionar com refluxo lateral',()=>{
 it('o exemplo do relatório: gravura 5 para 6, e a coluna da esquerda cede 1 quando a direita é fixa',()=>{
  const row=[b('texto',4),b('gravura',5),b('notas',3,{pinned:true})];
  const out=resizeWithReflow(row,'gravura',{span:6});
  expect(spans(out)).toEqual([3,6,3]);
  expect(out[2]!.pinned).toBe(true);
 });
 it('sem bloco fixo, a cessão vem do vizinho da direita primeiro',()=>{
  const out=resizeWithReflow([b('a',4),b('b',4),b('c',4)],'a',{span:6});
  expect(spans(out)).toEqual([6,3,3]);
 });
 it('usa o espaço livre antes de tirar de alguém',()=>{
  expect(spans(resizeWithReflow([b('a',4),b('b',4)],'a',{span:6}))).toEqual([6,4]);
 });
 it('nunca deixa um vizinho abaixo de 3 colunas e limita o crescimento ao que cabe',()=>{
  const out=resizeWithReflow([b('a',6),b('b',6)],'a',{span:12});
  expect(spans(out)).toEqual([9,3]);
  expect(spans(out).reduce((x,y)=>x+y)).toBe(12);
 });
 it('se todos os vizinhos são fixos, só cresce o que ainda cabe',()=>{
  const out=resizeWithReflow([b('a',4),b('p',6,{pinned:true})],'a',{span:9});
  expect(spans(out)).toEqual([6,6]);
 });
 it('encolher não mexe nos vizinhos e arrastar de volta devolve as colunas (parte sempre da lista original)',()=>{
  const base=[b('a',6),b('b',6)];
  expect(spans(resizeWithReflow(base,'a',{span:4}))).toEqual([4,6]);
  expect(spans(resizeWithReflow(base,'a',{span:9}))).toEqual([9,3]);
  expect(spans(resizeWithReflow(base,'a',{span:6}))).toEqual([6,6]);
 });
 it('um bloco fixo não muda de largura nem de altura, e a lista original não é alterada',()=>{
  const base=[b('a',6,{pinned:true}),b('b',6)];
  expect(resizeWithReflow(base,'a',{span:9,height:400})).toEqual(base);
  const out=resizeWithReflow(base,'b',{height:300,span:6});
  expect(out[1]!.height).toBe(300);expect(base[1]!.height).toBe(190);
 });
 it('só a altura muda sem tocar nas colunas', () => {
  const out=resizeWithReflow([b('a',6),b('b',6)],'a',{height:420});
  expect(spans(out)).toEqual([6,6]);expect(out[0]!.height).toBe(420);
 });
});

describe('blocos fixos e reordenação',()=>{
 const list=[b('a',4),b('p',4,{pinned:true}),b('c',4),b('d',4)];
 it('arrastar mantém o bloco fixo exatamente no mesmo lugar',()=>{
  const out=reorderPreservingPinned(list,'a','d');
  expect(out.map(x=>x.id)).toEqual(['c','p','d','a']);
  expect(out[1]!.id).toBe('p');
 });
 it('soltar sobre um bloco fixo, ou arrastar um fixo, não faz nada',()=>{
  expect(reorderPreservingPinned(list,'a','p').map(x=>x.id)).toEqual(['a','p','c','d']);
  expect(reorderPreservingPinned(list,'p','d').map(x=>x.id)).toEqual(['a','p','c','d']);
 });
 it('subir e descer passam por cima do bloco fixo',()=>{
  expect(movePreservingPinned(list,'a',1).map(x=>x.id)).toEqual(['c','p','a','d']);
  expect(movePreservingPinned(list,'c',-1).map(x=>x.id)).toEqual(['c','p','a','d']);
  expect(movePreservingPinned(list,'a',-1).map(x=>x.id)).toEqual(['a','p','c','d']);
  expect(movePreservingPinned(list,'p',1).map(x=>x.id)).toEqual(['a','p','c','d']);
 });
 it('a cópia de um bloco fixo nasce solta, e o campo sobrevive à leitura segura',()=>{
  const copy=duplicateNewspaperBlock(b('p',4,{pinned:true}));
  expect(copy.pinned).toBeUndefined();
  const [read]=safeNewspaperBlocks([{id:'x',type:'article',text:'t',span:6,height:190,pinned:true,dropCap:true}]);
  expect(read!.pinned).toBe(true);expect(read!.dropCap).toBe(true);
  expect(safeNewspaperBlocks([{id:'x',type:'article',text:'t',span:6,height:190,pinned:'sim'}])[0]!.pinned).toBeUndefined();
  expect(makeNewspaperBlock('article').pinned).toBeUndefined();
 });
});
