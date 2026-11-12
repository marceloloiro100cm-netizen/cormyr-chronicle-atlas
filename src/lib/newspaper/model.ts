import {formatDate,parseDate,MONTHS} from '@/lib/calendar/harptos';

export type NewspaperTemplate='classico'|'guerra'|'gazeta';
export type NewspaperFont='classico'|'editorial'|'condensado'|'gotica'|'romana';
export type NewspaperState='draft'|'published'|'archived'|'cancelled';
export type NewspaperBlockType='headline'|'subtitle'|'article'|'image'|'quote'|'notice';
export type NewspaperImageStyle='vintage'|'woodcut'|'original';
export type NewspaperTextAlign='left'|'center';
export const NEWSPAPER_NOTICE_ICONS=['⚜','📜','🏪','⚔','⚠','👑'] as const;
export type NewspaperImageFocus='top'|'center'|'bottom';
export const NEWSPAPER_IMAGE_FOCUS:{value:NewspaperImageFocus;label:string}[]=[
 {value:'top',label:'Topo'},{value:'center',label:'Centro'},{value:'bottom',label:'Base'},
];
export type NewspaperBlock={
  id:string;
  type:NewspaperBlockType;
  text:string;
  imagePath?:string;
  /** Gravura do acervo do Reino (arquivo fixo do site, sem envio). */
  imageSrc?:string;
  caption?:string;
  subtitle?:string;
  byline?:string;
  icon?:string;
  /** Pedido contratado por uma Casa que originou este bloco (liga a notícia às pendências). */
  commissionId?:string;
  align?:NewspaperTextAlign;
  imageStyle?:NewspaperImageStyle;
  autoHeight?:boolean;
  /** Com altura fixa, qual parte da imagem fica visível (padrão: centro). */
  imageFocus?:NewspaperImageFocus;
  /** Recorte livre da imagem (arraste): ponto de foco em % e ampliação de 1x a 3x. */
  focusX?:number;
  focusY?:number;
  cropZoom?:number;
  /** Bloco fixo: posição e tamanho travados (o texto continua editável). */
  pinned?:boolean;
  /** Letra capitular gótica na primeira letra do texto da matéria. */
  dropCap?:boolean;
  span:number;
  height:number;
};
export type NewspaperEdition={
  id:string;edition_no:number;campaign_date:string;title:string;subtitle:string;
  template:NewspaperTemplate;font_style:NewspaperFont;
  state:NewspaperState;blocks:NewspaperBlock[];pdf_path:string|null;
  version:number;publication_revision:number;created_by:string;updated_at:string;published_at:string|null;
  archived_at:string|null;cancelled_at:string|null;
  /** Data do Reino em que o rascunho é publicado sozinho (null: sem agendamento). */
  publish_on?:string|null;
};
/** Versão anterior da edição guardada pelo banco a cada salvamento (só o Editor-Chefe lê). */
export type NewspaperRevision={
  id:number;newspaper_id:string;previous_version:number;changed_at:string;
  snapshot:Partial<NewspaperEdition>;
};
export type NewspaperCommissionState='pending'|'published'|'rejected';
export type NewspaperCommission={
  id:string;house_id:string;requested_by:string;title:string;body:string;
  image_path:string|null;cost_wealth:number;state:NewspaperCommissionState;
  request_key:string;newspaper_id:string|null;created_at:string;published_at:string|null;
  rejection_note:string|null;rejected_at:string|null;
  /** Quando a Casa viu a resposta (publicação ou recusa). */
  seen_at:string|null;
};
export const COMMISSION_BUCKET='campaign-newspaper-commissions';
export const COMMISSION_COST_WEALTH=1;
/** Máximo de pedidos aguardando publicação por Casa (o banco impõe o mesmo limite). */
export const COMMISSION_PENDING_LIMIT=3;
/** Acervo de gravuras do Reino, disponível ao Editor-Chefe sem envio de arquivo. */
export const NEWSPAPER_ENGRAVINGS:{src:string;label:string}[]=[
 {src:'/newspaper/gravuras/castelo_cormyr.jpg',label:'Castelo de Cormyr'},
 {src:'/newspaper/gravuras/conselho_real.jpg',label:'Conselho Real'},
 {src:'/newspaper/gravuras/mercado_suzail.jpg',label:'Mercado de Suzail'},
];
export function engravingLabel(src:string|undefined):string|null{
 return NEWSPAPER_ENGRAVINGS.find(e=>e.src===src)?.label??null;
}
/** Pedidos resolvidos (publicados ou recusados) que a Casa ainda não viu. */
export function unseenCommissionAnswers(commissions:readonly NewspaperCommission[],houseId:string):NewspaperCommission[]{
 return commissions.filter(c=>c.house_id===houseId&&c.state!=='pending'&&!c.seen_at);
}
export function houseCanCommission(commissions:readonly NewspaperCommission[],houseId:string):boolean{
 return commissions.filter(c=>c.house_id===houseId&&c.state==='pending').length<COMMISSION_PENDING_LIMIT;
}
/** Larguras prontas (de 12 colunas), como no modelo da Gazeta. */
export const NEWSPAPER_WIDTH_PRESETS:{span:number;label:string}[]=[
 {span:3,label:'1/4'},{span:4,label:'1/3'},{span:6,label:'1/2'},{span:8,label:'2/3'},{span:12,label:'Total'},
];
export type NewspaperRead={newspaper_id:string;user_id:string;read_version:number;read_at:string};
export const PAPER_BUCKET='campaign-newspapers';

