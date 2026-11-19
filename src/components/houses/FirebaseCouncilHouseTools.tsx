import {useEffect,useState,type FormEvent} from 'react';
import {FirebaseConstructionQuote,type ConstructionQuoteView}
  from '@/components/houses/FirebaseConstructionQuote';
import {FirebaseOperationalEconomy,type OperationalEconomyView}
  from '@/components/houses/FirebaseOperationalEconomy';
import {councilCloudRequest} from '@/lib/firebase-workspace/council-tools';

type HouseView={id:string;name:string;state:Record<string,unknown>};
type TreasuryStatus={enabled:boolean;canAdjust:boolean;readOnly:boolean;
  balance:number|null;version:number|null};
type TreasurySummary={available:boolean;readOnly:true;
  balance:number|null;version:number|null};
type TreasuryReply={id:string;duplicate:boolean;houseId:string;
  balance:number;version:number};
const newRequestKey=()=>globalThis.crypto?.randomUUID?.()??null;

/** Ferramentas de consulta na Ficha da Casa oficial. Todas as decisões de
 * acesso e lançamentos continuam sendo feitas nas rotas Firebase do servidor.
 * Nunca usa a Casa selecionada para ampliar as permissões da sessão.
 */
export function FirebaseCouncilHouseTools({
  houseId,houseName,narrator,
}:{houseId:string;houseName:string;narrator:boolean}){
  const [house,setHouse]=useState<HouseView|null>(null);
  const [economy,setEconomy]=useState<OperationalEconomyView|null>(null);
  const [treasury,setTreasury]=useState<TreasuryStatus|null>(null);
  const [summary,setSummary]=useState<TreasurySummary|null>(null);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState('');
  const [delta,setDelta]=useState('');
  const [reason,setReason]=useState('');
  const [requestKey,setRequestKey]=useState<string|null>(newRequestKey);
  const [saving,setSaving]=useState(false);
  useEffect(()=>{
    let valid=true;
    setHouse(null);setEconomy(null);setTreasury(null);setSummary(null);
    setMessage('');setLoading(true);setRequestKey(newRequestKey());
    void Promise.allSettled([
      councilCloudRequest<HouseView>('/api/firebase-cloud-read',
        {action:'getHouse',houseId}),
      councilCloudRequest<OperationalEconomyView>('/api/firebase-operational-economy',
        {action:'getHouse',houseId}),
      narrator
        ?councilCloudRequest<TreasuryStatus>('/api/firebase-cloud-treasury',
          {action:'status',houseId})
        :councilCloudRequest<TreasurySummary>('/api/firebase-cloud-treasury',
          {action:'summary',houseId}),
    ]).then(results=>{
      if(!valid)return;
      const [sheet,operational,treasuryResult]=results;
      if(sheet.status==='fulfilled'&&sheet.value.id===houseId&&
         sheet.value.state&&typeof sheet.value.state==='object')
        setHouse(sheet.value);
      if(operational.status==='fulfilled'&&operational.value.houseId===houseId)
        setEconomy(operational.value);
      if(treasuryResult.status==='fulfilled'){
        if(narrator)setTreasury(treasuryResult.value as TreasuryStatus);
        else setSummary(treasuryResult.value as TreasurySummary);
      }
      setLoading(false);
    });
    return()=>{valid=false;};
  },[houseId,narrator]);

  async function adjust(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const amount=Number(delta);
    if(!narrator||saving||!treasury?.canAdjust||
       treasury.version===null||!requestKey||
       !Number.isSafeInteger(amount)||!amount||Math.abs(amount)>10000||
       reason.trim().length<10)return;
    setSaving(true);setMessage('');
    try{
      const result=await councilCloudRequest<TreasuryReply>(
        '/api/firebase-cloud-treasury',{
          action:'adjust',houseId,requestKey,expectedVersion:treasury.version,
          delta:amount,reason:reason.trim(),
        });
      if(result.houseId!==houseId)throw Error('Resposta de Tesouro de outra Casa recusada.');
      setTreasury({...treasury,balance:result.balance,version:result.version});
      setMessage(result.duplicate?'Lançamento já registrado.':
        'Lançamento registrado no Tesouro operacional Firebase.');
      setDelta('');setReason('');setRequestKey(newRequestKey());
    }catch(e){
      // Preserva a chave e os dados em falha de rede para repetição idempotente.
      setMessage(e instanceof Error?e.message:'Não foi possível registrar o lançamento.');
    }finally{setSaving(false);}
  }

  return <section aria-label={`Ferramentas Firebase da Casa ${houseName}`}
    className="space-y-4">
    <header className="space-y-1">
      <h2 className="text-xl font-semibold">Economia e construções no Firebase</h2>
      <p className="text-sm opacity-75">
        Casa {houseName}. Consultas autorizadas pelo servidor; acervo histórico preservado.
      </p>
    </header>
    {loading&&<p role="status">Consultando os dados operacionais da Casa…</p>}
    {!loading&&<>
      <FirebaseOperationalEconomy houseName={houseName} houseId={houseId} data={economy}/>
      <section className="rounded border border-current/25 p-4 space-y-3"
        aria-label="Tesouro operacional Firebase">
        <h3 className="text-lg font-semibold">Tesouro operacional</h3>
        {narrator?
          !treasury?.canAdjust||treasury.version===null
            ?<p>Os lançamentos ainda não estão liberados para esta Casa no Firebase.</p>
            :<>
              <p>Saldo operacional: <strong>{treasury.balance?.toLocaleString('pt-BR')
                ??'Não informado'}</strong>. Versão {treasury.version}.</p>
              <p className="text-xs">Ajustes não alteram os recursos da Ficha
                nem o snapshot histórico.</p>
              <form onSubmit={e=>void adjust(e)} className="space-y-3">
                <label className="block text-sm">Variação do Tesouro
                  <input className="mt-1 block w-full rounded border p-2"
                    type="number" required step={1} min={-10000} max={10000}
                    value={delta} disabled={saving}
                    onChange={e=>setDelta(e.target.value)}/>
                </label>
                <label className="block text-sm">Justificativa
                  <textarea className="mt-1 block w-full rounded border p-2"
                    required minLength={10} maxLength={500} rows={3}
                    value={reason} disabled={saving}
                    onChange={e=>setReason(e.target.value)}/>
                </label>
                <button className="rounded border px-4 py-2" type="submit"
                  disabled={saving||!requestKey||reason.trim().length<10||
                    !Number.isSafeInteger(Number(delta))||!Number(delta)||
                    Math.abs(Number(delta))>10000}>
                  {saving?'Registrando…':'Registrar lançamento'}
                </button>
              </form>
            </>:
          summary?.available&&summary.balance!==null&&summary.version!==null
            ?<p>Saldo disponível: <strong>{summary.balance.toLocaleString('pt-BR')}
              </strong>. Versão {summary.version}. Consulta somente leitura.</p>
            :<p>O saldo operacional ainda não está disponível para consulta.
              O Tesouro histórico continua preservado.</p>}
        {message&&<p role="status">{message}</p>}
      </section>
      {house?<FirebaseConstructionQuote key={houseId}
        houseId={houseId} state={house.state}
        onQuote={args=>councilCloudRequest<ConstructionQuoteView>(
          '/api/firebase-cloud-house-quote',{action:'quote',...args})}/>:
        <p role="status">Simulador indisponível: a ficha autorizada da Casa não foi recebida.</p>}
    </>}
  </section>;
}
