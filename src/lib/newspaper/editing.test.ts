import {describe,expect,it} from 'vitest';
import {
 BLOCK_CLIPBOARD_MARK,HISTORY_COALESCE_MS,HISTORY_LIMIT,blockFocus,blockWords,canRedo,canUndo,clampCropZoom,
 countWords,dateOrdinal,editionWords,emptyHistory,insertBlocksAfter,isScheduleDue,needsImageCopy,panFocus,
 parseClipboardBlocks,readingMinutes,recordSnapshot,redoHistory,sameSnapshot,serializeBlocks,textToArticleBlock,
 undoHistory,validateSchedule,type DraftSnapshot,
} from './editing';
import {makeNewspaperBlock,safeNewspaperBlocks,type NewspaperBlock} from './model';

const snap=(title:string,blocks:NewspaperBlock[]=[]):DraftSnapshot=>({
 campaign_date:'1522-01-01',title,subtitle:'',template:'classico',font_style:'classico',blocks,pdf_path:null,
});
const T=100000;

describe('desfazer e refazer',()=>{
 it('começa sem passos e registra cada alteração distante no tempo',()=>{
  let h=recordSnapshot(emptyHistory(),'e1',snap('A'),T);
  expect(canUndo(h)).toBe(false);
  h=recordSnapshot(h,'e1',snap('B'),T+5000);
  h=recordSnapshot(h,'e1',snap('C'),T+10000);
  expect(h.past.map(x=>x.title)).toEqual(['A','B']);
  const back=undoHistory(h)!;
  expect(back.snapshot.title).toBe('B');
  expect(canRedo(back.history)).toBe(true);
  expect(redoHistory(back.history)!.snapshot.title).toBe('C');
 });
 it('juntas alterações seguidas (arrastar) num só passo',()=>{
  let h=recordSnapshot(emptyHistory(),'e1',snap('A'),T);
  h=recordSnapshot(h,'e1',snap('B'),T+5000);
  h=recordSnapshot(h,'e1',snap('B2'),T+5000+HISTORY_COALESCE_MS-100);
  h=recordSnapshot(h,'e1',snap('B3'),T+5000+HISTORY_COALESCE_MS-50);
  expect(h.past.map(x=>x.title)).toEqual(['A']);
  expect(undoHistory(h)!.snapshot.title).toBe('A');
 });
 it('uma alteração nova apaga o que seria refeito e trocar de edição reinicia',()=>{
  let h=recordSnapshot(emptyHistory(),'e1',snap('A'),T);
  h=recordSnapshot(h,'e1',snap('B'),T+5000);
  h=undoHistory(h)!.history;
  h=recordSnapshot(h,'e1',snap('Z'),T+9000);
  expect(canRedo(h)).toBe(false);
  const other=recordSnapshot(h,'e2',snap('X'),T+20000);
  expect(other.past).toHaveLength(0);expect(other.editionId).toBe('e2');
  expect(undoHistory(emptyHistory())).toBeNull();
 });
 it('ignora a ordem das chaves devolvidas pelo banco e limita o tamanho',()=>{
  const a=snap('A',[{id:'1',type:'article',text:'x',span:6,height:190}]);
  const b=snap('A',[{height:190,span:6,text:'x',type:'article',id:'1'}]);
  expect(sameSnapshot(a,b)).toBe(true);
  let h=recordSnapshot(emptyHistory(),'e1',snap('0'),T);
  for(let i=1;i<=HISTORY_LIMIT+30;i++)h=recordSnapshot(h,'e1',snap(String(i)),T+i*5000);
  expect(h.past.length).toBeLessThanOrEqual(HISTORY_LIMIT);
 });
});

describe('copiar e colar blocos',()=>{
 it('serializa e cola com ids novos, sem vínculo com pedidos de Casas',()=>{
  const block:NewspaperBlock={...makeNewspaperBlock('article'),commissionId:'11111111-1111-4111-8111-111111111111'};
  const text=serializeBlocks([block]);
  expect(text.startsWith(BLOCK_CLIPBOARD_MARK)).toBe(true);
  const pasted=parseClipboardBlocks(text)!;
  expect(pasted).toHaveLength(1);
  expect(pasted[0]!.id).not.toBe(block.id);
  expect(pasted[0]!.commissionId).toBeUndefined();
  expect(pasted[0]!.text).toBe(block.text);
 });
 it('rejeita texto comum e JSON quebrado, e saneia o que vem de fora',()=>{
  expect(parseClipboardBlocks('um texto qualquer')).toBeNull();
  expect(parseClipboardBlocks(BLOCK_CLIPBOARD_MARK+'{quebrado')).toBeNull();
  const hostile=BLOCK_CLIPBOARD_MARK+JSON.stringify([{id:'x',type:'script',text:'ok',imageSrc:'/etc/passwd',span:99,height:1}]);
  const [block]=parseClipboardBlocks(hostile)!;
  expect(block!.type).toBe('article');expect(block!.imageSrc).toBeUndefined();expect(block!.span).toBe(12);
 });
 it('texto simples vira matéria e cola depois do bloco selecionado, respeitando o limite',()=>{
  const article=textToArticleBlock('Título\n\nCorpo')!;
  expect(article.type).toBe('article');expect(textToArticleBlock('   ')).toBeNull();
  const a=makeNewspaperBlock('headline'),b=makeNewspaperBlock('quote');
  const result=insertBlocksAfter([a,b],a.id,[article]);
  expect(result.ok).toBe(true);expect(result.blocks.map(x=>x.id)).toEqual([a.id,article.id,b.id]);
  expect(insertBlocksAfter([a,b],null,[article]).blocks.at(-1)!.id).toBe(article.id);
  const full=Array.from({length:80},()=>makeNewspaperBlock('quote'));
  expect(insertBlocksAfter(full,null,[article]).ok).toBe(false);
 });
 it('imagens enviadas de outra edição precisam ser copiadas',()=>{
  const block:NewspaperBlock={...makeNewspaperBlock('image'),imagePath:'ed-1/foto.png'};
  expect(needsImageCopy(block,'ed-1')).toBe(false);
  expect(needsImageCopy(block,'ed-2')).toBe(true);
  expect(needsImageCopy(makeNewspaperBlock('image'),'ed-2')).toBe(false);
 });
});

