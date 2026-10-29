import {isFichaCasa,isFichaPersonagem} from '@/lib/ficha';
export function isNarrativeNpc(r:{kind:string;title:string;content:string}){
 return r.kind==='character'&&!isFichaPersonagem(r.title,r.content)&&!isFichaCasa(r.title,r.content)&&!/^ficha\b/i.test(r.title.trim());
}
