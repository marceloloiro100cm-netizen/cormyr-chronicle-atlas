import {useEffect,useMemo,useRef} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {CanvasTexture,LinearFilter,SRGBColorSpace,type Group} from 'three';
import type {Hex} from '@/lib/battle/domain/types';
import {hexKey} from '@/lib/battle/geometry/hex';
import {squareWorldPosition,type VisualToken,type VisualSquareMap} from '@/lib/battle/visual3d/tokens';
import {RigidModel} from './RigidModels';
import {CameraRig} from './CameraRig';
import {ScenicTile3D} from './ScenicTile3D';
import type {MiniaturePalette} from './palette';

export type SceneProps={
 map:VisualSquareMap;tokens:readonly VisualToken[];selectedId?:string|null;
 activeId?:string|null;hoveredId?:string|null;moveKeys?:readonly string[];
 attackKeys?:readonly string[];onHexClick?:(hex:Hex)=>void;
 palette:MiniaturePalette;top:boolean;zoom:number;reset:number;
 reducedMotion:boolean;onReady:()=>void;onFailure:()=>void;
};
function Ready({onReady}:{onReady:()=>void}){
 const done=useRef(false);
 useFrame(()=>{if(!done.current){done.current=true;onReady();}});
 return null;
}
function tokenLocation(map:VisualSquareMap,t:VisualToken):[number,number,number]{
 const squares=t.footprintCells?.length?t.footprintCells:[t.position];
 const centerX=squares.reduce((sum,p)=>sum+p.q,0)/squares.length;
 const centerY=squares.reduce((sum,p)=>sum+p.r,0)/squares.length;
 return [centerX-(map.width-1)/2,t.flying?.32:0,centerY-(map.height-1)/2];
}
/** Numeric billboard rendered by WebGL itself; avoids unstable DOM portals per token.
 * Full name and count remain available in the HTML selection strip and 2D fallback.
 */
