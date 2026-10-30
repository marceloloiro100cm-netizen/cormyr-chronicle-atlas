/** A stable UUID derived from the action and its normalized payload.
 * A retry must reuse the same key; distinct operation payloads produce distinct keys.
 * Callers who intend to repeat identical content as a new message can supply a new UUID.
 */
export async function mailIdempotencyKey(input:unknown):Promise<string>{
 const bytes=new TextEncoder().encode(JSON.stringify(input));
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
 const id=digest.slice(0,16);
 id[6]=(id[6]!&15)|0x50;
 id[8]=(id[8]!&63)|0x80;
 const hex=[...id].map(n=>n.toString(16).padStart(2,'0')).join('');
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
