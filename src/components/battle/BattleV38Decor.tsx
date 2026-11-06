import type {V38Decoration} from '@/lib/battle/v3/theatres-v38';

/** SVG vetorial próprio; os objetos decorativos não introduzem terreno oculto. */
export function BattleV38Decor({kind}:{kind:V38Decoration}){
 if(kind==='none')return null;
 return <g aria-hidden="true" pointerEvents="none" className="crusade-v38-decoration">
  {kind==='palisade'&&<>
   <ellipse cx="0" cy="18" rx="24" ry="7" fill="#1a2924" opacity=".55"/>
   {[-18,-8,2,12].map(x=><g key={x}>
    <path d={`M${x} 10 v-27 l5 -7 5 7 v27 Z`} fill="#66513d"
     stroke="#d5b58a" strokeWidth="1.3"/>
    <path d={`M${x} -11 h10`} stroke="#493c31" strokeWidth="2"/>
   </g>)}
   <path d="M-22 3 H23" stroke="#cba578" strokeWidth="3"/>
  </>}
  {kind==='rock-wall'&&<>
   <path d="M-24 17 L-27 3 -13 -21 3 -15 14 -24 27 -10 25 15 Z"
    fill="#464b4b" stroke="#c9bda9" strokeWidth="1.5"/>
   <path d="M-14 -20 L-6 1 4 8 M14 -22 L7 -8 18 7 M-23 8 L-1 13 24 8"
    stroke="#a69e91" strokeWidth="1.4" fill="none"/>
   <path d="M-21 4 L-8 -8 7 -7" stroke="#263138" strokeWidth="2" fill="none"/>
  </>}
  {kind==='basalt'&&<>
   <ellipse cx="1" cy="19" rx="23" ry="5" fill="#2c201f" opacity=".75"/>
   <path d="M-24 12 -14 -19 -1 -15 5 15 Z M2 16 13 -25 26 -12 23 17 Z"
    fill="#34313b" stroke="#e0a47b" strokeWidth="1.3"/>
   <path d="M-12 -16 -5 6 1 14 M12 -20 17 -4 21 15"
    fill="none" stroke="#84514d" strokeWidth="1.7"/>
  </>}
  {kind==='dunes'&&<>
   <path d="M-28 14 Q-16 -9 -5 -11 Q6 3 13 3 Q20 -3 29 -10"
    fill="none" stroke="#f3d096" strokeWidth="3" opacity=".85"/>
   <path d="M-25 22 Q-10 7 4 17 T27 12"
    fill="none" stroke="#8b593e" strokeWidth="2.5" opacity=".7"/>
  </>}
  {kind==='cairn'&&<>
   <ellipse cx="0" cy="17" rx="19" ry="5" fill="#372f29" opacity=".46"/>
   <path d="M-15 12 L-13 4 6 4 13 14 Z M-9 4 L-7 -4 4 -6 8 3 Z M-4 -7 L-2 -15 2 -15 6 -7 Z"
    fill="#928879" stroke="#d5c4a0" strokeWidth="1.5"/>
  </>}
  {kind==='treefall'&&<>
   <path d="M-23 14 Q0 1 23 -2" fill="none" stroke="#745b44"
    strokeWidth="8" strokeLinecap="round"/>
   <path d="M-14 9 L-20 -10 M5 6 L12 -15 M11 3 L22 15"
    fill="none" stroke="#a28e6a" strokeWidth="3" strokeLinecap="round"/>
   <circle cx="-6" cy="-5" r="4" fill="#39634e"/>
   <circle cx="9" cy="-12" r="4.8" fill="#39634e"/>
  </>}
  {kind==='coastal-debris'&&<>
   <path d="M-19 10 L-10 -10 10 -10 18 10 Z" fill="#725844"
    stroke="#c6a77d" strokeWidth="1.4"/>
   <path d="M-19 2 H18 M-8 -10 V10 M8 -10 V10" stroke="#4a4138" strokeWidth="2"/>
   <circle cx="-15" cy="14" r="4.5" fill="#2d3b42" stroke="#b8ad95"/>
   <circle cx="14" cy="14" r="4.5" fill="#2d3b42" stroke="#b8ad95"/>
  </>}
  {kind==='scrub'&&<>
   <path d="M-15 17 L-13 -4 M-13 6 L-21 -5 M-13 1 L-4 -10 M10 18 L8 -3 M8 7 L17 -7"
    fill="none" stroke="#6d7848" strokeWidth="3" strokeLinecap="round"/>
   <path d="M-23 17 Q-16 9 -9 17 M-1 17 Q7 7 19 16"
    fill="none" stroke="#c6a86b" strokeWidth="1.8"/>
  </>}
  {kind==='camp'&&<>
   <path d="M-18 14 L0 -16 19 14 Z" fill="#8a6b4b"
    stroke="#ecd6a7" strokeWidth="1.8"/>
   <path d="M0 -16 L0 15 M-5 14 Q0 -5 5 14" fill="#42362b"
    stroke="#d1b38a" strokeWidth="1.1"/>
   <path d="M18 -18 V10" stroke="#ae986e" strokeWidth="2.2"/>
   <path d="M18 -18 L27 -14 18 -8 Z" fill="#d8b66f"/>
  </>}
  {kind==='watchfire'&&<>
   <path d="M-16 17 L16 17 M-11 20 L12 8 M12 20 L-10 9"
    stroke="#684b39" strokeWidth="4" strokeLinecap="round"/>
   <path d="M-7 9 Q-12 -4 -1 -12 Q0 -3 6 -13 Q14 1 8 10 Z"
    fill="#d5a75f" stroke="#f6d9a4" strokeWidth="1.3"/>
   <path d="M-2 7 Q-4 -2 3 -7 Q10 3 3 8 Z" fill="#f8dba1"/>
  </>}
 </g>;
}
