/** Moedas de Guerra dos Tronos RPG, capítulo 7, tabela 7-1.
 * Valores expressos em MEIOS VINTÉNS para evitar arredondamento em operações.
 * Dragão = 210 gamos = 11.760 vinténs. Uso para Cormyr sujeito à moeda da campanha.
 */
export const COIN_BOOK_REFERENCE='Guerra dos Tronos RPG · Capítulo 7 · Tabela 7-1';
export const COIN_RATES={
 half_vintem:1, vintem:2, half_tostao:4, tostao:8,
 estrela:16, gamo:112, lua:784, dragao:23520,
} as const;
export type CoinDenomination=keyof typeof COIN_RATES;
export const COIN_DENOMINATIONS:readonly CoinDenomination[]=[
 'dragao','lua','gamo','estrela','tostao','half_tostao','vintem','half_vintem',
] as const;
export const COIN_LABELS:Record<CoinDenomination,string>={
 dragao:'Dragão de ouro',lua:'Lua de prata',gamo:'Gamo de prata',
 estrela:'Estrela de cobre',tostao:'Tostão de cobre',
 half_tostao:'Meio tostão',vintem:'Vintém de cobre',half_vintem:'Meio vintém',
};
export type CoinOperation='deposit'|'withdraw';
export type CoinEntry=Readonly<{
 id:string;actorId:string;createdAt:string;operation:CoinOperation;
 denomination:CoinDenomination;quantity:number;note:string;
}>;
export type CharacterWallet=Readonly<{
 schemaVersion:1;sourceRecordId:string;houseId:string;
 entries:readonly CoinEntry[];
}>;
export const WALLET_PREFIX='Carteira de Moedas · Chronicle System · V1\n';
const validUUID=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const MAX_COIN_QUANTITY=1_000_000;
/** Bijective namespaced UUID distinct from the source ID; duplicate inserts
 * for the same source hit the same PK, never producing two active wallets.
 */
export function walletRecordId(sourceId:string):string{
 if(!validUUID(sourceId))throw new Error('ID de personagem inválido.');
 const mask='f1b832e09c3a5d8aa0c4e17bb64590d2';
 const hex=sourceId.replace(/-/g,'').toLowerCase();
 const out=Array.from({length:32},(_,i)=>(parseInt(hex[i]!,16)^parseInt(mask[i]!,16)).toString(16)).join('');
 return[out.slice(0,8),out.slice(8,12),'5'+out.slice(13,16),'8'+out.slice(17,20),out.slice(20)].join('-');
}
export function emptyCharacterWallet(sourceRecordId:string,houseId:string):CharacterWallet{
 if(!validUUID(sourceRecordId)||!houseId.trim())throw new Error('Personagem/Casa inválidos.');
 return{schemaVersion:1,sourceRecordId,houseId,entries:[]};
}
export function walletBalance(wallet:CharacterWallet):Record<CoinDenomination,number>{
 const balance=Object.fromEntries(COIN_DENOMINATIONS.map(id=>[id,0])) as Record<CoinDenomination,number>;
 const seen=new Set<string>();
 if(wallet.entries.length>5000)throw new Error('Carteira grande demais para atualização sem revisão.');
 for(const item of wallet.entries){
  if(!validUUID(item.id)||!validUUID(item.actorId)||seen.has(item.id)||!COIN_DENOMINATIONS.includes(item.denomination)||
   !Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>MAX_COIN_QUANTITY||
   !['deposit','withdraw'].includes(item.operation)||!item.note.trim()||item.note.trim().length>250)
   throw new Error('Lançamento monetário inválido ou duplicado.');
  seen.add(item.id);
  const next=balance[item.denomination]+(item.operation==='deposit'?item.quantity:-item.quantity);
  if(!Number.isSafeInteger(next)||next<0)throw new Error('Moedas insuficientes ou total inválido.');
  balance[item.denomination]=next;
 }
 return balance;
}
export function walletHalfVintems(balance:Readonly<Record<CoinDenomination,number>>):number{
 let value=0;
 for(const id of COIN_DENOMINATIONS){
  const n=balance[id];
  if(!Number.isSafeInteger(n)||n<0)throw new Error('Quantidade de moedas inválida.');
  const portion=n*COIN_RATES[id];value+=portion;
  if(!Number.isSafeInteger(portion)||!Number.isSafeInteger(value))throw new Error('Quantia excede limite exato.');
 }
 return value;
}
export function coinEquivalent(quantity:number,from:CoinDenomination,to:CoinDenomination){
 if(!Number.isSafeInteger(quantity)||quantity<0||quantity>MAX_COIN_QUANTITY)throw new Error('Quantidade inválida.');
 return quantity*COIN_RATES[from]/COIN_RATES[to];
}
export function appendWalletEntry(wallet:CharacterWallet,entry:CoinEntry):CharacterWallet{
 if(wallet.entries.some(e=>e.id===entry.id)){
  const prior=wallet.entries.find(e=>e.id===entry.id)!;
  if(JSON.stringify(prior)!==JSON.stringify(entry))throw new Error('Identificador já usado em lançamento diferente.');
  return wallet;
 }
 const updated={...wallet,entries:[...wallet.entries,entry]};
 walletBalance(updated);walletHalfVintems(walletBalance(updated));
 return updated;
}
export function parseCharacterWallet(text:string,sourceId:string,houseId:string):CharacterWallet{
 if(!text.startsWith(WALLET_PREFIX))throw new Error('Documento não é carteira de moedas.');
 let raw:unknown;
 try{raw=JSON.parse(text.slice(WALLET_PREFIX.length));}catch{throw new Error('Carteira corrompida.');}
 if(!raw||typeof raw!=='object')throw new Error('Carteira inválida.');
 const x=raw as Record<string,unknown>;
 if(x['schemaVersion']!==1||x['sourceRecordId']!==sourceId||x['houseId']!==houseId||!Array.isArray(x['entries']))
  throw new Error('Carteira pertence a outra Casa ou personagem.');
 const wallet={schemaVersion:1 as const,sourceRecordId:sourceId,houseId,entries:x['entries'] as CoinEntry[]};
 walletBalance(wallet);
 return wallet;
}
export function serializeCharacterWallet(wallet:CharacterWallet):string{
 if(!validUUID(wallet.sourceRecordId)||!wallet.houseId.trim())throw new Error('Carteira sem identidade.');
 walletHalfVintems(walletBalance(wallet));
 return WALLET_PREFIX+JSON.stringify(wallet);
}
