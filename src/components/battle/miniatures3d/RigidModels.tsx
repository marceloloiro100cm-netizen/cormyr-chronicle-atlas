import type {MiniatureKind} from '@/lib/battle/visual3d/tokens';
import type {MiniaturePalette} from './palette';
import {isCreatureVisualKind} from '@/lib/battle/visual3d/creature-visuals';
import {CreatureModel} from './CreatureModels';

type Point=[number,number,number];
function Block({at,size,color,rotation=[0,0,0]}:{at:Point;size:Point;color:string;rotation?:Point}){
 return <mesh position={at} rotation={rotation}><boxGeometry args={size}/>
  <meshStandardMaterial color={color} roughness={.76} flatShading/></mesh>;
}
function Orb({at,size,color}:{at:Point;size:Point;color:string}){
 return <mesh position={at} scale={size}><sphereGeometry args={[1,8,6]}/>
  <meshStandardMaterial color={color} roughness={.83} flatShading/></mesh>;
}
function Cone({at,r=.12,h=.25,color,rotation=[0,0,0]}:{
 at:Point;r?:number;h?:number;color:string;rotation?:Point;
}){
 return <mesh position={at} rotation={rotation}><coneGeometry args={[r,h,5]}/>
  <meshStandardMaterial color={color} roughness={.85} flatShading/></mesh>;
}
function Pole({at,color,height=.65,r=.018}:{at:Point;color:string;height?:number;r?:number}){
 return <mesh position={at}><cylinderGeometry args={[r,r,height,6]}/>
  <meshStandardMaterial color={color} roughness={.7}/></mesh>;
}
function Shield({p,tall=false,crest=false}:{p:MiniaturePalette;tall?:boolean;crest?:boolean}){
 return <group position={[-.29,.48,.15]}>
  <mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[tall?.16:.17,tall?.16:.17,.06,7]}/>
   <meshStandardMaterial color={crest?p.paper:p.cloth} metalness={.12}/></mesh>
  <Block at={[0,0,.06]} size={[.045,tall?.39:.29,.025]} color={p.gold}/>
  {crest&&<Block at={[0,0,.086]} size={[.17,.042,.026]} color={p.gold}/>}
 </group>;
}
function Sword({p}:{p:MiniaturePalette}){
 return <group>
  <Block at={[.3,.67,.12]} size={[.05,.44,.045]} color={p.metal} rotation={[0,0,-.12]}/>
  <Block at={[.27,.45,.12]} size={[.19,.035,.06]} color={p.gold}/>
 </group>;
}
function Bow({p}:{p:MiniaturePalette}){
 return <group>
  <mesh position={[.28,.53,.16]} rotation={[0,Math.PI/2,0]}>
   <torusGeometry args={[.26,.024,5,12,Math.PI]}/>
   <meshStandardMaterial color={p.wood}/></mesh>
  <Pole at={[.28,.53,.16]} color={p.paper} height={.53} r={.009}/>
  <Block at={[-.11,.52,-.2]} size={[.14,.30,.12]} color={p.wood} rotation={[0,0,.15]}/>
  {[-.15,-.10,-.05].map(x=><Pole key={x} at={[x,.70,-.20]} height={.32} r={.011} color={p.gold}/>)}
 </group>;
}
function Axe({p}:{p:MiniaturePalette}){
 return <group><Pole at={[.31,.57,.15]} color={p.wood} height={.62}/>
  <Block at={[.38,.80,.15]} size={[.17,.18,.05]} color={p.metal} rotation={[0,0,-.18]}/></group>;
}
function Spear({p}:{p:MiniaturePalette}){
 return <group><Pole at={[.30,.67,.12]} color={p.wood} height={1.05}/>
  <Cone at={[.30,1.22,.12]} r={.055} h={.25} color={p.metal}/></group>;
}
function Helmet({p,hood=false,elite=false}:{p:MiniaturePalette;hood?:boolean;elite?:boolean}){
 return <group>
  <Orb at={[0,.86,-.01]} size={[.17,.10,.16]} color={hood?p.cloth:p.metal}/>
  {hood&&<Cone at={[0,.95,-.06]} r={.17} h={.22} color={p.cloth}/>}
  {elite&&<Cone at={[0,1.02,0]} r={.095} h={.20} color={p.gold}/>}
 </group>;
}
function Soldier({kind,p}:{kind:MiniatureKind;p:MiniaturePalette}){
 const goblin=kind==='goblin',undead=kind==='undead';
 const archer=['archer','scouts','guerrillas'].includes(kind);
 const elite=['crusaders','personal-guard','garrison'].includes(kind);
 const hood=['scouts','criminals','guerrillas','raiders'].includes(kind);
 const plate=['infantry','crusaders','personal-guard','garrison','mercenaries','special'].includes(kind);
 const skin=goblin?p.goblin:undead?p.paper:p.skin;
 const armor=plate?p.metal:archer?p.forest:p.cloth;
 return <group scale={goblin?.75:1}>
  <Block at={[-.10,.22,0]} size={[.12,.27,.14]} color={p.ink}/>
  <Block at={[.10,.22,0]} size={[.12,.27,.14]} color={p.ink}/>
  <Block at={[0,.49,0]} size={[.31,.33,.22]} color={armor}/>
  <Orb at={[0,.78,0]} size={[.14,.16,.13]} color={skin}/>
  {(!goblin&&!undead)&&<Helmet p={p} hood={hood} elite={kind==='personal-guard'}/>}
  <Block at={[-.22,.50,.06]} size={[.12,.31,.12]} color={skin} rotation={[0,0,-.28]}/>
  <Block at={[.22,.50,.06]} size={[.12,.31,.12]} color={skin} rotation={[0,0,.28]}/>
  {goblin&&[-1,1].map(sign=><Cone key={sign} at={[sign*.23,.80,0]}
   r={.10} h={.28} rotation={[0,0,-sign*1.1]} color={p.goblin}/>)}
  {undead&&<><Orb at={[-.07,.80,.115]} size={[.03,.04,.02]} color={p.ink}/>
   <Orb at={[.07,.80,.115]} size={[.03,.04,.02]} color={p.ink}/></>}
  {archer?<Bow p={p}/>:['engineers','levies'].includes(kind)?<Pole at={[.30,.65,.16]} height={.85} color={p.wood}/>:
   ['mercenaries','raiders','sailors','goblin'].includes(kind)?<Axe p={p}/>:
   ['garrison','crusaders','special'].includes(kind)?<Spear p={p}/>:<Sword p={p}/>}
  {(!archer&&!['support','engineers','special','levies'].includes(kind))&&
   <Shield p={p} tall={kind==='garrison'} crest={kind==='crusaders'}/>}
  {kind==='support'&&<><Block at={[0,.44,-.23]} size={[.40,.35,.24]} color={p.wood}/>
   <Block at={[-.23,.44,-.23]} size={[.05,.35,.25]} color={p.gold}/></>}
  {kind==='engineers'&&<><Block at={[-.30,.27,.20]} size={[.33,.21,.25]} color={p.wood}/>
   <Block at={[.31,.95,.16]} size={[.23,.12,.13]} color={p.metal}/></>}
  {kind==='special'&&<><Orb at={[.30,1.18,.12]} size={[.12,.12,.12]} color={p.gold}/>
   <Cone at={[0,.98,0]} r={.18} h={.22} color={p.cloth}/></>}
  {kind==='personal-guard'&&<><Block at={[0,.57,.145]} size={[.21,.08,.035]} color={p.gold}/>
   <Block at={[0,.46,.145]} size={[.08,.26,.04]} color={p.gold}/></>}
  {kind==='garrison'&&<Block at={[-.28,.50,.19]} size={[.36,.53,.08]} color={p.cloth}/>}
  {kind==='criminals'&&<><Block at={[-.3,.37,.21]} size={[.06,.24,.05]} color={p.metal}/>
   <Block at={[.3,.32,.21]} size={[.06,.24,.05]} color={p.metal}/></>}
  {kind==='guerrillas'&&<Block at={[0,.40,-.19]} size={[.35,.29,.10]} color={p.wood}/>}
  {kind==='scouts'&&<Block at={[.20,.39,-.17]} size={[.14,.20,.15]} color={p.wood}/>}
  {kind==='sailors'&&<><Block at={[0,.89,0]} size={[.40,.07,.25]} color={p.ink}/>
   <Cone at={[0,1.0,0]} r={.15} h={.16} color={p.ink}/></>}
  {kind==='mercenaries'&&<Block at={[0,.5,.145]} size={[.28,.18,.04]} color={p.wood}/>}
  {kind==='levies'&&<Cone at={[0,.87,0]} r={.18} h={.24} color={p.wood}/>}
  {kind==='raiders'&&<><Pole at={[.37,1.05,.13]} color={p.wood} height={.4}/>
   <Cone at={[.37,1.31,.13]} r={.085} h={.22} color={p.gold}/></>}
 </group>;
}
function Horse({p}:{p:MiniaturePalette}){
 return <group scale={.80}>
  <Orb at={[0,.49,0]} size={[.24,.25,.43]} color={p.wood}/>
  {[-.15,.15].flatMap(x=>[-.29,.29].map(z=>
   <Block key={x+','+z} at={[x,.23,z]} size={[.08,.38,.09]} color={p.wood}/>))}
  <Block at={[0,.76,.30]} size={[.20,.48,.18]} color={p.wood} rotation={[.35,0,0]}/>
  <Orb at={[0,.94,.47]} size={[.14,.17,.23]} color={p.wood}/>
  {[-.085,.085].map(x=><Cone key={x} at={[x,1.10,.41]} r={.046} h={.16} color={p.wood}/>)}
  <Block at={[0,.62,-.47]} size={[.07,.33,.08]} color={p.ink} rotation={[-.6,0,0]}/>
  <Block at={[0,.69,-.03]} size={[.35,.12,.30]} color={p.cloth}/>
  <group position={[0,.57,-.06]} scale={.75}><Soldier kind="infantry" p={p}/></group>
 </group>;
}
function Ship({p}:{p:MiniaturePalette}){
 return <group>
  <mesh position={[0,.30,0]} rotation={[Math.PI/2,0,0]} scale={[.28,.43,.7]}>
   <cylinderGeometry args={[1,1,1,8,1]}/>
   <meshStandardMaterial color={p.wood} flatShading/></mesh>
  <Pole at={[0,.82,0]} color={p.ink} height={1.13} r={.025}/>
  <mesh position={[.04,.88,.0]} rotation={[0,.12,0]}><planeGeometry args={[.48,.67]}/>
   <meshStandardMaterial color={p.paper} side={2}/></mesh>
  <Block at={[0,.48,.03]} size={[.46,.07,.11]} color={p.gold}/>
 </group>;
}
function Beast({p,dragon=false}:{p:MiniaturePalette;dragon?:boolean}){
 return <group>
  <Orb at={[0,.52,0]} size={[.26,.27,.41]} color={dragon?p.goblin:p.wood}/>
  {[-.19,.19].flatMap(x=>[-.27,.25].map(z=>
   <Block key={x+','+z} at={[x,.25,z]} size={[.11,.40,.10]} color={dragon?p.goblin:p.wood}/>))}
  <Orb at={[0,.70,.39]} size={[.20,.22,.23]} color={dragon?p.goblin:p.wood}/>
  {dragon&&<>
   {[-1,1].map(s=><mesh key={s} position={[s*.33,.93,-.02]}
    rotation={[0,0,-s*.4]}><coneGeometry args={[.23,.64,3]}/>
    <meshStandardMaterial color={p.forest} side={2} flatShading/></mesh>)}
   <Cone at={[0,1.02,.48]} r={.12} h={.33} color={p.gold}/>
   <Cone at={[0,.54,-.45]} r={.12} h={.55} color={p.goblin} rotation={[Math.PI/2,0,0]}/>
  </>}
 </group>;
}
function Construct({p}:{p:MiniaturePalette}){
 return <group>
  <Block at={[0,.56,0]} size={[.48,.52,.35]} color={p.rock}/>
  <Block at={[0,.96,0]} size={[.40,.32,.34]} color={p.metal}/>
  {[-.34,.34].map(x=><Block key={x} at={[x,.55,0]} size={[.20,.48,.20]} color={p.rock}/>)}
  {[-.16,.16].map(x=><Block key={x} at={[x,.18,0]} size={[.20,.34,.22]} color={p.rock}/>)}
  {[-.10,.10].map(x=><Orb key={x} at={[x,.98,.18]} size={[.034,.032,.016]} color={p.gold}/>)}
 </group>;
}
/** Sculptural wargame figurines. Exactly one rigid pose per archetype; zero animation rigs. */
export function RigidModel({kind,p,compact=false}:{kind:MiniatureKind;p:MiniaturePalette;compact?:boolean}){
 if(compact){
  const color=kind==='goblin'||kind==='dragon'?p.goblin:
   kind==='warships'||kind==='support'?p.wood:
   kind==='undead'?p.paper:kind==='archer'||kind==='scouts'?p.forest:p.metal;
  return <group>
   <Block at={[0,.41,0]} size={[.33,.55,.27]} color={color}/>
   <Orb at={[0,.78,0]} size={[.15,.16,.14]} color={color}/>
   {['archer','scouts','guerrillas','cavalry','warships','dragon'].includes(kind)?
    <Pole at={[.25,.70,.05]} height={.75} color={p.wood}/>:
    <Block at={[.27,.58,.05]} size={[.05,.45,.05]} color={p.gold}/>}
  </group>;
 }
 if(isCreatureVisualKind(kind))return <CreatureModel kind={kind} p={p}/>;
 if(kind==='warships')return <Ship p={p}/>;
 if(kind==='cavalry')return <Horse p={p}/>;
 if(kind==='dragon')return <Beast p={p} dragon/>;
 if(kind==='beast')return <Beast p={p}/>;
 if(kind==='construct')return <Construct p={p}/>;
 if(kind==='giant')return <group scale={1.32}><Soldier kind="infantry" p={p}/></group>;
 if(kind==='generic')return <group><Cone at={[0,.48,0]} r={.25} h={.65} color={p.metal}/>
  <Orb at={[0,.88,0]} size={[.12,.12,.12]} color={p.gold}/></group>;
 if(kind==='humanoid')return <Soldier kind="mercenaries" p={p}/>;
 return <Soldier kind={kind} p={p}/>;
}