describe('contagem de palavras',()=>{
 it('conta palavras com acento e hífen e ignora pontuação',()=>{
  expect(countWords('Coração de Cormyr, a rainha-mãe fala!')).toBe(6);
  expect(countWords('  ')).toBe(0);
 });
 it('soma títulos e subtítulos e calcula o tempo de leitura',()=>{
  const headline:NewspaperBlock={...makeNewspaperBlock('headline'),text:'Rei visita Suzail',subtitle:'Multidão acompanha'};
  const image:NewspaperBlock={...makeNewspaperBlock('image'),caption:'O rei'};
  expect(blockWords(headline)).toBe(5);expect(blockWords(image)).toBe(2);
  expect(editionWords([headline,image])).toBe(7);
  expect(readingMinutes(0)).toBe(0);expect(readingMinutes(30)).toBe(1);expect(readingMinutes(650)).toBe(3);
 });
});

describe('recorte de imagem',()=>{
 it('o atalho Topo/Centro/Base vale até existir recorte livre',()=>{
  expect(blockFocus({})).toEqual({x:50,y:50});
  expect(blockFocus({imageFocus:'bottom'})).toEqual({x:50,y:100});
  expect(blockFocus({imageFocus:'bottom',focusX:20,focusY:10})).toEqual({x:20,y:10});
 });
 it('arrastar move o foco no sentido contrário e respeita os limites',()=>{
  expect(panFocus({x:50,y:50},50,0,{width:500,height:200},1)).toEqual({x:40,y:50});
  expect(panFocus({x:50,y:50},0,-50,{width:500,height:200},1)).toEqual({x:50,y:75});
  expect(panFocus({x:5,y:95},500,-500,{width:500,height:200},1)).toEqual({x:0,y:100});
  expect(panFocus({x:50,y:50},50,0,{width:500,height:200},2).x).toBe(45);
  expect(clampCropZoom(9)).toBe(3);expect(clampCropZoom(0)).toBe(1);expect(clampCropZoom(Number.NaN)).toBe(1);
 });
 it('o recorte livre sobrevive à leitura segura dos blocos e valores absurdos são limitados',()=>{
  const [b]=safeNewspaperBlocks([{id:'a',type:'image',text:'',span:6,height:200,focusX:30,focusY:-5,cropZoom:9}]);
  expect(b!.focusX).toBe(30);expect(b!.focusY).toBe(0);expect(b!.cropZoom).toBe(3);
  expect(safeNewspaperBlocks([{id:'a',type:'image',text:'',span:6,height:200,focusX:'x'}])[0]!.focusX).toBeUndefined();
 });
});

describe('publicação agendada',()=>{
 it('ordena as datas do ano de Harptos, com festivais entre os meses',()=>{
  const o=(k:string)=>dateOrdinal(k)!;
  expect(o('1522-01-30')).toBeLessThan(o('1522-F-midwinter'));
  expect(o('1522-F-midwinter')).toBeLessThan(o('1522-02-01'));
  expect(o('1524-F-midsummer')).toBeLessThan(o('1524-F-shieldmeet'));
  expect(o('1524-F-shieldmeet')).toBeLessThan(o('1524-08-01'));
  expect(o('1522-12-30')).toBeLessThan(o('1523-01-01'));
  expect(dateOrdinal('1523-F-shieldmeet')).toBeNull();
  expect(dateOrdinal('lixo')).toBeNull();
 });
 it('só aceita agendar depois de hoje no Reino', () => {
  expect(isScheduleDue('1522-10-11','1522-10-11')).toBe(true);
  expect(isScheduleDue('1522-10-12','1522-10-11')).toBe(false);
  expect(validateSchedule('1522-10-12','1522-10-11')).toBeNull();
  expect(validateSchedule('1522-10-11','1522-10-11')).toMatch(/depois de hoje/);
  expect(validateSchedule('1522-10-01','1522-10-11')).toMatch(/depois de hoje/);
  expect(validateSchedule('nada','1522-10-11')).toMatch(/válida/);
  expect(validateSchedule('1522-10-12','')).toBeNull();
 });
});

