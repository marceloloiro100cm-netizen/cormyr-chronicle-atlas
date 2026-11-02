import {useState} from 'react';
import {Shield} from 'lucide-react';
import {vassalCrestUrl} from '@/lib/house/vassal-links';

type HouseIdentityProps={house:{id:string;name:string;crest:string|null}};

/** Fixed, responsive identity for a player's house. Never a house selector. */
export function HouseIdentity({house}:HouseIdentityProps){
 const src=vassalCrestUrl(house.crest);
 const [failed,setFailed]=useState<string|null>(null);
 return <div className="campaign-house-identity" aria-label={'Casa '+house.name}>
  <span className="campaign-house-identity__crest">
   {src&&failed!==src
    ?<img src={src} alt={'Brasão da Casa '+house.name} loading="lazy" onError={()=>setFailed(src)}/>
    :<Shield aria-label={'Brasão indisponível para '+house.name} role="img"/>}
  </span>
  <h2 className="campaign-house-identity__name">{house.name}</h2>
 </div>;
}
