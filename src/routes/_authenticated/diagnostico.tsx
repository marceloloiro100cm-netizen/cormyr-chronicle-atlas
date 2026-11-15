import {createFileRoute} from '@tanstack/react-router';
import {useEffect,useState} from 'react';
import {CampaignShell} from '@/components/campaign-shell';
import {Button} from '@/components/ui/button';
import {supabase} from '@/integrations/supabase/client';
import {loadCampaignAccessScope} from '@/lib/auth/campaign-access-scope';
import {
  evaluateRoleSelfAudit,
  type RoleSelfAuditReport,
  type RoleSelfAuditSignal,
} from '@/lib/auth/role-self-audit';

export const Route=createFileRoute('/_authenticated/diagnostico')({
  head:()=>({meta:[
    {title:'Verificação do meu acesso — Cormyr Chronicle'},
    {name:'robots',content:'noindex,nofollow,noarchive'},
  ]}),
  component:CurrentSessionDiagnostics,
});

async function checkBooleanRpc(
  rpc:'campaign_access_active'|'is_campaign_editor'|'can_edit_campaign_newspaper',
):Promise<RoleSelfAuditSignal>{
  try{
    const result=await supabase.rpc(rpc);
    return !result.error&&typeof result.data==='boolean'?result.data:null;
  }catch{return null;}
}

async function loadCurrentSessionDiagnostics():Promise<RoleSelfAuditReport>{
  const scope=await loadCampaignAccessScope();
  const [campaignActive,editorIdentity,newspaperEdit,ownHouseConfirmed]=await Promise.all([
    checkBooleanRpc('campaign_access_active'),
    checkBooleanRpc('is_campaign_editor'),
    checkBooleanRpc('can_edit_campaign_newspaper'),
    scope.profile==='jogador'&&scope.memberships.length>0
      ?supabase.rpc('in_campaign_house',{
        h:scope.memberships[0].house_id,edit_required:false,
      }).then(({data,error}):RoleSelfAuditSignal=>
        !error&&typeof data==='boolean'?data:null).catch(()=>null)
      :Promise.resolve(null),
  ]);

  // Access and membership may be revoked during the network round trips.
  // Never publish a result assembled for a different authenticated identity.
  const {data:{user},error}=await supabase.auth.getUser();
  if(error||user?.id!==scope.userId)
    throw new Error('identity_changed');

  return evaluateRoleSelfAudit({
    profile:scope.profile,
    admin:scope.admin,
    campaignActive,
    editorIdentity,
    newspaperEdit,
    playerActive:scope.active,
    passwordChangeRequired:scope.passwordChangeRequired,
    hasPlayer:scope.playerId!==null,
    houseMembershipCount:scope.memberships.length,
    ownHouseConfirmed,
  });
}

function CurrentSessionDiagnostics(){
  const [attempt,setAttempt]=useState(0);
  const [state,setState]=useState<
    {phase:'loading'}|{phase:'error'}|{phase:'ready';report:RoleSelfAuditReport}
  >({phase:'loading'});
  useEffect(()=>{
    let active=true;
    setState({phase:'loading'});
    void loadCurrentSessionDiagnostics()
      .then(report=>{if(active)setState({phase:'ready',report});})
      .catch(()=>{if(active)setState({phase:'error'});});
    return ()=>{active=false;};
  },[attempt]);

  return <CampaignShell>
    <section style={{maxWidth:'900px',margin:'0 auto'}}>
      <p className="campaign-eyebrow">HOMOLOGAÇÃO · SOMENTE LEITURA</p>
      <h1>Verificação do meu acesso</h1>
      <p>Esta página verifica as permissões da conta que está conectada agora.
        Não consulta o conteúdo de missivas, não altera Casas e não executa ações administrativas.</p>
      <div style={{display:'flex',gap:'0.75rem',flexWrap:'wrap',margin:'1rem 0'}}>
        <Button type="button" disabled={state.phase==='loading'} onClick={()=>setAttempt(x=>x+1)}>
          Verificar novamente
        </Button>
        <a href="/jogadores">Voltar ao painel</a>
      </div>
      {state.phase==='loading'&&<p role="status">Consultando suas permissões atuais…</p>}
      {state.phase==='error'&&<p role="alert">
        Não foi possível confirmar a sessão e suas permissões. Nenhum acesso foi liberado.
      </p>}
      {state.phase==='ready'&&<>
        <h2>{state.report.profile==='jogador'?'Jogador':
          state.report.profile==='narrador'?'Narrador':
          state.report.profile==='editor'?'Editor-chefe':'Perfil não reconhecido'}</h2>
        <p role="status">{state.report.passed
          ?'As verificações de sessão e perfil foram aprovadas.'
          :'Há verificações reprovadas ou inconclusivas. Não presuma que o acesso está liberado.'}</p>
        <ul>
          {state.report.checks.map(item=><li key={item.key} style={{marginBlock:'0.7rem'}}>
            <strong>{item.state==='approved'?'Aprovado':
              item.state==='denied'?'Reprovado':'Inconclusivo'}:</strong> {item.label}
          </li>)}
        </ul>
        <h3>O que esta verificação não comprova</h3>
        <p>Isolamento entre duas Casas distintas, envio de missivas, edição e publicação
          do Jornal, acesso a arquivos privados do Narrador, sincronização com o Drive
          e migração completa ao Firebase Cloud ainda precisam de testes próprios.</p>
        <p>O resultado não altera suas permissões nem substitui a autorização
          aplicada pelo banco de dados.</p>
      </>}
    </section>
  </CampaignShell>;
}
