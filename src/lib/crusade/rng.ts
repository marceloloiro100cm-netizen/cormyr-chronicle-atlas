/** PCG32 (XSH-RR), estado 64-bit serializável. Sem relógio, random global ou efeitos de I/O.
 * 03 §3 exige seed gravada. A semântica do RNG é versionada junto do ruleset.
 */
const MASK=(1n<<64n)-1n;
const MULT=6364136223846793005n;
const DEFAULT_INC=1442695040888963407n;
export const CRZ_RNG_VERSION='PCG32-XSH-RR-1' as const;
export type CrzRngState=Readonly<{version:typeof CRZ_RNG_VERSION;state:string;inc:string}>;
export type CrzRng=Readonly<{
 nextUint32:()=>number;nextInt:(maxExclusive:number)=>number;
 state:()=>CrzRngState;
}>;
const hex=(n:bigint)=>n.toString(16).padStart(16,'0');
const parseHex=(n:string):bigint=>{
 if(!/^[0-9a-f]{16}$/.test(n))throw new Error('RNG: estado hexadecimal inválido.');
 return BigInt('0x'+n);
};
/** A seed é explicitamente fornecida, nunca gerada implicitamente. */
export function crzPcg32(seed:string|CrzRngState):CrzRng{
 let value:bigint,inc:bigint;
 if(typeof seed==='string'){
  if(!/^[0-9a-f]{1,16}$/i.test(seed))throw new Error('RNG: seed vazia ou inválida.');
  value=BigInt('0x'+seed)&MASK;inc=DEFAULT_INC;
 }else{
  if(seed.version!==CRZ_RNG_VERSION)throw new Error('RNG: versão desconhecida.');
  value=parseHex(seed.state);inc=parseHex(seed.inc);
  if((inc&1n)===0n)throw new Error('RNG: incremento inválido.');
 }
 const nextUint32=()=>{
  const old=value;
  value=(old*MULT+inc)&MASK;
  const xorshift=Number((((old>>18n)^old)>>27n)&0xffffffffn);
  const rotate=Number(old>>59n);
  return ((xorshift>>>rotate)|(xorshift<<((-rotate)&31)))>>>0;
 };
 const nextInt=(maxExclusive:number)=>{
  if(!Number.isSafeInteger(maxExclusive)||maxExclusive<1||maxExclusive>0x100000000)
   throw new Error('RNG: intervalo inválido.');
  const range=0x100000000;
  const threshold=range%maxExclusive;
  let bits=nextUint32();
  while(bits<threshold)bits=nextUint32();
  return bits%maxExclusive;
 };
 return {nextUint32,nextInt,state:()=>({
  version:CRZ_RNG_VERSION,state:hex(value),inc:hex(inc),
 })};
}
