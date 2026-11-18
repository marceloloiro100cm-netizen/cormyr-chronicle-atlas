import {useState,type FormEvent} from 'react';

/**
 * On-demand, Narrator-only access diagnostic. No account or historical
 * migration document can be modified from this component.
 * Never save identities in localStorage, URLs, logs or analytics.
 */
type Issue='inactive'|'missingProfile'|'playerWithoutHouse'|
  'passwordChangePending'|'invalidScope';
export type PendingAccessReview={
  readOnly:true;sourceImmutable:true;accountsChecked:number;
  pendingAccounts:number;
  issues:Record<Issue,number>;
  items:Array<{
    uid:string;email:string|null;profile:'narrador'|'jogador'|'editor'|null;
    issues:Issue[];active:boolean;requirePasswordChange:boolean;
    authDisabled:boolean;memberHouseIds:string[];editHouseIds:string[];
  }>;
  readyForRemediation:false;readyForPlayers:false;
  authWrites:0;firestoreWrites:0;
};
export type PendingDecisionProposal={
  profile:'jogador'|'editor';
  active:boolean;
  memberHouseIds:string[];
  editHouseIds:string[];
  manualReviewConfirmed:true;
};
export type PendingDecisionPreview={
  scope:'CORMYR_NARRATOR_ACCESS_REMEDIATION_DRY_RUN';
  mode:'preview-only';
  checked:boolean;
  proposedProfile:'jogador'|'editor';
  proposedActive:boolean;
  proposedMemberHouseCount:number;
  proposedEditHouseCount:number;
  changedFields:string[];
  requiresPasswordResetProof:boolean;
  authAccountDisabled:boolean;
  blockingCodes:string[];
  decisionApplied:false;roleGranted:false;
  adminGranted:false;passwordFlagCleared:false;
  sourceRecordsChanged:false;authWrites:0;firestoreWrites:0;
  readyForPlayers:false;readyForCutover:false;releaseDecision:'NO_GO';
};

type PendingUser=PendingAccessReview['items'][number];
type AvailableHouse={id:string;name:string};

const blockedMeaning:Record<string,string>={
  SOURCE_LIVE_DELTA_NOT_RECONCILED:'Dados atuais da origem não reconciliados',
  IMMUTABLE_MIGRATION_ACCESS_STAGE:'Snapshot histórico permanece imutável',
  APPROVED_ACCESS_RUNTIME_MISSING:'Fonte operacional de acesso não aprovada',
  PRODUCTION_PER_HOUSE_E2E_NOT_VERIFIED:'Testes reais entre Casas ainda pendentes',
  PASSWORD_RESET_PROOF_PENDING:'Troca de senha ainda não comprovada',
  FIREBASE_AUTH_ACCOUNT_DISABLED:'Conta do Firebase Auth desabilitada',
};

