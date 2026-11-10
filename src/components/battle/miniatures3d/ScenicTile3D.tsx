import type {VisualTerrain} from '@/lib/battle/visual3d/tokens';
import type {MiniaturePalette} from './palette';
/** Decoration only, no collision, ZOC or movement logic. Keep every mesh below
 * the base of the figurine where feasible so selection is never obstructed.
 */
export function ScenicTile3D({terrain,p,occupied=false,road=false,bridge=false}:{
 terrain:VisualTerrain;p:MiniaturePalette;occupied?:boolean;road?:boolean;bridge?:boolean;
}){
 const isBridge=bridge||terrain==='bridge',isRoad=road||terrain==='road';
 return <group>
  {/* Small shape markers remain visible even when terrain props are hidden under a base. */}
  {['forest','marsh','hill','rock','mountain'].includes(terrain)&&
   <group position={[-.34,.032,-.34]}>
    {terrain==='forest'?<mesh rotation={[-Math.PI/2,0,0]} raycast={()=>{}}>
     <coneGeometry args={[.085,.16,5]}/>
     <meshBasicMaterial color={p.ink}/>
    </mesh>:terrain==='marsh'?<mesh rotation={[-Math.PI/2,0,0]} raycast={()=>{}}>
     <torusGeometry args={[.070,.017,4,8]}/>
     <meshBasicMaterial color={p.paper}/>
    </mesh>:terrain==='hill'||terrain==='mountain'?
    <mesh position={[0,.08,0]} raycast={()=>{}}>
     <coneGeometry args={[.075,.15,3]}/>
     <meshBasicMaterial color={p.ink}/>
    </mesh>:<mesh position={[0,.03,0]} raycast={()=>{}}>
     <boxGeometry args={[.11,.06,.11]}/>
     <meshBasicMaterial color={p.paper}/>
    </mesh>}
   </group>}
  {['water','coast','marsh'].includes(terrain)&&!occupied&&
   [-.23,.17].map((x,i)=><mesh key={i} position={[x,.012,-.15+i*.21]} rotation={[-Math.PI/2,0,0]}>
    <torusGeometry args={[.14,.012,4,12,Math.PI]}/>
    <meshBasicMaterial color={p.paper} transparent opacity={.40}/></mesh>)}
  {terrain==='coast'&&<mesh position={[.27,-.006,0]}>
   <boxGeometry args={[.36,.025,.93]}/>
   <meshStandardMaterial color={p.desert} roughness={1}/></mesh>}
  {isRoad&&!isBridge&&<mesh position={[0,.001,0]}>
   <boxGeometry args={[.38,.015,.95]}/>
   <meshStandardMaterial color={p.road} roughness={1}/></mesh>}
  {isBridge&&<>
   <mesh position={[0,-.018,0]}>
    <boxGeometry args={[.96,.015,.88]}/>
    <meshStandardMaterial color={p.water}/></mesh>
   {[-.31,-.15,.01,.17,.33].map(x=><mesh key={x} position={[x,.055,0]}>
    <boxGeometry args={[.13,.07,.72]}/>
    <meshStandardMaterial color={p.wood} roughness={.92}/></mesh>)}
   {[-.39,.39].map(z=><mesh key={z} position={[0,.105,z]}>
    <boxGeometry args={[.93,.065,.07]}/>
    <meshStandardMaterial color={p.gold} roughness={.92}/></mesh>)}
  </>}
  {!occupied&&terrain==='forest'&&[-.21,.21].map(x=><group key={x}
   position={[x,0,-.15]}>
   <mesh position={[0,.07,0]}><cylinderGeometry args={[.03,.04,.16,5]}/>
    <meshStandardMaterial color={p.wood}/></mesh>
   <mesh position={[0,.24,0]}><coneGeometry args={[.15,.29,5]}/>
    <meshStandardMaterial color={p.forest} flatShading/></mesh>
  </group>)}
  {!occupied&&terrain==='desert'&&[-.24,.19].map((x,i)=><mesh key={i}
   position={[x,.033,i?.11:-.15]} scale={[.24,.08,.18]}>
   <dodecahedronGeometry args={[1,0]}/>
   <meshStandardMaterial color={p.road} flatShading/></mesh>)}
  {!occupied&&terrain==='marsh'&&[-.26,.16,.30].map((x,i)=><mesh key={i}
   position={[x,.12,i*.15-.20]}>
   <coneGeometry args={[.045,.25,4]}/>
   <meshStandardMaterial color={p.forest}/></mesh>)}
  {!occupied&&terrain==='mountain'&&<mesh position={[.03,.19,-.06]}>
   <coneGeometry args={[.29,.46,5]}/>
   <meshStandardMaterial color={p.mountain} flatShading/></mesh>}
  {!occupied&&['rock','hill'].includes(terrain)&&<mesh
   position={[.06,.075,-.10]} scale={[.26,.12,.25]}>
   <dodecahedronGeometry args={[1,0]}/>
   <meshStandardMaterial color={terrain==='rock'?p.rock:p.hill} flatShading/></mesh>}
  {!occupied&&terrain==='ruins'&&<group>
   <mesh position={[-.18,.12,-.18]}>
    <boxGeometry args={[.40,.25,.10]}/>
    <meshStandardMaterial color={p.ruins} flatShading/></mesh>
   <mesh position={[-.35,.19,.07]}>
    <boxGeometry args={[.10,.32,.40]}/>
    <meshStandardMaterial color={p.ruins} flatShading/></mesh>
   <mesh position={[.23,.06,.12]}>
    <boxGeometry args={[.27,.10,.25]}/>
    <meshStandardMaterial color={p.rock} flatShading/></mesh>
  </group>}
  {!occupied&&terrain==='settlement'&&<group position={[.05,0,-.10]}>
   <mesh position={[0,.105,0]}>
    <boxGeometry args={[.36,.23,.33]}/>
    <meshStandardMaterial color={p.wood}/></mesh>
   <mesh position={[0,.27,0]} rotation={[0,Math.PI/4,0]}>
    <coneGeometry args={[.28,.27,4]}/>
    <meshStandardMaterial color={p.ruins} flatShading/></mesh>
  </group>}
 </group>;
}
