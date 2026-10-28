import { describe, it, expect } from 'vitest';
import { parseFichaPersonagem, parseFichaCasa, isFichaPersonagem, isFichaCasa } from '@/lib/ficha';

// Amostras reais das planilhas importadas da pasta do jogador de Ashkar.
const FICHA_LORDE = `Página1
"Ficha de personagem GOT" ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·
"Nome do Personagem" · "Kael Ashkar" · Casa · Ashkar ·  ·  · Virtude ·  ·  ·  ·  ·  ·  ·
Idade · 40 · Jogador · "Marcelo Belem" ·  ·  · Vicio ·  ·  ·  ·  ·  ·  ·
Graduação · Habilidade · Especialização ·  ·  · Intriga ·  ·  ·  ·  · Movimento ·  · Corrida · 0
2 · Agilidade ·  · 0 ·  · "Defesa de Intriga" · 10 · Compostura · 12 ·  · "4m+1m /28 em corrida" ·  · "Movimento x 4" ·
2 · Astucia ·  · 0 ·  · Astucia+Percepção+Status ·  · "Vontade x 3" ·  ·  ·  ·  ·  ·
4 · Atletismo ·  · 40 ·  ·  ·  ·  ·  ·  · Armadura ·  ·  · `;

const FICHA_CASA = `Casa
"Ficha de Casa" ·  ·  ·  ·  ·  ·  ·
Nome · Ashkar · Susserano · Grandragon · Região · Dragoncoast · Lorde · "Kael Ashkar"
Lema · "We Will Come Back" · Fundação · 1000 · Arma · Phoinix · Herdeiro · "Darian Ashkar"
Fortaleza · Cinzaria ·  ·  ·  ·  ·  ·
"Atributos da Casa" ·  ·  ·  ·  ·  ·  ·
"Bonus Inicial" · Defesa · Influencia · Terras · Lei · População · Poder · Riqueza
Modificador · 50 · 50 · 20 · 30 · 10 · 50 · 40
"Bonus Inicial" ·  ·  ·  · " " ·  ·  ·
"Eventos Historicos" ·  ·  ·  ·  ·  ·  ·
Traição ·  ·  ·  ·  ·  ·  ·
Infraestrutura ·  ·  ·  ·  ·  ·  ·
Vitória ·  ·  ·  ·  ·  ·`;

describe('ficha de personagem', () => {
  it('extrai os campos principais da ficha do lorde', () => {
    const ficha = parseFichaPersonagem(FICHA_LORDE);
    expect(ficha.nome).toBe('Kael Ashkar');
    expect(ficha.casa).toBe('Ashkar');
    expect(ficha.idade).toBe('40');
    expect(ficha.jogador).toBe('Marcelo Belem');
    expect(ficha.defesaIntriga).toBe('10');
    expect(ficha.compostura).toBe('12');
    expect(ficha.movimento).toBe('4m+1m /28 em corrida');
    expect(ficha.corrida).toBe('0');
    // Campos vazios na planilha não puxam o rótulo da linha seguinte.
    expect(ficha.virtude).toBeNull();
    expect(ficha.vicio).toBeNull();
  });
  it('extrai as habilidades com graduação', () => {
    const ficha = parseFichaPersonagem(FICHA_LORDE);
    expect(ficha.habilidades).toEqual([
      { nome: 'Agilidade', graduacao: 2, especializacao: null },
      { nome: 'Astucia', graduacao: 2, especializacao: null },
      { nome: 'Atletismo', graduacao: 4, especializacao: null },
    ]);
  });
  it('reconhece o formato pelo conteúdo', () => {
    expect(isFichaPersonagem('Ficha - Lorde', FICHA_LORDE)).toBe(true);
    expect(isFichaPersonagem('Ficha da Casa', FICHA_CASA)).toBe(false);
  });
});

describe('ficha da casa', () => {
  it('extrai os campos principais', () => {
    const ficha = parseFichaCasa(FICHA_CASA);
    expect(ficha.nome).toBe('Ashkar');
    expect(ficha.suserano).toBe('Grandragon');
    expect(ficha.regiao).toBe('Dragoncoast');
    expect(ficha.lorde).toBe('Kael Ashkar');
    expect(ficha.lema).toBe('We Will Come Back');
    expect(ficha.fundacao).toBe('1000');
    expect(ficha.arma).toBe('Phoinix');
    expect(ficha.herdeiro).toBe('Darian Ashkar');
    expect(ficha.fortaleza).toBe('Cinzaria');
  });
  it('extrai os sete atributos com valores na ordem do cabeçalho', () => {
    const ficha = parseFichaCasa(FICHA_CASA);
    expect(ficha.atributos).toEqual([
      { rotulo: 'Defesa', valor: 50 },
      { rotulo: 'Influência', valor: 50 },
      { rotulo: 'Terras', valor: 20 },
      { rotulo: 'Lei', valor: 30 },
      { rotulo: 'População', valor: 10 },
      { rotulo: 'Poder', valor: 50 },
      { rotulo: 'Riqueza', valor: 40 },
    ]);
  });
  it('extrai os eventos históricos', () => {
    const ficha = parseFichaCasa(FICHA_CASA);
    expect(ficha.eventos).toEqual(['Traição', 'Infraestrutura', 'Vitória']);
  });
  it('não classifica Bonus/Bônus como evento e preserva os atributos', () => {
    const source = FICHA_CASA + '\n Bonus \n BÔNUS \n bônus \n';
    const ficha = parseFichaCasa(source);
    expect(ficha.eventos).toEqual(['Traição', 'Infraestrutura', 'Vitória']);
    expect(ficha.atributos).toEqual(parseFichaCasa(FICHA_CASA).atributos);
    expect(source).toContain('BÔNUS');
  });
  it('extrai corretamente posses e exércitos', () => {
    const source = FICHA_CASA + '\nPosses · Castelo\nExercito · Cavalaria\nTropas · Arqueiros';
    const ficha = parseFichaCasa(source);
    expect(ficha.posses).toEqual(['Castelo']);
    expect(ficha.exercitos).toEqual(['Cavalaria', 'Arqueiros']);
  });
  it('reconhece o formato pelo conteúdo', () => {
    expect(isFichaCasa('Ficha da Casa', FICHA_CASA)).toBe(true);
    expect(isFichaCasa('Ficha - Lorde', FICHA_LORDE)).toBe(false);
  });
});
