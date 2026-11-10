import {useEffect,useMemo,useRef} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {CanvasTexture,LinearFilter,SRGBColorSpace,type Group} from 'three';
import type {Hex} from '@/lib/battle/domain/types';
import {hexKey} from '@/lib/battle/geometry/hex';
import {squareWorldPosition,type VisualToken,type VisualSquareMap,type VisualFeature} from '@/lib/battle/visual3d/tokens';
import {RigidModel} from './RigidModels';
import {CameraRig} from './CameraRig';
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
  <group scale={scale}><RigidModel kind={token.kind} p={p} compact={compact} cosmeticTint={token.cosmeticTint}/></group>
  <CountSprite value={token.count} p={p}
   at={[0,.22,token.side==='defender'?-radius-.13:radius+.13]}/>
 </group>;
}
/** Decorative-only terrain for coastal war maps. No changes to collision, rules or LOS. */
function TileDecoration({feature,p,occupied}:{
 feature:VisualFeature;p:MiniaturePalette;occupied:boolean;
}){
 if(feature==='road')return <mesh position={[0,.022,0]}>
  <boxGeometry args={[.92,.035,.24]}/>
  <meshStandardMaterial color={p.wood} flatShading roughness={1}/></mesh>;
 if(feature==='bridge')return <group>
  <mesh position={[0,.09,0]}><boxGeometry args={[.97,.18,.35]}/>
   <meshStandardMaterial color={p.wood} flatShading/></mesh>
  {[-.40,.40].map(x=><mesh key={x} position={[x,.19,.19]}>
   <boxGeometry args={[.08,.24,.07]}/>
   <meshStandardMaterial color={p.gold} flatShading/></mesh>)}
 </group>;
 if(feature==='coast')return <group>
  <mesh position={[-.28,.01,0]}><boxGeometry args={[.31,.06,.92]}/>
   <meshStandardMaterial color={p.plain} flatShading/></mesh>
  <mesh position={[-.04,.02,0]}><boxGeometry args={[.09,.04,.89]}/>
   <meshStandardMaterial color={p.paper} flatShading/></mesh>
 </group>;
 if(feature==='island')return !occupied&&<mesh position={[0,.03,0]} scale={[.34,.13,.37]}>
  <dodecahedronGeometry args={[1,0]}/>
  <meshStandardMaterial color={p.forest} flatShading/></mesh>;
 if(feature==='marsh')return <group>
  {[-.27,0,.29].map(x=><mesh key={x} position={[x,.008,.18]} rotation={[-Math.PI/2,0,0]}>
   <planeGeometry args={[.23,.27]}/>
   <meshBasicMaterial color={p.water} transparent opacity={.8}/></mesh>)}
  {!occupied&&[0,.3].map(x=><mesh key={x} position={[x,.12,-.26]}>
   <coneGeometry args={[.05,.21,4]}/>
   <meshStandardMaterial color={p.forest}/></mesh>)}
 </group>;
 if(occupied)return null;
 if(feature==='wall')return <mesh position={[0,.14,-.32]}>
  <boxGeometry args={[.92,.28,.23]}/>
  <meshStandardMaterial color={p.rock} roughness={1} flatShading/></mesh>;
 if(feature==='ruins')return <group>
  {[-.24,.17].map((x,i)=><mesh key={x} position={[x,.12,-.25]}>
   <boxGeometry args={[.22,i?.20:.27,.23]}/>
   <meshStandardMaterial color={p.rock} flatShading/></mesh>)}
 </group>;
 if(feature==='fort')return <group>
  <mesh position={[0,.12,-.2]}><boxGeometry args={[.58,.26,.3]}/>
   <meshStandardMaterial color={p.rock} flatShading/></mesh>
  <mesh position={[0,.35,-.2]}><coneGeometry args={[.25,.23,4]}/>
   <meshStandardMaterial color={p.wood} flatShading/></mesh>
 </group>;
 return null;
}
function Field(props:SceneProps){
 const {map,palette:p,tokens,moveKeys=[],attackKeys=[],onHexClick}=props;
 const moves=useMemo(()=>new Set(moveKeys),[moveKeys]);
 const occupied=useMemo(()=>new Set(tokens.flatMap(t=>
  (t.footprintCells?.length?t.footprintCells:[t.position]).map(hexKey))),[tokens]);
 const compact=tokens.length>40;
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
    {tile.feature&&<TileDecoration feature={tile.feature} p={p} occupied={unit}/>}
    {moves.has(key)&&<mesh position={[0,.004,0]} rotation={[-Math.PI/2,0,0]}>
     <planeGeometry args={[.87,.87]}/>
     <meshBasicMaterial color={p.move} transparent opacity={.62}/></mesh>}
    {!unit&&tile.terrain==='forest'&&[-.21,.21].map(x=>
     <group key={x} position={[x,0,-.12]}>
      <mesh position={[0,.07,0]}><cylinderGeometry args={[.03,.04,.16,5]}/>
       <meshStandardMaterial color={p.wood}/></mesh>
      <mesh position={[0,.24,0]}><coneGeometry args={[.17,.32,5]}/>
       <meshStandardMaterial color={p.forest} flatShading/></mesh>
     </group>)}
    {!unit&&['rock','hill','settlement'].includes(tile.terrain)&&
     <mesh position={[.10,.08,-.12]} scale={[.30,.13,.27]}>
      <dodecahedronGeometry args={[1,0]}/>
      <meshStandardMaterial color={tile.terrain==='settlement'?p.wood:p[tile.terrain]} flatShading/>
     </mesh>}
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
