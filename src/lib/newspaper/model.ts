import {parseDate} from '@/lib/calendar/harptos';

export type NewspaperTemplate='classico'|'guerra'|'gazeta';
export type NewspaperFont='classico'|'editorial'|'condensado';
export type NewspaperState='draft'|'published'|'archived'|'cancelled';
export type NewspaperBlockType='headline'|'article'|'image'|'quote';
export type NewspaperBlock={
  id:string;
  type:NewspaperBlockType;
  text:string;
  imagePath?:string;
  caption?:string;
  span:number;
  height:number;
};
export type NewspaperEdition={
  id:string;edition_no:number;campaign_date:string;title:string;subtitle:string;
  template:NewspaperTemplate;font_style:NewspaperFont;
  state:NewspaperState;blocks:NewspaperBlock[];pdf_path:string|null;
  version:number;publication_revision:number;created_by:string;updated_at:string;published_at:string|null;
  archived_at:string|null;cancelled_at:string|null;
};
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
];

export function makeNewspaperBlock(type:NewspaperBlockType):NewspaperBlock{
 const id=crypto.randomUUID();
 if(type==='headline')return{id,type,text:'Escreva a manchete principal',span:12,height:110};
 if(type==='image')return{id,type,text:'',caption:'Legenda da fotografia',span:6,height:270};
 if(type==='quote')return{id,type,text:'Uma declaração importante ganha destaque aqui.',span:6,height:130};
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
  type:['headline','article','image','quote'].includes(String(x['type']))?x['type'] as NewspaperBlockType:'article',
  text:typeof x['text']==='string'?x['text'].slice(0,30000):'',
  ...(typeof x['imagePath']==='string'&&x['imagePath'].length<300?{imagePath:x['imagePath']}:{}),
  ...(typeof x['caption']==='string'?{caption:x['caption'].slice(0,500)}:{}),
  span:clampNewspaperSpan(Number(x['span'])),
  height:clampNewspaperHeight(Number(x['height'])),
 }));
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
 if(!input.pdf_path&&!input.blocks.some(b=>b.type==='headline'||b.type==='article')&&!input.blocks.some(b=>b.imagePath))
  return 'Adicione uma notícia, imagem ou PDF.';
 return null;
}
