import {useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {checkBattlePersistence,listSavedBattles} from '@/lib/battle/battle-session.functions';
import {listBattleSourceHouses} from '@/lib/battle/adapters/readonly-source.functions';
import {listV3Invitations} from '@/lib/battle/v3/invitations.functions';
import {BATTLE_PLAYERS_ENABLED} from '@/lib/battle/feature-flag';

/** P0: diagnóstico de ponta a ponta usando o JWT da sessão atual.
 * Somente leitura; resultados ficam nesta tela. Não cria usuários, senhas,
 * convocações, sessões, baixas ou writes no Supabase.
 */
export function BattleAccessCheck({role}:{role:'narrator'|'player'}){
 const check=useServerFn(checkBattlePersistence);
 const saved=useServerFn(listSavedBattles);
 const houses=useServerFn(listBattleSourceHouses);
 const invites=useServerFn(listV3Invitations);
 const [checks,setChecks]=useState<string[]>([]);
 const [busy,setBusy]=useState(false);
 const [ran,setRan]=useState(false);
 const run=async()=>{
  setBusy(true);setChecks([]);setRan(false);
  const results:string[]=[];
  if(BATTLE_PLAYERS_ENABLED){
   try{
    await invites();
    results.push('PASSOU · sessão autenticada e leitura de convocações permitida pelo RLS.');
   }catch(e){
    results.push('FALHOU · consulta de convocações: '+(e instanceof Error?e.message:'erro desconhecido'));
   }
  }else{
   results.push('DESATIVADO · convocações para jogadores não integram esta publicação.');
  }
  if(role==='narrator'){
   try{await houses();results.push('PASSOU · permissão do Narrador e origem militar somente leitura.');}
   catch(e){results.push('FALHOU · leitura militar: '+(e instanceof Error?e.message:'erro desconhecido'));}
   try{
    const status=await check();
    if(!status.available)throw new Error('Camada de persistência não disponível neste ambiente.');
    await saved();
    results.push('PASSOU · autorização e listagem de sessões salvas pelo servidor.');
   }catch(e){
    results.push('PENDENTE · persistência: '+(e instanceof Error?e.message:'erro desconhecido'));
   }
  }else{
   try{
    await check();
    results.push('FALHOU · jogador obteve autorização de persistência do Narrador.');
   }catch(e){
    const message=e instanceof Error?e.message:'erro desconhecido';
    results.push(/restrito ao Narrador|restrit[ao]|autorizad/i.test(message)?
     'PASSOU · jogador não possui acesso às sessões administrativas.':
     'INCONCLUSIVO · persistência negada, mas sem comprovação de RLS: '+message);
   }
  }
  setChecks(results);setRan(true);setBusy(false);
 };
 return <section className="battle-surface" aria-label="Diagnóstico autenticado da batalha">
  <h3>Diagnóstico de acesso · P0</h3>
  <p className="battle-note">Consulta autenticada com sua sessão atual, exclusivamente leitura. 
   Não valida outras contas ou o banco sem executar o teste na respectiva sessão.</p>
  <Button variant="outline" disabled={busy} onClick={()=>void run()}>
   {busy?'Conferindo permissões…':'Executar diagnóstico autenticado'}
  </Button>
  {ran&&<div role="status" aria-live="polite">
   {checks.map((item,index)=><p key={index}>{item}</p>)}
  </div>}
 </section>;
}
