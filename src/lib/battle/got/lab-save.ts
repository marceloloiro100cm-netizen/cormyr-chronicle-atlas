import type {WarBattle,WarUnit} from './types';

/** Browser-only save; isolated from server-side House and official battle storage. */
export const GOT_LAB_SAVE_KEY='cormyr-got-ch10-simulation-v1';
export const GOT_LAB_MAX_SAVE_BYTES=1_000_000;
const sides=new Set(['attacker','defender']);
const phases=new Set(['siege','heroes-first','orders','heroes-second','finished']);
const conditions=new Set(['organized','disorganized','routed','destroyed','surrendered','escaped']);
const rec=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&
 typeof value==='object'&&!Array.isArray(value);
const validUnit=(x:unknown,width:number,height:number):x is WarUnit=>{
 if(!rec(x)||typeof x['id']!=='string'||!x['id']['trim']()||typeof x['name']!=='string'||
  !sides.has(x['side'] as string)||!conditions.has(x['condition'] as string)||
  !rec(x['position'])||!rec(x['ability'])||!rec(x['source'])||
  !Number.isInteger(x['position']['x'])||!Number.isInteger(x['position']['y'])||
  (x['position']['x'] as number)<0||(x['position']['x'] as number)>=width||
  (x['position']['y'] as number)<0||(x['position']['y'] as number)>=height||
  !Number.isFinite(x['health'])||!Number.isFinite(x['maxHealth'])||
  (x['health'] as number)<0||(x['health'] as number)>(x['maxHealth'] as number)||
  !Number.isInteger(x['ability']['endurance'])||
  x['maxHealth']!==(x['ability']['endurance'] as number)*3||
  !['model','house-readonly'].includes(x['source']['kind'] as string))
  return false;
 return true;
};
/** Read-only schema check before restoring an untrusted local JSON snapshot.
 * This is a restore compatibility check, not an authorization mechanism.
 */
export function decodeGotLabSave(json:string):WarBattle{
 if(typeof json!=='string'||json.length>GOT_LAB_MAX_SAVE_BYTES||!json.trim())
  throw new Error('Arquivo de simulação vazio ou acima do limite de 1 MB.');
 let value:unknown;
 try{value=JSON.parse(json) as unknown;}
 catch{throw new Error('Formato JSON da simulação inválido.');}
 if(!rec(value)||value['schemaVersion']!==1||value['rulesVersion']!=='GOT-CH10-1'||
  typeof value['id']!=='string'||!value['id']['trim']()||
  typeof value['name']!=='string'||!value['name']['trim']()||
  !Number.isInteger(value['seed'])||(value['seed'] as number)<0||
  (value['seed'] as number)>4294967295||
  !Number.isInteger(value['width'])||!Number.isInteger(value['height'])||
  (value['width'] as number)<5||(value['width'] as number)>60||
  (value['height'] as number)<5||(value['height'] as number)>60||
  value['metresPerCell']!==10||!Number.isInteger(value['round'])||
  (value['round'] as number)<1||(value['round'] as number)>10000||
  !phases.has(value['phase'] as string)||!sides.has(value['first'] as string)||
  !sides.has(value['turn'] as string)||!Array.isArray(value['units'])||
  !Array.isArray(value['commanders'])||!Array.isArray(value['heroes'])||
  !Array.isArray(value['siege'])||!Array.isArray(value['fortifications'])||
  !Array.isArray(value['tiles'])||!Array.isArray(value['events'])||
  !rec(value['ordersRemaining'])||!rec(value['siegeCompleted'])||
  value['units']['length']<2||value['units']['length']>250||
  value['events']['length']>15000||
  !value['units']['every'](u=>validUnit(u,value['width'] as number,value['height'] as number))||
  new Set((value['units'] as WarUnit[]).map(u=>u.id)).size!==value['units']['length']||
  new Set((value['units'] as WarUnit[]).filter(u=>!['destroyed','escaped','surrendered'].includes(u.condition)).map(u=>u.position.x+':'+u.position.y)).size!==
   (value['units'] as WarUnit[]).filter(u=>!['destroyed','escaped','surrendered'].includes(u.condition)).length||
  !value['commanders']['every']((c:unknown)=>rec(c)&&typeof c['id']==='string'&&
   sides.has(c['side'] as string)&&Number.isInteger(c['warfare'])&&
   (c['warfare'] as number)>=1&&(c['warfare'] as number)<=12)||
  value['winner']!==null&&!sides.has(value['winner'] as string)&&
   value['winner']!==undefined||
  !value['events']['every']((e:unknown,i:number)=>rec(e)&&e['seq']===i+1&&
   typeof e['text']==='string'&&e['text']['length']<8000)||
  !Array.isArray(value['events']))
  throw new Error('Esta simulação não é compatível com o modo Guerra dos Tronos.');
 return value as unknown as WarBattle;
}
export function encodeGotLabSave(battle:WarBattle):string{
 const json=JSON.stringify(battle);
 decodeGotLabSave(json);
 return json;
}
