import {useMemo,useState} from 'react';
import type {BattleState} from '@/lib/battle/domain/types';
import {exportReplayJson,parseReplayJson,verifyReplay} from '@/lib/battle/domain/replay';
import {BattleBoard} from './BattleBoard';
import {battleReport} from '@/lib/battle/domain/report';
import {Button} from '@/components/ui/button';

export function BattleReplay({initial,state}:{
 initial:BattleState;state:BattleState;
}){
 const [index,setIndex]=useState(0);
 const result=useMemo(()=>{
  try{return {value:parseReplayJson(exportReplayJson(initial,state)),error:''};}
  catch(e){return {value:null,error:e instanceof Error?e.message:'Replay inválido.'};}
 },[initial,state]);
 if(!result.value)return <p role="alert">Integridade não confirmada: {result.error}</p>;
 const frames=result.value.states,chosen=frames[Math.min(index,frames.length-1)]!;
 return <section className="battle-surface" aria-label="Replay verificável">
  <h3>Rever turnos · SHA-256 verificado</h3>
  <p role="status">Comando {index} de {frames.length-1} · rodada {chosen.round} · fase {chosen.phase}</p>
  <label>Posição do replay
   <input type="range" min={0} max={frames.length-1} value={index}
    aria-label="Posição do replay" onChange={e=>setIndex(Number(e.target.value))}/>
  </label>
  <div className="battle-form-row">
   <Button size="sm" variant="outline" disabled={index<=0} onClick={()=>setIndex(i=>i-1)}>Anterior</Button>
   <Button size="sm" variant="outline" disabled={index>=frames.length-1} onClick={()=>setIndex(i=>i+1)}>Próximo</Button>
   <Button size="sm" variant="outline" onClick={()=>setIndex(0)}>Início</Button>
   <Button size="sm" variant="outline" onClick={()=>setIndex(frames.length-1)}>Fim</Button>
  </div>
  <BattleBoard map={chosen.map} stacks={chosen.stacks} activeId={chosen.activeUnitId}/>
  <p>Integridade confirmada: {result.value.file.finalStateHash.slice(0,16)}… · resultados exclusivos do simulador.</p>
 </section>;
}
export function BattleReplayImporter(){
 const [error,setError]=useState(''),[replay,setReplay]=useState<ReturnType<typeof verifyReplay>|null>(null);
 const [index,setIndex]=useState(0);
 return <section className="battle-surface" aria-label="Importar replay">
  <h3>Importar replay verificado</h3>
  <p>Selecione um arquivo JSON exportado pelo módulo. Arquivos modificados, sem hashes ou de outra versão são recusados.</p>
  <label>Arquivo JSON
   <input type="file" accept=".json,application/json" aria-label="Importar arquivo de replay"
    onChange={e=>{
      const file=e.target.files?.[0];e.target.value='';
      if(!file)return;
      if(file.size>1_500_000){setError('Arquivo acima de 1,5 MB.');setReplay(null);return;}
      void file.text().then(text=>{
       try{const parsed=parseReplayJson(text);setReplay(parsed);setError('');setIndex(0);}
       catch(err){setError(err instanceof Error?err.message:'Integridade não confirmada.');setReplay(null);}
      }).catch(()=>{setError('Não foi possível ler o arquivo.');setReplay(null);});
    }}/>
  </label>
  {error&&<p role="alert">{error}</p>}
  {replay&&<>
   <p role="status">Integridade confirmada · {replay.file.commands.length} comandos · {replay.state.round} rodadas.</p>
   <div className="battle-form-row">
    <Button variant="outline" disabled={index===0} onClick={()=>setIndex(v=>v-1)}>Anterior</Button>
    <Button variant="outline" disabled={index>=replay.states.length-1} onClick={()=>setIndex(v=>v+1)}>Próximo</Button>
   </div>
   <BattleBoard map={replay.states[index]!.map} stacks={replay.states[index]!.stacks}
    activeId={replay.states[index]!.activeUnitId}/>
   <p>Vencedor: {replay.state.winner??'empate'} · {battleReport(replay.state).units.length} agrupamentos.</p>
  </>}
 </section>;
}
