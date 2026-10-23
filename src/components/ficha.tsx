import { parseFichaCasa, parseFichaPersonagem, type FichaCasa, type FichaPersonagem } from '@/lib/ficha';
import { contentParts } from '@/lib/campaign-content';
import { PrivateImage } from '@/components/campaign-content';

function Pips({ valor, max = 7 }: { valor: number; max?: number }) {
  return <span className="ficha-pips" aria-label={`Graduação ${valor} de ${max}`}>{Array.from({ length: max }, (_, i) => <span key={i} className={i < valor ? 'ficha-pip cheio' : 'ficha-pip'} />)}</span>;
}

function Barra({ rotulo, valor }: { rotulo: string; valor: number }) {
  const largura = Math.max(0, Math.min(100, valor));
  return (
    <div className="ficha-barra">
      <div className="ficha-barra-rotulo"><span>{rotulo}</span><strong>{valor}</strong></div>
      <div className="ficha-barra-trilha" role="meter" aria-valuenow={valor} aria-valuemin={0} aria-valuemax={100} aria-label={rotulo}>
        <div className="ficha-barra-valor" style={{ width: `${largura}%` }} />
      </div>
    </div>
  );
}

function InfoGrid({ itens }: { itens: [string, string | null][] }) {
  const visiveis = itens.filter(([, v]) => v);
  if (!visiveis.length) return null;
  return <dl className="ficha-info">{visiveis.map(([rotulo, valor]) => <div key={rotulo}><dt>{rotulo}</dt><dd>{valor}</dd></div>)}</dl>;
}

export function FichaCasaCard({ content, crest, houseName }: { content: string; crest: string | null; houseName: string }) {
  const ficha: FichaCasa = parseFichaCasa(content);
  return (
    <article className="ficha-card">
      <header className="ficha-cabecalho">
        {crest && <img src={crest} alt={`Brasão da Casa ${houseName}`} />}
        <div>
          <p className="campaign-eyebrow">FICHA DA CASA</p>
          <h3>{ficha.nome ?? houseName}</h3>
          {ficha.lema && <p className="ficha-lema">“{ficha.lema}”</p>}
        </div>
      </header>
      <InfoGrid itens={[["Suserano", ficha.suserano], ["Região", ficha.regiao], ["Lorde", ficha.lorde], ["Fundação", ficha.fundacao], ["Arma ancestral", ficha.arma], ["Herdeiro", ficha.herdeiro], ["Fortaleza", ficha.fortaleza]]} />
      {ficha.atributos.length > 0 && (
        <section>
          <h4>Atributos da casa</h4>
          <div className="ficha-atributos">{ficha.atributos.map((a) => <Barra key={a.rotulo} rotulo={a.rotulo} valor={a.valor} />)}</div>
        </section>
      )}
      {ficha.eventos.length > 0 && (
        <section>
          <h4>Eventos históricos</h4>
          <ul className="ficha-eventos">{ficha.eventos.map((e) => <li key={e}>{e}</li>)}</ul>
        </section>
      )}
    </article>
  );
}

export function FichaPersonagemCard({ content, portrait, titulo }: { content: string; portrait: string | null; titulo: string }) {
  const ficha: FichaPersonagem = parseFichaPersonagem(content);
  return (
    <article className="ficha-card">
      <header className="ficha-cabecalho">
        {portrait && <PrivateImage path={portrait} caption="" />}
        <div>
          <p className="campaign-eyebrow">FICHA DE PERSONAGEM</p>
          <h3>{ficha.nome ?? titulo}</h3>
          <p className="text-muted-foreground">{[ficha.casa && `Casa ${ficha.casa}`, ficha.idade && `${ficha.idade} anos`, ficha.jogador && `Jogador: ${ficha.jogador}`].filter(Boolean).join(' · ')}</p>
        </div>
      </header>
      {(ficha.virtude || ficha.vicio) && <InfoGrid itens={[["Virtude", ficha.virtude], ["Vício", ficha.vicio]]} />}
      <div className="ficha-badges">
        {ficha.defesaIntriga && <span className="ficha-badge">Defesa de Intriga <strong>{ficha.defesaIntriga}</strong></span>}
        {ficha.compostura && <span className="ficha-badge">Compostura <strong>{ficha.compostura}</strong></span>}
        {ficha.movimento && <span className="ficha-badge">Movimento <strong>{ficha.movimento}</strong></span>}
        {ficha.corrida && <span className="ficha-badge">Corrida <strong>{ficha.corrida}</strong></span>}
      </div>
      {ficha.habilidades.length > 0 && (
        <section>
          <h4>Habilidades</h4>
          <table className="ficha-habilidades">
            <thead><tr><th>Habilidade</th><th>Graduação</th><th>Especialização</th></tr></thead>
            <tbody>{ficha.habilidades.map((h) => <tr key={h.nome}><td>{h.nome}</td><td><Pips valor={h.graduacao} /></td><td>{h.especializacao ?? '—'}</td></tr>)}</tbody>
          </table>
        </section>
      )}
    </article>
  );
}

/** Extrai o caminho da imagem de registros que contêm apenas uma imagem. */
export function portraitPath(content: string): string | null {
  const parts = contentParts(content);
  const images = parts.filter((p): p is { path: string; caption: string } => 'path' in p);
  const text = parts.filter((p) => 'text' in p).map((p) => ('text' in p ? p.text : '')).join('').trim();
  return images.length === 1 && !text ? (images[0]?.path ?? null) : null;
}
