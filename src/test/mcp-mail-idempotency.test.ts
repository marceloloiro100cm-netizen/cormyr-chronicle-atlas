import {describe,it,expect} from 'vitest';
import {mailIdempotencyKey} from '@/lib/mcp/idempotency';
describe('MCP mail idempotency',()=>{
 it('gives identical key to identical requests across retries',async()=>{
  const doc={action:'send',date:'1522-01-01',recipients:['h:harcourt'],content:'Mensagem',week:4};
  const key=await mailIdempotencyKey(doc);
  expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(await mailIdempotencyKey({...doc})).toBe(key);
 });
 it('different replies, weeks and recipients never collide',async()=>{
  const base={action:'reply',letter:'root',reply:'answer',week:4};
  const all=await Promise.all([base,{...base,reply:'other'},{...base,week:5},{...base,letter:'another'}].map(mailIdempotencyKey));
  expect(new Set(all).size).toBe(all.length);
 });
});