export const NEWSPAPER_TEMPLATES:{value:NewspaperTemplate;label:string;description:string}[]=[
 {value:'classico',label:'Primeira página',description:'Manchete, colunas e fotografia'},
 {value:'guerra',label:'Edição de guerra',description:'Título de impacto e notícias curtas'},
 {value:'gazeta',label:'Gazeta do Reino',description:'Editorial e avisos em colunas'},
];
export const NEWSPAPER_FONTS:{value:NewspaperFont;label:string}[]=[
 {value:'classico',label:'Clássica · Times'},
 {value:'editorial',label:'Editorial · Georgia'},
 {value:'condensado',label:'Imprensa · Impact'},
 {value:'gotica',label:'Gótica · Fraktur e Garamond'},
 {value:'romana',label:'Romana · Cinzel e Georgia'},
];

export function makeNewspaperBlock(type:NewspaperBlockType):NewspaperBlock{
 const id=crypto.randomUUID();
 if(type==='headline')return{id,type,text:'Escreva a manchete principal',subtitle:'Uma linha de apoio para a notícia.',align:'left',span:12,height:110};
 if(type==='subtitle')return{id,type,text:'Linha fina que complementa a manchete',span:12,height:90};
 if(type==='image')return{id,type,text:'',caption:'Legenda da fotografia',imageStyle:'vintage',autoHeight:true,span:6,height:270};
 if(type==='quote')return{id,type,text:'Uma declaração importante ganha destaque aqui.',span:6,height:130};
 if(type==='notice')return{id,type,text:'Notas da Corte\n\nEscreva aqui o comunicado ou anúncio.',icon:'⚜',span:6,height:150};
 return{id,type,text:'Título da notícia\n\nEscreva aqui o conteúdo da reportagem. As colunas se ajustam conforme o espaço disponível.',span:6,height:190};
}
export function createNewspaperLayout(template:NewspaperTemplate):NewspaperBlock[]{
 if(template==='guerra'){
  const a=makeNewspaperBlock('headline'),b=makeNewspaperBlock('article'),c=makeNewspaperBlock('article');
  a.text='ÚLTIMA HORA';b.span=8;c.span=4;
  return[a,b,c];
 }
 if(template==='gazeta'){
  const a=makeNewspaperBlock('article'),b=makeNewspaperBlock('article'),c=makeNewspaperBlock('quote');
  a.span=6;b.span=6;c.span=12;
  return[a,b,c];
 }
 const a=makeNewspaperBlock('headline'),b=makeNewspaperBlock('article'),c=makeNewspaperBlock('image');
 a.text='A GAZETA DE CORMYR';b.span=6;c.span=6;
 return[a,b,c];
}
export function safeNewspaperBlocks(value:unknown):NewspaperBlock[]{
 if(!Array.isArray(value))return[];
 return value.slice(0,80).filter((x):x is Record<string,unknown>=>x!==null&&typeof x==='object')
 .map((x,index)=>({
  id:typeof x['id']==='string'&&x['id'].length<100?x['id']:`block-${index}`,
  type:['headline','subtitle','article','image','quote','notice'].includes(String(x['type']))?x['type'] as NewspaperBlockType:'article',
  text:typeof x['text']==='string'?x['text'].slice(0,30000):'',
  ...(typeof x['imagePath']==='string'&&x['imagePath'].length<300?{imagePath:x['imagePath']}:{}),
  ...(typeof x['imageSrc']==='string'&&NEWSPAPER_ENGRAVINGS.some(e=>e.src===x['imageSrc'])?{imageSrc:x['imageSrc']}:{}),
  ...(typeof x['caption']==='string'?{caption:x['caption'].slice(0,500)}:{}),
  ...(typeof x['subtitle']==='string'?{subtitle:x['subtitle'].slice(0,500)}:{}),
  ...(typeof x['byline']==='string'?{byline:x['byline'].slice(0,120)}:{}),
  ...(typeof x['commissionId']==='string'&&/^[0-9a-f-]{36}$/i.test(x['commissionId'])?{commissionId:x['commissionId']}:{}),
  ...(typeof x['icon']==='string'&&NEWSPAPER_NOTICE_ICONS.some(icon=>icon===x['icon'])?{icon:x['icon']}:{}),
  ...(x['align']==='center'||x['align']==='left'?{align:x['align'] as NewspaperTextAlign}:{}),
  ...(x['imageStyle']==='vintage'||x['imageStyle']==='woodcut'||x['imageStyle']==='original'?{imageStyle:x['imageStyle'] as NewspaperImageStyle}:{}),
  ...(typeof x['autoHeight']==='boolean'?{autoHeight:x['autoHeight']}:{}),
  ...(x['imageFocus']==='top'||x['imageFocus']==='center'||x['imageFocus']==='bottom'?{imageFocus:x['imageFocus'] as NewspaperImageFocus}:{}),
  ...(typeof x['focusX']==='number'&&Number.isFinite(x['focusX'])?{focusX:Math.min(100,Math.max(0,x['focusX']))}:{}),
  ...(typeof x['focusY']==='number'&&Number.isFinite(x['focusY'])?{focusY:Math.min(100,Math.max(0,x['focusY']))}:{}),
  ...(typeof x['cropZoom']==='number'&&Number.isFinite(x['cropZoom'])?{cropZoom:Math.min(3,Math.max(1,x['cropZoom']))}:{}),
  ...(x['pinned']===true?{pinned:true}:{}),
  ...(x['dropCap']===true?{dropCap:true}:{}),
  span:clampNewspaperSpan(Number(x['span'])),
  height:clampNewspaperHeight(Number(x['height'])),
 }));
}
/** Deterministic drag-and-drop ordering: existing article IDs and layout stay intact. */
export function reorderNewspaperBlocks(blocks:readonly NewspaperBlock[],sourceId:string,targetId:string):NewspaperBlock[]{
 const from=blocks.findIndex(b=>b.id===sourceId);
 const to=blocks.findIndex(b=>b.id===targetId);
 if(from<0||to<0||from===to)return [...blocks];
 const result=[...blocks],moved=result.splice(from,1)[0]!;
 result.splice(to,0,moved);
 return result;
}
export function insertNewspaperBlockBefore(blocks:readonly NewspaperBlock[],type:NewspaperBlockType,targetId?:string|null){
 const result=[...blocks];
 if(result.length>=80)return result;
 const newBlock=makeNewspaperBlock(type),index=result.findIndex(b=>b.id===targetId);
 result.splice(index<0?result.length:index,0,newBlock);
 return result;
}
export function duplicateNewspaperBlock(block:NewspaperBlock):NewspaperBlock{
 // A cópia nasce solta: só o bloco original fica fixo.
 const {pinned:_pinned,...rest}=block;
 return {...rest,id:crypto.randomUUID()};
}

