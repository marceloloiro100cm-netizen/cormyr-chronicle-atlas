import {useState,type ComponentProps} from 'react';
import {Button} from '@/components/ui/button';
import {BattleBoard} from '../BattleBoard';
import {canUseMiniatures,visualTokens} from '@/lib/battle/visual3d/tokens';
import {MiniatureViewport} from './MiniatureViewport';

type Props=ComponentProps<typeof BattleBoard>&{narrator:boolean;sessionEnabled:boolean};
/** The renderer receives the SAME board props and validated callback; no commands or engines imported. */
export function V3MiniatureBoard({narrator,sessionEnabled,...board}:Props){
 const [three,setThree]=useState(false);const [failed,setFailed]=useState(false);
 const allowed=canUseMiniatures(narrator,sessionEnabled,board.map);
 const fallback=<BattleBoard {...board}/>;
 return <>
  {allowed&&<div className="miniatures3d-toolbar" role="group" aria-label="Visão do campo de batalha">
   <Button variant="outline" aria-pressed={!three} onClick={()=>setThree(false)}>Mapa 2D</Button>
   <Button variant="outline" aria-pressed={three} disabled={failed} onClick={()=>setThree(true)}>Miniaturas 3D (teste)</Button>
  </div>}
  {failed&&<p role="status">3D indisponível neste dispositivo. Mapa 2D preservado.</p>}
  {allowed&&three?<MiniatureViewport map={board.map} tokens={visualTokens(board.map,board.stacks??[])}
   selectedId={board.selectedId??null} activeId={board.activeId??null} hoveredId={board.hoveredId??null}
   moveKeys={board.moveKeys??[]} attackKeys={board.attackKeys??[]}
   {...(board.onHexClick?{onHexClick:board.onHexClick}:{})}
   fallback={fallback} onFailure={()=>{setThree(false);setFailed(true);}}/>:fallback}
 </>;
}