const IMG = /\[cormyr-image:([a-zA-Z0-9_./-]+)\|[^\]\n]*\]/;

/** Extrai nome, cargo (linha "Cargo: X" ou sufixo "Nome - Cargo"), foto e descrição de um registro de personagem. */
export function parseNpc(title: string, content: string) {
  const foto = content.match(IMG)?.[1] ?? null;
  const cargoLinha = content.match(/^\s*Cargo:\s*(.+)$/im)?.[1]?.trim() ?? null;
  const partes = title.split(/\s+-\s+/);
  const nome = (cargoLinha || partes.length < 2 ? title : partes[0]!).trim();
  const cargo = cargoLinha ?? (partes.length >= 2 ? partes.slice(1).join(' - ').trim() : null);
  const descricao = content.replace(new RegExp(IMG.source, 'g'), '').replace(/^\s*Cargo:.*$/im, '').trim();
  return { nome, cargo, foto, descricao };
}
