import {clampNewspaperHeight,clampNewspaperSpan,type NewspaperBlock} from './model';

export const GRID_COLUMNS=12;
export const MIN_BLOCK_SPAN=3;

/** Fileiras como a grade as monta: blocos entram em sequência até fechar 12 colunas. */
export function rowsOf(blocks:readonly Pick<NewspaperBlock,'span'>[]):number[][]{
 const rows:number[][]=[];
 let current:number[]=[],used=0;
 blocks.forEach((block,index)=>{
  const span=Math.min(GRID_COLUMNS,Math.max(1,block.span));
  if(current.length>0&&used+span>GRID_COLUMNS){rows.push(current);current=[];used=0;}
  current.push(index);used+=span;
 });
 if(current.length>0)rows.push(current);
 return rows;
}

/**
 * Redimensiona um bloco mantendo a fileira fechada em 12 colunas: se o bloco cresce além do espaço
 * livre, as colunas que faltam saem dos vizinhos da mesma fileira (primeiro à direita, depois à
 * esquerda), nunca abaixo de 3 colunas e nunca de um bloco fixo. Se os vizinhos não puderem ceder
 * tudo, o crescimento para onde a fileira ainda cabe. Encolher não mexe nos vizinhos.
 * Sempre parte da lista original (`blocks`), por isso arrastar de volta devolve as colunas.
 */
export function resizeWithReflow(blocks:readonly NewspaperBlock[],id:string,
 patch:{span?:number;height?:number}):NewspaperBlock[]{
 const index=blocks.findIndex(b=>b.id===id);
 const target=blocks[index];
 if(!target||target.pinned)return [...blocks];
 const height=patch.height===undefined?target.height:clampNewspaperHeight(patch.height);
 const wanted=patch.span===undefined?target.span:clampNewspaperSpan(patch.span);
 const next=blocks.map(b=>({...b}));
 const resized=next[index]!;
 resized.height=height;
 if(wanted<=target.span){resized.span=wanted;return next;}
 const row=rowsOf(blocks).find(r=>r.includes(index))??[index];
 const used=row.reduce((total,i)=>total+blocks[i]!.span,0);
 const free=Math.max(0,GRID_COLUMNS-used);
 const needed=wanted-target.span-free;
 if(needed<=0){resized.span=wanted;return next;}
 const position=row.indexOf(index);
 const donors=[...row.slice(position+1),...row.slice(0,position).reverse()]
  .filter(i=>!blocks[i]!.pinned&&blocks[i]!.span>MIN_BLOCK_SPAN);
 let remaining=needed;
 for(const donor of donors){
  if(remaining<=0)break;
  const give=Math.min(remaining,next[donor]!.span-MIN_BLOCK_SPAN);
  next[donor]!.span-=give;remaining-=give;
 }
 resized.span=wanted-remaining;
 return next;
}

function refill(blocks:readonly NewspaperBlock[],unpinned:readonly NewspaperBlock[]):NewspaperBlock[]{
 let k=0;
 return blocks.map(b=>b.pinned?b:unpinned[k++]!);
}
/** Arrastar um bloco sobre outro: os blocos fixos ficam exatamente na mesma posição da lista. */
export function reorderPreservingPinned(blocks:readonly NewspaperBlock[],fromId:string,toId:string):NewspaperBlock[]{
 const free=blocks.filter(b=>!b.pinned);
 const from=free.findIndex(b=>b.id===fromId),to=free.findIndex(b=>b.id===toId);
 if(from<0||to<0||from===to)return [...blocks];
 const moved=free.splice(from,1)[0]!;
 free.splice(to,0,moved);
 return refill(blocks,free);
}
/** Subir/descer: troca com o vizinho livre mais próximo, passando por cima dos blocos fixos. */
export function movePreservingPinned(blocks:readonly NewspaperBlock[],id:string,direction:-1|1):NewspaperBlock[]{
 const free=blocks.filter(b=>!b.pinned);
 const from=free.findIndex(b=>b.id===id),to=from+direction;
 if(from<0||to<0||to>=free.length)return [...blocks];
 [free[from],free[to]]=[free[to]!,free[from]!];
 return refill(blocks,free);
}
