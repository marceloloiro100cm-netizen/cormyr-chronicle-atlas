import type {CSSProperties,ReactNode} from 'react';
import type {WarBanner} from '@/lib/battle/got/types';
import './battle-got-banner.css';

/** Bandeira de uma Casa: o próprio brasão recortado em flâmula, com as cores
 * da Casa na borda. Sem brasão, a flâmula mostra as duas cores e a inicial.
 * Apenas apresentação.
 */
export const bannerStyle=(banner:WarBanner):CSSProperties=>({
 '--flag-a':banner.primary,'--flag-b':banner.secondary,'--flag-ink':banner.ink,
} as CSSProperties);
export function WarFlag({banner,size='md',title}:{
 banner:WarBanner;size?:'xs'|'sm'|'md'|'lg';title?:string;
}){
 return <span className={'got-flag got-flag--'+size} style={bannerStyle(banner)}
  role={title?'img':undefined} aria-label={title} aria-hidden={title?undefined:true}>
  <span className="got-flag-cloth">
   {banner.crest?<img src={banner.crest} alt="" loading="lazy" decoding="async" draggable={false}
    onError={e=>{e.currentTarget.style.display='none';}}/>:null}
   <b>{banner.houseName.slice(0,1).toUpperCase()}</b>
  </span>
 </span>;
}
/** Faixa com bandeira e nome, usada nos cabeçalhos de cada exército. */
export function WarBannerTitle({banner,children,detail}:{
 banner:WarBanner;children?:ReactNode;detail?:ReactNode;
}){
 return <span className="got-banner-title" style={bannerStyle(banner)}>
  <WarFlag banner={banner} size="sm"/>
  <span className="got-banner-text"><strong>{children??banner.houseName}</strong>
   {detail&&<small>{detail}</small>}</span>
 </span>;
}
