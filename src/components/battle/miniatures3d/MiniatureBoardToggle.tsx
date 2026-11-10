import {useState,type ReactNode} from 'react';
import {Button} from '@/components/ui/button';
import type {Hex} from '@/lib/battle/domain/types';
import type {VisualSquareMap,VisualToken} from '@/lib/battle/visual3d/tokens';
import {MiniatureViewport} from './MiniatureViewport';

/** Shared presentation switch only. Rules, saves, rolls and permissions stay with parent. */
export function MiniatureBoardToggle({allowed,map,tokens,selectedId,activeId,hoveredId,
 moveKeys=[],attackKeys=[],onHexClick,fallback}:{
 allowed:boolean;map:VisualSquareMap;tokens:readonly VisualToken[];
 selectedId?:string|null;activeId?:string|null;hoveredId?:string|null;
 moveKeys?:readonly string[];attackKeys?:readonly string[];
 onHexClick:(cell:Hex)=>void;fallback:ReactNode;
}){
 const [view3d,setView3d]=useState(false);
 const [failed,setFailed]=useState(false);
 const show=allowed&&map.grid==='square'&&view3d&&!failed;
 return <>
  {allowed&&map.grid==='square'&&<div className="miniatures3d-toolbar" role="group" aria-label="Visão do campo de batalha">
   <Button variant="outline" aria-pressed={!show} onClick={()=>setView3d(false)}>Mapa 2D</Button>
   <Button variant="outline" aria-pressed={show} disabled={failed}
    onClick={()=>setView3d(true)}>Miniaturas 3D (teste)</Button>
  </div>}
  {failed&&<p role="status">3D indisponível. A visão 2D permanece disponível.</p>}
  {show?<MiniatureViewport map={map} tokens={tokens} selectedId={selectedId}
   activeId={activeId} hoveredId={hoveredId} moveKeys={moveKeys}
   attackKeys={attackKeys} onHexClick={onHexClick}
   fallback={fallback} onFailure={()=>{setFailed(true);setView3d(false);}}/>:fallback}
 </>;
}
