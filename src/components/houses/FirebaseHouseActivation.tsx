import {useState,useRef,useEffect} from 'react';
import {firebasePilotAuth} from '@/lib/auth/firebase-pilot-session';
import {RESOURCE_KEYS,RESOURCE_NAMES,type Resource} from '@/lib/house/types';
type Review={status:string;houseId:string;sourceHash:string|null;preview:{
  sourceSheetVersion:number;holdings:number;projects:number;treasury:number;
  calendarMonth:number;available:Record<Resource,number>;
}|null};
const reasons:Record<string,string>={
  calendar_mismatch:'O mês da ficha importada não corresponde ao HUB. Confira a data e a ficha antes de ativar.',
  source_unusable:'A ficha importada ainda tem dados incompletos ou saldos inconsistentes.',
  existing_document_requires_review:'Já existe um documento operacional. Nenhuma substituição foi realizada.',
  already_initialized:'A ficha já foi inicializada. Nenhum saldo foi reiniciado.',
  treasury_invalid:'O tesouro importado precisa ser corrigido e conferido antes da ativação.',
  state_exceeds_firestore_budget:'A ficha ultrapassa o limite seguro de armazenamento.',
};
export function FirebaseHouseActivation({houseId,houseName,onActivated}:{
  houseId:string;houseName:string;onActivated:()=>void;
}){
  const [review,setReview]=useState<Review|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  async function run(action:'inspect'|'activate'){
    if(busy)return;setBusy(true);setMessage('');
    try{
      const token=await firebasePilotAuth()?.getToken();
      if(!token)throw Error('Entre novamente com sua conta de Narrador.');
      const response=await fetch('/api/firebase-house-activation',{
        method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
        body:JSON.stringify({action,houseId,...(action==='activate'?{
          expectedSourceVersion:review?.preview?.sourceSheetVersion,expectedSourceHash:review?.sourceHash}:{})}),
      });
      if(!response.ok)throw Error(response.status===409
        ?'Publique a configuração inicial do HUB e confira novamente a ficha.'
        :response.status===403?'Somente o Narrador pode ativar uma ficha.'
        :'Não foi possível conferir ou ativar a ficha. Nenhum saldo foi presumido.');
      const body=await response.json() as {result:Review};
      const result=body.result;
      if(!result||result.houseId!==houseId)throw Error('Resposta inválida para esta Casa.');
      if(!mounted.current)return;
      setReview(result);
      if(result.status==='activated'){
        setMessage('Ficha e tesouro ativados com os valores importados.');onActivated();
      }else setMessage(reasons[result.status]??'Confira os valores abaixo antes de ativar.');
    }catch(e){if(mounted.current)setMessage(e instanceof Error?e.message:'Ativação indisponível.');}
    finally{if(mounted.current)setBusy(false);}
  }
  return <section aria-label={'Ativação da Casa '+houseName} className="rounded border p-4 space-y-3">
    <h2 className="text-lg font-semibold">Ativar ficha e tesouro — {houseName}</h2>
    <p className="text-sm">Confere os saldos importados e cria a base operacional desta Casa. O histórico permanece preservado.</p>
    <button type="button" disabled={busy} className="rounded border px-3 py-2" onClick={()=>void run('inspect')}>Conferir ficha importada</button>
    {message&&<p role="status" className="text-sm">{message}</p>}
    {review?.status==='ready_for_operator_review'&&review.preview&&<>
      <p className="text-sm">Fonte v{review.preview.sourceSheetVersion} · {review.preview.holdings} posses · {review.preview.projects} projetos · Tesouro: {review.preview.treasury}</p>
      <dl className="grid grid-cols-2 gap-2 text-sm">{RESOURCE_KEYS.map(k=><div key={k}><dt>{RESOURCE_NAMES[k]}</dt><dd>{review.preview!.available[k]}</dd></div>)}</dl>
      <button type="button" disabled={busy} className="rounded border px-3 py-2" onClick={()=>void run('activate')}>Ativar com estes valores</button>
    </>}
  </section>;
}