export function clampNewspaperSpan(value:number):number{
 return Number.isFinite(value)?Math.min(12,Math.max(3,Math.round(value))):6;
}
export function clampNewspaperHeight(value:number):number{
 return Number.isFinite(value)?Math.min(800,Math.max(90,Math.round(value))):190;
}
export function newspaperResize(current:NewspaperBlock,dx:number,dy:number,columnWidth:number):Pick<NewspaperBlock,'span'|'height'>{
 return {span:clampNewspaperSpan(current.span+Math.round(dx/Math.max(1,columnWidth))),
  height:clampNewspaperHeight(current.height+dy)};
}
export function newspaperIsUnread(edition:NewspaperEdition,receipt?:NewspaperRead):boolean{
 return ['published','archived'].includes(edition.state)&&edition.publication_revision>0&&
  (!receipt||receipt.read_version<edition.publication_revision);
}
export function newspaperStatus(state:NewspaperState):string{
 return {draft:'Rascunho',published:'Publicada',archived:'Arquivada',cancelled:'Envio cancelado'}[state];
}
export function validateNewspaperEdition(input:Pick<NewspaperEdition,'title'|'campaign_date'|'blocks'|'pdf_path'>):string|null{
 if(!parseDate(input.campaign_date))return 'Escolha uma data válida no HUB Temporal.';
 if(!input.title.trim())return 'Informe o nome do jornal.';
 if(input.title.length>180)return 'O nome deve ter até 180 caracteres.';
 if(input.blocks.length>80)return 'A edição permite até 80 blocos.';
 if(!input.pdf_path&&!input.blocks.some(b=>b.type==='headline'||b.type==='article')&&!input.blocks.some(b=>b.imagePath||b.imageSrc))
  return 'Adicione uma notícia, imagem ou PDF.';
 return null;
}

