import type {AdvancedMonsterKind,DragonMiniatureTint} from '@/lib/battle/visual3d/monster-kinds';
import {DRAGON_TINT_COLORS} from '@/lib/battle/visual3d/monster-kinds';
import type {MiniaturePalette} from './palette';
type V=[number,number,number];
function Box({p,size,color,rot=[0,0,0]}:{p:V;size:V;color:string;rot?:V}){
 return <mesh position={p} rotation={rot}><boxGeometry args={size}/>
  <meshStandardMaterial color={color} flatShading roughness={.8}/></mesh>;
}
function Ball({p,scale,color}:{p:V;scale:V;color:string}){
 return <mesh position={p} scale={scale}><sphereGeometry args={[1,8,6]}/>
  <meshStandardMaterial color={color} flatShading roughness={.8}/></mesh>;
}
function Spike({p,r,h,color,rot=[0,0,0]}:{p:V;r:number;h:number;color:string;rot?:V}){
 return <mesh position={p} rotation={rot}><coneGeometry args={[r,h,5]}/>
  <meshStandardMaterial color={color} flatShading roughness={.8}/></mesh>;
}
function Limb({p,h,color,rot=[0,0,0],r=.065}:{p:V;h:number;color:string;rot?:V;r?:number}){
 return <mesh position={p} rotation={rot}><cylinderGeometry args={[r,r,h,5]}/>
  <meshStandardMaterial color={color} flatShading roughness={.8}/></mesh>;
}
function Wing({p,rot,color}:{p:V;rot:V;color:string}){
 return <mesh position={p} rotation={rot}>
  <coneGeometry args={[.38,.9,3]}/>
  <meshStandardMaterial color={color} side={2} flatShading roughness={.9}/>
 </mesh>;
}
function ArmedHumanoid({kind,p}:{kind:AdvancedMonsterKind;p:MiniaturePalette}){
 const small=kind==='kobold';
 const massive=['ogre','troll','bugbear'].includes(kind);
 const scale=small?0.68:massive?1.25:1;
 const skin=kind==='orc'||kind==='troll'?p.goblin:kind==='kobold'?p.wood:
  kind==='ogre'||kind==='bugbear'?p.wood:p.skin;
 const armor=kind==='hobgoblin'?p.metal:kind==='orc'?p.ink:p.cloth;
 return <group scale={scale}>
  <Box p={[0,.48,0]} size={[.40,.44,.27]} color={armor}/>
  <Box p={[-.13,.21,0]} size={[.14,.35,.16]} color={p.ink}/>
  <Box p={[.13,.21,0]} size={[.14,.35,.16]} color={p.ink}/>
  <Ball p={[0,.83,.03]} scale={[.18,.19,.16]} color={skin}/>
  {[-1,1].map(sign=><group key={sign}>
   <Box p={[sign*.29,.54,0]} size={[.13,.42,.14]} color={skin}
    rot={[0,0,sign*.16]}/>
   {kind==='kobold'||kind==='hobgoblin'?<Spike p={[sign*.19,1,.03]}
    r={.075} h={.22} color={skin} rot={[0,0,sign*.35]}/>:null}
   {kind==='troll'&&<Spike p={[sign*.16,.98,0]} r={.06} h={.25} color={skin}/>}
  </group>)}
  {kind==='bugbear'&&<Ball p={[0,.62,-.17]} scale={[.28,.3,.14]} color={p.wood}/>}
  {kind==='ogre'&&<Ball p={[0,.61,.18]} scale={[.26,.27,.18]} color={skin}/>}
  {kind==='orc'&&<><Spike p={[-.08,.78,.18]} r={.04} h={.12} color={p.paper}/>
   <Spike p={[.08,.78,.18]} r={.04} h={.12} color={p.paper}/></>}
  {kind==='hobgoblin'&&<Spike p={[0,1.02,0]} r={.18} h={.2} color={p.metal}/>}
  {kind==='kobold'&&<Spike p={[0,.70,-.33]} r={.09} h={.46}
   rot={[Math.PI/2,0,0]} color={skin}/>}
  <Limb p={[.35,.77,.16]} h={.65} color={p.wood}/>
  <Box p={[.39,.97,.16]} size={[massive?0.28:0.16,.22,.065]} color={p.metal}/>
 </group>;
}
function UndeadFigure({kind,p}:{kind:AdvancedMonsterKind;p:MiniaturePalette}){
 const ethereal=kind==='wraith';
 const skeletal=kind==='skeleton'||kind==='lich';
 const color=skeletal?p.paper:kind==='zombie'?p.goblin:p.cloth;
 return <group>
  {ethereal?<><Spike p={[0,.46,0]} r={.34} h={.9} color={p.cloth}/>
   <Ball p={[0,.97,.02]} scale={[.18,.21,.16]} color={p.ink}/></>:
   <><Box p={[0,.48,0]} size={[.34,.42,.25]} color={color}/>
    <Box p={[-.1,.2,0]} size={[.11,.3,.12]} color={color}/>
    <Box p={[.1,.2,0]} size={[.11,.3,.12]} color={color}/>
    <Ball p={[0,.80,.03]} scale={[.16,.18,.14]} color={skeletal?p.paper:p.skin}/></>}
  {[-1,1].map(sign=><group key={sign}>
   <Limb p={[sign*.28,.53,0]} h={.48} color={color}
    rot={[0,0,sign*.33]}/>
   {(skeletal||ethereal)&&<Ball p={[sign*.07,.83,.17]}
    scale={[.025,.03,.015]} color={kind==='lich'?p.gold:p.ink}/>}
  </group>)}
  {kind==='skeleton'&&[.41,.49,.57].map(y=><Box key={y} p={[0,y,.15]}
   size={[.25,.035,.05]} color={p.ink}/>)}
  {kind==='lich'&&<><Spike p={[-.12,1.01,0]} r={.05} h={.25} color={p.gold}/>
   <Spike p={[.12,1.01,0]} r={.05} h={.25} color={p.gold}/>
   <Limb p={[.38,.69,.1]} h={1} color={p.wood}/>
   <Ball p={[.38,1.22,.1]} scale={[.1,.1,.1]} color={p.gold}/></>}
  {kind==='vampire'&&<><Wing p={[-.20,.56,-.14]} rot={[.25,0,-.25]} color={p.ink}/>
   <Wing p={[.20,.56,-.14]} rot={[.25,0,.25]} color={p.ink}/></>}
  {kind==='wraith'&&<><Wing p={[-.26,.61,-.1]} rot={[0,0,-.3]} color={p.ink}/>
   <Wing p={[.26,.61,-.1]} rot={[0,0,.3]} color={p.ink}/></>}
 </group>;
}
function GolemFigure({kind,p}:{kind:AdvancedMonsterKind;p:MiniaturePalette}){
 const armored=kind==='iron-golem'||kind==='animated-armor';
 const body=armored?p.metal:p.rock;
 return <group scale={kind==='stone-golem'||kind==='iron-golem'?1.2:1}>
  <Box p={[0,.55,0]} size={[.54,.55,.36]} color={body}/>
  <Box p={[0,.98,0]} size={[.42,.32,.33]} color={armored?p.ink:p.rock}/>
  {[-1,1].map(sign=><group key={sign}>
   <Box p={[sign*.38,.51,0]} size={[.22,.56,.22]} color={body}/>
   <Box p={[sign*.16,.19,0]} size={[.22,.32,.25]} color={body}/>
   <Ball p={[sign*.1,.99,.175]} scale={[.045,.032,.022]} color={p.gold}/>
  </group>)}
  {kind==='stone-golem'&&<><Spike p={[0,1.22,0]} r={.19} h={.22} color={p.rock}/>
   <Box p={[0,.53,.21]} size={[.26,.12,.03]} color={p.wood}/></>}
  {kind==='iron-golem'&&<Box p={[0,.59,.22]} size={[.25,.26,.045]} color={p.gold}/>}
  {kind==='animated-armor'&&<><Spike p={[0,1.16,0]} r={.17} h={.28} color={p.metal}/>
   <Limb p={[.43,.83,.1]} h={.82} color={p.gold}/></>}
 </group>;
}
function AnimalFigure({kind,p}:{kind:AdvancedMonsterKind;p:MiniaturePalette}){
 if(kind==='spider')return <group>
  <Ball p={[0,.43,-.16]} scale={[.29,.27,.33]} color={p.ink}/>
  <Ball p={[0,.41,.23]} scale={[.21,.19,.23]} color={p.wood}/>
  {[-1,1].flatMap(sign=>[0,1,2,3].map((i)=><Limb key={sign+','+i}
   p={[sign*(.29+i*.05),.33,(i-1.5)*.17]}
   h={.48} r={.035} color={p.ink} rot={[0,0,sign*1.1]}/>))}
  {[-.07,.07].map(x=><Ball key={x} p={[x,.51,.44]}
   scale={[.035,.035,.025]} color={p.gold}/>)}
 </group>;
 const wolf=kind==='wolf';
 const color=wolf?p.rock:p.wood;
 return <group scale={wolf?0.88:1.2}>
  <Ball p={[0,.48,-.03]} scale={[wolf?0.24:0.32,.28,.43]} color={color}/>
  {[-1,1].flatMap(x=>[-.28,.28].map(z=><Box key={x+','+z}
   p={[x*.63,.22,z]} size={[.11,.35,.12]} color={color}/>))}
  <Ball p={[0,.67,.39]} scale={[.21,.22,.23]} color={color}/>
  {[-.13,.13].map(x=><Spike key={x} p={[x,.91,.38]}
   r={wolf?0.085:0.1} h={wolf?0.22:0.16} color={color}/>)}
  <Spike p={[0,.47,-.51]} r={.09} h={.40} color={color} rot={[Math.PI/2,0,0]}/>
  <Ball p={[0,.61,.58]} scale={[.11,.09,.13]} color={p.ink}/>
 </group>;
}
function DragonFigure({kind,p,tint}:{kind:AdvancedMonsterKind;p:MiniaturePalette;
 tint?:DragonMiniatureTint|undefined}){
 const old=kind==='dracolich',elder=kind==='dragon-elder';
 const body=old?p.paper:tint?DRAGON_TINT_COLORS[tint]:p.goblin;
 return <group scale={elder?1.30:kind==='dragon-young'?0.85:1.18}>
  <Ball p={[0,.52,0]} scale={[.29,.26,.47]} color={body}/>
  {[-1,1].flatMap(x=>[-.29,.27].map(z=><Box key={x+','+z}
   p={[x*.72,.22,z]} size={[.11,.32,.12]} color={body}/>))}
  <Box p={[0,.80,.37]} size={[.20,.40,.20]} color={body} rot={[.20,0,0]}/>
  <Ball p={[0,.96,.54]} scale={[.18,.15,.25]} color={body}/>
  {[-1,1].map(sign=><group key={sign}>
   <Wing p={[sign*.49,1.02,-.12]} rot={[0,0,-sign*.69]}
    color={old?p.paper:p.forest}/>
   <Spike p={[sign*.11,1.14,.49]} r={.055} h={.26} color={old?p.wood:p.gold}/>
  </group>)}
  <Spike p={[0,.56,-.62]} r={.13} h={.56} color={body} rot={[Math.PI/2,0,0]}/>
  {old&&[.45,.58,.68].map(y=><Box key={y} p={[0,y,.24]}
   size={[.28,.035,.04]} color={p.ink}/>)}
  {elder&&[-.20,.20].map(x=><Spike key={x} p={[x,.7,-.18]}
   r={.095} h={.32} color={p.gold}/>)}
 </group>;
}
function OtherFigure({kind,p}:{kind:AdvancedMonsterKind;p:MiniaturePalette}){
 if(kind==='elemental')return <group>
  <Spike p={[0,.53,0]} r={.30} h={.90} color={p.gold}/>
  {[-.25,.25].map(x=><Spike key={x} p={[x,.41,.03]}
   r={.12} h={.55} color={p.forest} rot={[0,0,x]}/>)}
  <Ball p={[0,1.07,0]} scale={[.13,.15,.14]} color={p.paper}/>
 </group>;
 const celestial=kind==='celestial';
 return <group>
  <Box p={[0,.50,0]} size={[.32,.49,.25]} color={celestial?p.paper:p.ink}/>
  <Ball p={[0,.87,0]} scale={[.16,.17,.14]} color={celestial?p.skin:p.wood}/>
  <Box p={[-.12,.22,0]} size={[.11,.32,.14]} color={p.metal}/>
  <Box p={[.12,.22,0]} size={[.11,.32,.14]} color={p.metal}/>
  {[-1,1].map(sign=><group key={sign}>
   <Wing p={[sign*.32,.69,-.14]} rot={[0,0,-sign*.55]}
    color={celestial?p.paper:p.cloth}/>
   {!celestial&&<Spike p={[sign*.12,1.07,0]} r={.085} h={.31}
    color={p.ink} rot={[0,0,sign*.35]}/>}
  </group>)}
  {celestial&&<mesh position={[0,1.15,0]} rotation={[Math.PI/2,0,0]}>
   <torusGeometry args={[.20,.025,5,16]}/>
   <meshBasicMaterial color={p.gold}/></mesh>}
 </group>;
}
/** Hand-built low-poly silhouettes. All rigid; no third-party models, animations or stats. */
export function AdvancedMonsterModel({kind,p,tint}:{
 kind:AdvancedMonsterKind;p:MiniaturePalette;tint?:DragonMiniatureTint|undefined;
}){
 if(['hobgoblin','bugbear','orc','ogre','troll','kobold'].includes(kind))
  return <ArmedHumanoid kind={kind} p={p}/>;
 if(['skeleton','zombie','wraith','lich','vampire'].includes(kind))
  return <UndeadFigure kind={kind} p={p}/>;
 if(['stone-golem','iron-golem','animated-armor'].includes(kind))
  return <GolemFigure kind={kind} p={p}/>;
 if(['wolf','bear','spider'].includes(kind))return <AnimalFigure kind={kind} p={p}/>;
 if(['dragon-young','dragon-elder','dracolich'].includes(kind))
  return <DragonFigure kind={kind} p={p} tint={tint}/>;
 return <OtherFigure kind={kind} p={p}/>;
}
