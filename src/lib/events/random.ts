/** Sorteio local do acervo do Narrador. Não cria eventos no calendário.
 * Para cada tipo há 100 registros; sorteia apenas entre os existentes.
 */
export type RandomEventRef=Readonly<{id:number;kind:string}>;
export function drawRandomEvent<T extends RandomEventRef>(
 events:readonly T[],kind:string,previousId:number|null=null,rng:()=>number=Math.random,
):T|null{
 const candidates=events.filter(e=>e.kind===kind);
 if(!candidates.length)return null;
 const choices=candidates.length>1&&previousId!==null
  ?candidates.filter(e=>e.id!==previousId):candidates;
 if(!choices.length)return null;
 const roll=rng();
 if(!Number.isFinite(roll)||roll<0||roll>=1)throw new Error('Sorteio inválido.');
 return choices[Math.floor(roll*choices.length)]??null;
}
