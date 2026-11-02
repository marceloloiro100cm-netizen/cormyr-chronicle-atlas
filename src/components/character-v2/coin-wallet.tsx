import {useRef,useState,type FormEvent} from 'react';
import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {COIN_BOOK_REFERENCE,COIN_DENOMINATIONS,COIN_LABELS,COIN_RATES,
 type CoinDenomination,type CoinOperation,coinEquivalent,
 walletRecordId,emptyCharacterWallet,parseCharacterWallet,serializeCharacterWallet,
 walletBalance,walletHalfVintems,appendWalletEntry} from '@/lib/character-v2/coins';

type Source={id:string;title:string;visibility:'house'|'player'|'gm';player_id:string|null};
const pt=(n:number,digits=3)=>n.toLocaleString('pt-BR',{maximumFractionDigits:digits});
export function CharacterCoinWallet({source,houseId,canEdit=false}:{
 source:Source;houseId:string;canEdit?:boolean;
}){
 const [denomination,setDenomination]=useState<CoinDenomination>('dragao');
 const [quantity,setQuantity]=useState('1');
 const [operation,setOperation]=useState<CoinOperation>('deposit');
 const [note,setNote]=useState('');
 const [calcFrom,setCalcFrom]=useState<CoinDenomination>('dragao');
 const [calcTo,setCalcTo]=useState<CoinDenomination>('gamo');
 const [calcQuantity,setCalcQuantity]=useState('1');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const pending=useRef<string|null>(null);
 const key=walletRecordId(source.id);
 const query=useQuery({
  queryKey:['character-wallet',source.id,houseId],
  queryFn:async()=>{
   const response=await supabase.from('campaign_records')
    .select('id,title,content,version,house_id,player_id,visibility,kind')
    .eq('id',key).maybeSingle();
   if(response.error)throw response.error;
   const row=response.data;
   if(row){
    if(row.house_id!==houseId||row.kind==='character')throw new Error('Documento de carteira inválido.');
    parseCharacterWallet(row.content,source.id,houseId);
   }
   return row;
  },
 });
 const wallet=query.data?
  parseCharacterWallet(query.data.content,source.id,houseId):
  emptyCharacterWallet(source.id,houseId);
 const balance=walletBalance(wallet);
 const total=walletHalfVintems(balance);
 const entered=Number(quantity),calcEntered=Number(calcQuantity);
 const canRecord=canEdit&&!busy&&!query.isPending&&!query.error&&
  Number.isSafeInteger(entered)&&entered>0&&entered<=1_000_000&&
  note.trim().length>=3&&note.trim().length<=250;
 const converted=Number.isSafeInteger(calcEntered)&&calcEntered>=0&&calcEntered<=1_000_000?
  coinEquivalent(calcEntered,calcFrom,calcTo):null;
 async function submit(event:FormEvent){
  event.preventDefault();
  if(!canRecord)return;
  setBusy(true);setMessage('');
  try{
   const userResponse=await supabase.auth.getUser(),user=userResponse.data.user;
   if(!user)throw new Error('Sessão expirada.');
   if(!source.visibility||source.visibility==='player'&&!source.player_id)
    throw new Error('Visibilidade da ficha original inválida.');
   const id=pending.current??crypto.randomUUID();
   pending.current=id;
   const next=appendWalletEntry(wallet,{
    id,actorId:user.id,createdAt:new Date().toISOString(),
    operation,denomination,quantity:entered,note:note.trim(),
   });
   const content=serializeCharacterWallet(next);
   if(query.data){
    const response=await supabase.rpc('save_campaign_record',{
     p_id:query.data.id,p_version:query.data.version,
     p_title:query.data.title,p_content:content,
    });
    if(response.error)throw response.error;
   }else{
    const response=await supabase.from('campaign_records').insert({
     id:key,house_id:houseId,
     player_id:source.visibility==='player'?source.player_id:null,
     kind:'document',visibility:source.visibility,
     title:'Carteira de moedas · '+source.title,
     content,version:1,created_by:user.id,updated_by:user.id,
    });
    if(response.error)throw response.error;
   }
   pending.current=null;
   setNote('');setMessage('Movimentação registrada e versão preservada.');
   await query.refetch();
  }catch(error){
   await query.refetch();
   setMessage((error instanceof Error?error.message:'Falha ao salvar.')+
    ' Confira o saldo antes de tentar novamente.');
  }finally{setBusy(false);}
 }
 return <section className="character-v2-section" aria-label="Carteira de moedas do personagem">
  <h4>Moedas e valores</h4>
  <p className="text-xs">Carteira pessoal separada da Riqueza da Casa. Conversões conforme {COIN_BOOK_REFERENCE}.
   Taxas podem ser ajustadas pelo Narrador para regiões específicas.</p>
  {query.isPending?<p role="status">Consultando as moedas registradas…</p>:
   query.error?<p role="alert">Não foi possível consultar a carteira: {String(query.error)}</p>:<>
    <div className="character-v2-stats">
     <div><dt>Valor em dragões de ouro</dt><dd>{pt(total/COIN_RATES.dragao,4)}</dd></div>
     <div><dt>Valor em gamos de prata</dt><dd>{pt(total/COIN_RATES.gamo,3)}</dd></div>
     <div><dt>Valor em vinténs de cobre</dt><dd>{pt(total/COIN_RATES.vintem,2)}</dd></div>
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
     {COIN_DENOMINATIONS.map(id=><div className="rounded border p-2" key={id}>
      <span className="block text-xs">{COIN_LABELS[id]}</span>
      <strong>{pt(balance[id],0)}</strong>
     </div>)}
    </div>
    {canEdit&&<form className="campaign-form mt-4" onSubmit={e=>void submit(e)}>
     <h5 className="font-semibold">Adicionar ou retirar moedas</h5>
     <div className="house-input-grid">
      <label>Operação<select value={operation} onChange={e=>setOperation(e.target.value as CoinOperation)}>
       <option value="deposit">Adicionar moedas</option><option value="withdraw">Retirar moedas</option>
      </select></label>
      <label>Tipo de moeda<select value={denomination} onChange={e=>setDenomination(e.target.value as CoinDenomination)}>
       {COIN_DENOMINATIONS.map(id=><option key={id} value={id}>{COIN_LABELS[id]}</option>)}
      </select></label>
      <label>Quantidade<input type="number" min="1" max="1000000" step="1"
       value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
      <label>Motivo<input maxLength={250} value={note} onChange={e=>setNote(e.target.value)}
       placeholder="Ex.: pagamento de serviço"/></label>
     </div>
     <Button type="submit" disabled={!canRecord}>{busy?'Salvando…':'Registrar moedas'}</Button>
     <p role="status" className="text-sm">{message}</p>
    </form>}
    <div className="rounded-lg border p-3 mt-4 space-y-3">
     <h5 className="font-semibold">Calculadora de conversão</h5>
     <div className="house-input-grid">
      <label>Quantidade<input type="number" min="0" max="1000000" step="1"
       value={calcQuantity} onChange={e=>setCalcQuantity(e.target.value)}/></label>
      <label>De<select value={calcFrom} onChange={e=>setCalcFrom(e.target.value as CoinDenomination)}>
       {COIN_DENOMINATIONS.map(id=><option key={id} value={id}>{COIN_LABELS[id]}</option>)}
      </select></label>
      <label>Para<select value={calcTo} onChange={e=>setCalcTo(e.target.value as CoinDenomination)}>
       {COIN_DENOMINATIONS.map(id=><option key={id} value={id}>{COIN_LABELS[id]}</option>)}
      </select></label>
     </div>
     <output aria-label="Resultado da conversão" className="block font-semibold">
      {converted===null?'Informe quantidade inteira válida.':
       pt(converted,5)+' '+COIN_LABELS[calcTo].toLowerCase()}
     </output>
     <p className="text-xs">1 dragão = 210 gamos = 11.760 vinténs. A calculadora não modifica o saldo.</p>
    </div>
    {wallet.entries.length>0&&<details className="mt-4">
     <summary>Histórico de moedas ({wallet.entries.length})</summary>
     <ol className="list-decimal pl-5 text-sm space-y-1 mt-2">
      {[...wallet.entries].reverse().slice(0,15).map(entry=><li key={entry.id}>
       {entry.operation==='deposit'?'+':'−'}{pt(entry.quantity,0)} {COIN_LABELS[entry.denomination]}
       {' · '}{entry.note}{' · '}{new Date(entry.createdAt).toLocaleDateString('pt-BR')}
      </li>)}
     </ol>
    </details>}
  </>}
 </section>;
}
