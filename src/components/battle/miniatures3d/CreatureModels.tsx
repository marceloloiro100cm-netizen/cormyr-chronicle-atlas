import type {CreatureMiniatureKind} from '@/lib/battle/visual3d/tokens';
import type {MiniaturePalette} from './palette';
type Point=[number,number,number];
const point=(x:number,y:number,z:number):Point=>[x,y,z];
function Block({at,size,color,rot=[0,0,0]}:{at:Point;size:Point;color:string;rot?:Point}){
 return <mesh position={at} rotation={rot}><boxGeometry args={size}/>
  <meshStandardMaterial color={color} roughness={.84} flatShading/></mesh>;
}
function Orb({at,scale,color,transparent=false}:{at:Point;scale:Point;color:string;transparent?:boolean}){
 return <mesh position={at} scale={scale}><sphereGeometry args={[1,9,6]}/>
  <meshStandardMaterial color={color} transparent={transparent}
   opacity={transparent?.72:1} roughness={.67} flatShading/></mesh>;
}
function Spike({at,color,height=.28,radius=.10,rot=[0,0,0]}:{
 at:Point;color:string;height?:number;radius?:number;rot?:Point;
}){
 return <mesh position={at} rotation={rot}><coneGeometry args={[radius,height,6]}/>
  <meshStandardMaterial color={color} flatShading roughness={.7}/></mesh>;
}
function Rod({at,color,height=.5,radius=.035,rot=[0,0,0]}:{
 at:Point;color:string;height?:number;radius?:number;rot?:Point;
}){
 return <mesh position={at} rotation={rot}><cylinderGeometry args={[radius,radius,height,6]}/>
  <meshStandardMaterial color={color} roughness={.75}/></mesh>;
}
function Wing({at,color,mirrored=false}:{at:Point;color:string;mirrored?:boolean}){
 return <mesh position={at} rotation={[.2,mirrored?-.32:.32,mirrored?-.53:.53]}>
  <coneGeometry args={[.22,.78,3]}/>
  <meshStandardMaterial color={color} side={2} flatShading/>
 </mesh>;
}
function CreatureHumanoid({kind,p}:{kind:CreatureMiniatureKind;p:MiniaturePalette}){
 const bone=kind==='skeleton',spectral=kind==='spirit',zombie=kind==='zombie';
 const tiny=['goblin','kobold','fey'].includes(kind),huge=['giant','troll'].includes(kind);
 const body=bone?p.paper:spectral?p.selection:zombie?p.forest:
  kind==='orc'?p.goblin:kind==='troll'?p.rock:kind==='kobold'?p.wood:
  kind==='fey'?p.gold:kind==='celestial'?p.paper:kind==='fiend'?p.cloth:p.metal;
 return <group scale={tiny?.78:huge?1.22:1}>
  {spectral?<Spike at={[0,.34,0]} color={body} height={.68} radius={.22}/>:
   <><Block at={[-.13,.23,0]} size={[.11,.34,.13]} color={body}/>
   <Block at={[.13,.23,0]} size={[.11,.34,.13]} color={body}/></>}
  <Block at={[0,.54,0]} size={[.37,.41,.26]} color={body}/>
  <Orb at={[0,.90,0]} scale={[.17,.19,.15]} color={body} transparent={spectral}/>
  {[-1,1].map(sign=><Block key={'arm'+sign}
   at={[sign*.27,.53,0]} size={[.12,.36,.15]} color={body}
   rot={[0,0,-sign*.18]}/>)}
  {bone&&<>
   {[.45,.55,.65].map(y=><Block key={y} at={[0,y,.15]} size={[.31,.034,.045]} color={p.ink}/>)}
   {[-.075,.075].map(x=><Orb key={x} at={[x,.92,.135]} scale={[.035,.038,.02]} color={p.ink}/>)}
  </>}
  {zombie&&<><Block at={[.22,.56,.13]} size={[.12,.08,.04]} color={p.ink}/>
   <Orb at={[-.07,.93,.13]} scale={[.035,.04,.022]} color={p.paper}/></>}
  {kind==='kobold'&&<><Spike at={[0,.91,.15]} height={.24} radius={.12} color={p.wood} rot={[Math.PI/2,0,0]}/>
   <Spike at={[0,.39,-.30]} height={.40} radius={.09} color={p.wood} rot={[-Math.PI/2,0,0]}/></>}
  {kind==='goblin'&&[-1,1].map(s=><Spike key={s} at={[s*.22,.92,0]}
   height={.30} radius={.10} color={p.goblin} rot={[0,0,-s*1.08]}/>)}
  {kind==='orc'&&[-1,1].map(s=><Spike key={s} at={[s*.095,.81,.16]}
   height={.17} radius={.035} color={p.paper}/>)}
  {kind==='troll'&&<><Block at={[0,.60,.13]} size={[.43,.15,.18]} color={p.wood}/>
   <Spike at={[0,1.11,0]} color={p.ink} radius={.16}/></>}
  {kind==='giant'&&<Rod at={[.37,.55,.14]} color={p.wood} height={1.2} radius={.09}/>}
  {kind==='fiend'&&<>{[-1,1].map(s=><Spike key={s} at={[s*.12,1.09,-.01]}
   height={.36} radius={.07} color={p.gold} rot={[0,0,-s*.27]}/>)}
   <Wing at={[-.39,.80,-.18]} color={p.cloth} mirrored/>
   <Wing at={[.39,.80,-.18]} color={p.cloth}/></>}
  {kind==='celestial'&&<><Wing at={[-.38,.83,-.2]} color={p.paper} mirrored/>
   <Wing at={[.38,.83,-.2]} color={p.paper}/>
   <mesh position={[0,1.20,0]} rotation={[Math.PI/2,0,0]}>
    <torusGeometry args={[.17,.026,5,14]}/><meshStandardMaterial color={p.gold}/></mesh></>}
  {kind==='fey'&&<><Wing at={[-.3,.7,-.14]} color={p.forest} mirrored/>
   <Wing at={[.3,.7,-.14]} color={p.forest}/></>}
  {kind==='humanoid'&&<><Block at={[-.23,.49,.17]} size={[.25,.33,.035]} color={p.wood}/>
   <Rod at={[.32,.52,.16]} color={p.metal} height={.66}/></>}
  {kind==='undead'&&<><Spike at={[0,1.12,0]} color={p.ink} height={.35} radius={.22}/>
   <Rod at={[.30,.60,.12]} color={p.wood} height={.72}/></>}
 </group>;
}
function Quadruped({kind,p}:{kind:CreatureMiniatureKind;p:MiniaturePalette}){
 const dragon=kind==='dragon',beast=kind==='beast';
 const color=dragon?p.goblin:kind==='aquatic'?p.water:kind==='serpent'?p.forest:
  kind==='insect'||kind==='spider'?p.ink:p.wood;
 if(kind==='serpent')return <group>
  {Array.from({length:5},(_,i)=><Orb key={i}
   at={[Math.sin(i*.85)*.19,.25+i*.08,-.31+i*.15]}
   scale={[.18-i*.018,.16-i*.007,.17]} color={color}/>)}
  <Orb at={[.18,.69,.37]} scale={[.17,.13,.20]} color={color}/>
  <Spike at={[.18,.74,.58]} color={p.paper} height={.12} radius={.035} rot={[Math.PI/2,0,0]}/>
 </group>;
 if(kind==='aquatic')return <group>
  <Orb at={[0,.34,0]} scale={[.30,.20,.51]} color={color}/>
  <Spike at={[0,.62,0]} color={p.forest} height={.38} radius={.16}/>
  <Spike at={[0,.34,-.54]} color={color} height={.42} radius={.20} rot={[Math.PI/2,0,0]}/>
  <Orb at={[-.18,.39,.33]} scale={[.03,.03,.03]} color={p.paper}/>
 </group>;
 return <group>
  <Orb at={[0,.50,0]} scale={[dragon?.35:.29,dragon?.29:.26,.39]} color={color}/>
  {[-1,1].flatMap(s=>[-1,1].map(z=><Block key={s+','+z}
   at={[s*.21,.26,z*.29]} size={[.105,.38,.11]} color={color}/>))}
  <Orb at={[0,.71,.38]} scale={[.21,.20,.22]} color={color}/>
  {dragon&&<><Wing at={[-.38,.93,-.12]} color={p.forest} mirrored/>
   <Wing at={[.38,.93,-.12]} color={p.forest}/>
   <Spike at={[0,.58,-.52]} color={p.goblin} height={.5} radius={.12} rot={[-Math.PI/2,0,0]}/>
   {[-.13,.13].map(x=><Spike key={x} at={[x,.95,.41]} color={p.gold}
    radius={.045} height={.23} />)}</>}
  {beast&&<><Spike at={[-.14,.88,.42]} color={p.wood} height={.18} radius={.06}/>
   <Spike at={[.14,.88,.42]} color={p.wood} height={.18} radius={.06}/></>}
 </group>;
}
function Arthropod({kind,p}:{kind:'insect'|'spider'|'swarm';p:MiniaturePalette}){
 const spider=kind==='spider',swarm=kind==='swarm',n=swarm?6:spider?8:6;
 if(swarm)return <group>
  {Array.from({length:n},(_,i)=>{
   const a=i/n*Math.PI*2;
   return <group key={i} position={[Math.cos(a)*.27,.15+(i%3)*.07,Math.sin(a)*.27]}>
    <Orb at={[0,0,0]} scale={[.12,.09,.13]} color={i%2?p.wood:p.ink}/>
    <Spike at={[.10,.09,0]} color={p.gold} height={.12} radius={.025}/>
   </group>;
  })}
 </group>;
 return <group>
  <Orb at={[0,.43,.1]} scale={[.21,.23,.26]} color={spider?p.ink:p.wood}/>
  <Orb at={[0,.38,-.27]} scale={[.26,.24,.30]} color={spider?p.ink:p.wood}/>
  {Array.from({length:n},(_,i)=>{
   const s=i%2===0?-1:1,k=Math.floor(i/2),z=-.27+k*.19;
   return <group key={i}>
    <Rod at={[s*.28,.40,z]} color={spider?p.ink:p.wood}
     height={.48} radius={.035} rot={[0,0,s*1.15]}/>
    <Rod at={[s*.50,.24,z]} color={spider?p.ink:p.wood}
     height={.40} radius={.03} rot={[0,0,s*.35]}/>
   </group>;
  })}
  {spider&&[-.07,.07].map(x=><Orb key={x} at={[x,.49,.34]} scale={[.034,.03,.02]} color={p.gold}/>)}
  {!spider&&<><Wing at={[-.24,.73,-.07]} color={p.paper} mirrored/>
   <Wing at={[.24,.73,-.07]} color={p.paper}/></>}
 </group>;
}
function Strange({kind,p}:{kind:CreatureMiniatureKind;p:MiniaturePalette}){
 if(kind==='ooze')return <group>
  <Orb at={[0,.34,0]} scale={[.35,.35,.34]} color={p.forest} transparent/>
  <Orb at={[.10,.17,.17]} scale={[.23,.17,.20]} color={p.goblin} transparent/>
  <Orb at={[-.09,.49,.16]} scale={[.045,.045,.02]} color={p.paper}/>
 </group>;
 if(kind==='plant')return <group>
  <Rod at={[0,.45,0]} color={p.wood} height={.70} radius={.12}/>
  <Orb at={[0,.90,0]} scale={[.32,.31,.31]} color={p.forest}/>
  {[-1,1].map(s=><group key={s}>
   <Rod at={[s*.29,.58,0]} color={p.wood} height={.50} rot={[0,0,s*.8]}/>
   <Orb at={[s*.49,.76,0]} scale={[.12,.19,.12]} color={p.forest}/>
  </group>)}
  <Block at={[-.10,.20,0]} size={[.11,.31,.12]} color={p.wood}/>
  <Block at={[.10,.20,0]} size={[.11,.31,.12]} color={p.wood}/>
 </group>;
 if(kind==='elemental')return <group>
  <Orb at={[0,.36,0]} scale={[.22,.25,.22]} color={p.gold}/>
  {[0,1,2,3].map(i=><Spike key={i}
   at={[Math.sin(i*1.5)*.18,.64+i*.12,Math.cos(i*1.5)*.14]}
   height={.38+i*.06} radius={.13} color={i%2?p.gold:p.wood}
   rot={[0,0,Math.sin(i*1.5)*.30]}/>)}
 </group>;
 if(kind==='aberration')return <group>
  <Orb at={[0,.73,0]} scale={[.30,.28,.28]} color={p.cloth}/>
  <Orb at={[0,.76,.26]} scale={[.15,.15,.025]} color={p.paper}/>
  <Orb at={[0,.76,.285]} scale={[.06,.07,.02]} color={p.ink}/>
  {Array.from({length:6},(_,i)=>{
   const a=i*Math.PI/3;
   return <Rod key={i}
    at={[Math.cos(a)*.32,.36,Math.sin(a)*.31]}
    height={.52} radius={.055} color={p.cloth}
    rot={[Math.sin(a)*.38,0,Math.cos(a)*.5]}/>;
  })}
 </group>;
 if(kind==='construct')return <group>
  <Block at={[0,.60,0]} size={[.48,.55,.36]} color={p.rock}/>
  <Block at={[0,1.0,0]} size={[.38,.29,.31]} color={p.metal}/>
  {[-1,1].map(s=><group key={s}>
   <Block at={[s*.34,.55,0]} size={[.19,.45,.19]} color={p.rock}/>
   <Block at={[s*.14,.20,0]} size={[.17,.34,.20]} color={p.rock}/>
   <Orb at={[s*.09,1.0,.16]} scale={[.03,.03,.016]} color={p.gold}/>
  </group>)}
 </group>;
 return <CreatureHumanoid kind="humanoid" p={p}/>;
}
/** 25 original, rigid, non-rigged silhouettes. No protected character meshes. */
export function CreatureModel({kind,p}:{kind:CreatureMiniatureKind;p:MiniaturePalette}){
 if(['goblin','kobold','orc','undead','skeleton','zombie','spirit',
   'giant','humanoid','fiend','celestial','fey','troll'].includes(kind))
  return <CreatureHumanoid kind={kind} p={p}/>;
 if(['dragon','beast','aquatic','serpent'].includes(kind))
  return <Quadruped kind={kind} p={p}/>;
 if(kind==='spider'||kind==='insect'||kind==='swarm')
  return <Arthropod kind={kind} p={p}/>;
 return <Strange kind={kind} p={p}/>;
}
