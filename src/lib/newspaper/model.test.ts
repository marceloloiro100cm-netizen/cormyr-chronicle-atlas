import {describe,expect,it} from 'vitest';
import {createNewspaperLayout,makeNewspaperBlock,newspaperIsUnread,newspaperResize,safeNewspaperBlocks,validateNewspaperEdition,reorderNewspaperBlocks,duplicateNewspaperBlock,insertNewspaperBlockBefore,type NewspaperEdition,commissionInEdition,moveNewspaperBlock,newspaperIsDirty,NEWSPAPER_WIDTH_PRESETS,commissionToBlocks,pendingCommissions,validateCommissionDraft,type NewspaperCommission,NEWSPAPER_ENGRAVINGS,unseenCommissionAnswers,houseCanCommission,COMMISSION_PENDING_LIMIT,staffByline,validateStaffMember,dateStoryDraft,sampleNewspaperBlocks,BUILTIN_STORY_MODELS,instantiateStoryModel,validateStoryModel,duplicatedStoryModelName,safeNewspaperSettings,validateNewspaperSettings,newEditionDate,DEFAULT_NEWSPAPER_SETTINGS,storyModelPreviewEdition} from './model';

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

describe('Notícias contratadas pelas Casas',()=>{
 const commission:NewspaperCommission={
  id:'11111111-1111-4111-8111-111111111111',house_id:'crownsilver',requested_by:'u',
  title:'Grande feira em Suzail',body:'A Casa anuncia uma feira de três dias na capital.',
  image_path:null,cost_wealth:1,state:'pending',request_key:'k',newspaper_id:null,
  created_at:'2026-11-11T10:00:00Z',published_at:null,rejection_note:null,rejected_at:null,seen_at:null,
 };
 it('exige título e texto antes de gastar Riqueza',()=>{
  expect(validateCommissionDraft({title:'',body:'texto suficiente aqui'})).toMatch(/título/i);
  expect(validateCommissionDraft({title:'Feira',body:'curto'})).toMatch(/texto/i);
  expect(validateCommissionDraft({title:'Feira',body:'texto suficiente aqui'})).toBeNull();
 });
 it('converte o pedido em reportagem editável com título na primeira linha',()=>{
  const [article,photo]=commissionToBlocks(commission,undefined,'Casa Crownsilver');
  expect(photo).toBeUndefined();
  expect(article?.type).toBe('article');
  expect(article?.text.split('\n')[0]).toBe('Grande feira em Suzail');
  expect(article?.commissionId).toBe(commission.id);
  expect(article?.byline).toContain('Casa Crownsilver');
 });
 it('acrescenta a fotografia ligada ao mesmo pedido quando há imagem',()=>{
  const blocks=commissionToBlocks(commission,'edicao/foto.jpg');
  expect(blocks.map(b=>b.type)).toEqual(['article','image']);
  expect(blocks[1]?.imagePath).toBe('edicao/foto.jpg');
  expect(blocks.every(b=>b.commissionId===commission.id)).toBe(true);
 });
 it('mantém o vínculo ao salvar e rejeita identificadores inválidos',()=>{
  const [article]=commissionToBlocks(commission);
  expect(safeNewspaperBlocks([article])[0]?.commissionId).toBe(commission.id);
  expect(safeNewspaperBlocks([{...article,commissionId:'<script>'}])[0]?.commissionId).toBeUndefined();
 });
 it('lista só pendentes, do mais antigo ao mais novo, e detecta o pedido na edição',()=>{
  const older={...commission,id:'22222222-2222-4222-8222-222222222222',created_at:'2026-11-10T10:00:00Z'};
  const done={...commission,id:'33333333-3333-4333-8333-333333333333',state:'published' as const};
  expect(pendingCommissions([commission,done,older]).map(c=>c.id)).toEqual([older.id,commission.id]);
  expect(commissionInEdition({blocks:commissionToBlocks(commission)},commission.id)).toBe(true);
  expect(commissionInEdition({blocks:[]},commission.id)).toBe(false);
  expect(commissionInEdition(null,commission.id)).toBe(false);
 });
});

