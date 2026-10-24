import { describe, expect, it } from 'vitest';
import { parseNpc } from '@/lib/npc';

describe('personagens da casa', () => {
  it('lê o cargo da linha Cargo', () => {
    const n = parseNpc('Ser Aldo', 'Cargo: Mestre de armas\n\nVeterano.\n[cormyr-image:u/a.png|Ser Aldo]');
    expect(n).toEqual({ nome: 'Ser Aldo', cargo: 'Mestre de armas', foto: 'u/a.png', descricao: 'Veterano.' });
  });
  it('usa o sufixo do título como cargo', () => {
    const n = parseNpc('Samyra Qazir - Lady', '[cormyr-image:u/b.jpg|x]');
    expect([n.nome, n.cargo, n.descricao]).toEqual(['Samyra Qazir', 'Lady', '']);
  });
});