import {
 CONVERTIBLE_LABELS,FIELD_LIMITS,blockSummary,convertBlock,normalizeFieldText,pastedPlainText,publicationIssues,saveStatusText,
} from './editing';
describe('colar e digitar nos campos da folha',()=>{
 it('cola sempre como texto puro e junta as linhas em campos de uma linha',()=>{
  expect(pastedPlainText('Um\r\ntítulo\n\nlongo',true)).toBe('Um título longo');
  expect(pastedPlainText('a  \n\n\n\nb c',false)).toBe('a\n\nb c');
 });
 it('normaliza o texto ao sair do campo',()=>{
  expect(normalizeFieldText('  Manchete\ncom quebra \r',true)).toBe('Manchete com quebra');
  expect(normalizeFieldText(' Linha 1\nLinha 2 ',false)).toBe('Linha 1\nLinha 2');
 });
});
describe('conferência antes de publicar',()=>{
 it('aponta todos os blocos recém-criados porque ainda têm texto de exemplo',()=>{
  for(const type of ['headline','article','image','quote','notice'] as const){
   const issues=publicationIssues([makeNewspaperBlock(type)]);
   expect(issues.length,type).toBeGreaterThan(0);
  }
 });
 it('não aponta nada em blocos bem preenchidos',()=>{
  const headline={...makeNewspaperBlock('headline'),text:'Rei declara paz nas Marcas'};
  const article={...makeNewspaperBlock('article'),text:'Paz nas Marcas\n\nO rei assinou o tratado ontem.'};
  const photo={...makeNewspaperBlock('image'),imageSrc:'/newspaper/gravuras/castelo_cormyr.jpg',caption:'O castelo ao amanhecer'};
  expect(publicationIssues([headline,article,photo])).toEqual([]);
 });
 it('avisa de manchete longa, matéria sem texto e foto sem imagem',()=>{
  const long={...makeNewspaperBlock('headline'),text:'x'.repeat(FIELD_LIMITS.headline+1)};
  const title={...makeNewspaperBlock('article'),text:'Só título'};
  const photo={...makeNewspaperBlock('image'),caption:'Com legenda'};
  const texts=publicationIssues([long,title,photo]).map(i=>i.text).join('|');
  expect(texts).toMatch(/manchete com 91 caracteres/);
  expect(texts).toMatch(/falta o texto/);
  expect(texts).toMatch(/fotografia sem imagem/);
 });
});
describe('transformar bloco',()=>{
 it('matéria vira manchete e volta sem perder o texto',()=>{
  const article={...makeNewspaperBlock('article'),text:'Paz\n\nO rei assinou.',dropCap:true};
  const headline=convertBlock(article,'headline')!;
  expect(headline.type).toBe('headline');
  expect(headline.text).toBe('Paz');
  expect(headline.subtitle).toBe('O rei assinou.');
  expect('dropCap' in headline).toBe(false);
  const back=convertBlock(headline,'article')!;
  expect(back.text).toBe('Paz\n\nO rei assinou.');
 });
 it('aviso ganha selo e citação vira texto de uma linha',()=>{
  const quote={...makeNewspaperBlock('quote'),text:'Linha um\nlinha dois'};
  const notice=convertBlock(quote,'notice')!;
  expect(notice.icon).toBe('⚜');
  expect(convertBlock(notice,'quote')!.text).toBe('Linha um linha dois');
 });
 it('não converte fotografia nem para o mesmo tipo',()=>{
  expect(convertBlock(makeNewspaperBlock('image'),'article')).toBeNull();
  expect(convertBlock(makeNewspaperBlock('article'),'image' as never)).toBeNull();
  expect(convertBlock(makeNewspaperBlock('article'),'article')).toBeNull();
  expect(CONVERTIBLE_LABELS.map(l=>l.value)).not.toContain('image');
 });
});
describe('situação do salvamento',()=>{
 it('descreve cada estado em português',()=>{
  expect(saveStatusText({status:'saving',dirty:true})).toBe('Salvando…');
  expect(saveStatusText({status:'failed',dirty:true})).toMatch(/Falha ao salvar/);
  expect(saveStatusText({status:'idle',dirty:true})).toBe('Alterações ainda não salvas');
  expect(saveStatusText({status:'saved',at:'14:02',dirty:false})).toBe('Salvo às 14:02');
  expect(saveStatusText({status:'idle',dirty:false})).toBe('Tudo salvo');
 });
 it('resume o bloco para o esboço',()=>{
  expect(blockSummary({...makeNewspaperBlock('headline'),text:'Uma manchete'})).toBe('Manchete: Uma manchete');
 });
});
