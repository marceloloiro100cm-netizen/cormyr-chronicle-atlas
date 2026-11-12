import {FESTIVALS,parseDate} from '@/lib/calendar/harptos';
import {
 safeNewspaperBlocks,type NewspaperBlock,type NewspaperEdition,type NewspaperImageFocus,
} from './model';

// ---- Desfazer e refazer (vale para texto, blocos, imagens e configurações da edição aberta) ----
export type DraftSnapshot=Pick<NewspaperEdition,'campaign_date'|'title'|'subtitle'|'template'|'font_style'|'blocks'|'pdf_path'>&{
 publish_on?:string|null;
};
export function snapshotOf(edition:NewspaperEdition):DraftSnapshot{
 return {
  campaign_date:edition.campaign_date,title:edition.title,subtitle:edition.subtitle,template:edition.template,
  font_style:edition.font_style,blocks:edition.blocks,pdf_path:edition.pdf_path,
  ...(edition.publish_on!==undefined?{publish_on:edition.publish_on}:{}),
 };
}
/** JSON com chaves em ordem fixa: o banco devolve o jsonb com as chaves em outra ordem. */
function canonical(value:unknown):string{
 return JSON.stringify(value,(_key,item:unknown)=>{
  if(item&&typeof item==='object'&&!Array.isArray(item)){
   return Object.fromEntries(Object.entries(item as Record<string,unknown>).sort(([x],[y])=>x<y?-1:x>y?1:0));
  }
  return item;
 });
}
export function sameSnapshot(a:DraftSnapshot,b:DraftSnapshot):boolean{
 return canonical(a)===canonical(b);
}
export type EditHistory={editionId:string|null;past:DraftSnapshot[];present:DraftSnapshot|null;future:DraftSnapshot[];at:number};
export const HISTORY_LIMIT=100;
/** Alterações seguidas em menos de 0,8 s (arrastar, digitar) viram um único passo do histórico. */
export const HISTORY_COALESCE_MS=800;
export function emptyHistory():EditHistory{return {editionId:null,past:[],present:null,future:[],at:0};}
export function recordSnapshot(history:EditHistory,editionId:string,snapshot:DraftSnapshot,now:number):EditHistory{
 if(history.editionId!==editionId||!history.present)return {editionId,past:[],present:snapshot,future:[],at:now};
 if(sameSnapshot(history.present,snapshot))return history;
 const coalesce=history.past.length>0&&now-history.at<HISTORY_COALESCE_MS;
 const past=coalesce?history.past:[...history.past,history.present].slice(-HISTORY_LIMIT);
 return {editionId,past,present:snapshot,future:[],at:now};
}
export function canUndo(history:EditHistory):boolean{return history.past.length>0;}
export function canRedo(history:EditHistory):boolean{return history.future.length>0;}
export function undoHistory(history:EditHistory):{history:EditHistory;snapshot:DraftSnapshot}|null{
 const snapshot=history.past[history.past.length-1];
 if(!snapshot||!history.present)return null;
 return {snapshot,history:{...history,past:history.past.slice(0,-1),present:snapshot,
  future:[history.present,...history.future].slice(0,HISTORY_LIMIT),at:0}};
}
export function redoHistory(history:EditHistory):{history:EditHistory;snapshot:DraftSnapshot}|null{
 const snapshot=history.future[0];
 if(!snapshot||!history.present)return null;
 return {snapshot,history:{...history,past:[...history.past,history.present].slice(-HISTORY_LIMIT),present:snapshot,
  future:history.future.slice(1),at:0}};
}

