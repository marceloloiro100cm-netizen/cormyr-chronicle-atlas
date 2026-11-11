import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

/** The GOT/D&D styles are scoped to .battle-module. The player's early-return
 * branches must use the same ancestor as the narrator, including Leonardo.
 */
const read=(path:string)=>readFileSync(path,'utf8');

describe('Batalha do jogador · mesmo layout do Narrador',()=>{
 const entries=[
  {path:'src/components/battle/BattleV3PlayerEntry.tsx',
   got:"mode==='got-training'",dnd:"mode==='dnd-training'"},
  {path:'src/components/battle/BattleLeonardoSandbox.tsx',
   got:"active==='got'",dnd:"active==='dnd'"},
 ] as const;

 for(const entry of entries){
  it(entry.path+' mantém o escopo visual em GOT e D&D',()=>{
   const source=read(entry.path);
   expect(source).toContain("import './battle.css';");
   expect(source).toContain("import './battle-cleanup.css';");
   for(const condition of [entry.got,entry.dnd]){
    expect(source).toContain('if('+condition+')return <main className="battle-module"');
   }
   expect(source).toContain('playerSandbox onBack=');
  });
 }

 it('o CSS de preparação continua associado ao contêiner de batalha',()=>{
  const css=read('src/components/battle/battle-got-simple.css');
  expect(css).toContain('.battle-module .got-versus');
  expect(css).toContain('.battle-module .got-launch');
  expect(css).toContain('.battle-module .got-versus-side');
  expect(css).toContain('.battle-module .battle-got .battle-surface');
 });

 it('o treino conserva salvamento separado e não habilita a convocação oficial',()=>{
  const got=read('src/components/battle/BattleGotGame.tsx');
  expect(got).toContain('playerSandbox&&<p className="battle-note"');
  expect(got).toContain('!playerSandbox&&<label className=');
  expect(got).toContain("const saveKey=playerSandbox?'cormyr-got-player-training-v1':GOT_LAB_SAVE_KEY");
 });
});
