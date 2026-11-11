import {useState} from 'react';
import {Shield} from 'lucide-react';
import {vassalCrestUrl} from '@/lib/house/vassal-links';

type HouseIdentityProps={house:{id:string;name:string;crest:string|null}};

/** Fixed, responsive identity for a player's house. Never a house selector. */
export function HouseIdentity({house}:HouseIdentityProps){
 const themeKey=['goldfin','ashkar','fewmerry','grantass','harcourt','everlost','silversky','erdenor'].find(key=>house.name.toLocaleLowerCase('pt-BR').includes(key));
 const preferred=themeKey?`/house-flags/player-${themeKey}.webp`:null;
 const fallback=vassalCrestUrl(house.crest);
 const [failedSources,setFailedSources]=useState<string[]>([]);
 const src=[preferred,fallback].find((candidate):candidate is string=>Boolean(candidate)&&!failedSources.includes(candidate))??null;
 return <div className="campaign-house-identity" aria-label={'Casa '+house.name}>
  <span className="campaign-house-identity__crest">
   {src
    ?<img src={src} alt={'Brasão da Casa '+house.name} loading="lazy" onError={()=>setFailedSources(current=>src&&!current.includes(src)?[...current,src]:current)}/>
    :<Shield aria-label={'Brasão indisponível para '+house.name} role="img"/>}
  </span>
  <h2 className="campaign-house-identity__name">{house.name}</h2>
 </div>;
}