// ---- Copiar, recortar e colar blocos (Ctrl+C, Ctrl+X, Ctrl+V) ----
export const BLOCK_CLIPBOARD_MARK='CORMYR-FOLHA-BLOCOS:v1\n';
export const CLIPBOARD_BLOCK_LIMIT=12;
export const NEWSPAPER_BLOCK_LIMIT=80;
/** Texto que vai para a área de transferência: marca + blocos em JSON (cola em outra edição ou aba). */
export function serializeBlocks(blocks:readonly NewspaperBlock[]):string{
 return BLOCK_CLIPBOARD_MARK+JSON.stringify(blocks.slice(0,CLIPBOARD_BLOCK_LIMIT));
}
/** Blocos novos (ids novos, sem vínculo com pedidos de Casas) ou null se o texto não for de blocos. */
export function parseClipboardBlocks(text:string):NewspaperBlock[]|null{
 if(!text.startsWith(BLOCK_CLIPBOARD_MARK))return null;
 try{
  const raw:unknown=JSON.parse(text.slice(BLOCK_CLIPBOARD_MARK.length));
  return safeNewspaperBlocks(raw).slice(0,CLIPBOARD_BLOCK_LIMIT).map(block=>{
   const {commissionId:_unlinked,...rest}=block;
   return {...rest,id:crypto.randomUUID()};
  });
 }catch{return null;}
}
/** Texto simples colado fora de um campo vira uma matéria (primeira linha = título). */
export function textToArticleBlock(text:string):NewspaperBlock|null{
 const clean=text.replace(/\r/g,'').trim();
 if(!clean)return null;
 return {id:crypto.randomUUID(),type:'article',text:clean.slice(0,30000),span:6,height:190};
}
export function insertBlocksAfter(blocks:readonly NewspaperBlock[],afterId:string|null,added:readonly NewspaperBlock[]):
 {blocks:NewspaperBlock[];ok:boolean}{
 if(blocks.length+added.length>NEWSPAPER_BLOCK_LIMIT)return {blocks:[...blocks],ok:false};
 const next=[...blocks],index=next.findIndex(b=>b.id===afterId);
 next.splice(index<0?next.length:index+1,0,...added);
 return {blocks:next,ok:true};
}
/** Imagens enviadas moram na pasta da edição de origem; ao colar em outra edição precisam ser copiadas. */
export function needsImageCopy(block:NewspaperBlock,editionId:string):boolean{
 return Boolean(block.imagePath&&!block.imagePath.startsWith(`${editionId}/`));
}

// ---- Contagem de palavras ----
export function countWords(text:string):number{
 const found=text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
 return found?found.length:0;
}
export function blockWords(block:NewspaperBlock):number{
 if(block.type==='image')return countWords(block.caption??'');
 return countWords(block.text)+(block.type==='headline'?countWords(block.subtitle??''):0);
}
export function editionWords(blocks:readonly NewspaperBlock[]):number{
 return blocks.reduce((total,block)=>total+blockWords(block),0);
}
/** Minutos de leitura a ~200 palavras por minuto; 0 quando não há texto. */
export function readingMinutes(words:number):number{
 return words<=0?0:Math.max(1,Math.round(words/200));
}
export function wordsLabel(words:number):string{
 return `${words} ${words===1?'palavra':'palavras'}`;
}

// ---- Recorte de imagem por arraste ----
export const CROP_ZOOM_MIN=1;
export const CROP_ZOOM_MAX=3;
export function clampPercent(value:number):number{
 return Number.isFinite(value)?Math.min(100,Math.max(0,Math.round(value*10)/10)):50;
}
export function clampCropZoom(value:number):number{
 return Number.isFinite(value)?Math.min(CROP_ZOOM_MAX,Math.max(CROP_ZOOM_MIN,Math.round(value*20)/20)):1;
}
const PRESET_Y:Record<NewspaperImageFocus,number>={top:0,center:50,bottom:100};
/** Ponto de foco (em %): o recorte livre vence; sem ele vale o atalho Topo/Centro/Base. */
export function blockFocus(block:Pick<NewspaperBlock,'focusX'|'focusY'|'imageFocus'>):{x:number;y:number}{
 return {x:block.focusX??50,y:block.focusY??PRESET_Y[block.imageFocus??'center']};
}
/** Arrastar a imagem para a direita/baixo mostra o que está à esquerda/acima. */
export function panFocus(start:{x:number;y:number},dx:number,dy:number,box:{width:number;height:number},zoom:number):{x:number;y:number}{
 const z=Math.max(1,zoom);
 return {
  x:clampPercent(start.x-(dx/Math.max(1,box.width))*100/z),
  y:clampPercent(start.y-(dy/Math.max(1,box.height))*100/z),
 };
}

// ---- Publicação agendada para uma data do Reino ----
const FESTIVAL_ORDER:Record<string,number>={shieldmeet:62};
/** Posição da data no ano de Harptos. O banco usa a mesma conta em newspaper_date_ordinal(). */
export function dateOrdinal(key:string|null|undefined):number|null{
 const date=parseDate(key);
 if(!date)return null;
 const inMonth=date.festival?(FESTIVAL_ORDER[date.festival]??61):date.day*2;
 return date.year*100000+date.month*1000+inMonth;
}
export function isScheduleDue(publishOn:string|null|undefined,hubDate:string):boolean{
 const due=dateOrdinal(publishOn),today=dateOrdinal(hubDate);
 return due!==null&&today!==null&&due<=today;
}
/** Mensagem de erro, ou null quando a data pode ser usada para agendar. */
export function validateSchedule(publishOn:string,hubDate:string):string|null{
 if(dateOrdinal(publishOn)===null)return 'Escolha uma data válida do calendário do Reino.';
 if(hubDate&&isScheduleDue(publishOn,hubDate))return 'A data precisa ser depois de hoje no Reino. Para publicar agora, use Publicar Edição.';
 return null;
}
export const KNOWN_FESTIVAL_IDS:readonly string[]=FESTIVALS.map(f=>f.id);
