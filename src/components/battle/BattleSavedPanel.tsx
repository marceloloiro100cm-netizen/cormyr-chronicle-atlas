import {useEffect,useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {listSavedBattles,readSavedBattle} from '@/lib/battle/battle-session.functions';
import {parseReplayJson} from '@/lib/battle/domain/replay';
import {downloadBattleJson} from '@/lib/battle/serialization/map-io';
import {BattleReplay} from './BattleReplay';
type Saved=Awaited<ReturnType<typeof listSavedBattles>>[number];
type Loaded=ReturnType<typeof parseReplayJson>;
export function BattleSavedPanel({onClose}:{onClose:()=>void}){
 const list=useServerFn(listSavedBattles),read=useServerFn(readSavedBattle);
 const [rows,setRows]=useState<Saved[]>([]);
 const [loaded,setLoaded]=useState<Loaded|null>(null),[message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const refresh=async()=>{
  setBusy(true);try{setRows(await list());setMessage('');}
  catch(e){setMessage(e instanceof Error?e.message:'Não foi possível carregar sessões.');}
  finally{setBusy(false);}
 };
 useEffect(()=>{void refresh();},[]);
 const open=async(id:string)=>{
  setBusy(true);setLoaded(null);
  try{const data=await read({data:{sessionId:id}});setLoaded(parseReplayJson(data.replayJson));setMessage('Integridade SHA-256 confirmada.');}
  catch(e){setMessage(e instanceof Error?e.message:'Sessão não verificada.');}
  finally{setBusy(false);}
 };
 return <section className="battle-surface" aria-label="Batalhas salvas">
  <h2>Batalhas salvas · arquivo tático</h2>
  <p>Consulta e exportação de replays verificados do Narrador. Este painel é somente leitura; a retomada editável de uma batalha salva será tratada em etapa própria.</p>
  <div className="battle-form-row">
   <Button variant="outline" onClick={()=>void refresh()} disabled={busy}>Atualizar lista</Button>
   <Button variant="outline" onClick={onClose}>Voltar</Button>
  </div>
  {message&&<p role="status">{message}</p>}
  {rows.length===0?<p>Nenhuma batalha disponível para esta sessão administrativa.</p>:
   <ul>{rows.map(s=><li key={s.id} className="battle-result-card">
    <strong>{s.name}</strong> · {s.status} · Versão {s.state_version}
    <Button size="sm" variant="outline" disabled={busy} onClick={()=>void open(s.id)}>Consultar</Button>
   </li>)}</ul>}
  {loaded&&<div>
   <Button variant="outline" onClick={()=>downloadBattleJson('batalha-salva-verificada.json',JSON.stringify(loaded.file,null,2))}>
    Exportar replay verificado
   </Button>
   <BattleReplay initial={loaded.file.initial} state={loaded.state}/>
  </div>}
 </section>;
}
