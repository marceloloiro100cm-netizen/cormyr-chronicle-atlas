import {describe,it,expect} from 'vitest';
import {readFileSync,statSync} from 'node:fs';
import {REGIONS} from '@/lib/house/regions';
import {REGIONAL_MAP_LABEL_HOTSPOTS} from '@/components/house/espionage/cormyr-interactive-map';

const source=(path:string)=>readFileSync(path,'utf8');

describe('Espionagem · interface renovada e imagem do Narrador',()=>{
 it('inclui a imagem completa do mapa no próprio site, sem URL do Drive',()=>{
  const file=statSync('public/maps/cormyr-regioes.webp');
  expect(file.size).toBeGreaterThan(200000);
  const map=source('src/components/house/espionage/cormyr-interactive-map.tsx');
  expect(map).toContain('href="/maps/cormyr-regioes.webp"');
  expect(map).toContain('viewBox="0 0 1443 1090"');
  expect(map).not.toContain('drive.google.com');
  expect(Object.keys(REGIONAL_MAP_LABEL_HOTSPOTS).sort()).toEqual(Object.keys(REGIONS).sort());
  for(const spot of Object.values(REGIONAL_MAP_LABEL_HOTSPOTS)){
   expect(spot.x).toBeGreaterThanOrEqual(0);
   expect(spot.y).toBeGreaterThanOrEqual(0);
   expect(spot.x+spot.width).toBeLessThanOrEqual(1443);
   expect(spot.y+spot.height).toBeLessThanOrEqual(1090);
  }
 });
 it('oferece vagas totais sem seleção manual de rede e recarrega após criar',()=>{
  const s=source('src/components/house/espionage/spy-create-agent-dialog.tsx');
  expect(s).toContain('const source=slots[0]');
  expect(s).toContain('totalVacancies=options?.recruitment.reduce(');
  expect(s).not.toContain('<select value={source?.sourceHoldingId');
  expect(s).toContain('sourceHoldingId:source.sourceHoldingId');
  expect(s).toContain("qc.invalidateQueries({queryKey:['spy-recruitment-options',houseId]})");
  expect(s).toContain('slot.vacancies');
 });
 it('esconde avisos e opções marcados, preservando login e a galeria',()=>{
  const auth=source('src/routes/auth.tsx');
  expect(auth).not.toContain('Os oito jogadores oficiais estão cadastrados.');
  expect(auth).not.toContain('A seleção da casa não concede acesso.');
  expect(auth).not.toContain('Continue with Lovable');
  expect(auth).not.toContain('Entrar com Google');
  expect(auth).toContain('supabase.auth.signInWithPassword');
  const creation=source('src/components/house/espionage/spy-create-agent-dialog.tsx');
  const portrait=source('src/components/house/espionage/spy-portrait-picker.tsx');
  expect(creation).not.toContain('O recrutamento, a reserva da foto e o desconto');
  expect(portrait).not.toContain('Cada imagem pode ser usada por apenas um');
  expect(portrait).toContain('disabled={used}');
 });
});
