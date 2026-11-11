import {useState} from 'react';
import {Shield} from 'lucide-react';
import {vassalCrestUrl} from '@/lib/house/vassal-links';
import {heraldicCrestUrl,heraldicHouseKey} from '@/lib/house/heraldry';

type HouseIdentityProps={house:{id:string;name:string;crest:string|null}};

function HouseIdentityCrest({house}:HouseIdentityProps) {
 const [failedSources,setFailedSources]=useState<string[]>([]);
 const preferred=heraldicCrestUrl(heraldicHouseKey(house.name));
 const fallback=vassalCrestUrl(house.crest);
 const src=[preferred,fallback].find((candidate):candidate is string=>Boolean(candidate)&&!failedSources.includes(candidate))??null;
 return <span className="campaign-house-identity__crest">
  {src?<img src={src} alt={'Brasão da Casa '+house.name} loading="lazy"
    onError={()=>setFailedSources(current=>current.includes(src)?current:[...current,src])}/>:
    <Shield aria-label={'Brasão indisponível para '+house.name} role="img"/>}
 </span>;
}

/** Player identity remains a label, not a house selector. */
export function HouseIdentity({house}:HouseIdentityProps){
 return <div className="campaign-house-identity" aria-label={'Casa '+house.name}>
  <HouseIdentityCrest key={house.id+':'+house.name+':'+(house.crest??'')} house={house}/>
  <h2 className="campaign-house-identity__name">{house.name}</h2>
 </div>;
}