function PendingAccessDecisionForm({
  item,houses,plan,
}:{
  item:PendingUser;
  houses:AvailableHouse[];
  plan:(uid:string,proposal:PendingDecisionProposal)=>Promise<PendingDecisionPreview>;
}){
  const initialRole=item.profile==='jogador'||item.profile==='editor'
    ?item.profile:'';
  const [role,setRole]=useState<''|'jogador'|'editor'>(initialRole);
  const known=new Set(houses.map(h=>h.id));
  const [members,setMembers]=useState<string[]>(item.memberHouseIds.filter(id=>known.has(id)));
  const [edit,setEdit]=useState<string[]>(item.editHouseIds.filter(id=>
    known.has(id)&&item.memberHouseIds.includes(id)));
  const [active,setActive]=useState(item.active);
  const [confirmed,setConfirmed]=useState(false);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState(false);
  const [result,setResult]=useState<PendingDecisionPreview|null>(null);

  const clear=()=>{setResult(null);setError(false);setConfirmed(false);};
  const toggleMember=(id:string,checked:boolean)=>{
    clear();
    setMembers(current=>checked?[...current,id]:current.filter(x=>x!==id));
    if(!checked)setEdit(current=>current.filter(x=>x!==id));
  };
  async function preview(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(pending||!confirmed||!role)return;
    setPending(true);setError(false);setResult(null);
    try{
      const report=await plan(item.uid,{
        profile:role,active,
        memberHouseIds:role==='editor'?[]:members,
        editHouseIds:role==='editor'?[]:edit,
        manualReviewConfirmed:true,
      });
      if(report.scope!=='CORMYR_NARRATOR_ACCESS_REMEDIATION_DRY_RUN'||
         report.mode!=='preview-only'||report.decisionApplied!==false||
         report.firestoreWrites!==0||report.authWrites!==0||
         report.readyForPlayers!==false||report.releaseDecision!=='NO_GO')
        throw Error('invalid_dry_run');
      setResult(report);
    }catch{setError(true);}
    finally{setPending(false);}
  }
  if(item.profile==='narrador')
    return <p className="text-sm">Uma conta de Narrador exige homologação
      administrativa separada; esta prévia não pode conceder admin.</p>;
  return <details className="mt-3 rounded border p-3">
    <summary className="cursor-pointer font-medium">Preparar decisão (sem salvar)</summary>
    <form onSubmit={event=>void preview(event)}
      className="space-y-3 pt-3">
      <p className="text-xs">Apenas simulação. Nenhuma permissão ou senha
        é alterada, mesmo quando a prévia é aprovada tecnicamente.</p>
      <label className="block">Perfil proposto
        <select required className="ml-2 rounded border p-1"
          value={role} onChange={event=>{
            clear();setRole(event.target.value as ''|'jogador'|'editor');
            if(event.target.value==='editor'){setMembers([]);setEdit([]);}
          }}>
          <option value="">Selecione</option>
          <option value="jogador">Jogador</option>
          <option value="editor">Editor</option>
        </select>
      </label>
      {role==='jogador'&&<>
        <fieldset className="space-y-1">
          <legend>Casas das quais será membro</legend>
          {houses.map(h=><label key={h.id} className="block">
            <input type="checkbox" className="mr-2"
              checked={members.includes(h.id)}
              onChange={e=>toggleMember(h.id,e.target.checked)}/>
            {h.name}
          </label>)}
        </fieldset>
        <fieldset className="space-y-1">
          <legend>Permissão de edição (somente Casas de membro)</legend>
          {houses.filter(h=>members.includes(h.id)).map(h=><label
            key={h.id} className="block">
            <input type="checkbox" className="mr-2"
              checked={edit.includes(h.id)}
              onChange={e=>{
                clear();setEdit(current=>e.target.checked?
                  [...current,h.id]:current.filter(x=>x!==h.id));
              }}/>
            {h.name}
          </label>)}
        </fieldset>
      </>}
      <label className="block">
        <input type="checkbox" className="mr-2" checked={active}
          onChange={e=>{clear();setActive(e.target.checked);}}/>
        Propor acesso da campanha ativo
      </label>
      <label className="block text-sm">
        <input type="checkbox" className="mr-2" checked={confirmed}
          onChange={e=>{setConfirmed(e.target.checked);setResult(null);}}/>
        Conferi pessoalmente a identidade, o perfil e as Casas desta conta
      </label>
      <button type="submit" disabled={pending||!confirmed||!role||
        (role==='jogador'&&members.length===0)}
        className="rounded border px-3 py-2 text-sm">
        {pending?'Conferindo proposta…':'Validar proposta sem aplicar'}
      </button>
      {error&&<p role="alert" className="text-sm">
        Proposta inválida ou informação de origem desatualizada.
        Nenhuma alteração foi feita.
      </p>}
      {result&&<div role="status" className="space-y-2 text-sm">
        <p className="font-semibold">Prévia validada, sem aplicação.</p>
        <p>Campos que exigiriam atualização: {
          result.changedFields.length?result.changedFields.join(', '):'nenhum'}.
        </p>
        <p>Bloqueios de produção:</p>
        <ul className="list-disc pl-5">
          {result.blockingCodes.map(code=><li key={code}>
            {blockedMeaning[code]??'Aprovação adicional pendente'}
          </li>)}
        </ul>
        <p className="text-xs">Essa prévia não grava um pedido de alteração.
          Não comprova troca de senha ou autorização para jogar.</p>
      </div>}
    </form>
  </details>;
}

