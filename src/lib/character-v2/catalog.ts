/**
 * Lote 01 — inventário versionado, NÃO um motor de efeitos.
 *
 * Fonte: Guerra dos Tronos RPG (edição em português no acervo do Narrador),
 * Capítulo 5, Tabelas 5-1 (benefícios) e 5-2 (desvantagens).
 * Versões I/II/III são entradas individuais. A leitura OCR da fonte contém
 * quebras de linhas: entradas sinalizadas carecem de revisão visual do livro.
 * Regras de Westeros não são automaticamente aplicadas a Cormyr.
 */
export const CHARACTER_CATALOG_VERSION = 'got-pt-core-cormyr-2026-11-01-draft-1' as const;
export const CHARACTER_CATALOG_SOURCE = {
  edition: 'Guerra dos Tronos RPG — edição portuguesa do acervo da campanha; edição/impressão a conferir',
  driveFileId: '1FUzZozcKozW03lcjES-thJ2K9pbcpKll',
  benefits: 'Capítulo 5, Tabela 5-1',
  flaws: 'Capítulo 5, Tabela 5-2',
} as const;

const FORTUNE = 'Abastado • Companheiro • Companheiro Animal • Esquadrão de Elite • Famoso • Herança • Herdeiro • Irmão da Patrulha da Noite • Líder de Casa • Meistre • Membro da Guarda Real • Mestre dos Corvos • Olhos Noturnos • Patrono • Pio • Sonhos de Warg • Sortudo • Terras • Trocador de Peles • Visão Verde • Warg'.split(' • ');
const HERITAGE = 'Enorme • Sangue dos Andals • Sangue de Heróis • Sangue dos Homens de Ferro • Sangue dos Primeiros Homens • Sangue dos Roinar • Sangue dos Selvagens • Sangue de Valyria'.split(' • ');
const ABILITY = 'Ágil • Amigo das Feras • Artista • Atleta Nato • Avaliação • Contatos • Especialista • Especialista em Terreno • Foco em Conhecimento • Furtivo • Grande Caçador • Memória Eidética • Mente Matemática • Milagreiro • Ofício • Pantomima • Poliglota • Professor Nato • Rato das Ruas • Resistente • Rosto na Multidão • Sentidos Aguçados • Sinistro • Talentoso'.split(' • ');
const MARTIAL = 'Cavaleiro de Torneio • Chuva de Aço • Dançarino da Água I • Dançarino da Água II • Dançarino da Água III • Defesa Acrobática • Durão • Fúria • Furioso • Inspirador • Líder de Homens • Lutador Braavosi I • Lutador Braavosi II • Lutador Braavosi III • Lutador com Armas de Contusão I • Lutador com Armas de Contusão II • Lutador com Armas de Contusão III • Lutador com Armas de Haste I • Lutador com Armas de Haste II • Lutador com Armas de Haste III • Lutador com Lâminas Curtas I • Lutador com Lâminas Curtas II • Lutador com Lâminas Curtas III • Lutador com Lâminas Longas I • Lutador com Lâminas Longas II • Lutador com Lâminas Longas III • Lutador com Lanças I • Lutador com Lanças II • Lutador com Lanças III • Lutador com Machados I • Lutador com Machados II • Lutador com Machados III • Maestria em Arma • Maestria em Arma Aprimorada • Maestria em Armadura • Maestria em Armadura Aprimorada • Mãos Ágeis • Preciso • Pugilista I • Pugilista II • Pugilista III • Rápido • Sentido de Perigo • Tiro Duplo • Tiro Mortal • Tiro Triplo'.split(' • ');
const SOCIAL = 'Atraente • Autoridade • Carismático • Cortês • Cosmopolita • Diplomata Cauteloso • Eloquente • Fascinante • Favorito da Nobreza • Favorito da Plebe • Fiel • Magnético • Negociante Nato • Respeitado • Teimoso • Traiçoeiro'.split(' • ');
const FLAWS = 'Aleijado • Amaldiçoado • Ameaçador • Anão • Arrogância Suprema • Assombrado • Bastardo • Colérico • Covarde • Defeito (habilidade parametrizada) • Desastrado • Distraído • Dívida • Doença na Infância • Doente • Empolado • Eunuco • Frágil • Hábito Perturbador • Honrado • Ignóbil • Ingênuo • Inimigo • Insanidade Cruel • Lascivo • Manco • Marcado • Medo • Mudo • Odiado • Preso à Garrafa • Proscrito • Protegido • Saúde Frágil • Sentido Deficiente'.split(' • ');

