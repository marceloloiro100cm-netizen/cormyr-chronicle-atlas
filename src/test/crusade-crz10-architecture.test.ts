import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {crzPreset,crzRulesetHash,CRZ_APPROVED_HASHES} from '@/lib/crusade/ruleset';

describe('CRZ-1.0 · isolamento estrutural e segurança das regras',()=>{
 it('não depende de motor PTE, UI, Supabase, relógio ou RNG global',()=>{
  for(const file of ['ruleset.ts','stack.ts','rng.ts','damage.ts','creatures.ts','catalog.ts','convert.ts','battle.ts','geometry.ts','combat.ts','turns.ts']){
   const source=readFileSync(resolve('src/lib/crusade',file),'utf8');
   // Reutilizar tipos e geometria pública é permitido; importar redutores PTE não.
   const imports=[...source.matchAll(/import[^;]*from\s+['"]([^'"]+)['"]/g)];
   for(const match of imports){
    const path=match[1]??'';
    if(path.includes('/battle/')){
     const geometry=path.includes('/battle/geometry/');
     const types=path.endsWith('/battle/domain/types')&&
      /^import\s+type\s/.test(match[0].trim());
     expect(geometry||types).toBe(true);
    }
   }
   expect(source).not.toMatch(/from\s+['"][^'"]*(?:\/house\/|supabase|react|\.server|\.functions)/i);
   expect(source).not.toMatch(/\bMath\.random\s*\(/);
   expect(source).not.toMatch(/\bDate\.now\s*\(/);
   expect(source).not.toMatch(/\bcrypto\.getRandomValues\s*\(/);
   expect(source).not.toMatch(/\bresolveSurvivors\s*\(/);
   expect(source).not.toMatch(/\bchangeUnitState\s*\(/);
  }
 });
 it('hash rejeita edição furtiva de parâmetros de uma partida',()=>{
  const rules=crzPreset('CRZ-5E');
  const tampered={...rules,battle:{...rules.battle,maxRounds:999}};
  expect(crzRulesetHash(tampered)).not.toBe(CRZ_APPROVED_HASHES['CRZ-5E']);
  expect(crzRulesetHash(crzPreset('CRZ-5E'))).toBe(CRZ_APPROVED_HASHES['CRZ-5E']);
  expect(rules.battle.maxRounds).toBe(20);
 });
});
