/** Visual contract for the same portable square battlefield in all three modes.
 * Only presentation data are shared; terrain mechanics remain mode-local.
 */
export const SQUARE_TERRAIN_PRESENTATION={
 plain:{name:'Planície',color:'#d4c69e',symbol:'▱'},
 forest:{name:'Floresta',color:'#66886b',symbol:'♣'},
 hill:{name:'Colina',color:'#c4a36f',symbol:'▲'},
 rock:{name:'Rochedo / muralha',color:'#787478',symbol:'◆'},
} as const;

export const SQUARE_SIDE_PRESENTATION={
 attacker:{color:'#416f9b',label:'Atacante'},
 defender:{color:'#ab5246',label:'Defensor'},
} as const;

/** Common visual vocabulary does not imply equal movement cost or damage. */
export const SQUARE_MAP_CONTRACT='Quadrados · terreno compartilhável, regras independentes';
