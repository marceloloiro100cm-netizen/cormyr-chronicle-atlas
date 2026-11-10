import type {VisualSquareMap,VisualTerrain,VisualToken} from '@/lib/battle/visual3d/tokens';

const terrainColor:Readonly<Record<VisualTerrain,string>>={
 plain:'#bbac8b',forest:'#62876b',hill:'#9f845c',rock:'#67666a',
 water:'#42758a',settlement:'#a18b7e',
};
/** Explicitly visual-only 2D backup, not a substitute for either combat engine. */
export function VisualGalleryFallback({map,tokens,selectedId,onSelect}:{
 map:VisualSquareMap;tokens:readonly VisualToken[];
 selectedId:string|null;onSelect:(id:string)=>void;
}){
 const byCell=new Map<string,VisualToken>();
 for(const token of tokens)byCell.set(token.position.q+','+token.position.r,token);
 const selected=tokens.find(t=>t.id===selectedId);
 return <section className="miniatures3d-fallback" aria-label="Galeria visual em 2D">
  <p>Prévia estática 2D. As regras e a campanha não são alteradas.</p>
  <div className="miniatures3d-fallback-scroll">
   <div className="miniatures3d-fallback-grid"
    style={{gridTemplateColumns:`repeat(${map.width},minmax(30px,1fr))`}}>
    {map.tiles.map(tile=>{
     const token=byCell.get(tile.q+','+tile.r);
     const id=tile.q+','+tile.r;
     return <button key={id} type="button" disabled={!token}
      onClick={()=>token&&onSelect(token.id)}
      aria-label={token?`${token.name} · casa ${id}`:`Terreno ${tile.terrain} · casa ${id}`}
      aria-pressed={token?.id===selectedId}
      style={{backgroundColor:terrainColor[tile.terrain]}}>
      {token?<span aria-hidden>{token.naval?'⛵':token.flying?'🐉':'♟'}</span>:null}
     </button>;
    })}
   </div>
  </div>
  {selected&&<p role="status">{selected.name} · {selected.count.toLocaleString('pt-BR')}</p>}
 </section>;
}
