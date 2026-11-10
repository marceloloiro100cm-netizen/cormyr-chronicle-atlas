import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {miniatureCatalog,miniatureDemo,miniatureStressDemo} from '@/lib/battle/visual3d/demo';
import {scenicDemo,type ScenicDemoId} from '@/lib/battle/visual3d/scenic-demos';
import type {VisualSquareMap,VisualToken} from '@/lib/battle/visual3d/tokens';
import {BattleBoard} from '../BattleBoard';
import {MiniatureViewport} from './MiniatureViewport';

type GalleryView='four'|'military'|'stress40'|'stress80'|ScenicDemoId;
function ScenicFallback({map,tokens,onSelect}:{
 map:VisualSquareMap;tokens:readonly VisualToken[];onSelect:(id:string)=>void;
}){
 const byTile=new Map(tokens.flatMap(t=>
  (t.footprintCells?.length?t.footprintCells:[t.position])
   .map(cell=>[cell.q+','+cell.r,t] as const)));
 return <div role="group" aria-label="Versão 2D demonstrativa do cenário"
  className="miniatures3d-fallback-grid"
  style={{gridTemplateColumns:'repeat('+map.width+',minmax(24px,1fr))'}}>
  {map.tiles.map(tile=>{
   const token=byTile.get(tile.q+','+tile.r);
   return <button key={tile.q+','+tile.r} type="button"
    aria-label={'Quadrado '+tile.q+','+tile.r+' · '+tile.terrain+
     (token?' · '+token.name:'')}
    title={token?.name??tile.terrain}
    onClick={()=>{if(token)onSelect(token.id);}}
    style={{backgroundColor:'var(--mini-'+tile.terrain+')'}}>
    {token?'●':''}
   </button>;
  })}
 </div>;
}
/** All five modes are read-only visual demonstrations. No real battle reducer
 * is imported, naval simulation is not created and campaign sheets are untouched.
 */
export function MiniatureDemo({narrator}:{narrator:boolean}){
 const [show,setShow]=useState(false);
 const [demo,setDemo]=useState(miniatureDemo);
 const [selected,setSelected]=useState('demo-infantry');
 const [view,setView]=useState<GalleryView>('four');
 const display=view==='four'?demo:view==='military'?miniatureCatalog():
  view==='stress40'?miniatureStressDemo(40):view==='stress80'?miniatureStressDemo(80):scenicDemo(view);
 const legacy=view==='four'||view==='military'||view==='stress40'||view==='stress80';
 const legacyMap=display.map;
 if(!narrator)return null;
 const selectView=(next:GalleryView)=>{
  setView(next);
  setSelected(next==='four'?'demo-infantry':next==='military'?'demo-military-support':
   next==='stress40'||next==='stress80'?'benchmark-0':
   next==='creatures'?'demo-creature-goblin':next==='coast'?'demo-naval-one':'demo-bridge-guard');
 };
 const stacks=legacy?display.tokens.map(t=>({...t,
  primaryTypeId:t.kind==='archer'?'archers':t.kind,
  initialCount:t.count,currentHp:t.count*10,hpPerSoldier:10,moraleState:'steady' as const})):[];
 const sceneNotice=!legacy?scenicDemo(view as ScenicDemoId).notice:null;
 return <section className="miniatures3d-demo" aria-label="Protótipo visual isolado">
  <Button variant="outline" aria-expanded={show}
   onClick={()=>setShow(v=>!v)}>{show?'Fechar protótipo':'Ver protótipo 3D'}</Button>
  {show&&<>
   <div className="miniatures3d-scene-nav" role="group" aria-label="Galerias e cenários 3D">
    <Button variant="outline" aria-pressed={view==='four'}
     onClick={()=>selectView('four')}>4 protótipos</Button>
    <Button variant="outline" aria-pressed={view==='military'}
     onClick={()=>selectView('military')}>17 unidades</Button>
    <Button variant="outline" aria-pressed={view==='creatures'}
     onClick={()=>selectView('creatures')}>25 famílias de monstros</Button>
    <Button variant="outline" aria-pressed={view==='stress40'}
     onClick={()=>selectView('stress40')}>40 peças (teste)</Button>
    <Button variant="outline" aria-pressed={view==='stress80'}
     onClick={()=>selectView('stress80')}>80 peças (teste)</Button>
    <Button variant="outline" aria-pressed={view==='coast'}
     onClick={()=>selectView('coast')}>Costa e navios</Button>
    <Button variant="outline" aria-pressed={view==='fortress'}
     onClick={()=>selectView('fortress')}>Ponte e fortaleza</Button>
    {view==='four'&&<Button variant="outline" onClick={()=>setDemo(d=>({...d,
     tokens:d.tokens.map(t=>t.id===selected?
      {...t,position:{...t.position,q:t.position.q===8?2:t.position.q+1}}:t),
    }))}>Mover peça</Button>}
   </div>
   {sceneNotice&&<p className="miniatures3d-scenic-note">{sceneNotice}</p>}
   {(view==='stress40'||view==='stress80')&&<p className="miniatures3d-scenic-note">
    Cenário sintético de desempenho: toque em Medir FPS para coletar um resultado
    neste dispositivo. O resultado não substitui um teste de partida real.
   </p>}
   <MiniatureViewport map={display.map} tokens={display.tokens} selectedId={selected}
    forceDetailed={view==='creatures'}
    onHexClick={hex=>{
     const token=display.tokens.find(t=>(t.footprintCells?.length?t.footprintCells:
      [t.position]).some(p=>p.q===hex.q&&p.r===hex.r));
     if(token)setSelected(token.id);
    }} fallback={legacy?
     <BattleBoard map={legacyMap} stacks={stacks} selectedId={selected}/>:
     <ScenicFallback map={display.map} tokens={display.tokens} onSelect={setSelected}/>}/>
  </>}
 </section>;
}
