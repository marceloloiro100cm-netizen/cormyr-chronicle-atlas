import {useEffect,useMemo,useRef,useState} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {Environment,Html,Lightformer} from '@react-three/drei';
import {CanvasTexture,SRGBColorSpace,type Group} from 'three';
import type {BattleMap,Hex} from '@/lib/battle/domain/types';
import {hexKey} from '@/lib/battle/geometry/hex';
import {squareWorldPosition,type VisualToken} from '@/lib/battle/visual3d/tokens';
import {RigidModel} from './RigidModels';
import {CameraRig} from './CameraRig';
import type {MiniaturePalette} from './palette';

export type SceneProps={map:BattleMap;tokens:readonly VisualToken[];selectedId?:string|null;activeId?:string|null;hoveredId?:string|null;
 moveKeys?:readonly string[];attackKeys?:readonly string[];onHexClick?:(hex:Hex)=>void;
 palette:MiniaturePalette;top:boolean;zoom:number;reset:number;reducedMotion:boolean;onReady:()=>void;onFailure:()=>void};
function Ready({onReady}:{onReady:()=>void}){
 const done=useRef(false);useFrame(()=>{if(!done.current){done.current=true;onReady();}});return null;
}
function Token({token,map,p,selected,active,hovered,target,reduced,onClick}:{token:VisualToken;map:BattleMap;p:MiniaturePalette;selected:boolean;active:boolean;hovered:boolean;target:boolean;reduced:boolean;onClick:()=>void}){
 const group=useRef<Group>(null);const {invalidate}=useThree();
 const dest=squareWorldPosition(map,token.position);
 const initial=useRef(dest);
 useEffect(()=>{invalidate();},[dest[0],dest[2],invalidate]);
 useFrame((_,delta)=>{
  if(!group.current)return;
  const pos=group.current.position;const alpha=reduced?1:1-Math.exp(-12*Math.min(delta,.05));
  pos.x+=(dest[0]-pos.x)*alpha;pos.z+=(dest[2]-pos.z)*alpha;
  if(Math.abs(pos.x-dest[0])+Math.abs(pos.z-dest[2])>.001)invalidate();
  else pos.set(dest[0],0,dest[2]);
 });
 return <group ref={group} position={initial.current} onClick={e=>{e.stopPropagation();onClick();}} rotation={[0,token.side==='defender'?Math.PI:0,0]}>
  <mesh position={[0,.055,0]}><cylinderGeometry args={[.40,.43,.11,16]}/><meshStandardMaterial color={p[token.side]} roughness={.5}/></mesh>
  {(selected||active||hovered||target)&&<mesh position={[0,.125,0]} rotation={[-Math.PI/2,0,0]}><torusGeometry args={[.43,.035,6,24]}/><meshBasicMaterial color={target?p.attack:selected||hovered?p.selection:p.move}/></mesh>}
  <RigidModel kind={token.kind} p={p}/>
  <Html position={[0,.10,token.side==='defender'?-.46:.46]} center zIndexRange={[10,0]} style={{pointerEvents:'none'}}>
   <div className="miniatures3d-label">{token.count.toLocaleString('pt-BR')}<small>{token.name}{token.fallback?' · genérica':''}</small></div>
  </Html>
 </group>;
}
function TerrainTexture({p,children}:{p:MiniaturePalette;children:(texture:CanvasTexture|null)=>React.ReactNode}){
 const [texture,setTexture]=useState<CanvasTexture|null>(null);
 useEffect(()=>{
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.fillStyle=p.paper;ctx.fillRect(0,0,64,64);
  ctx.globalAlpha=.12;ctx.fillStyle=p.wood;
  for(let i=0;i<180;i++)ctx.fillRect((i*17)%64,(i*31+Math.floor(i/64)*7)%64,1,2);
  const tex=new CanvasTexture(canvas);tex.colorSpace=SRGBColorSpace;setTexture(tex);
  return ()=>tex.dispose();
 },[p]);
 return children(texture);
}
function Field(props:SceneProps){
 const {map,palette:p,tokens,moveKeys=[],attackKeys=[],onHexClick}=props;
 const moves=useMemo(()=>new Set(moveKeys),[moveKeys]);
 return <>
  <color attach="background" args={[p.ground]}/>
  <ambientLight intensity={.7}/><directionalLight position={[5,12,5]} intensity={2}/>
  <Environment resolution={32}><Lightformer intensity={1.5} position={[0,5,0]} rotation={[-Math.PI/2,0,0]} scale={[12,12,1]}/></Environment>
  <CameraRig width={map.width} height={map.height} top={props.top} zoom={props.zoom} reset={props.reset}/>
  <TerrainTexture p={p}>{texture=><group>{map.tiles.map(tile=>{
   const key=hexKey(tile);const position=squareWorldPosition(map,tile);
   const occupied=tokens.some(t=>hexKey(t.position)===key);
   return <group key={key} position={position} onClick={e=>{e.stopPropagation();onHexClick?.({q:tile.q,r:tile.r});}}>
    <mesh position={[0,-.10,0]}><boxGeometry args={[.97,.18,.97]}/><meshStandardMaterial color={p[tile.terrain]} map={texture} roughness={1}/></mesh>
    {moves.has(key)&&<mesh position={[0,.003,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[.87,.87]}/><meshBasicMaterial color={p.move} transparent opacity={.65}/></mesh>}
    {!occupied&&tile.terrain==='forest'&&[-.23,.23].map(x=><group key={x} position={[x,0,-.12]}>
     <mesh position={[0,.09,0]}><cylinderGeometry args={[.035,.04,.18,5]}/><meshStandardMaterial color={p.wood}/></mesh>
     <mesh position={[0,.27,0]}><coneGeometry args={[.18,.32,6]}/><meshStandardMaterial color={p.forest} flatShading/></mesh>
    </group>)}
    {!occupied&&(tile.terrain==='rock'||tile.terrain==='hill')&&<mesh position={[.12,.08,-.12]} scale={[.35,.17,.3]}><dodecahedronGeometry args={[1,0]}/><meshStandardMaterial color={p[tile.terrain]} flatShading/></mesh>}
   </group>;
  })}</group>}</TerrainTexture>
  {tokens.map(token=><Token key={token.id} token={token} map={map} p={p} selected={token.id===props.selectedId}
   active={token.id===props.activeId} hovered={token.id===props.hoveredId} target={attackKeys.includes(token.id)}
   reduced={props.reducedMotion} onClick={()=>onHexClick?.({...token.position})}/>)}
  <Ready onReady={props.onReady}/>
 </>;
}
export default function MiniatureScene(props:SceneProps){
 return <Canvas orthographic frameloop="demand" dpr={[1,1.5]} camera={{position:[14,18,14],zoom:25,near:.1,far:250}}
  gl={{antialias:true,alpha:false}} onCreated={({gl})=>{
   gl.domElement.addEventListener('webglcontextlost',props.onFailure,{once:true});
  }}><Field {...props}/></Canvas>;
}