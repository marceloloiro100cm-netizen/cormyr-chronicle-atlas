import type {ReactNode} from 'react';

/** Peças de tabuleiro no estilo xadrez para as tropas do modo Game of Thrones.
 * Cada tipo de tropa tem uma silhueta própria; o Atacante joga com as peças
 * claras e o Defensor com as escuras. A base leva as cores da Casa
 * (variáveis --flag-a e --flag-b herdadas da peça). Apenas apresentação.
 */
type Tone='light'|'dark';
const PAWN='M18 69 Q19 57 26 51 Q22 43 27 37 A9.5 9.5 0 1 1 37 37 Q42 43 38 51 Q45 57 46 69 Z';
const SHAPES:Readonly<Record<string,string>>={
 pawn:PAWN,
 knight:'M19 69 Q19 55 27 47 Q21 45 19 37 Q17 26 27 16 L29 9 L35 15 Q47 18 49 32 Q50 41 44 43 L38 38 Q36 45 42 53 Q46 59 46 69 Z',
 rook:'M18 69 L22 41 L17 36 L17 19 L24 19 L24 25 L29 25 L29 19 L35 19 L35 25 L40 25 L40 19 L47 19 L47 36 L42 41 L46 69 Z',
 hood:'M18 69 Q19 56 26 50 Q21 44 24 36 L32 9 L40 36 Q43 44 38 50 Q45 56 46 69 Z',
 crown:'M18 69 Q21 51 27 43 Q23 35 28 29 L23 17 L29 22 L32 12 L35 22 L41 17 L36 29 Q41 35 37 43 Q43 51 46 69 Z',
 ship:'M8 56 Q32 66 56 56 L51 67 Q32 73 13 67 Z',
};
const KIND:Readonly<Record<string,{shape:string;gear?:string}>>={
 infantry:{shape:'pawn',gear:'spear-shield'},archers:{shape:'pawn',gear:'bow'},
 cavalry:{shape:'knight'},garrison:{shape:'rook'},scouts:{shape:'hood',gear:'bow'},
 'personal-guard':{shape:'crown'},engineers:{shape:'pawn',gear:'hammer'},
 warships:{shape:'ship',gear:'sail'},support:{shape:'pawn',gear:'crate'},
 crusaders:{shape:'pawn',gear:'banner'},levies:{shape:'pawn',gear:'fork'},
 guerrillas:{shape:'hood',gear:'sword'},mercenaries:{shape:'pawn',gear:'sword'},
 raiders:{shape:'pawn',gear:'axe'},criminals:{shape:'hood',gear:'sword'},
 sailors:{shape:'pawn',gear:'sword'},special:{shape:'crown',gear:'sword'},
};
const WOOD='#6b4a27',STEEL='#d9dee4',EDGE='#1a1410';
function gear(kind:string|undefined,tone:Tone):ReactNode{
 const fill='url(#got-piece-'+tone+')';
 switch(kind){
  case 'spear-shield':return <>
   <path d="M48 70 L48 12" stroke={WOOD} strokeWidth="2.4" strokeLinecap="round"/>
   <path d="M48 5 L51.5 14 L44.5 14 Z" fill={STEEL} stroke={EDGE} strokeWidth=".8"/>
   <path d="M11 42 Q21 38 31 42 Q31 58 21 64 Q11 58 11 42 Z" style={{fill:'var(--flag-a)',stroke:'var(--flag-b)'}} strokeWidth="2"/>
  </>;
  case 'bow':return <>
   <path d="M47 18 Q61 42 47 66" fill="none" stroke={WOOD} strokeWidth="2.6" strokeLinecap="round"/>
   <path d="M47 18 L47 66" stroke="#efe6cf" strokeWidth=".9"/>
   <path d="M38 42 L56 42" stroke={WOOD} strokeWidth="1.6"/><path d="M59 42 L54 39 L54 45 Z" fill={STEEL}/>
  </>;
  case 'sword':return <>
   <path d="M49 60 L49 22 L51.5 16 L54 22 L54 60 Z" transform="rotate(14 51 40)" fill={STEEL} stroke={EDGE} strokeWidth=".8"/>
   <path d="M43 59 L60 59" transform="rotate(14 51 40)" stroke={WOOD} strokeWidth="3" strokeLinecap="round"/>
  </>;
  case 'axe':return <>
   <path d="M49 70 L49 16" stroke={WOOD} strokeWidth="2.6" strokeLinecap="round"/>
   <path d="M49 18 Q62 16 60 32 Q54 28 49 30 Z" fill={STEEL} stroke={EDGE} strokeWidth=".8"/>
  </>;
  case 'hammer':return <>
   <path d="M49 70 L49 18" stroke={WOOD} strokeWidth="2.6" strokeLinecap="round"/>
   <rect x="41" y="12" width="16" height="10" rx="2" fill={STEEL} stroke={EDGE} strokeWidth=".8"/>
  </>;
  case 'fork':return <>
   <path d="M49 70 L49 22 M43 12 L43 22 L55 22 L55 12 M49 12 L49 22" fill="none" stroke={WOOD} strokeWidth="2.2" strokeLinecap="round"/>
  </>;
  case 'banner':return <>
   <path d="M49 70 L49 8" stroke={WOOD} strokeWidth="2.2" strokeLinecap="round"/>
   <path d="M49 9 L62 9 L62 27 L55.5 23 L49 27 Z" style={{fill:'var(--flag-a)',stroke:'var(--flag-b)'}} strokeWidth="1.4"/>
  </>;
  case 'crate':return <rect x="40" y="50" width="17" height="17" rx="2" fill="#a57b45" stroke={EDGE} strokeWidth="1"/>;
  case 'sail':return <>
   <path d="M32 58 L32 8" stroke={WOOD} strokeWidth="2.4" strokeLinecap="round"/>
   <path d="M34 12 Q54 28 34 52 Z" fill={fill} stroke={EDGE} strokeWidth="1"/>
   <path d="M30 16 Q16 32 30 50 Z" style={{fill:'var(--flag-a)',stroke:'var(--flag-b)'}} strokeWidth="1.2"/>
  </>;
  default:return null;
 }
}
export function WarPiece({typeId,tone}:{typeId:string;tone:Tone}){
 const kind=KIND[typeId]??{shape:'pawn',gear:'sword'};
 return <svg className="got-piece" viewBox="0 0 64 86" aria-hidden="true" focusable="false">
  <defs>
   <linearGradient id="got-piece-light" x1="0" x2="1" y1="0" y2="0">
    <stop offset="0" stopColor="#a39678"/><stop offset=".32" stopColor="#fffaf0"/>
    <stop offset=".7" stopColor="#e2d6b8"/><stop offset="1" stopColor="#8c8064"/>
   </linearGradient>
   <linearGradient id="got-piece-dark" x1="0" x2="1" y1="0" y2="0">
    <stop offset="0" stopColor="#17191d"/><stop offset=".32" stopColor="#7b8089"/>
    <stop offset=".7" stopColor="#3a3d44"/><stop offset="1" stopColor="#0f1013"/>
   </linearGradient>
   <linearGradient id="got-piece-shade" x1="0" x2="1" y1="0" y2="0">
    <stop offset="0" stopColor="#000" stopOpacity=".45"/><stop offset=".35" stopColor="#fff" stopOpacity=".18"/>
    <stop offset="1" stopColor="#000" stopOpacity=".5"/>
   </linearGradient>
  </defs>
  <ellipse cx="32" cy="79" rx="27" ry="6" fill="#000" opacity=".35"/>
  {/* Base redonda nas cores da Casa: lateral, tampo e friso. */}
  <path d="M6 70 L6 75 A26 8 0 0 0 58 75 L58 70 Z" style={{fill:'var(--flag-a)'}}/>
  <path d="M6 70 L6 75 A26 8 0 0 0 58 75 L58 70 Z" fill="url(#got-piece-shade)"/>
  <ellipse cx="32" cy="70" rx="26" ry="8" style={{fill:'var(--flag-a)',stroke:'var(--flag-b)'}} strokeWidth="2.2"/>
  <ellipse cx="32" cy="70" rx="19" ry="5.4" fill="#000" opacity=".22"/>
  <path d={SHAPES[kind.shape]??PAWN} fill={'url(#got-piece-'+tone+')'} stroke={EDGE} strokeWidth="1.4" strokeLinejoin="round"/>
  {kind.shape==='knight'&&<circle cx="38" cy="26" r="1.8" fill={EDGE}/>}
  {gear(kind.gear,tone)}
 </svg>;
}
