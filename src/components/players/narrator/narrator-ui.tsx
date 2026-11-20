import {useEffect,useState} from 'react';
import {vassalCrestUrl} from '@/lib/house/vassal-links';
import {heraldicCrestUrl,heraldicHouseKey} from '@/lib/house/heraldry';
import {NARRATION_GROUPS,narrationHouseIds} from '@/lib/mail-groups';

/** Brasão do reino usado pelo Narrador e como reserva de Casas sem arte. */
export const CORMYR_CREST='/newspaper/brasao_reino.webp';

/** Faixas de tela da visão do Narrador (as mesmas do CSS). */
export const NARRATOR_MOBILE='(max-width: 767px)';
export const NARRATOR_NARROW='(max-width: 1023px)';
export const NARRATOR_DRAWER_CONTEXT='(max-width: 1679px)';

/** Acompanha uma media query; sem matchMedia (testes, SSR) vale "não". */
export function useMedia(query:string):boolean{
 const read=()=>typeof window!=='undefined'&&typeof window.matchMedia==='function'&&window.matchMedia(query).matches;
 const [matches,setMatches]=useState(read);
 useEffect(()=>{
  if(typeof window==='undefined'||typeof window.matchMedia!=='function')return;
  const mql=window.matchMedia(query);
  const sync=()=>setMatches(mql.matches);
  sync();
  mql.addEventListener?.('change',sync);
  return()=>mql.removeEventListener?.('change',sync);
 },[query]);
 return matches;
}

/** Grupo de narração de uma Casa (Grupo 1 · Costa do Dragão, Grupo 2 · Horselands). */
export function narrationGroupOf(houseId:string|null|undefined){
 if(!houseId)return null;
 return NARRATION_GROUPS.find(g=>narrationHouseIds(g.id,[houseId]).length>0)??null;
}

type HouseLike={id:string;name:string;crest?:string|null};

/**
 * Estandarte da Casa: a arte oficial registrada vem primeiro e o estandarte
 * temático do jogador é reserva (mesma ordem de HouseIdentity). Sem Casa,
 * mostra o brasão de Cormyr (Narrador, Arauto, cartas gerais).
 */
export function HouseMark({house,size='sm'}:{house:HouseLike|null|undefined;size?:'xs'|'sm'|'lg'}){
 const [failed,setFailed]=useState<string[]>([]);
 const sources=house?[vassalCrestUrl(house.crest??null),heraldicCrestUrl(heraldicHouseKey(house.name)),CORMYR_CREST]:[CORMYR_CREST];
 const src=sources.filter((s):s is string=>Boolean(s)).find(s=>!failed.includes(s))??null;
 const alt=house?'Estandarte da Casa '+house.name:'Brasão de Cormyr';
 if(!src)return <span className={'nw-mark nw-mark--'+size+' nw-mark--empty'} role="img" aria-label={alt}/>;
 return <img className={'nw-mark nw-mark--'+size+(house&&src!==CORMYR_CREST?'':' nw-mark--crest')} src={src} alt={alt}
  loading="lazy" onError={()=>setFailed(current=>current.includes(src)?current:[...current,src])}/>;
}

/** Ícones de traço simples, herdando a cor do texto. */
const PATHS:Record<string,string>={
 painel:'M3 18h18M4.5 18 3 8l5 4 4-7 4 7 5-4-1.5 10',
 missivas:'M3 5h18v14H3zM3.5 6.5l8.5 7 8.5-7',
 jornal:'M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M7 9h7M7 13h7M7 16h4',
 calendario:'M6 3h12M6 21h12M7 3v3l5 6-5 6v3M17 3v3l-5 6 5 6v3',
 dossies:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
 batalha:'M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2',
 eventos:'M3 5h18v16H3zM8 3v4M16 3v4M3 10h18',
 aventuras:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z',
 'acessos-firebase':'M9 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .8 3 3 3 6',
 mais:'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
 feather:'M20 4C12 4 6 10 6 18M6 18c6 0 12-4 14-14M9.5 14.5h5M4 20l2-2',
 search:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
 filter:'M3 5h18l-7 8v6l-4-2v-4z',
 back:'M15 5l-7 7 7 7',
 close:'M6 6l12 12M18 6 6 18',
 check:'M5 12l5 5 9-10',
 send:'M21 3 10 14M21 3l-7 18-4-7-7-4z',
 alert:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v6M12 16.5v.5',
 reply:'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 6 6v5',
 wait:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
 scale:'M12 3v18M7 21h10M4 7h16M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z',
 hour:'M6 3h12M6 21h12M7 3v3l5 6-5 6v3M17 3v3l-5 6 5 6v3',
 file:'M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h4',
 trash:'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14',
 inbox:'M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6z',
 mailopen:'M3 10v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9l-9-6zM3.5 10.5l8.5 6 8.5-6',
 castle:'M3 21h18M5 21V10h3V7h2v3h4V7h2v3h3v11M10 21v-5h4v5',
 lock:'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
 edit:'M4 20h4L19 9l-4-4L4 16z',
 undo:'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
 user:'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21c0-4 3.6-7 8-7s8 3 8 7',
};
export function Icon({name,size=18}:{name:string;size?:number}){
 return <svg className="nw-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
  fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={PATHS[name]??PATHS['inbox']}/></svg>;
}
