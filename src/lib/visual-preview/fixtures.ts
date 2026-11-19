import {imageToken} from '@/lib/campaign-content';
import {blankChronicleSheet, serializeChronicleSheet, CHARACTER_SKILLS} from '@/lib/house/character-sheet';
import {dateKey, parseDate} from '@/lib/calendar/harptos';
import {spyPortraitManifest} from '@/lib/espionage/spy-portrait-manifest';
import {makeNewspaperBlock, NEWSPAPER_ENGRAVINGS, type NewspaperBlock} from '@/lib/newspaper/model';
import type {Row, RpcHandler, VisualDb} from './mock-supabase';
import type {VisualPreviewProfile} from './state';

/**
 * Dados de demonstração da prévia visual. Casas, brasões e sedes vêm do
 * catálogo público (public/cormyr/data.js); textos de missivas, jornal e
 * espionagem são ilustrativos e servem só para preencher as telas originais.
 */
export const PREVIEW_CALENDAR = {year: 1522, month: 0, day: 18, festival: null as string | null};
const TODAY = dateKey(PREVIEW_CALENDAR);
const CURRENT_ROUND = 3;

/** UUID determinístico (v4 no formato) para ids estáveis entre renderizações. */
export function previewUuid(group: number, index = 0): string {
  const tail = (group * 1000 + index).toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${tail}`;
}
const iso = (day: number, hour = 12) => new Date(Date.UTC(2026, 10, day, hour, 0, 0)).toISOString();

export type PreviewHouse = {
  id: string; name: string; region: 'Dragon Coast' | 'Horselands'; regionId: 'dragoncoast' | 'horselands';
  castle: string | null; lord: string | null; crest: string; city: string | null; motto: string | null;
  colors: string | null; portrait: string | null;
};
export const PREVIEW_HOUSES: PreviewHouse[] = [
  {id: 'ashkar', name: 'Ashkar', region: 'Dragon Coast', regionId: 'dragoncoast', castle: 'Cinzaria', lord: 'Kael Ashkar', crest: 'assets/dragoncoast-ashkar.webp', city: null, motto: 'We Will Come Back', colors: 'Ouro, laranja e vermelho', portrait: 'cormyr/assets/portraits/ashkar.jpg'},
  {id: 'fewmerry', name: 'Fewmerry', region: 'Dragon Coast', regionId: 'dragoncoast', castle: 'Torre Alta das Bandeiras e Salão Giratório', lord: 'Bassu Fewmerry', crest: 'assets/dragoncoast-fewmerry.webp', city: 'Rivermouth', motto: 'Forwards', colors: 'Azul e ouro', portrait: null},
  {id: 'goldfin', name: 'Goldfin', region: 'Dragon Coast', regionId: 'dragoncoast', castle: 'The Nightfall', lord: 'Hektor Goldfin', crest: 'assets/dragoncoast-goldfin.webp', city: 'Porto da Mordida', motto: 'Our Cuts Runs Deep', colors: 'Cinza e ouro', portrait: 'cormyr/assets/portraits/goldfin.jpg'},
  {id: 'grantass', name: 'Grantass', region: 'Dragon Coast', regionId: 'dragoncoast', castle: 'Torre sem Escadas', lord: 'Rowena Grantass', crest: 'assets/dragoncoast-grantass.webp', city: 'Salão das Lavandas', motto: "We don't drink, we pour", colors: 'Bordeaux e ouro', portrait: 'cormyr/assets/portraits/grantass.jpg'},
  {id: 'erdenor', name: 'Erdenor', region: 'Horselands', regionId: 'horselands', castle: 'Goldenbull tower', lord: 'Aldaeric Erdenor', crest: 'assets/horselands-erdenor.webp', city: 'Povoado de Oxstep Hill', motto: null, colors: null, portrait: null},
  {id: 'everlost', name: 'Everlost', region: 'Horselands', regionId: 'horselands', castle: null, lord: null, crest: 'assets/horselands-everlost.webp', city: null, motto: null, colors: null, portrait: null},
  {id: 'harcourt', name: 'Harcourt', region: 'Horselands', regionId: 'horselands', castle: 'Honorwatch Keep', lord: 'Genevieve Harcourt', crest: 'assets/horselands-harcourt.webp', city: 'Emberfall Crossing', motto: 'Honor Above All', colors: 'Azul & Branco', portrait: 'cormyr/assets/portraits/harcourt.jpg'},
  {id: 'silversky', name: 'Silversky', region: 'Horselands', regionId: 'horselands', castle: null, lord: 'Ashladd Silversky', crest: 'assets/horselands-silversky.webp', city: null, motto: null, colors: null, portrait: 'cormyr/assets/portraits/silversky.jpg'},
];
/** Casas não jogadoras usadas como alvos e remetentes históricos. */
const NPC_TARGETS = [
  {id: 'grandragon', name: 'Grandragon', region: 'Dragon Coast'},
  {id: 'hardcastle', name: 'Hardcastle', region: 'Dragon Coast'},
  {id: 'phelles', name: 'Phelles', region: 'Crownlands'},
  {id: 'obarskyr', name: 'Obarskyr', region: 'Helmlands'},
];

export const PREVIEW_USERS = {
  narrador: {id: previewUuid(1), email: 'narrador@cormyr.com.br', name: 'Narrador'},
  editor: {id: previewUuid(2), email: 'redacao@cormyr.com.br', name: 'Editor-Chefe'},
};
export const playerUserId = (index: number) => previewUuid(3, index);
export const playerId = (index: number) => previewUuid(4, index);
const playerName = (house: PreviewHouse) => `Jogador · Casa ${house.name}`;

/** Escolhe a Casa do jogador a partir dos vínculos Firebase, se reconhecíveis. */
export function previewHouseFor(hints: readonly string[]): PreviewHouse {
  const normalized = hints.map(h => h.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
  return PREVIEW_HOUSES.find(h => normalized.some(hint => hint === h.id || hint.includes(h.id))) ?? PREVIEW_HOUSES[0]!;
}

function lordSheet(house: PreviewHouse): string {
  const sheet = blankChronicleSheet();
  const values = [3, 3, 2, 3, 2, 3, 2, 4, 3, 2, 3, 4, 3, 4, 3, 2, 5, 3, 4];
  CHARACTER_SKILLS.forEach((skill, i) => { sheet.skills[skill] = values[i] ?? 2; });
  return serializeChronicleSheet({
    ...sheet, name: house.lord ?? `Lorde da Casa ${house.name}`, role: 'Lorde da Casa',
    birthYear: 1484, birthDate: '1484-03-11', cunning: 4, movement: 4, destiny: 4, spentDestiny: 1,
    specialties: 'Status: Reputação 2B · Guerra: Comando 1B · Persuasão: Barganha 1B',
    qualities: 'Herdeiro, Líder de Homens, Sangue Nobre', flaws: 'Orgulhoso', xpSpent: 30,
  });
}

function houseRecords(house: PreviewHouse, index: number, actor: string): Row[] {
  const base = {
    house_id: house.id, player_id: null, created_by: actor, updated_by: actor,
    last_synced_at: iso(10), source_file_id: null, source_modified_at: null, sync_state: 'synced',
    visibility: 'house',
  };
  const map = house.regionId === 'dragoncoast' ? 'maps/espionage/dragoncoast.webp' : 'maps/espionage/horselands.webp';
  const crest = 'cormyr/' + house.crest;
  return [
    {...base, id: previewUuid(10, index * 10 + 1), kind: 'history', title: `Crônica da Casa ${house.name}`, version: 3,
      created_at: iso(2), updated_at: iso(15),
      content: `A Casa ${house.name} governa${house.castle ? ` a partir de ${house.castle}` : ''} em ${house.region}.` +
        `${house.motto ? ` Seu lema, “${house.motto}”, é repetido nos salões e nas bandeiras.` : ''}\n\n` +
        'Texto de demonstração da prévia visual. Aqui aparece a crônica oficial da Casa assim que o conector do acervo for ligado.'},
    {...base, id: previewUuid(10, index * 10 + 2), kind: 'document', title: 'Tratado de passagem pelas estradas do rei', version: 1,
      created_at: iso(5), updated_at: iso(5),
      content: 'Pelo presente, a Coroa garante à Casa o direito de passagem pelas estradas reais durante as estações de comércio, mediante o pagamento das taxas habituais.\n\nDocumento de demonstração da prévia visual.'},
    {...base, id: previewUuid(10, index * 10 + 3), kind: 'image', title: 'Brasão e estandarte', version: 1,
      created_at: iso(3), updated_at: iso(3),
      content: imageToken(crest, `Brasão da Casa ${house.name}`) + '\n' + imageToken(map, `Mapa de ${house.region}`)},
    {...base, id: previewUuid(10, index * 10 + 4), kind: 'character', title: `Ficha de Personagem · ${house.lord ?? house.name}`, version: 2,
      created_at: iso(4), updated_at: iso(14), content: lordSheet(house)},
    {...base, id: previewUuid(10, index * 10 + 5), kind: 'character', title: 'Mestre de Armas · Corin Valemar', version: 1,
      created_at: iso(6), updated_at: iso(6),
      content: 'Veterano das campanhas contra os goblins, responde diretamente ao Lorde e treina a guarda da sede.\n' +
        imageToken('spy-portraits/guarda.jpg', 'Corin Valemar')},
    {...base, id: previewUuid(10, index * 10 + 6), kind: 'character', title: 'Meistre · Elandra Voss', version: 1,
      created_at: iso(6), updated_at: iso(6),
      content: 'Conselheira e guardiã dos registros da Casa. Mantém a correspondência com Suzail.\n' +
        imageToken('spy-portraits/escriba.jpg', 'Elandra Voss')},
    ...(house.portrait ? [{...base, id: previewUuid(10, index * 10 + 7), kind: 'character', title: `Retrato · ${house.lord ?? house.name}`, version: 1,
      created_at: iso(7), updated_at: iso(7), content: imageToken(house.portrait, house.lord ?? house.name)}] : []),
  ];
}

type Letter = Row & {id: string; recipient_house_id: string | null; origin_house_id: string | null; sender_user_id: string};
type Reply = Row & {id: string; letter_id: string; author_user_id: string; recipient_user_id: string; house_id: string | null};

function houseMail(house: PreviewHouse, index: number, others: PreviewHouse[]) {
  const narrator = PREVIEW_USERS.narrador;
  const me = {user: playerUserId(index), player: playerId(index), name: playerName(house)};
  const neighbour = others[(index + 1) % others.length]!;
  const neighbourIndex = PREVIEW_HOUSES.indexOf(neighbour);
  const common = {
    sync_state: 'synced', last_synced_at: iso(16), deleted_at: null, deleted_by: null, version: 1,
    batch_key: null, court_member_id: null, court_assignment: null, military_unit_id: null,
    house_sheet_version: null, historical_recipient_name: null, historical_source: null,
    administrative_actor: null, reply_to_id: null, updated_at: iso(16),
  };
  const fromNarrator: Letter = {
    ...common, id: previewUuid(20, index * 10 + 1), sender_user_id: narrator.id, sender_player_id: null,
    sender_name: 'Narrador', recipient_house_id: house.id, recipient_player_id: null, origin_house_id: null,
    subject: 'Convocação ao Conselho de Suzail', letter_number: 3, letter_kind: 'reservada',
    publication_state: 'delivered', creation_week: 3, delivery_week: 3, conversation_id: previewUuid(21, index * 10 + 1),
    created_at: iso(15), delivered_at: iso(15), campaign_date: '1522-01-15',
    content: `Ao Lorde da Casa ${house.name},\n\nA Coroa convoca as Casas de ${house.region} ao Conselho de Suzail na próxima désdia. ` +
      'Tragam relatórios das colheitas e das guarnições.\n\nTexto de demonstração da prévia visual.',
  };
  const toNarrator: Letter = {
    ...common, id: previewUuid(20, index * 10 + 2), sender_user_id: me.user, sender_player_id: me.player,
    sender_name: me.name, recipient_house_id: null, recipient_player_id: null, origin_house_id: house.id,
    subject: 'Relatório das colheitas de Hammer', letter_number: 2, letter_kind: 'reservada',
    publication_state: 'delivered', creation_week: 2, delivery_week: 2, conversation_id: previewUuid(21, index * 10 + 2),
    created_at: iso(9), delivered_at: iso(9), campaign_date: '1522-01-08',
    content: 'Ao Narrador,\n\nAs colheitas foram modestas, mas os celeiros resistem ao inverno. Pedimos orientação sobre o pedágio do rio.\n\nTexto de demonstração.',
  };
  const fromNeighbour: Letter = {
    ...common, id: previewUuid(20, index * 10 + 3), sender_user_id: playerUserId(neighbourIndex),
    sender_player_id: playerId(neighbourIndex), sender_name: playerName(neighbour),
    recipient_house_id: house.id, recipient_player_id: null, origin_house_id: neighbour.id,
    subject: `Proposta de aliança da Casa ${neighbour.name}`, letter_number: 3, letter_kind: 'reservada',
    publication_state: 'delivered', creation_week: 3, delivery_week: 3, conversation_id: previewUuid(21, index * 10 + 3),
    created_at: iso(16), delivered_at: iso(16), campaign_date: '1522-01-17',
    content: `Saudações da Casa ${neighbour.name}.\n\nPropomos um pacto de defesa mútua enquanto os goblins rondam as fronteiras.\n\nTexto de demonstração.`,
  };
  const replyCommon = {
    sync_state: 'synced', last_synced_at: iso(17), deleted_at: null, version: 1, reply_to_id: null,
    administrative_actor: null, updated_at: iso(17),
  };
  const replies: Reply[] = [
    {...replyCommon, id: previewUuid(22, index * 10 + 1), letter_id: fromNarrator.id, author_user_id: me.user,
      author_player_id: me.player, author_name: me.name, house_id: house.id, recipient_user_id: narrator.id,
      created_at: iso(16), delivered_at: iso(16), publication_state: 'delivered', delivery_week: 3, creation_week: 3,
      campaign_date: '1522-01-16', conversation_id: fromNarrator['conversation_id'], idempotency_key: previewUuid(23, index * 10 + 1),
      content: 'A Casa comparecerá ao Conselho com seus relatórios. Texto de demonstração.'},
    {...replyCommon, id: previewUuid(22, index * 10 + 2), letter_id: toNarrator.id, author_user_id: narrator.id,
      author_player_id: null, author_name: 'Narrador', house_id: house.id, recipient_user_id: me.user,
      created_at: iso(11), delivered_at: iso(11), publication_state: 'delivered', delivery_week: 2, creation_week: 2,
      campaign_date: '1522-01-10', conversation_id: toNarrator['conversation_id'], idempotency_key: previewUuid(23, index * 10 + 2),
      content: 'O pedágio permanece suspenso até o fim do inverno. Texto de demonstração.'},
  ];
  return {letters: [fromNarrator, toNarrator, fromNeighbour], replies};
}

function editionBlocks(headline: string, subtitle: string, body: string, image: string, quote: string): NewspaperBlock[] {
  const head = {...makeNewspaperBlock('headline'), text: headline, subtitle, span: 12};
  const article = {...makeNewspaperBlock('article'), text: body, span: 6, byline: 'Lisandra Quill, Correspondente da Corte', dropCap: true};
  const picture = {...makeNewspaperBlock('image'), imageSrc: image, caption: 'Gravura do acervo do Reino', span: 6};
  const quoteBlock = {...makeNewspaperBlock('quote'), text: quote, span: 12};
  const notice = {...makeNewspaperBlock('notice'), text: 'Anúncios\n\nVende-se cavalo de tração em Porto da Mordida. Tratar na estalagem do Javali.', icon: '📜', span: 6};
  const second = {...makeNewspaperBlock('article'), text: 'Mercado em alta\n\nOs preços do sal e da lã subiram nas feiras de Suzail após as primeiras nevascas.', span: 6};
  return [head, article, picture, quoteBlock, second, notice].map((block, i) => ({...block, id: `preview-block-${headline.length}-${i}`}));
}

function newspaperTables(userId: string, privileged: boolean, house: PreviewHouse) {
  const author = PREVIEW_USERS.editor.id;
  const edition = (no: number, state: string, title: string, blocks: NewspaperBlock[], date: string, day: number) => ({
    id: previewUuid(30, no), edition_no: no, campaign_date: date, title, subtitle: 'O jornal independente de Cormyr',
    template: 'classico', font_style: 'classico', state, blocks, pdf_path: null, version: 1, publication_revision: 1,
    created_by: author, updated_at: iso(day), published_at: state === 'published' ? iso(day) : null,
    archived_at: null, cancelled_at: null, publish_on: null,
  });
  const editions = [
    edition(1, 'published', 'A Folha Sem Selo', editionBlocks('O INVERNO CHEGA A CORMYR', 'Primeiras nevascas fecham as passagens do norte', 'Neve nas estradas\n\nAs primeiras nevascas de Hammer fecharam as passagens do norte. Mercadores aguardam em Arabel pela abertura das estradas.', '/newspaper/gravuras/castelo_cormyr.jpg', '“O reino resiste, como sempre resistiu.”'), '1522-01-03', 4),
    edition(2, 'published', 'A Folha Sem Selo', editionBlocks('O CONSELHO REAL SE REÚNE', 'Casas nobres são convocadas a Suzail', 'Convocação real\n\nA Coroa convocou as Casas da Dragon Coast e das Horselands para a próxima désdia. Fala-se em novos impostos.', '/newspaper/gravuras/conselho_real.jpg', '“Quem não comparecer, será lembrado.”'), '1522-01-10', 11),
    edition(3, 'published', 'A Folha Sem Selo', editionBlocks('FEIRA DE SUZAIL BATE RECORDE', 'Mercadores celebram o melhor inverno em uma década', 'Feira de inverno\n\nO mercado de Suzail recebeu caravanas de toda a Costa do Dragão, e as tavernas não deram conta dos visitantes.', '/newspaper/gravuras/mercado_suzail.jpg', '“Nunca vi tanta prata trocar de mãos.”'), '1522-01-17', 17),
    ...(privileged ? [edition(4, 'draft', 'A Folha Sem Selo', editionBlocks('RUMORES NAS FRONTEIRAS', 'Goblins avistados perto das Horselands', 'Rascunho\n\nRelatos de batedores indicam movimentação nas colinas. Matéria em apuração.', '/newspaper/gravuras/castelo_cormyr.jpg', '“Os tambores voltaram a soar.”'), '1522-01-20', 18)] : []),
  ];
  return {
    campaign_newspapers: editions,
    campaign_newspaper_reads: [1, 2].map(no => ({newspaper_id: previewUuid(30, no), user_id: userId, read_version: 1, read_at: iso(12)})),
    campaign_newspaper_commissions: [
      {id: previewUuid(31, 1), house_id: house.id, requested_by: playerUserId(PREVIEW_HOUSES.indexOf(house)),
        title: `A Casa ${house.name} anuncia torneio`, body: 'Cavaleiros de todo o reino são convidados para o torneio de primavera.',
        image_path: null, cost_wealth: 1, state: 'pending', request_key: previewUuid(32, 1), newspaper_id: null,
        created_at: iso(17), published_at: null, rejection_note: null, rejected_at: null, seen_at: null},
      {id: previewUuid(31, 2), house_id: house.id, requested_by: playerUserId(PREVIEW_HOUSES.indexOf(house)),
        title: 'Agradecimento aos mercadores de Suzail', body: 'A Casa agradece a hospitalidade dos mercadores durante a feira.',
        image_path: null, cost_wealth: 1, state: 'published', request_key: previewUuid(32, 2), newspaper_id: previewUuid(30, 3),
        created_at: iso(12), published_at: iso(17), rejection_note: null, rejected_at: null, seen_at: iso(17)},
    ],
    campaign_newspaper_staff: [
      {id: previewUuid(33, 1), name: 'Lisandra Quill', specialty: 'Correspondente da Corte', bio: 'Acompanha o Conselho Real e as intrigas de Suzail.', photo_path: 'cormyr/assets/portraits/alsevir.jpg', sort_order: 0, created_at: iso(1), updated_at: iso(1)},
      {id: previewUuid(33, 2), name: 'Bram Tolliver', specialty: 'Repórter de Mercados', bio: 'Percorre as feiras e os portos da Costa do Dragão.', photo_path: 'cormyr/assets/portraits/barelder.jpg', sort_order: 1, created_at: iso(1), updated_at: iso(1)},
      {id: previewUuid(33, 3), name: 'Meryl Ashdown', specialty: 'Ilustradora', bio: 'Responsável pelas gravuras de cada edição.', photo_path: null, sort_order: 2, created_at: iso(1), updated_at: iso(1)},
    ],
    campaign_newspaper_story_models: [],
    campaign_newspaper_engravings: NEWSPAPER_ENGRAVINGS.map((item, i) => ({
      id: previewUuid(34, i), name: item.label, image_path: null, public_src: item.src, in_collection: true, created_at: iso(1),
    })),
    campaign_newspaper_settings: [],
    campaign_newspaper_revisions: [],
  };
}

function spyFixtures(house: PreviewHouse, index: number) {
  const agentA = previewUuid(40, index * 10 + 1), agentB = previewUuid(40, index * 10 + 2);
  const target = PREVIEW_HOUSES.find(h => h.regionId !== house.regionId) ?? PREVIEW_HOUSES[4]!;
  const operationId = previewUuid(41, index * 10 + 1);
  const portraits = spyPortraitManifest.map(p => ({
    id: p.id, label: p.label, imageUrl: 'https://atlas.cormyr.com.br' + p.src,
    assignedAgentId: p.id === 'espiao-tillet' ? agentA : p.id === 'espiao-cortesa' ? agentB : null,
    occupied: p.id === 'espiao-tillet' || p.id === 'espiao-cortesa',
  }));
  const recruitment = [{sourceHoldingId: `${house.id}-rede-de-informantes`, name: 'Rede de informantes', capacity: 3, occupied: 2, vacancies: 1}];
  const agents = [
    {id: agentA, codename: 'Sombra das Cinzas', status: 'available', version: 2, currentRegion: house.regionId,
      missionSuccesses: 2, rank: 'Treinada', cunning: 4, toNextRank: 1, sourceHoldingId: recruitment[0]!.sourceHoldingId,
      portraitId: 'espiao-tillet', forgedDocuments: true, aceInTheHole: false},
    {id: agentB, codename: 'Véu de Seda', status: 'traveling', version: 3, currentRegion: house.regionId,
      missionSuccesses: 0, rank: 'Verde', cunning: 3, toNextRank: 2, sourceHoldingId: recruitment[0]!.sourceHoldingId,
      portraitId: 'espiao-cortesa', forgedDocuments: false, aceInTheHole: true},
  ];
  const timeline = {operationId, agentId: agentB, operationVersion: 1, departureKey: '1522-01-15', arrivalKey: '1522-01-25',
    investigationEndKey: '1522-02-05', originRegion: house.regionId, destinationRegion: target.regionId, travelDays: 10,
    targetHouseName: target.name, objective: 'army'};
  const management = {
    houseId: house.id, agents,
    operations: [{id: operationId, assetId: agentB, missionKind: 'house_intelligence', targetType: 'house', targetId: target.id,
      status: 'traveling', travelDays: 10, arrivalKey: '1522-01-25', departureKey: '1522-01-15', investigationEndKey: '1522-02-05',
      originRegion: house.regionId, destinationRegion: target.regionId, targetHouseName: target.name, objective: 'army', version: 1,
      createdAt: iso(15)}],
    history: [
      {id: previewUuid(42, index * 10 + 1), agentId: agentA, eventType: 'recruited', dateKey: '1521-11-04', targetName: null,
        targetRegion: null, detail: 'Recrutada na rede de informantes da Casa.', rank: 'Verde', cunning: 3, totalSuccesses: 0,
        failureDegrees: null, operationId: null},
      {id: previewUuid(42, index * 10 + 2), agentId: agentA, eventType: 'mission_success', dateKey: '1521-12-14', targetName: 'Grandragon',
        targetRegion: 'dragoncoast', detail: 'Levantou os recursos da Casa alvo sem ser detectada.', rank: 'Verde', cunning: 3, totalSuccesses: 1,
        failureDegrees: null, operationId: null},
      {id: previewUuid(42, index * 10 + 3), agentId: agentA, eventType: 'promoted', dateKey: '1522-01-05', targetName: null,
        targetRegion: null, detail: 'Promovida a Treinada.', rank: 'Treinada', cunning: 4, totalSuccesses: 2,
        failureDegrees: null, operationId: null},
      {id: previewUuid(42, index * 10 + 4), agentId: agentB, eventType: 'recruited', dateKey: '1522-01-02', targetName: null,
        targetRegion: null, detail: 'Recrutada com Ás na manga.', rank: 'Verde', cunning: 3, totalSuccesses: 0,
        failureDegrees: null, operationId: null},
    ],
    recruitment, houseVersion: 4, portraits,
  };
  const dossier = (admin: boolean) => ({
    id: previewUuid(43, index), ownerHouseId: house.id, targetHouseId: 'grandragon', ownerHouseName: house.name,
    targetHouseName: 'Grandragon', targetRegion: 'dragoncoast', updatedAt: iso(14),
    findings: [
      {id: previewUuid(44, index * 10 + 1), objective: 'house_resources', key: 'wealth', snapshot: {value: 38}, discoveredDate: '1521-12-14', verifiedDate: '1521-12-14'},
      {id: previewUuid(44, index * 10 + 2), objective: 'house_resources', key: 'power', snapshot: {value: 52}, discoveredDate: '1521-12-14', verifiedDate: '1522-01-06'},
      {id: previewUuid(44, index * 10 + 3), objective: 'house_resources', key: 'defense', snapshot: {value: 44}, discoveredDate: '1522-01-06', verifiedDate: '1522-01-06'},
      {id: previewUuid(44, index * 10 + 4), objective: 'army', key: 'unit-lanceiros', snapshot: {name: 'Lanceiros do Dragão', types: ['Infantaria'], strength: 4}, discoveredDate: '1522-01-06', verifiedDate: '1522-01-06'},
      {id: previewUuid(44, index * 10 + 5), objective: 'possessions', key: 'holding-porto', snapshot: {name: 'Porto fortificado', category: 'Fortificação'}, discoveredDate: '1522-01-06', verifiedDate: '1522-01-06'},
    ],
    history: [
      {id: previewUuid(45, index * 10 + 1), objective: 'house_resources', key: 'wealth', action: 'discovered', dateKey: '1521-12-14',
        oldSnapshot: null, newSnapshot: admin ? {value: 38} : {}},
    ],
    adminHistory: [],
  });
  return {agents, management, timeline, recruitment, portraits, target, dossier, operationId, agentB};
}

export type PreviewContext = {
  profile: VisualPreviewProfile;
  user: {id: string; email: string; name: string};
  house: PreviewHouse;
  houseIndex: number;
  records: Row[];
};

/** Monta as tabelas e RPCs vistas pelo perfil Firebase autenticado. */
export function buildVisualDb(profile: VisualPreviewProfile, memberHouseHints: readonly string[]): {db: VisualDb; context: PreviewContext} {
  const house = previewHouseFor(memberHouseHints);
  const houseIndex = PREVIEW_HOUSES.indexOf(house);
  const user = profile === 'narrador' ? PREVIEW_USERS.narrador : profile === 'editor' ? PREVIEW_USERS.editor
    : {id: playerUserId(houseIndex), email: `${house.id}@cormyr.com.br`, name: playerName(house)};
  const admin = profile === 'narrador';
  const visibleHouses = admin ? PREVIEW_HOUSES : profile === 'jogador' ? [house] : [];

  const houses = PREVIEW_HOUSES.map(h => ({
    id: h.id, name: h.name, region: h.region, castle: h.castle, crest: h.crest, lord_name: h.lord,
    active: true, season: 2, archive_house_id: h.id, folder_id: null, review_note: null, source: 'catalog',
    details: `Casa nobre de ${h.region}.${h.castle ? ` Sede: ${h.castle}.` : ''}${h.city ? ` Cidade: ${h.city}.` : ''}` +
      `${h.motto ? ` Lema: “${h.motto}”.` : ''}${h.colors ? ` Cores: ${h.colors}.` : ''}\n\n` +
      'Prévia visual: o texto oficial da Casa aparecerá aqui quando o conector do acervo for ligado.',
  }));
  const players = PREVIEW_HOUSES.map((h, i) => ({
    id: playerId(i), user_id: playerUserId(i), name: playerName(h), active: true, require_password_change: false,
    roster_house_id: h.id, roster_source: 'catalog', lord_name: h.lord, details: '', folder_id: null, created_at: iso(1),
  }));
  const members = PREVIEW_HOUSES.map((h, i) => ({
    house_id: h.id, player_id: playerId(i), can_edit: true, can_edit_attributes: false,
    authorized_at: iso(1), authorized_by: PREVIEW_USERS.narrador.id,
  }));
  const records = visibleHouses.flatMap(h => houseRecords(h, PREVIEW_HOUSES.indexOf(h), user.id));
  const mail = PREVIEW_HOUSES.map((h, i) => houseMail(h, i, PREVIEW_HOUSES));
  const allLetters = mail.flatMap(m => m.letters);
  const allReplies = mail.flatMap(m => m.replies);
  const canSeeLetter = (l: Letter) => admin || (profile === 'jogador' &&
    (l.recipient_house_id === house.id || l.origin_house_id === house.id || l.sender_user_id === user.id));
  const letters = allLetters.filter(canSeeLetter);
  const letterIds = new Set(letters.map(l => l.id));
  const replies = allReplies.filter(r => letterIds.has(r.letter_id));
  // Propostas de aliança ficam não lidas para exibir o contador de missivas.
  const receipts = letters.filter(l => !String(l['subject']).startsWith('Proposta de aliança'))
    .map(l => ({letter_id: l.id, user_id: user.id, read_at: iso(17)}));
  const rounds = [
    {number: 1, status: 'closed', closed: true, harptos_period: '1521-12:désdia-3', opened_at: iso(1), opened_by: PREVIEW_USERS.narrador.id, closed_at: iso(5), closed_by: PREVIEW_USERS.narrador.id, updated_at: iso(5)},
    {number: 2, status: 'closed', closed: true, harptos_period: '1522-01:désdia-1', opened_at: iso(6), opened_by: PREVIEW_USERS.narrador.id, closed_at: iso(12), closed_by: PREVIEW_USERS.narrador.id, updated_at: iso(12)},
    {number: CURRENT_ROUND, status: 'open', closed: false, harptos_period: '1522-01:désdia-2', opened_at: iso(13), opened_by: PREVIEW_USERS.narrador.id, closed_at: null, closed_by: null, updated_at: iso(13)},
  ];
  const ownPlayer = players.filter(p => p.user_id === user.id);

  const calendarSnapshot = {
    ...PREVIEW_CALENDAR, version: 12, auto_advance: false, published_week: CURRENT_ROUND, last_round: CURRENT_ROUND,
    published_at: iso(13), updated_at: iso(13),
  };
  const spies = new Map(PREVIEW_HOUSES.map((h, i) => [h.id, spyFixtures(h, i)] as const));
  const spyFor = (args: Record<string, unknown>) => {
    const id = String(args['p_house'] ?? house.id);
    const found = spies.get(id);
    if (!found || (!admin && id !== house.id)) throw new Error('Você não tem autorização para os espiões desta Casa.');
    return found;
  };
  let represented: number | null = null;

  const mailVisible = (args: Record<string, unknown>) => {
    const filters = (args['p_filters'] ?? {}) as Record<string, unknown>;
    if (filters['box'] === 'lixeira') return {list: [] as Letter[], filters};
    const group = Array.isArray(filters['group_house_ids']) ? new Set(filters['group_house_ids'].map(String)) : null;
    const list = allLetters.filter(canSeeLetter).filter(l => !group ||
      group.has(String(l.recipient_house_id ?? '')) || group.has(String(l.origin_house_id ?? '')));
    return {list, filters};
  };
  const mailPage = (args: Record<string, unknown>) => {
    const {list} = mailVisible(args);
    const page = Number(args['p_page'] ?? 0), size = Number(args['p_size'] ?? 20);
    const sorted = [...list].sort((a, b) => String(b['created_at']).localeCompare(String(a['created_at'])));
    const pageLetters = sorted.slice(page * size, page * size + size);
    const ids = new Set(pageLetters.map(l => l.id));
    return {
      total: list.length, letters: pageLetters, replies: allReplies.filter(r => ids.has(r.letter_id)),
      ...(admin ? {kpis: {delivered: list.length, awaiting_house: 4, awaiting_narrator: 6, scheduled_replies_next: 2, drafts: 1}} : {}),
    };
  };
  const ageDashboard = (args: Record<string, unknown>) => {
    const year = Number(args['p_year'] ?? PREVIEW_CALENDAR.year), target = Number(args['p_target_year'] ?? year);
    const characters = PREVIEW_HOUSES.filter(h => h.lord).map((h, i) => ({
      id: previewUuid(50, i), display_name: h.lord!, house_id: h.id, noble_roles: ['Lorde'], race: 'Humano', is_noble: true,
      visibility: 'house', alive_status: 'alive', review_status: 'reviewed', confidence: 'confirmed', birth_year: 1484, death_year: null,
      before_age: {status: 'ok', age: year - 1484, as_of_year: year, life: 'alive', reason: 'Nascimento registrado na ficha.', birth_year: 1484, death_year: null},
      after_age: {status: 'ok', age: target - 1484, as_of_year: target, life: 'alive', reason: 'Nascimento registrado na ficha.', birth_year: 1484, death_year: null},
    }));
    return {current_year: year, target_year: target, characters, truncated: false,
      totals: {total: characters.length, nobles: characters.length, alive: characters.length, deceased: 0, pending: 0,
        conflicts: 0, unknown: 0, not_born: 0, aged_nobles: year === target ? 0 : characters.length}};
  };
  const timePreview = (args: Record<string, unknown>) => {
    const mode = String(args['p_mode'] ?? 'advance');
    const count = Math.max(0, Number(args['p_count'] ?? 0));
    let to = TODAY;
    const requested = args['p_date'];
    if (mode === 'set' && typeof requested === 'string' && parseDate(requested)) to = requested;
    if (mode === 'advance') {
      const total = PREVIEW_CALENDAR.month * 30 + PREVIEW_CALENDAR.day - 1 + count * 10;
      to = dateKey({year: PREVIEW_CALENDAR.year + Math.floor(total / 360), month: Math.floor(total / 30) % 12, day: (total % 30) + 1, festival: null});
    }
    const target = parseDate(to)!;
    const monthDelta = (target.year * 12 + target.month) - (PREVIEW_CALENDAR.year * 12 + PREVIEW_CALENDAR.month);
    return {version: Number(args['p_version'] ?? calendarSnapshot.version), from: TODAY, to, mode,
      ordinary_days: count * 10, calendar_days: count * 10, month_delta: monthDelta, backdated: false, backdate_authorized: false,
      crossed_festivals: [], crossed_years: target.year !== PREVIEW_CALENDAR.year ? [target.year] : [],
      house_sheets_to_check: monthDelta > 0 ? PREVIEW_HOUSES.length : 0, published_week_unchanged: CURRENT_ROUND};
  };

  const rpc: Record<string, RpcHandler> = {
    is_campaign_admin: () => admin,
    current_campaign_profile: () => profile,
    in_campaign_house: args => admin || String(args['h'] ?? '') === house.id,
    get_campaign_calendar: () => calendarSnapshot,
    get_public_campaign_time: () => ({...PREVIEW_CALENDAR, version: calendarSnapshot.version}),
    calendar_mail_events: args => Number(args['p_year']) === PREVIEW_CALENDAR.year && Number(args['p_month']) === PREVIEW_CALENDAR.month
      ? letters.filter(l => l['campaign_date']).map(l => ({id: 'mail-' + l.id, date: String(l['campaign_date']), title: String(l['subject']), kind: 'mail'}))
      : [],
    get_campaign_schedule_events: args => Number(args['p_year']) === PREVIEW_CALENDAR.year && Number(args['p_month']) === PREVIEW_CALENDAR.month
      ? [{id: 'evento-conselho', date: '1522-01-21', title: 'Conselho de Suzail', kind: 'kingdom', description: 'As Casas convocadas se reúnem no Palácio Real.'},
        {id: 'evento-feira', date: '1522-01-17', title: 'Feira de inverno de Suzail', kind: 'kingdom', description: 'Mercadores de todo o reino.'}]
      : [],
    get_newspaper_calendar_events: args => Number(args['p_year']) === PREVIEW_CALENDAR.year && Number(args['p_month']) === PREVIEW_CALENDAR.month
      ? [{id: 'evento-conselho', date: '1522-01-21', title: 'Conselho de Suzail', kind: 'kingdom'}] : [],
    get_campaign_schedule_drafts: () => [
      {id: previewUuid(51, 1), date: '1522-01-21', title: 'Conselho de Suzail', description: 'As Casas convocadas se reúnem no Palácio Real.', deleted: false, version: 2, published: true},
      {id: previewUuid(51, 2), date: '1522-01-27', title: 'Caçada real', description: 'Rascunho: a Coroa convida os herdeiros.', deleted: false, version: 1, published: false},
    ],
    get_campaign_time_history: () => [
      {id: previewUuid(52, 1), from: '1522-01-08', to: '1522-01-18', mode: 'advance', reason: 'Avanço de uma désdia após a rodada 2.', created_at: iso(13)},
      {id: previewUuid(52, 2), from: '1521-12-28', to: '1522-01-08', mode: 'advance', reason: 'Virada do ano e abertura da rodada 2.', created_at: iso(6)},
    ],
    preview_campaign_time_change: timePreview,
    get_temporal_consumer_dashboard: () => ({
      consumers: [
        {code: 'house_projects', title: 'Obras das Casas', description: 'Conclusão de projetos ao virar o mês.', boundary: 'month', mode: 'projection', enabled: true, total: 3, pending: 0},
        {code: 'character_ages', title: 'Idades dos personagens', description: 'Revisão anual das idades.', boundary: 'year', mode: 'manual_review', enabled: true, total: 1, pending: 0},
      ],
      deliveries: [], pending_total: 0,
    }),
    get_temporal_release_preflight: () => ({
      official_date: TODAY, month_processing_preflight_ok: true, requires_production_backup: true, requires_homologation: true,
      automatic_economic_effects_enabled: false, calendar_version: calendarSnapshot.version,
      official_month: PREVIEW_CALENDAR.year * 12 + PREVIEW_CALENDAR.month, house_sheets: PREVIEW_HOUSES.length,
      active_houses: 6, draft_houses: 2, invalid_houses: 0, lagging_houses: 0, ahead_houses: 0,
      operations: 4, deliveries: 0, manual_reviews_pending: 0,
    }),
    get_character_age_dashboard: ageDashboard,
    get_character_year_transitions: () => [],
    get_house_character_ages: args => records.filter(r => r['house_id'] === args['p_house'] && String(r['title']).startsWith('Ficha de Personagem'))
      .map((r, i) => ({record_id: r['id'], character_id: previewUuid(53, i), age: PREVIEW_CALENDAR.year - 1484, as_of_year: PREVIEW_CALENDAR.year, status: 'ok', death_year: null})),
    get_campaign_chronology: args => ({year: Number(args['p_year']), month: Number(args['p_month']), events: [], rounds: [], unassigned_round_count: 0}),
    reply_delivery_week: () => CURRENT_ROUND,
    mail_page: mailPage,
    mail_trash_page: () => ({total: 0, letters: [], replies: []}),
    mail_insights: () => [],
    mail_insights_grouped: () => [],
    mail_overview_grouped: args => {
      const ids = new Set(Array.isArray(args['p_house_ids']) ? args['p_house_ids'].map(String) : []);
      const delivered = allLetters.filter(l => ids.has(String(l.recipient_house_id ?? '')) || ids.has(String(l.origin_house_id ?? ''))).length;
      return {total: delivered, scheduled: ids.size ? 2 : 0, drafts: ids.size ? 1 : 0, delivered};
    },
    mail_compose_options: () => ({
      players: players.map(p => ({id: p.id, name: p.name, houses: [String(p.roster_house_id)]})),
      houses: houses.map((h, i) => ({id: h.id, name: h.name, version: 4,
        court: [{id: previewUuid(54, i * 10 + 1), name: 'Corin Valemar', role: 'Mestre de Armas'}, {id: previewUuid(54, i * 10 + 2), name: 'Elandra Voss', role: 'Meistre'}],
        units: [{id: previewUuid(55, i), name: 'Guarda da Casa', available: true}]})),
    }),
    house_gallery_mail_images: () => [],
    publish_due_campaign_newspapers: () => 0,
    spy_house_management: args => spyFor(args).management,
    spy_house_mission_timeline: args => [spyFor(args).timeline],
    spy_recruitment_options: args => {const s = spyFor(args); return {houseId: s.management.houseId, recruitment: s.recruitment, portraits: s.portraits};},
    spy_get_regional_strategy: args => {
      const s = spyFor(args);
      return {houseId: s.management.houseId,
        agents: s.agents.map(a => ({id: a.id, codename: a.codename, status: a.status, currentRegion: a.currentRegion})),
        links: [
          {id: previewUuid(56, 1), fromRegion: 'dragoncoast', toRegion: 'crownlands', passage: 'land_neighbor', bidirectional: true, version: 1},
          {id: previewUuid(56, 2), fromRegion: 'crownlands', toRegion: 'horselands', passage: 'land_neighbor', bidirectional: true, version: 1},
          {id: previewUuid(56, 3), fromRegion: 'dragoncoast', toRegion: 'horselands', passage: 'sea_passage', bidirectional: true, version: 1},
        ]};
    },
    spy_public_noble_targets: () => [...PREVIEW_HOUSES.map(h => ({id: h.id, name: h.name, region: h.region})), ...NPC_TARGETS],
    spy_house_counterintelligence: () => ({totalDetections: 1, alerts: [{dateKey: '1522-01-09', result: 'escaped'}]}),
    spy_intelligence_read: args => {
      const id = args['p_house'];
      if (typeof id === 'string') return [spyFor(args).dossier(false)];
      if (!admin) throw new Error('Este acervo é exclusivo do Narrador.');
      return PREVIEW_HOUSES.slice(0, 4).map(h => spies.get(h.id)!.dossier(true));
    },
    spy_intelligence_admin_pending: () => [],
    spy_intelligence_admin_options: () => [],
    spy_narrator_operations_dashboard: () => {
      if (!admin) throw new Error('Este painel é exclusivo do Narrador.');
      return PREVIEW_HOUSES.slice(0, 5).map(h => {
        const s = spies.get(h.id)!;
        return {operationId: s.operationId, ownerHouseId: h.id, ownerHouseName: h.name, targetHouseId: s.target.id,
          targetHouseName: s.target.name, agentName: 'Véu de Seda', agentStatus: 'traveling', status: 'traveling', objective: 'army',
          departureKey: '1522-01-15', arrivalKey: '1522-01-25', investigationEndKey: '1522-02-05', outcome: null,
          intelligenceStatus: null, createdAt: iso(15)};
      });
    },
    spy_narrator_incident_history: () => [],
    // Leituras confirmadas pelo leitor: atualizadas só na memória da prévia.
    mark_campaign_newspaper_read: args => {
      const reads = tables['campaign_newspaper_reads'] ??= [];
      if (!reads.some(r => r['newspaper_id'] === args['p_newspaper'] && r['user_id'] === user.id))
        reads.push({newspaper_id: args['p_newspaper'], user_id: user.id, read_version: 1, read_at: new Date().toISOString()});
      return null;
    },
    mark_campaign_newspaper_unread: args => {
      tables['campaign_newspaper_reads'] = (tables['campaign_newspaper_reads'] ?? [])
        .filter(r => !(r['newspaper_id'] === args['p_newspaper'] && r['user_id'] === user.id));
      return null;
    },
    mark_letter_read: args => {
      const list = tables['letter_receipts'] ??= [];
      if (!list.some(r => r['letter_id'] === args['p_id'] && r['user_id'] === user.id))
        list.push({letter_id: args['p_id'], user_id: user.id, read_at: new Date().toISOString()});
      return null;
    },
    mark_newspaper_commissions_seen: args => {
      for (const row of tables['campaign_newspaper_commissions'] ?? [])
        if (row['house_id'] === args['p_house'] && row['state'] !== 'pending' && !row['seen_at']) row['seen_at'] = new Date().toISOString();
      return null;
    },
    start_campaign_representation: args => {
      const index = players.findIndex(p => p.id === args['p_player']);
      if (!admin || index < 0) throw new Error('Jogador indisponível para representação.');
      represented = index;
      return null;
    },
    stop_campaign_representation: () => { represented = null; return null; },
    campaign_representation_action: args => {
      if (args['p_action'] !== 'read' || represented === null) throw new Error('Prévia visual: esta ação ainda não está conectada ao Firebase.');
      const target = PREVIEW_HOUSES[represented]!;
      const own = mail[represented]!;
      return {
        player: {name: playerName(target), user_id: playerUserId(represented)},
        records: houseRecords(target, represented, PREVIEW_USERS.narrador.id),
        letters: own.letters, replies: own.replies, week: CURRENT_ROUND,
        houses: [{id: target.id, name: target.name, region: target.region, crest: target.crest, lord_name: target.lord, castle: target.castle}],
      };
    },
  };

  const tables: Record<string, Row[]> = {
    campaign_houses: houses,
    campaign_players: admin ? players : ownPlayer,
    house_memberships: admin ? members : members.filter(m => m.house_id === house.id && profile === 'jogador'),
    campaign_records: records,
    campaign_letters: letters,
    letter_replies: replies,
    letter_receipts: receipts,
    letter_rounds: rounds,
    house_catalog: PREVIEW_HOUSES.map(h => ({id: h.id, name: h.name, region: h.region, archive_data: {crest: h.crest, castle: h.castle, lord_name: h.lord}})),
    campaign_access_profiles: [{user_id: PREVIEW_USERS.editor.id, profile: 'editor'}],
    profiles: [PREVIEW_USERS.narrador, PREVIEW_USERS.editor, ...players.map(p => ({id: p.user_id, name: p.name}))]
      .map(p => ({id: p.id, display_name: p.name, created_at: iso(1)})),
    noble_house_sheets: [],
    noble_house_ledger: [],
    noble_house_drive_exports: [],
    noble_house_gm_notes: [],
    narrator_mail_notes: [],
    campaign_letter_consequences: [],
    letter_versions: [],
    letter_reply_versions: [],
    record_versions: [],
    spy_agent_upgrades: [],
    ...newspaperTables(user.id, profile !== 'jogador', house),
  };

  const assetUrl = (_bucket: string, path: string) => {
    const clean = path.replace(/^\/+/, '');
    return /^(cormyr|spy-portraits|newspaper|maps|house-flags)\//.test(clean) ? '/' + clean : '/cormyr/assets/cormyr.jpg';
  };
  return {db: {user, tables, rpc, assetUrl}, context: {profile, user, house, houseIndex, records}};
}
