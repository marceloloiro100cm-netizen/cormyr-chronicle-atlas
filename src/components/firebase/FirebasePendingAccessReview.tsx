import {useState} from 'react';

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
const explanations:Record<Issue,string>={
  inactive:'Acesso da campanha inativo',
  missingProfile:'Perfil ainda não definido',
  playerWithoutHouse:'Jogador sem Casa atribuída',
  passwordChangePending:'Troca de senha ainda não comprovada',
  invalidScope:'Vínculo ou permissão inconsistente',
};

export function FirebasePendingAccessReview({
  inspect,resolveHouseName,
}:{
  inspect:()=>Promise<PendingAccessReview>;
  resolveHouseName:(id:string)=>string;
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
        </li>)}
      </ul>}
      <p className="text-xs">Esses dados são privados e visíveis apenas
        após autenticação autorizada como Narrador. A coleção
        histórica é imutável; nenhuma decisão é aplicada aqui.
        A troca de senha exige confirmação do titular.</p>
    </div>}
  </section>;
}
