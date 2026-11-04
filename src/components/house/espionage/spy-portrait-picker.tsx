import {useState} from 'react';
import {Check,UserRound} from 'lucide-react';
import type {SpyManagement} from '@/lib/espionage/spy-management.functions';
type Portrait=SpyManagement['portraits'][number];

/** Never render a broken image glyph: retry the public Google thumbnail
 * through Google's image host, then display a neutral silhouette. Site-hosted
 * portraits are preferred and have no Google Drive runtime dependency.
 */
function SafeSpyPortraitImage({url,label,size=32}:{url:string;label:string;size?:number}){
 const [attempt,setAttempt]=useState(0);
 const driveId=url.match(/^https:\/\/drive\.google\.com\/thumbnail\?id=([A-Za-z0-9_-]+)/)?.[1];
 const source=attempt===0?url:attempt===1&&driveId
  ?'https://lh3.googleusercontent.com/d/'+driveId+'=w400':null;
 if(!source)return <UserRound size={size} aria-label={'Retrato indisponível: '+label}/>;
 return <img src={source} alt={label} loading="lazy"
  onError={()=>setAttempt(driveId?Math.min(attempt+1,2):2)}
  style={{width:'100%',height:'100%',objectFit:'cover'}}/>;
}

/** Only trusted server-provided HTTPS image URLs appear in this gallery.
 * Unique selection is enforced by PostgreSQL, not just by disabled buttons.
 */
export function SpyPortraitPicker({portraits,selected,onChange,currentAgentId=null}:{
 portraits:Portrait[];selected:string|null;onChange:(id:string)=>void;
 currentAgentId?:string|null;
}){
 if(!portraits.length)return <div className="house-ledger" style={{padding:12}}>
  <UserRound size={23} aria-hidden/>
  <p style={{margin:'6px 0'}}>A galeria de retratos ainda não foi cadastrada.</p>
  <small>As fotos serão exibidas aqui como círculos assim que o Narrador fornecer
   e cadastrar o link da coleção. Até lá, o espião pode usar a silhueta padrão.</small>
 </div>;
 return <fieldset style={{border:0,padding:0,margin:0}}>
  <legend style={{marginBottom:8,fontWeight:600}}>Escolha uma foto para o espião</legend>
  <div style={{display:'flex',flexWrap:'wrap',gap:12,alignItems:'center'}}>
   {portraits.map(p=>{
    // Global reservation: another House occupies the portrait without
    // exposing its spy's identity to this player.
    const used=Boolean((p.occupied||p.assignedAgentId)&&
     p.assignedAgentId!==currentAgentId);
    const chosen=selected===p.id;
    return <button key={p.id} type="button" title={used
     ?p.label+' — já reservada por outro agente':p.label}
     aria-label={used?p.label+' — indisponível':p.label}
     aria-pressed={chosen}
     disabled={used}
     onClick={()=>onChange(p.id)}
     style={{width:76,display:'grid',justifyItems:'center',gap:4,
      background:'transparent',border:0,color:'inherit',cursor:used?'not-allowed':'pointer',
      opacity:used?0.3:1,filter:used?'grayscale(100%)':'none'}}>
     <span style={{width:60,height:60,borderRadius:'50%',overflow:'hidden',
      display:'block',position:'relative',
      border:chosen?'3px solid #b99550':'2px solid rgba(160,159,159,.45)'}}>
      <SafeSpyPortraitImage key={p.imageUrl} url={p.imageUrl} label={p.label} size={30}/>
      {chosen&&<span style={{position:'absolute',inset:0,
       background:'rgba(16,44,26,.35)',display:'grid',placeItems:'center'}}>
       <Check color="white" size={22}/>
      </span>}
     </span>
     <small style={{fontSize:10,maxWidth:76,overflowWrap:'break-word',textAlign:'center'}}>
      {used?'Em uso':p.label}</small>
    </button>;
   })}
  </div>

 </fieldset>;
}

export function SpyAvatar({name,url,size=42}:{name:string;url:string|null;size?:number}){
 return <span role="img" aria-label={'Retrato de '+name} style={{
  width:size,height:size,flexShrink:0,overflow:'hidden',borderRadius:'50%',
  border:'2px solid rgba(160,159,159,.45)',display:'inline-grid',
  placeItems:'center',background:'rgba(150,158,172,.12)'}}>
  {url?<SafeSpyPortraitImage key={url} url={url} label={name} size={Math.round(size*0.58)}/>:
   <UserRound size={Math.round(size*0.58)} aria-hidden/>}
 </span>;
}