describe('Facilidades herdadas do modelo da Gazeta',()=>{
 it('cria bloco de subtítulo e preserva o tipo ao salvar',()=>{
  const sub=makeNewspaperBlock('subtitle');
  expect(sub.span).toBe(12);
  expect(safeNewspaperBlocks([sub])[0]?.type).toBe('subtitle');
 });
 it('oferece larguras prontas dentro das 12 colunas',()=>{
  expect(NEWSPAPER_WIDTH_PRESETS.map(p=>p.span)).toEqual([3,4,6,8,12]);
 });
 it('detecta alterações não salvas e move blocos',()=>{
  const saved={...published,state:'draft',blocks:[makeNewspaperBlock('headline')]} as NewspaperEdition;
  expect(newspaperIsDirty(saved,saved)).toBe(false);
  expect(newspaperIsDirty({...saved,title:'Outro'},saved)).toBe(true);
  const [a,b]=[makeNewspaperBlock('article'),makeNewspaperBlock('quote')];
  expect(moveNewspaperBlock([a,b],a.id,1).map(x=>x.id)).toEqual([b.id,a.id]);
  expect(moveNewspaperBlock([a,b],a.id,-1).map(x=>x.id)).toEqual([a.id,b.id]);
 });
});

describe('Acervo, avisos e limite por Casa',()=>{
 const base={requested_by:'u',title:'Titulo',body:'Texto longo o bastante',image_path:null,cost_wealth:1,
  request_key:'k',newspaper_id:null,created_at:'',published_at:null,rejection_note:null,rejected_at:null,seen_at:null};
 const c=(id:string,house:string,state:'pending'|'published'|'rejected',seen:string|null=null):NewspaperCommission=>
  ({...base,id,house_id:house,state,seen_at:seen});
 it('aceita só gravuras do acervo fixo',()=>{
  const ok=NEWSPAPER_ENGRAVINGS[0]!.src;
  const [a,b]=safeNewspaperBlocks([
   {...makeNewspaperBlock('image'),imageSrc:ok},
   {...makeNewspaperBlock('image'),imageSrc:'https://evil.example/x.png'},
  ]);
  expect(a?.imageSrc).toBe(ok);
  expect(b?.imageSrc).toBeUndefined();
 });
 it('conta respostas ainda não vistas somente da própria Casa',()=>{
  const list=[c('1','a','published'),c('2','a','rejected','2026-11-11'),c('3','b','published'),c('4','a','pending')];
  expect(unseenCommissionAnswers(list,'a').map(x=>x.id)).toEqual(['1']);
 });
 it('bloqueia novo pedido ao atingir o limite de pendentes',()=>{
  const full=Array.from({length:COMMISSION_PENDING_LIMIT},(_,i)=>c(String(i),'a','pending'));
  expect(houseCanCommission(full,'a')).toBe(false);
  expect(houseCanCommission(full,'b')).toBe(true);
  expect(houseCanCommission([...full.slice(1),c('x','a','published')],'a')).toBe(true);
 });
});

describe('Redação, calendário e pré-visualização',()=>{
 it('a assinatura junta nome e cargo',()=>{
  expect(staffByline({name:' Elaine Vox ',specialty:'Cronista da Corte'})).toBe('Elaine Vox, Cronista da Corte');
  expect(staffByline({name:'Elaine Vox',specialty:''})).toBe('Elaine Vox');
  expect(validateStaffMember({name:'  ',specialty:'',bio:''})).not.toBe('');
  expect(validateStaffMember({name:'A',specialty:'',bio:''})).toBe('');
 });
 it('prepara o título "Dia de X" para escrever sobre a data',()=>{
  expect(dateStoryDraft('1522-01-05','Tyr · Ver a Justiça').title).toBe('Dia de Tyr · Ver a Justiça');
  expect(dateStoryDraft('1522-01-05').title).toBe('Dia 5 de Hammer');
  expect(dateStoryDraft('1522-01-05').body).toContain('Escreva aqui');
 });
 it('cada modelo tem página de exemplo com texto e gravura própria',()=>{
  for(const t of ['classico','guerra','gazeta'] as const){
   const blocks=sampleNewspaperBlocks(t);
   expect(blocks.length).toBeGreaterThan(1);
   expect(blocks.every(b=>b.type!=='image'||Boolean(b.imageSrc))).toBe(true);
  }
 });
});