function CountSprite({value,p,at}:{value:number;p:MiniaturePalette;at:[number,number,number]}){
 const texture=useMemo(()=>{
  if(typeof document==='undefined')return null;
  const canvas=document.createElement('canvas');
  canvas.width=256;canvas.height=128;
  const context=canvas.getContext('2d');
  if(!context)return null;
  context.fillStyle=p.ink;context.fillRect(9,12,238,104);
  context.lineWidth=7;context.strokeStyle=p.gold;context.strokeRect(9,12,238,104);
  context.fillStyle=p.paper;context.font='bold 64px system-ui, sans-serif';
  context.textAlign='center';context.textBaseline='middle';
  context.fillText(value.toLocaleString('pt-BR'),128,64,225);
  const tex=new CanvasTexture(canvas);
  tex.colorSpace=SRGBColorSpace;tex.minFilter=LinearFilter;tex.magFilter=LinearFilter;
  return tex;
 },[value,p.ink,p.gold,p.paper]);
 useEffect(()=>()=>{texture?.dispose();},[texture]);
 if(!texture)return null;
 return <sprite position={at} scale={[.62,.31,1]}>
  <spriteMaterial map={texture} transparent depthTest={false}
   depthWrite={false} toneMapped={false}/>
 </sprite>;
}
function Token({token,map,p,selected,active,hovered,target,reduced,compact,onClick}:{
 token:VisualToken;map:VisualSquareMap;p:MiniaturePalette;
 selected:boolean;active:boolean;hovered:boolean;target:boolean;
 reduced:boolean;compact:boolean;onClick:()=>void;
}){
 const group=useRef<Group>(null);
 const {invalidate}=useThree();
 const dest=tokenLocation(map,token);
 const initial=useRef(dest);
 const count=token.footprintCells?.length??1;
 const span=Math.max(1,Math.round(Math.sqrt(count)));
 const radius=.40*span;
 const scale=1+.30*(span-1);
 useEffect(()=>{invalidate();},[dest[0],dest[1],dest[2],invalidate]);
 useFrame((_,delta)=>{
  if(!group.current)return;
  const pos=group.current.position,alpha=reduced?1:1-Math.exp(-12*Math.min(delta,.05));
  pos.x+=(dest[0]-pos.x)*alpha;
  pos.y+=(dest[1]-pos.y)*alpha;
  pos.z+=(dest[2]-pos.z)*alpha;
  if(Math.abs(pos.x-dest[0])+Math.abs(pos.y-dest[1])+Math.abs(pos.z-dest[2])>.001)invalidate();
  else pos.set(...dest);
 });
 return <group ref={group} position={initial.current}
  onClick={e=>{e.stopPropagation();if(e.delta<=6)onClick();}}
  rotation={[0,token.side==='defender'?Math.PI:0,0]}>
  {token.flying&&<mesh position={[0,-.10,0]}>
   <cylinderGeometry args={[.035,.035,.68,6]}/>
   <meshStandardMaterial color={p.metal} transparent opacity={.7}/></mesh>}
  <mesh position={[0,.055,0]}><cylinderGeometry args={[radius,radius+.03,.11,16]}/>
   <meshStandardMaterial color={p[token.side]} roughness={.5}/></mesh>
  {(selected||active||hovered||target)&&<mesh position={[0,.125,0]} rotation={[-Math.PI/2,0,0]}>
   <torusGeometry args={[radius+.03,.037,6,24]}/>
   <meshBasicMaterial color={target?p.attack:selected||hovered?p.selection:p.move}/></mesh>}
  <group scale={scale}><RigidModel kind={token.kind} p={p} compact={compact}/></group>
  <CountSprite value={token.count} p={p}
   at={[0,.22,token.side==='defender'?-radius-.13:radius+.13]}/>
 </group>;
}
function Field(props:SceneProps){
 const {map,palette:p,tokens,moveKeys=[],attackKeys=[],onHexClick}=props;
 const moves=useMemo(()=>new Set(moveKeys),[moveKeys]);
 const occupied=useMemo(()=>new Set(tokens.flatMap(t=>
  (t.footprintCells?.length?t.footprintCells:[t.position]).map(hexKey))),[tokens]);
 const compact=tokens.length>24;
 const selectedFootprint=useMemo(()=>new Set(tokens.filter(t=>
  t.id===props.selectedId||t.id===props.activeId).flatMap(t=>
  (t.footprintCells?.length?t.footprintCells:[t.position]).map(hexKey))),
  [tokens,props.selectedId,props.activeId]);
 const attacks=useMemo(()=>new Set(attackKeys),[attackKeys]);
 return <>
  <color attach="background" args={[p.ground]}/>
  <ambientLight intensity={1.05}/>
  <directionalLight position={[5,12,5]} intensity={1.45}/>
  <CameraRig width={map.width} height={map.height} top={props.top}
   zoom={props.zoom} reset={props.reset}/>
  <group>{map.tiles.map(tile=>{
   const key=hexKey(tile);
   const position=squareWorldPosition(map,tile);
   const unit=occupied.has(key);
   return <group key={key} position={position} onClick={e=>{
    e.stopPropagation();if(e.delta<=6)onHexClick?.({q:tile.q,r:tile.r});
   }}>
    <mesh position={[0,-.10,0]}>
     <boxGeometry args={[.975,.18,.975]}/>
     <meshStandardMaterial color={p[tile.terrain]} roughness={1} flatShading/>
    </mesh>
    {moves.has(key)&&<mesh position={[0,.004,0]} rotation={[-Math.PI/2,0,0]}>
     <planeGeometry args={[.87,.87]}/>
     <meshBasicMaterial color={p.move} transparent opacity={.62}/></mesh>}
    {selectedFootprint.has(key)&&<mesh position={[0,.014,0]}
      rotation={[-Math.PI/2,0,0]}>
      <planeGeometry args={[.91,.91]}/>
      <meshBasicMaterial color={p.selection} transparent opacity={.28}
       depthWrite={false}/></mesh>}
    <ScenicTile3D terrain={tile.terrain} p={p} occupied={unit}
     road={Boolean(tile.road)} bridge={Boolean(tile.bridge)}/>
    </group>;
  })}</group>
  {tokens.map(token=><Token key={token.id} token={token} map={map} p={p}
   selected={token.id===props.selectedId} active={token.id===props.activeId}
   hovered={token.id===props.hoveredId} target={attacks.has(token.id)}
   compact={compact} reduced={props.reducedMotion}
   onClick={()=>onHexClick?.({...token.position})}/>)}
  <Ready onReady={props.onReady}/>
 </>;
}
/** Frame on demand; capped DPR on mobile. Never touch an engine or mutate battle state. */
export default function MiniatureScene(props:SceneProps){
 return <Canvas orthographic frameloop="demand" dpr={[1,1.35]}
  camera={{position:[14,18,14],zoom:25,near:.1,far:250}}
  gl={{antialias:true,alpha:false,powerPreference:'low-power'}}
  onCreated={({gl})=>{
   gl.domElement.addEventListener('webglcontextlost',props.onFailure,{once:true});
  }}><Field {...props}/></Canvas>;
}
