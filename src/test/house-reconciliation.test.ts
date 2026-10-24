import { describe, it, expect } from 'vitest';
import { reconciliationPreview, type ReconciliationRecord } from '@/lib/house/reconciliation';
const source = (content: string): ReconciliationRecord => ({ id: 'source', house_id: 'ashkar', title: 'Ficha da Casa', content, version: 1, source_file_id: 'original', source_modified_at: null });
const header = 'Bonus Inicial · Defesa · Influencia · Terras · Lei · População · Poder · Riqueza';
describe('prévia de conciliação sem migração', () => {
  it('preserva valores reconhecidos e não reaplica bônus', () => {
    const record = source(`Nome · Ashkar\n${header}\nModificador · 50 · 50 · 20 · 30 · 10 · 50 · 40`);
    const before = JSON.stringify(record);
    const p = reconciliationPreview(record, 'Ashkar');
    expect(p.candidates[0]?.values).toEqual({ defense: 50, influence: 50, lands: 20, law: 30, population: 10, power: 50, wealth: 40 });
    expect(JSON.stringify(record)).toBe(before);
  });
  it('não converte campos vazios em zero nem escolhe total divergente', () => {
    const p = reconciliationPreview(source(`${header}\nModificador · · 50 · 20 · 30 · 10 · 50 · 40\nTotal · 40 · 50 · 20 · 30 · 10 · 50 · 40\nTotal · 35 · 50 · 20 · 30 · 10 · 50 · 40`), 'Ashkar');
    expect(p.candidates[0]?.values.defense).toBeNull();
    expect(p.candidates.map(c => c.values.defense)).toEqual([null, 40, 35]);
  });
  it('preserva erros e divergência de identidade para revisão', () => {
    const p = reconciliationPreview(source(`Nome · Erdenor\n${header}\nTotal · #REF! · 50 · 20 · 30 · 10 · 50 · 40`), 'Ashkar');
    expect(p.identity.nome).toBe('Erdenor');
    expect(p.candidates[0]?.values.defense).toBeNull();
    expect(p.issues.some(i => i.includes('conciliação bloqueada'))).toBe(true);
    expect(p.issues.some(i => i.includes('#REF!'))).toBe(true);
  });
});