/** Valida o texto de uma notícia contratada antes de gastar Riqueza. */
export function validateCommissionDraft(input:{title:string;body:string}):string|null{
 const title=input.title.trim(),body=input.body.trim();
 if(title.length<3)return 'Escreva um título para a notícia.';
 if(title.length>180)return 'O título deve ter até 180 caracteres.';
 if(body.length<10)return 'Escreva o texto da notícia (mínimo de 10 caracteres).';
 if(body.length>6000)return 'O texto deve ter até 6000 caracteres.';
 return null;
}
/**
 * Converte um pedido em blocos prontos para a folha: reportagem (título na primeira linha)
 * e, se houver imagem já copiada para a edição, uma fotografia logo após o texto.
 */
export function commissionToBlocks(commission:Pick<NewspaperCommission,'id'|'title'|'body'>,
 imagePath?:string,houseName?:string):NewspaperBlock[]{
 const article:NewspaperBlock={...makeNewspaperBlock('article'),
  text:`${commission.title.trim()}\n\n${commission.body.trim()}`,span:imagePath?6:12,height:220,
  commissionId:commission.id,
  ...(houseName?{byline:`Notícia contratada pela ${houseName}`}:{})};
 if(!imagePath)return[article];
 const photo:NewspaperBlock={...makeNewspaperBlock('image'),imagePath,
  caption:commission.title.trim().slice(0,200),span:6,commissionId:commission.id};
 return[article,photo];
}
/** Pendências: pedidos ainda não publicados (a publicação da edição os retira do rol). */
export function pendingCommissions(list:readonly NewspaperCommission[]):NewspaperCommission[]{
 return list.filter(c=>c.state==='pending').sort((a,b)=>a.created_at.localeCompare(b.created_at));
}
export function commissionInEdition(edition:Pick<NewspaperEdition,'blocks'>|null|undefined,id:string):boolean{
 return Boolean(edition?.blocks.some(b=>b.commissionId===id));
}