export type CharacterTraitCategory = 'fortune'|'heritage'|'ability'|'martial'|'social'|'flaw';
export type CharacterTrait = Readonly<{
  id:string;
  label:string;
  category:CharacterTraitCategory;
  kind:'benefit'|'flaw';
  source:string;
  catalogVersion:typeof CHARACTER_CATALOG_VERSION;
  /** A existência no catálogo NÃO autoriza nenhuma modificação de estatísticas. */
  automation:'pending_rules';
  campaignStatus:'requires_narrator_review';
  sourceQuality:'transcribed'|'visual_review_required';
  tier:1|2|3|null;
  seriesId:string|null;
  parameterized:boolean;
  aliases:readonly string[];
}>;
export function normalizeTraitName(value:string):string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g,' ').trim();
}
function slug(value:string){return normalizeTraitName(value).replace(/ /g,'-');}
const aliases: Record<string,readonly string[]> = {
  'companheiro-animal':['Animal Companheiro'],
  'cavaleiro-de-torneio':['Cavaleiro de Torneios'],
  'negociante-nato':['Negociador Nato'],
  'sangue-dos-roinar':['Sangue dos Rhoynar'],
  'defeito-habilidade-parametrizada':['Defeito','Defeito (habilidade)'],
  'fragil':['Fragil'],
};
const visualReview = new Set([
  'companheiro-animal','membro-da-guarda-real','pugilista-ii',
  'lutador-com-laminas-longas-iii','lutador-com-machados-i',
  'maestria-em-armadura','maestria-em-armadura-aprimorada',
  'tiro-duplo','tiro-mortal','defeito-habilidade-parametrizada'
]);
function entries(names:string[],category:CharacterTraitCategory):CharacterTrait[]{
  return names.map(label=>{
    const id=slug(label),tierMatch=label.match(/ (I|II|III)$/);
    const tier=tierMatch?(tierMatch[1]==='I'?1:tierMatch[1]==='II'?2:3):null;
    const base=tier?label.replace(/ (I|II|III)$/,''):null;
    const entry:CharacterTrait=Object.freeze({
      id,label,category,kind:category==='flaw'?'flaw':'benefit',
      source:category==='flaw'?CHARACTER_CATALOG_SOURCE.flaws:CHARACTER_CATALOG_SOURCE.benefits,
      catalogVersion:CHARACTER_CATALOG_VERSION,
      automation:'pending_rules',campaignStatus:'requires_narrator_review',
      sourceQuality:visualReview.has(id)?'visual_review_required':'transcribed',
      tier,seriesId:base?slug(base):null,
      parameterized:category==='flaw'&&label.startsWith('Defeito ('),
      aliases:aliases[id]??[],
    });
    return entry;
  });
}
/** Catálogo integral de nomes revisados na auditoria, sem efeitos habilitados. */
export const CHARACTER_TRAITS:readonly CharacterTrait[] = Object.freeze([
  ...entries(FORTUNE,'fortune'), ...entries(HERITAGE,'heritage'),
  ...entries(ABILITY,'ability'), ...entries(MARTIAL,'martial'),
  ...entries(SOCIAL,'social'), ...entries(FLAWS,'flaw'),
]);
export const CHARACTER_BENEFITS=CHARACTER_TRAITS.filter(t=>t.kind==='benefit');
export const CHARACTER_FLAWS=CHARACTER_TRAITS.filter(t=>t.kind==='flaw');
export function findCharacterTrait(nameOrId:string):CharacterTrait|undefined{
  const key=normalizeTraitName(nameOrId);
  return CHARACTER_TRAITS.find(t=>normalizeTraitName(t.id)===key||
    normalizeTraitName(t.label)===key||t.aliases.some(a=>normalizeTraitName(a)===key));
}
export function auditCharacterCatalog(){
  const ids=new Set<string>(),duplicates:string[]=[];
  for(const t of CHARACTER_TRAITS){if(ids.has(t.id))duplicates.push(t.id);ids.add(t.id);}
  const byCategory={fortune:FORTUNE.length,heritage:HERITAGE.length,ability:ABILITY.length,martial:MARTIAL.length,social:SOCIAL.length,flaw:FLAWS.length};
  return {version:CHARACTER_CATALOG_VERSION,byCategory,benefits:CHARACTER_BENEFITS.length,
    flaws:CHARACTER_FLAWS.length,duplicates,untraceable:CHARACTER_TRAITS.filter(t=>!t.source),
    pendingVisualReview:CHARACTER_TRAITS.filter(t=>t.sourceQuality==='visual_review_required').map(t=>t.id)};
}
