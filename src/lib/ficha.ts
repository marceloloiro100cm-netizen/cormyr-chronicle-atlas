// Interpreta as fichas importadas das planilhas das casas (sistema GOT).
// O texto vem das células da planilha separadas por " · "; o interpretador
// extrai os campos conhecidos e preserva o restante como texto original.

export type Habilidade = { nome: string; graduacao: number; especializacao: string | null };

export type FichaPersonagem = {
  nome: string | null;
  casa: string | null;
  idade: string | null;
  jogador: string | null;
  virtude: string | null;
  vicio: string | null;
  defesaIntriga: string | null;
  compostura: string | null;
  movimento: string | null;
  corrida: string | null;
  habilidades: Habilidade[];
};

export type FichaCasa = {
  nome: string | null;
  suserano: string | null;
  regiao: string | null;
  lorde: string | null;
  lema: string | null;
  fundacao: string | null;
  arma: string | null;
  herdeiro: string | null;
  fortaleza: string | null;
  atributos: { rotulo: string; valor: number }[];
  eventos: string[];
};

const norm = (value: string) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

function cells(line: string): string[] {
  return line.split('·').map((cell) => cell.trim().replace(/^["“]|["”]$/g, '').trim());
}

// Lê o valor na mesma linha do rótulo: planilhas exportadas deixam células
// vazias quando o campo não foi preenchido, e o rótulo seguinte já é outra linha.
function valueAfter(lines: string[], label: string): string | null {
  for (const line of lines) {
    const parts = cells(line);
    const index = parts.findIndex((cell) => norm(cell) === norm(label));
    if (index < 0) continue;
    for (const cell of parts.slice(index + 1)) {
      if (cell) return cell;
    }
    return null;
  }
  return null;
}

export function isFichaPersonagem(title: string, content: string): boolean {
  return /ficha de personagem/i.test(content) || (/ficha/i.test(title) && /Nome do Personagem/i.test(content));
}

export function isFichaCasa(title: string, content: string): boolean {
  return /ficha de casa/i.test(content) || (/ficha da casa/i.test(title) && /Atributos da Casa/i.test(content));
}

export function parseFichaPersonagem(text: string): FichaPersonagem {
  const lines = text.split(/\r?\n/);
  const allCells = lines.flatMap(cells).filter((cell) => cell !== '');
  const habilidades: Habilidade[] = [];
  let inTable = false;
  for (const line of lines) {
    const parts = cells(line);
    if (parts.length >= 3 && norm(parts[0] ?? '') === 'graduacao' && norm(parts[1] ?? '') === 'habilidade') { inTable = true; continue; }
    if (!inTable) continue;
    const first = parts[0] ?? '';
    const nome = parts[1] ?? '';
    if (/^\d+$/.test(first) && /^[A-ZÀ-Ý]/.test(nome)) {
      habilidades.push({ nome, graduacao: Number(first), especializacao: parts[2] || null });
    } else if (habilidades.length > 0 && nome === '' && !/^\d+$/.test(first)) {
      inTable = false;
    }
  }
  const movimento = allCells.find((cell) => /^\d+\s*m/.test(cell)) ?? null;
  return {
    nome: valueAfter(lines, 'Nome do Personagem'),
    casa: valueAfter(lines, 'Casa'),
    idade: valueAfter(lines, 'Idade'),
    jogador: valueAfter(lines, 'Jogador'),
    virtude: valueAfter(lines, 'Virtude'),
    vicio: valueAfter(lines, 'Vicio'),
    defesaIntriga: valueAfter(lines, 'Defesa de Intriga'),
    compostura: valueAfter(lines, 'Compostura'),
    movimento,
    corrida: valueAfter(lines, 'Corrida'),
    habilidades,
  };
}

const ATRIBUTOS_CASA = ['Defesa', 'Influência', 'Terras', 'Lei', 'População', 'Poder', 'Riqueza'];

export function parseFichaCasa(text: string): FichaCasa {
  const lines = text.split(/\r?\n/);
  const allCells = lines.flatMap(cells).filter((cell) => cell !== '');
  const atributos: { rotulo: string; valor: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const parts = cells(lines[i] ?? '').map(norm);
    if (parts.includes('defesa') && parts.includes('riqueza')) {
      const valores = cells(lines[i + 1] ?? '').filter((cell) => /^\d+$/.test(cell)).map(Number);
      ATRIBUTOS_CASA.forEach((rotulo, n) => {
        if (valores[n] !== undefined) atributos.push({ rotulo, valor: valores[n] ?? 0 });
      });
      break;
    }
  }
  const eventos: string[] = [];
  const inicio = lines.findIndex((line) => norm(line).includes('eventos historicos'));
  if (inicio >= 0) {
    for (const line of lines.slice(inicio + 1)) {
      const parts = cells(line).filter(Boolean);
      if (parts.length === 1 && parts[0] && eventos.length < 12) eventos.push(parts[0]);
      else if (parts.length > 1 && eventos.length > 0) break;
    }
  }
  return {
    nome: valueAfter(lines, 'Nome'),
    suserano: valueAfter(lines, 'Susserano') ?? valueAfter(lines, 'Suserano'),
    regiao: valueAfter(lines, 'Região'),
    lorde: valueAfter(lines, 'Lorde'),
    lema: valueAfter(lines, 'Lema'),
    fundacao: valueAfter(lines, 'Fundação'),
    arma: valueAfter(lines, 'Arma'),
    herdeiro: valueAfter(lines, 'Herdeiro'),
    fortaleza: valueAfter(lines, 'Fortaleza'),
    atributos,
    eventos,
  };
}