/** Há alterações ainda não salvas? Compara o que está na tela com a versão do servidor. */
export function newspaperIsDirty(draft:NewspaperEdition|null|undefined,saved:NewspaperEdition|null|undefined):boolean{
 if(!draft||!saved||draft.id!==saved.id)return false;
 const pick=(e:NewspaperEdition)=>JSON.stringify([
  e.campaign_date,e.title,e.subtitle,e.template,e.font_style,e.blocks,e.pdf_path,e.state,e.publish_on??null]);
 return pick(draft)!==pick(saved);
}
export function moveNewspaperBlock(blocks:readonly NewspaperBlock[],id:string,direction:-1|1):NewspaperBlock[]{
 const list=[...blocks],index=list.findIndex(b=>b.id===id),next=index+direction;
 if(index<0||next<0||next>=list.length)return list;
 [list[index],list[next]]=[list[next]!,list[index]!];
 return list;
}

// ---- Redação: corpo de funcionários ----
export type NewspaperStaffMember={
  id:string;name:string;specialty:string;bio:string;photo_path:string|null;
  created_at:string;updated_at:string;
};
export const STAFF_BUCKET='campaign-newspaper-staff';
/** Assinatura das matérias: Nome e Cargo (a especialidade faz as vezes de cargo). */
export function staffByline(member:Pick<NewspaperStaffMember,'name'|'specialty'>):string{
 const name=member.name.trim(),role=member.specialty.trim();
 return role?`${name}, ${role}`:name;
}
export function validateStaffMember(input:{name:string;specialty:string;bio:string}):string{
 if(!input.name.trim())return 'Informe o nome do funcionário.';
 if(input.name.length>120||input.specialty.length>120)return 'Nome e especialidade aceitam até 120 caracteres.';
 if(input.bio.length>3000)return 'O texto aceita até 3000 caracteres.';
 return '';
}
/** Título e abertura prontos para "Escrever sobre a data" a partir do calendário. */
export function dateStoryDraft(date:string,eventTitle?:string):{title:string;body:string}{
 const parsed=parseDate(date);
 const label=formatDate(date);
 const title=eventTitle?`Dia de ${eventTitle}`:parsed&&!parsed.festival?`Dia ${parsed.day} de ${MONTHS[parsed.month]}`:`Dia de ${label}`;
 return {title,body:`${label}. Escreva aqui a notícia sobre a data.`};
}
/** Página de exemplo para pré-visualizar modelo e fonte nas Configurações. */
export function sampleNewspaperBlocks(template:NewspaperTemplate):NewspaperBlock[]{
 const blocks=createNewspaperLayout(template);
 const lorem='O texto de exemplo mostra como as colunas se ajustam ao espaço e como a fonte escolhida aparece na leitura da edição.';
 return blocks.map(b=>{
  if(b.type==='headline')return {...b,text:template==='guerra'?'ÚLTIMA HORA':'A COROA REAFIRMA ALIANÇAS NO NORTE',subtitle:'Uma linha de apoio para a manchete'};
  if(b.type==='image')return {...b,imageSrc:'/newspaper/gravuras/conselho_real.jpg',caption:'Legenda da fotografia'};
  if(b.type==='quote')return {...b,text:'Uma declaração importante ganha destaque aqui.'};
  return {...b,text:`Título da notícia\n\n${lorem}`};
 });
}

