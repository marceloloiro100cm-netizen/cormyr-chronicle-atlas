import '@react-three/fiber';
import type {MiniatureKind} from '@/lib/battle/visual3d/tokens';
import type {MiniaturePalette} from './palette';

type PartProps={at:[number,number,number];size:[number,number,number];color:string;rotation?:[number,number,number]};
function Block({at,size,color,rotation=[0,0,0]}:PartProps){
 return <mesh position={at} rotation={rotation}><boxGeometry args={size}/><meshStandardMaterial color={color} roughness={.7} flatShading/></mesh>;
}
function Ball({at,size,color}:PartProps){
 return <mesh position={at} scale={size}><sphereGeometry args={[1,8,6]}/><meshStandardMaterial color={color} roughness={.8} flatShading/></mesh>;
}
function Soldier({p,archer=false,goblin=false}:{p:MiniaturePalette;archer?:boolean;goblin?:boolean}){
 const skin=goblin?p.goblin:p.skin;
 return <group>
  <Block at={[-.10,.23,0]} size={[.12,.27,.14]} color={p.ink}/>
  <Block at={[.10,.23,0]} size={[.12,.27,.14]} color={p.ink}/>
  <Block at={[0,.48,0]} size={[.30,.32,.22]} color={archer?p.forest:goblin?p.wood:p.metal}/>
  <Ball at={[0,.77,0]} size={[.14,.16,.13]} color={skin}/>
  {!goblin&&<Ball at={[0,.86,-.01]} size={[.155,.10,.145]} color={archer?p.forest:p.metal}/>}
  <Block at={[-.22,.50,.06]} size={[.12,.31,.12]} color={skin} rotation={[0,0,-.35]}/>
  <Block at={[.22,.50,.06]} size={[.12,.31,.12]} color={skin} rotation={[0,0,.35]}/>
  {goblin&&<>
   {[-1,1].map(sign=><mesh key={sign} position={[sign*.22,.80,0]} rotation={[0,0,-sign*1.1]}><coneGeometry args={[.12,.3,3]}/><meshStandardMaterial color={p.goblin}/></mesh>)}
   <Block at={[0,.76,.13]} size={[.10,.08,.1]} color={p.goblin}/>
   {[-1,1].map(sign=><Ball key={sign} at={[sign*.06,.82,.115]} size={[.027,.025,.018]} color={p.ink}/>)}
  </>}
  {archer?<>
   <mesh position={[.30,.55,.16]} rotation={[0,Math.PI/2,0]}><torusGeometry args={[.26,.025,6,12,Math.PI]}/><meshStandardMaterial color={p.wood}/></mesh>
   <Block at={[.30,.55,.16]} size={[.012,.52,.012]} color={p.paper}/>
   <Block at={[-.10,.52,-.20]} size={[.12,.32,.12]} color={p.wood} rotation={[0,0,.2]}/>
   {[-.14,-.09,-.04].map(x=><Block key={x} at={[x,.76,-.21]} size={[.015,.30,.015]} color={p.gold}/>)}
  </>:<>
   <mesh position={[-.27,.49,.16]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.19,.19,.07,8]}/><meshStandardMaterial color={goblin?p.wood:p.cloth} metalness={.25}/></mesh>
   <Block at={[-.27,.49,.205]} size={[.045,.28,.025]} color={p.gold}/>
   <Block at={[.30,.66,.1]} size={[.05,.43,.045]} color={p.metal} rotation={[0,0,-.15]}/>
   <Block at={[.28,.45,.1]} size={[.17,.035,.06]} color={p.gold}/>
  </>}
 </group>;
}
/** Original solid geometry: all poses fixed; no bones, rigs, limb animation or asset fetches. */
export function RigidModel({kind,p}:{kind:MiniatureKind;p:MiniaturePalette}){
 if(kind!=='cavalry')return <Soldier p={p} archer={kind==='archer'} goblin={kind==='goblin'}/>;
 return <group scale={.78}>
  <Ball at={[0,.49,0]} size={[.24,.25,.47]} color={p.wood}/>
  {[-.15,.15].flatMap(x=>[-.29,.29].map(z=><Block key={x+','+z} at={[x,.24,z]} size={[.08,.38,.09]} color={p.wood}/>))}
  <Block at={[0,.75,.30]} size={[.19,.47,.20]} color={p.wood} rotation={[.4,0,0]}/>
  <Ball at={[0,.95,.47]} size={[.14,.17,.24]} color={p.wood}/>
  {[-.085,.085].map(x=><mesh key={x} position={[x,1.13,.4]}><coneGeometry args={[.045,.17,4]}/><meshStandardMaterial color={p.wood}/></mesh>)}
  <Block at={[0,.60,-.48]} size={[.07,.32,.08]} color={p.ink} rotation={[-.6,0,0]}/>
  <Block at={[0,.71,-.03]} size={[.36,.10,.28]} color={p.cloth}/>
  <group position={[0,.59,-.06]} scale={.75}><Soldier p={p}/></group>
 </group>;
}