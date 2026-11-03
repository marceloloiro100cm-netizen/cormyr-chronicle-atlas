import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {allSpyRegionalBaselines} from '@/lib/espionage/public-strategy';
import {approveSpyRegionLink} from '@/lib/espionage/region-review.functions';

/** Approval is an administrative source review, NOT discovery of a new map.
 * The Narrator must provide the official map source. Never infer geography.
 */
export function SpyRegionRouteAdmin({houseId}:{houseId:string}){
 const regions=allSpyRegionalBaselines();
 const approve=useServerFn(approveSpyRegionLink),qc=useQueryClient();
 const [origin,setOrigin]=useState(''),[destination,setDestination]=useState('');
 const [passage,setPassage]=useState<'land_neighbor'|'sea_passage'>('land_neighbor');
 const [bidirectional,setBidirectional]=useState(true);
 const [source,setSource]=useState(''),[reason,setReason]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [error,setError]=useState(false);
 const submit=async(e:React.FormEvent<HTMLFormElement>)=>{
  e.preventDefault();if(busy)return;
  setBusy(true);setMessage('');setError(false);
  try{
   await approve({data:{
    id:crypto.randomUUID(),fromRegion:origin,toRegion:destination,
    passage,bidirectional,approved:true,blocked:false,
    visibility:'public',source:source.trim(),reason:reason.trim(),
    requestKey:crypto.randomUUID(),
   }});
   await qc.invalidateQueries({queryKey:['espionage-regional-strategy']});
   setMessage('Ligação aprovada e registrada. Atualize o planejador para conferir o novo trajeto.');
   setReason('');
  }catch{
   setError(true);setMessage('Não foi possível registrar a ligação. Confira a fonte do mapa, a versão e sua autorização de Narrador.');
  }finally{setBusy(false);}
 };
 return <details className="house-ledger">
  <summary>Gestão do Narrador · homologar uma fronteira ou rota marítima</summary>
  <p className="house-caption">Apenas conexões confirmadas no mapa oficial devem ser cadastradas. Uma ligação marítima aprovada equivale a uma travessia de 1 désdia; não cria automaticamente portos ou fronteiras.</p>
  <form className="campaign-form" onSubmit={e=>{void submit(e);}}>
   <label>Região de origem
    <select required value={origin} onChange={e=>setOrigin(e.target.value)}>
     <option value="">Escolha a região</option>
     {regions.map(r=><option key={r.regionId} value={r.regionId}>{r.regionName}</option>)}
    </select>
   </label>
   <label>Região de destino
    <select required value={destination} onChange={e=>setDestination(e.target.value)}>
     <option value="">Escolha a região</option>
     {regions.filter(r=>r.regionId!==origin).map(r=><option key={r.regionId} value={r.regionId}>{r.regionName}</option>)}
    </select>
   </label>
   <label>Tipo de conexão
    <select value={passage} onChange={e=>setPassage(e.target.value as 'land_neighbor'|'sea_passage')}>
     <option value="land_neighbor">Fronteira terrestre vizinha</option>
     <option value="sea_passage">Ligação marítima homologada</option>
    </select>
   </label>
   <label style={{display:'flex',alignItems:'center',gap:8}}>
    <input type="checkbox" checked={bidirectional} onChange={e=>setBidirectional(e.target.checked)}/>
    Permite viagem nos dois sentidos
   </label>
   <label>Fonte no mapa ou documento oficial
    <input value={source} onChange={e=>setSource(e.target.value)} required minLength={8} maxLength={500}
     placeholder="Identifique o mapa, pasta ou documento que confirma a ligação"/>
   </label>
   <label>Justificativa de homologação
    <textarea value={reason} onChange={e=>setReason(e.target.value)} required minLength={10} maxLength={1000}
     placeholder="Explique por que as regiões são vizinhas ou possuem conexão marítima"/>
   </label>
   <Button type="submit" disabled={busy||origin===''||destination===''||origin===destination||source.trim().length<8||reason.trim().length<10}>
    {busy?'Homologando…':'Homologar ligação regional'}
   </Button>
   {message&&<p role={error?'alert':'status'}>{message}</p>}
  </form>
  <p className="house-caption">As ligações aprovadas ficam públicas a todas as Casas autenticadas. Reversão de uma ligação publicada exige revisão narratorial por versão; não deduza conexões somente por proximidade visual.</p>
 </details>;
}