// ---- Modelos de matéria ----
export type StoryModel={id:string;name:string;description:string;builtin:boolean;blocks:NewspaperBlock[]};
const modelBlock=(type:NewspaperBlockType,patch:Partial<NewspaperBlock>):NewspaperBlock=>({...makeNewspaperBlock(type),...patch});
export const BUILTIN_STORY_MODELS:StoryModel[]=[
 {id:'builtin-corte',name:'Notícia da Corte',description:'Manchete, linha de apoio e texto em largura total.',builtin:true,blocks:[
  modelBlock('headline',{text:'[Manchete da notícia]',subtitle:'[Linha de apoio: o essencial em uma frase]',span:12}),
  modelBlock('article',{text:'[Título da matéria]\n\n[Lide: quem, o quê, onde e quando.]\n\n[Desenvolvimento: detalhes, falas e contexto.]',byline:'',span:12,height:220}),
 ]},
 {id:'builtin-ultima-hora',name:'Última Hora',description:'Manchete de impacto com texto curto e uma fala em destaque.',builtin:true,blocks:[
  modelBlock('headline',{text:'ÚLTIMA HORA: [ACONTECIMENTO]',subtitle:'[Onde e quando]',align:'center',span:12}),
  modelBlock('article',{text:'[Título]\n\n[O que aconteceu, em poucas linhas.]',span:8,height:200}),
  modelBlock('quote',{text:'“[Declaração de uma testemunha ou autoridade.]”',span:4}),
 ]},
 {id:'builtin-reportagem',name:'Reportagem com gravura',description:'Imagem ao lado do texto, ideal para eventos e lugares.',builtin:true,blocks:[
  modelBlock('image',{caption:'[Legenda da gravura]',span:6}),
  modelBlock('article',{text:'[Título da reportagem]\n\n[Descreva o lugar ou o evento: o que se viu, quem estava lá e por que importa.]',span:6,height:260}),
 ]},
 {id:'builtin-entrevista',name:'Entrevista',description:'Citação de abertura e duas colunas de perguntas e respostas.',builtin:true,blocks:[
  modelBlock('headline',{text:'[Nome do entrevistado] fala ao jornal',subtitle:'[Cargo ou Casa]',span:12}),
  modelBlock('quote',{text:'“[A frase mais forte da entrevista.]”',span:12}),
  modelBlock('article',{text:'[Primeira pergunta]\n\n[Resposta do entrevistado.]',span:6,height:220}),
  modelBlock('article',{text:'[Segunda pergunta]\n\n[Resposta do entrevistado.]',span:6,height:220}),
 ]},
 {id:'builtin-comunicado',name:'Comunicado oficial',description:'Aviso com selo para decretos, editais e anúncios da Coroa.',builtin:true,blocks:[
  modelBlock('notice',{text:'[Quem comunica]\n\n[Texto do comunicado, edital ou anúncio.]',icon:'📜',span:12,height:170}),
 ]},
 {id:'builtin-cronista',name:'Coluna do Cronista',description:'Texto de opinião com subtítulo e fala de apoio ao lado.',builtin:true,blocks:[
  modelBlock('subtitle',{text:'[Título da coluna]',span:12}),
  modelBlock('article',{text:'[Assunto da semana]\n\n[Opinião, impressões e rumores do reino.]',byline:'',span:8,height:240}),
  modelBlock('quote',{text:'“[Frase para destacar.]”',span:4}),
 ]},
];
/** Cópia dos blocos com novos ids, pronta para entrar numa edição. */
export function instantiateStoryModel(model:Pick<StoryModel,'blocks'>):NewspaperBlock[]{
 return model.blocks.map(b=>({...b,id:crypto.randomUUID()}));
}
export function validateStoryModel(input:{name:string;description:string;blocks:readonly NewspaperBlock[]}):string{
 if(!input.name.trim())return 'Dê um nome ao modelo.';
 if(input.name.length>80)return 'O nome aceita até 80 caracteres.';
 if(input.description.length>200)return 'A descrição aceita até 200 caracteres.';
 if(input.blocks.length<1)return 'O modelo precisa de pelo menos um bloco.';
 if(input.blocks.length>12)return 'O modelo aceita até 12 blocos.';
 return '';
}
export function duplicatedStoryModelName(name:string):string{return `Cópia de ${name}`.slice(0,80);}

