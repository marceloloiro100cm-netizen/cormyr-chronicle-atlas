import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {miniatureDemo} from '@/lib/battle/visual3d/demo';
import {BattleBoard} from '../BattleBoard';
import {MiniatureViewport} from './MiniatureViewport';

export function MiniatureDemo({narrator}:{narrator:boolean}){
 const [show,setShow]=useState(false);const [demo,setDemo]=useState(miniatureDemo);
 const [selected,setSelected]=useState('demo-infantry');
 if(!narrator)return null;
 const stacks=demo.tokens.map(t=>({...t,primaryTypeId:t.kind==='archer'?'archers':t.kind,
  initialCount:t.count,currentHp:t.count*10,hpPerSoldier:10,moraleState:'steady' as const}));
 return <section className="miniatures3d-demo" aria-label="Protótipo visual isolado">
  <Button variant="outline" aria-expanded={show} onClick={()=>setShow(v=>!v)}>{show?'Fechar protótipo':'Ver protótipo 3D'}</Button>
  {show&&<>
   <div className="miniatures3d-toolbar"><Button variant="outline" onClick={()=>setDemo(d=>({...d,
    tokens:d.tokens.map(t=>t.id===selected?{...t,position:{...t.position,q:t.position.q===8?2:t.position.q+1}}:t),
   }))}>Mover peça</Button></div>
   <MiniatureViewport map={demo.map} tokens={demo.tokens} selectedId={selected} onHexClick={hex=>{
    const token=demo.tokens.find(t=>t.position.q===hex.q&&t.position.r===hex.r);if(token)setSelected(token.id);
   }} fallback={<BattleBoard map={demo.map} stacks={stacks} selectedId={selected}/>}/>
  </>}
 </section>;
}