describe('Modelos de matéria',()=>{
 it('traz exatamente 6 modelos prontos, todos válidos',()=>{
  expect(BUILTIN_STORY_MODELS).toHaveLength(6);
  for(const m of BUILTIN_STORY_MODELS)expect(validateStoryModel(m)).toBe('');
  expect(new Set(BUILTIN_STORY_MODELS.map(m=>m.name)).size).toBe(6);
 });
 it('usar um modelo gera ids novos a cada vez',()=>{
  const a=instantiateStoryModel(BUILTIN_STORY_MODELS[0]!),b=instantiateStoryModel(BUILTIN_STORY_MODELS[0]!);
  expect(a[0]!.id).not.toBe(b[0]!.id);
  expect(a[0]!.text).toBe(BUILTIN_STORY_MODELS[0]!.blocks[0]!.text);
 });
 it('valida nome e limites, e sugere o nome da cópia',()=>{
  expect(validateStoryModel({name:' ',description:'',blocks:BUILTIN_STORY_MODELS[0]!.blocks})).not.toBe('');
  expect(validateStoryModel({name:'x',description:'',blocks:[]})).not.toBe('');
  expect(duplicatedStoryModelName('Entrevista')).toBe('Cópia de Entrevista');
 });
});

describe('Configurações do jornal e data da edição nova',()=>{
 it('aceita só modelo e fonte conhecidos e nunca deixa o nome vazio',()=>{
  expect(safeNewspaperSettings(null)).toEqual(DEFAULT_NEWSPAPER_SETTINGS);
  expect(safeNewspaperSettings({title:'  ',subtitle:7,template:'x',font_style:'y'})).toEqual({...DEFAULT_NEWSPAPER_SETTINGS});
  expect(safeNewspaperSettings({title:'Gazeta',subtitle:'',template:'guerra',font_style:'condensado'}))
   .toEqual({title:'Gazeta',subtitle:'',template:'guerra',font_style:'condensado'});
  expect(validateNewspaperSettings({...DEFAULT_NEWSPAPER_SETTINGS,title:' '})).toMatch(/nome/);
  expect(validateNewspaperSettings(DEFAULT_NEWSPAPER_SETTINGS)).toBeNull();
 });
 it('a edição nova usa a data do HUB; sem ela, a da edição mais recente; nunca inventa',()=>{
  expect(newEditionDate('1522-10-11',[{campaign_date:'1522-09-01'}])).toBe('1522-10-11');
  expect(newEditionDate('',[{campaign_date:'1522-09-01'}])).toBe('1522-09-01');
  expect(newEditionDate('',[])).toBe('');
 });
 it('guarda o enquadramento da imagem e descarta valores estranhos',()=>{
  const base={id:'a',type:'image',text:'',span:6,height:200};
  expect(safeNewspaperBlocks([{...base,imageFocus:'top'}])[0]!.imageFocus).toBe('top');
  expect(safeNewspaperBlocks([{...base,imageFocus:'diagonal'}])[0]!.imageFocus).toBeUndefined();
 });
 it('a prévia de modelo leva a identidade do jornal e preenche imagens vazias',()=>{
  const e=storyModelPreviewEdition([makeNewspaperBlock('image')],'editorial',{title:'Gazeta',template:'guerra'});
  expect(e.title).toBe('Gazeta');expect(e.template).toBe('guerra');expect(e.font_style).toBe('editorial');
  expect(e.blocks[0]!.imageSrc).toBeTruthy();
 });
});