// ---- Gravuras do Reino enviadas pelo Editor-Chefe ----
/** Gravura do acervo: enviada (image_path no bucket privado) ou original do site (public_src). */
export type NewspaperEngraving={id:string;name:string;image_path:string|null;public_src:string|null;in_collection:boolean;created_at:string};
export const ENGRAVINGS_BUCKET='campaign-newspaper-engravings';
/** Gravuras marcadas para o acervo, na ordem de envio. */
export function collectionEngravings(list:readonly NewspaperEngraving[]):NewspaperEngraving[]{
 return list.filter(e=>e.in_collection);
}
/** Edição fictícia só para pré-visualizar um modelo de matéria (imagens vazias ganham uma gravura). */
export function storyModelPreviewEdition(blocks:readonly NewspaperBlock[],font:NewspaperFont='classico',
 identity:{title?:string;subtitle?:string;template?:NewspaperTemplate;campaign_date?:string}={}):NewspaperEdition{
 return {
  id:'preview',edition_no:1,campaign_date:identity.campaign_date||'1522-01-01',title:identity.title||'A Folha Sem Selo',subtitle:identity.subtitle??'',
  template:identity.template??'classico',font_style:font,state:'draft',pdf_path:null,version:1,publication_revision:0,
  created_by:'',updated_at:'',published_at:null,archived_at:null,cancelled_at:null,
  blocks:blocks.map(b=>b.type==='image'&&!b.imagePath&&!b.imageSrc?{...b,imageSrc:NEWSPAPER_ENGRAVINGS[1]!.src}:b),
 };
}

// ---- Configurações do jornal (valem sem edição aberta) ----
export type NewspaperSettings={title:string;subtitle:string;template:NewspaperTemplate;font_style:NewspaperFont};
export const DEFAULT_NEWSPAPER_SETTINGS:NewspaperSettings={
 title:'A Folha Sem Selo',subtitle:'O jornal independente de Cormyr',template:'classico',font_style:'classico',
};
/** Aceita só valores conhecidos; qualquer campo estranho volta ao padrão. */
export function safeNewspaperSettings(value:unknown):NewspaperSettings{
 const row=(value&&typeof value==='object'?value:{}) as Partial<Record<keyof NewspaperSettings,unknown>>;
 const title=typeof row.title==='string'&&row.title.trim()?row.title.slice(0,180):DEFAULT_NEWSPAPER_SETTINGS.title;
 const subtitle=typeof row.subtitle==='string'?row.subtitle.slice(0,240):DEFAULT_NEWSPAPER_SETTINGS.subtitle;
 const template=NEWSPAPER_TEMPLATES.some(t=>t.value===row.template)?row.template as NewspaperTemplate:'classico';
 const font_style=NEWSPAPER_FONTS.some(f=>f.value===row.font_style)?row.font_style as NewspaperFont:'classico';
 return {title,subtitle,template,font_style};
}
export function validateNewspaperSettings(input:NewspaperSettings):string|null{
 if(!input.title.trim())return 'Dê um nome ao jornal.';
 if(input.title.length>180)return 'O nome do jornal permite até 180 caracteres.';
 if(input.subtitle.length>240)return 'O subtítulo permite até 240 caracteres.';
 return null;
}
/**
 * Data para uma edição nova: a data oficial do HUB; se faltar, a da edição mais recente.
 * Nunca inventa uma data: sem nenhuma das duas devolve vazio.
 */
export function newEditionDate(hubDate:string,history:readonly Pick<NewspaperEdition,'campaign_date'>[]):string{
 return hubDate||history[0]?.campaign_date||'';
}