const explanations:Record<Issue,string>={
  inactive:'Acesso da campanha inativo',
  missingProfile:'Perfil ainda não definido',
  playerWithoutHouse:'Jogador sem Casa atribuída',
  passwordChangePending:'Troca de senha ainda não comprovada',
  invalidScope:'Vínculo ou permissão inconsistente',
};

export function FirebasePendingAccessReview({
  inspect,resolveHouseName,availableHouses,plan,
}:{
  inspect:()=>Promise<PendingAccessReview>;
  resolveHouseName:(id:string)=>string;
  availableHouses:AvailableHouse[];
  plan:(uid:string,proposal:PendingDecisionProposal)=>Promise<PendingDecisionPreview>;
}){
  const [report,setReport]=useState<PendingAccessReview|null>(null);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState(false);
  async function run(){
    if(pending)return;
    setPending(true);setError(false);setReport(null);
    try{
      const result=await inspect();
      if(result.readOnly!==true||result.sourceImmutable!==true||
         result.accountsChecked!==14||!Array.isArray(result.items)||
         result.pendingAccounts!==result.items.length||
         result.firestoreWrites!==0||result.authWrites!==0)
        throw Error('invalid_private_access_report');
      setReport(result);
    }catch{
      setError(true);
    }finally{setPending(false);}
  }
  return <section aria-label="Diagnóstico de contas do Narrador"
    className="rounded border border-current/25 p-4 space-y-3">
    <h2 className="font-semibold">Acessos pendentes — consulta privada</h2>
    <p className="text-sm">Confira quais cadastros exigem decisão do Narrador.
      A consulta é somente leitura, não ativa contas, não altera
      Casas nem modifica o snapshot histórico.</p>
    <button type="button" onClick={()=>void run()} disabled={pending}
      className="rounded border px-3 py-2 text-sm">
      {pending?'Conferindo…':'Conferir cadastros no Firebase'}
    </button>
    {error&&<p role="alert" className="text-sm">
      Não foi possível conferir todos os 14 cadastros com segurança.
      Nenhuma alteração foi feita.
    </p>}
    {report&&<div className="space-y-3" role="status">
      <p className="text-sm">Contas conferidas: {report.accountsChecked}.
        Cadastros que exigem revisão: {report.pendingAccounts}.</p>
      {report.items.length===0?<p className="text-sm">
        Nenhum cadastro pendente neste inventário. A liberação do jogo
        ainda requer aceite operacional independente.
      </p>:<ul className="space-y-3">
        {report.items.map(item=><li key={item.uid}
          className="rounded border p-3 space-y-1 text-sm">
          <p className="font-medium break-all">{item.email??'Sem e-mail cadastrado'}</p>
          <p>Identificador privado: <code className="break-all">{item.uid}</code></p>
          <p>Perfil: {item.profile??'não definido'}</p>
          <p>Casas vinculadas: {item.memberHouseIds.length?
            item.memberHouseIds.map(resolveHouseName).join(', '):'nenhuma'}</p>
          <p>Casas com edição: {item.editHouseIds.length?
            item.editHouseIds.map(resolveHouseName).join(', '):'nenhuma'}</p>
          <ul className="list-disc pl-5">
            {item.issues.map(code=><li key={code}>{explanations[code]}</li>)}
            {item.authDisabled&&<li>Conta Firebase Auth desativada</li>}
          </ul>
          <PendingAccessDecisionForm item={item}
            houses={availableHouses} plan={plan}/>
        </li>)}
      </ul>}
      <p className="text-xs">Esses dados são privados e visíveis apenas
        após autenticação autorizada como Narrador. A coleção
        histórica é imutável; nenhuma decisão é aplicada aqui.
        A troca de senha exige confirmação do titular.</p>
    </div>}
  </section>;
}
