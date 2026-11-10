import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {miniatureCatalog,miniatureDemo} from '@/lib/battle/visual3d/demo';
import {BattleBoard} from '../BattleBoard';
import {MiniatureViewport} from './MiniatureViewport';

export function MiniatureDemo({narrator}:{narrator:boolean}){
 const [show,setShow]=useState(false);const [demo,setDemo]=useState(miniatureDemo);
 const [selected,setSelected]=useState('demo-infantry');
 const [catalog,setCatalog]=useState(false);
 const display=catalog?miniatureCatalog():demo;
 if(!narrator)return null;
 const stacks=display.tokens.map(t=>({...t,primaryTypeId:t.kind==='archer'?'archers':t.kind,
  initialCount:t.count,currentHp:t.count*10,hpPerSoldier:10,moraleState:'steady' as const}));
 return <section className="miniatures3d-demo" aria-label="Protótipo visual isolado">
  <Button variant="outline" aria-expanded={show} onClick={()=>setShow(v=>!v)}>{show?'Fechar protótipo':'Ver protótipo 3D'}</Button>
  {show&&<>
   <div className="miniatures3d-toolbar"><Button variant="outline" aria-pressed={!catalog}
    onClick={()=>{setCatalog(false);setSelected('demo-infantry');}}>4 protótipos</Button>
    <Button variant="outline" aria-pressed={catalog} onClick={()=>{setCatalog(true);setSelected('demo-military-support');}}>17 unidades</Button>
    {!catalog&&<Button variant="outline" onClick={()=>setDemo(d=>({...d,
    tokens:d.tokens.map(t=>t.id===selected?{...t,position:{...t.position,q:t.position.q===8?2:t.position.q+1}}:t),
   }))}>Mover peça</Button>}
    </div>
   <MiniatureViewport map={display.map} tokens={display.tokens} selectedId={selected} onHexClick={hex=>{
    const token=display.tokens.find(t=>t.position.q===hex.q&&t.position.r===hex.r);if(token)setSelected(token.id);
   }} fallback={<BattleBoard map={display.map} stacks={stacks} selectedId={selected}/>}/>
  </>}
 </section>;
}