import {describe,it,expect} from 'vitest';
import {blankChronicleSheet,chronicleStats,serializeChronicleSheet,parseChronicleSheet,CHARACTER_SKILLS} from '@/lib/house/character-sheet';
describe('lote 11: ficha estruturada do personagem Chronicle',()=>{
 it('mantém 19 habilidades distintas com base padrão',()=>{
  const s=blankChronicleSheet();expect(CHARACTER_SKILLS).toHaveLength(19);
  expect(Object.keys(s.skills)).toHaveLength(19);expect(s.skills['Status']).toBe(2);
 });
 it('calcula Saúde, Compostura, Defesa de Combate e Defesa de Intriga sem sobrescrever habilidades',()=>{
  const s=blankChronicleSheet();s.skills['Vigor']=5;s.skills['Vontade']=4;s.skills['Agilidade']=3;s.skills['Atletismo']=4;s.skills['Percepção']=3;s.skills['Status']=4;s.cunning=5;s.shield=2;s.armorPenalty=1;
  const r=chronicleStats(s);
  expect(r.health).toBe(15);expect(r.composure).toBe(12);
  expect(r.combatDefense).toBe(11);expect(r.intrigueDefense).toBe(12);
  expect(s.skills['Vigor']).toBe(5);
 });
 it('salva e recupera ficha JSON sem confundi-la com texto legado',()=>{
  const s=blankChronicleSheet();s.name='Herdeira Evenhand';s.specialties='Luta: espadas +1B';s.destiny=4;s.spentDestiny=1;
  const text=serializeChronicleSheet(s),decoded=parseChronicleSheet(text);
  expect(decoded?.name).toBe(s.name);expect(decoded?.specialties).toBe(s.specialties);
  expect((decoded?.destiny??0)-(decoded?.spentDestiny??0)).toBe(3);expect(parseChronicleSheet('Texto antigo')).toBeNull();
 });
 it('aceita nascimento declarado sem modificar a idade canônica e preserva fichas antigas',()=>{
  const raw=blankChronicleSheet();raw.name='Lady Evenhand';raw.birthYear=1492;raw.birthDate='1492-03-17';
  const saved=serializeChronicleSheet(raw);
  expect(parseChronicleSheet(saved)?.birthYear).toBe(1492);
  expect(parseChronicleSheet(saved)?.birthDate).toBe('1492-03-17');
  raw.birthDate='1522-03-17';
  expect(()=>serializeChronicleSheet(raw)).toThrow('incompatíveis');
  raw.birthDate='';
  raw.birthYear=null;
  expect(parseChronicleSheet(serializeChronicleSheet(raw))?.birthYear).toBeNull();
 });
 it('rejeita ficha sem nome e gastos de Destino incoerentes',()=>{
  const s=blankChronicleSheet();expect(()=>serializeChronicleSheet(s)).toThrow();
  s.name='Nobre';s.destiny=1;s.spentDestiny=2;expect(()=>serializeChronicleSheet(s)).toThrow('Destino');
 });
});
