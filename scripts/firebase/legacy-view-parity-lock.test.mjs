/**
 * Immutable UI baseline from the last complete (pre-Firebase) Cormyr views.
 *
 * The requested migration must reproduce original screens, filters, controls
 * and their effects. None of these source files is allowed to be silently
 * redesigned or dropped to "simplify" the Firebase migration.
 *
 * 2026-11-21 (histórico de imagens, PR #672): o Canvas da Redação
 * recebe apenas um endereço interno por índice de bloco publicado quando a
 * imagem veio do acervo histórico. Mantém todos os controles de edição,
 * recorte, filtro, impressão e layout inalterados; a mudança afeta somente
 * a origem da imagem no Firebase, com aviso se o arquivo não existir.
 * Revisão explícita da paridade antes de recapturar SHA-1.
 * The SHA-1 values are Git blob hashes captured on 2026-11-18 from main.
 * 2026-11-19: PR #598 moved the original council JSX verbatim from
 * routes/_authenticated/jogadores.tsx to components/players/players-workspace.tsx
 * (the route now only renders it) and changed exactly one import line
 * (useServerFn) in admin-panel.tsx and ficha-tab.tsx. Hashes re-captured after
 * that reviewed relocation; layout, controls and filters are unchanged.
 * 2026-11-19 (Missivas v4, PR do proprietário): additive-only change to
 * missivas-tab.tsx (Firebase-only "Marcar como não lida", author "Editar" and
 * "Cancelar envio" while the delivery week is open, Lixeira restore of own
 * cancellation) and players-workspace.tsx (Editor-Chefe read-only Missivas
 * view beside the Jornal). Every original control, filter and RPC name below
 * is retained; hashes re-captured after that reviewed change.
 * 2026-11-19 (área interna, PR seguinte): missivas-tab.tsx hides only the
 * historical-reply and manual round controls inside the Firebase workspace
 * (historical weeks are immutable; the HUB opens weeks) and lets authors
 * manage their own drafts/scheduled letters; players-workspace.tsx shows a
 * safe technical code when the access check fails. Re-captured after review.
 * 2026-11-19 (HUB Temporal): players-workspace.tsx adds, only inside the
 * Firebase workspace, a notice above the Narrator calendar pointing to the
 * Firebase HUB that opens weeks. Re-captured after review.
 * 2026-11-19 (Chancelaria v4): players-workspace.tsx wraps, only inside the
 * Firebase workspace, the player Missivas tab and the Narrator Missivas section
 * in MissivasArea, which opens the Chancelaria (protótipo v4) and keeps the
 * original MissivasTab/NarratorMissivasHub one click away ("Visão clássica").
 * Outside Firebase the originals render unchanged. Re-captured after review.
 * 2026-11-19 (login único): players-workspace.tsx shows the same opening
 * screen (CouncilOpening) while access and the archive load, offers "Sair" on
 * an access error and retries only transient access-check failures (denials
 * still lock at once). Re-captured after review.
 * 2026-11-19 (item 1, telas Firebase ocultas): adição exclusivamente
 * condicional ao workspace Firebase de um acesso a diagnóstico de contas
 * no menu do Narrador e de uma aba de economia Firebase na Ficha.
 * Nenhuma guia, filtro ou ação preexistente foi removida ou modificada.
 * A mudança reaproveita componentes e rotas Firebase já existentes.
 * 2026-11-19 (item 2, calendário): no Conselho Firebase a seção
 * Calendário usa FirebaseNarratorWeekDraft. Fora do Firebase a tela
 * NarratorCalendar original permanece intacta; nenhuma RPC legada
 * é montada na área do Narrador autenticada pelo Firebase.
 * 2026-11-19 (visão do Narrador v5, PR #618): players-workspace.tsx renderiza
 * a área do Narrador dentro de NarratorWorkspace (cabeçalho de uma linha, rail
 * de módulos e barra inferior no celular). Todas as seções, o seletor
 * "Acessar como jogador", Alterar senha, Sair, a Visão clássica das Missivas
 * e o conteúdo original do Conselho continuam presentes e com as mesmas RPCs;
 * a área dos jogadores não muda. Re-captured after review.
 * 2026-11-20 (ajustes pedidos pelo proprietário, com capturas de tela):
 * players-workspace.tsx move a Administração da ficha para "Contas" no menu do
 * Narrador (mesmo AdminPanel) e leva as Missivas do Editor-Chefe para um item
 * do menu da Redação; NewspaperHub/NewspaperEditorialDesk ganham esse item
 * (acima de Configurações) e as leituras do site aberto em Leitura e Alcance;
 * newspaper-editorial.css só ajusta a grade de estatísticas. Nenhum controle,
 * filtro ou RPC preexistente foi removido. Re-captured after review.
 * 2026-11-20 (funções ligadas): players-workspace.tsx só acrescenta, em Contas,
 * o painel de aprovações do runtime Firebase acima da revisão de contas.
 * Re-captured after review.
 * 2026-11-20 (correção da entrada Firebase, PR #667): carregamento da caixa
 * de Missivas separado do carregamento central do Conselho. Se o serviço de
 * correspondência falhar, a tela histórica mantém as abas, filtros e ações,
 * mas mostra aviso e nova tentativa somente no módulo afetado. Acrescenta
 * diagnóstico seguro à falha do carregamento geral. Nenhuma opção de jogo,
 * controle histórico ou filtro original foi removido; hash recapturado
 * após revisão explícita do diff.
 * 2026-11-21 (links abríveis em nova guia, pedido do proprietário): as abas
 * do jogador, o menu do Narrador, os tipos de ficha e as seções da Redação
 * passam de <button> para links reais (<a href>) com o estado no endereço
 * (src/lib/navigation/url-state.ts): mesmos rótulos, mesma ordem, mesmas
 * ações e mesmos estilos; o botão direito passa a oferecer "Abrir em nova
 * guia". newspaper-editorial.css só repete as regras do menu para <a>.
 * Nenhum controle, filtro ou RPC foi removido. Re-captured after review.
 * 2026-11-21 (Hub Temporal V2.1, pedido do proprietário): players-workspace.tsx
 * só acrescenta, no workspace Firebase e para jogadores, a bolinha de festival
 * na aba Calendário (some ao abrir a aba) e o aviso "Festival nesta semana"
 * acima do calendário. Nenhuma aba, filtro, controle ou RPC preexistente foi
 * removido ou alterado. Re-captured after review.
 * 2026-11-21 (playlist das Casas): players-workspace.tsx ganhou só o
 * HousePlaylistButton de cada Casa, após solicitação expressa do proprietário.
 * Nenhuma aba, filtro, acesso editorial ou tela do Narrador foi alterada.
 * 2026-11-21 (foto da Redação, PR #687): NewspaperHub.tsx só direciona
 * o envio de foto para o Firebase Storage autenticado; a interface e os
 * demais comandos editoriais permanecem os mesmos. O formulário e a API
 * tratam prévia, erro, gravação, vínculo e leitura pública do retrato.
 * 2026-11-21 (edição histórica nº 002): NewspaperHub.tsx mantém o
 * layout e todos os controles; apenas atualiza o cache local após um
 * salvamento operacional bem-sucedido e não repete para sempre erros
 * permanentes da gravação. A cópia editável permanece no Firebase; o
 * acervo histórico e os filtros continuam inalterados.
 * 2026-11-21 (pente fino Editor-Chefe): NewspaperHub não cria rascunho
 * vazio antes de inserir notícias contratadas e informa limitações do
 * upload Firebase sem gravar registros incompletos. A tela, menus, filtros,
 * conteúdo importado e fluxos dos demais perfis permanecem preservados.
 * A 21/11 audit CSS review verified: long engraving names and campaign dates
 * must wrap instead of being clipped; old responsive spacing, menus,
 * typography choices and controls were preserved. No hidden interactive
 * element was made newly accessible or removed.
 * 2026-11-21 (Firebase editorial media): NewspaperHub retains all sections,
 * controls and filters; only upload, commissioned illustration and engraving
 * handlers now use an approved Firebase media bridge. Empty image slots are
 * reused rather than blocking publication. Explicitly reviewed source
 * contract before updating this UI integrity hash.
 * 2026-11-21 (resiliência de uploads da Folha): a redação pré-valida
 * a imagem contratada ou gravura no registro autenticado do Firebase antes
 * de criar qualquer edição. Se a mídia falhar após a criação, o rascunho
 * que contém a matéria fica aberto e no cache para recuperação, sem descartar
 * os dados nem modificar o acervo importado. O upload rápido também mantém
 * o rascunho recuperável após erro. Nenhuma aba, filtro, permissão ou ação
 * editorial foi removida. SHA-1 recapturado após diff e testes de segurança.
 * A change must be reviewed explicitly against screenshots and parity tests;
 * the frontend originals are reference artifacts, not Firebase backends.
 */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const originals={
  'src/components/players/players-workspace.tsx':'4ca7440409de1560c3e4df94a3bfdc8d2606836d',
  'src/components/players/narrator-missives-hub.tsx':'0d0dd9d9d0a3c5e8df4da7285062551bcb845b9c',
  'src/components/players/missivas-tab.tsx':'c52a9ec0184a8721c44f5be73b5d2e2dc98b746e',
  'src/components/newspaper/NewspaperEditorialDesk.tsx':'f6f1cf4f106580ddb62e813a27c5a0f4bf9f2f10',
  'src/components/newspaper/NewspaperHub.tsx':'5b9a5772421c75ee6d576640994484759f951ef7',
  'src/components/newspaper/newspaper-editorial.css':'7983710e5e5a6cc5872cb9b6568fc0a81f4cdd43',
  'src/components/newspaper/NewspaperCanvas.tsx':'a67dc51dbef2dea8aa53101091c932adaadd1693',
  'src/components/players/admin-panel.tsx':'a9c1153d693176c0b0698773894dd123078f5a10',
  'src/components/players/ficha-tab.tsx':'baad9942071d55721d9e0fb33ffd3c0ea93663a0',
  'src/components/calendar/narrator-calendar.tsx':'d4d8a268f8af0f002dcffee0a610b9d712466c7b',
};
for(const [path,expected] of Object.entries(originals)){
  test('original view/filter must not change: '+path,()=>{
    const bytes=readFileSync(resolve(root,path));
    const actual=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
    assert.equal(actual,expected,'Original UI was altered; preserve all controls and filters.');
  });
}

test('Narrator historic navigation includes every original section',()=>{
  const code=readFileSync(resolve(root,'src/components/players/narrator-missives-hub.tsx'),'utf8');
  for(const key of [
    "['painel','Conselho das casas']",
    "['missivas','Missivas']",
    "['jornal','Jornal']",
    "['calendario','Hub Temporal']",
    "['dossies','Dossiês de Espionagem']",
    "['batalha','Módulo de batalha']",
    "['eventos','Eventos']",
    "['aventuras','Aventuras']",
  ])assert.ok(code.includes(key),'Original Narrator menu is missing '+key);
});
test('legacy newspaper desk still has all nine original editorial sections',()=>{
  const code=readFileSync(resolve(root,'src/components/newspaper/NewspaperEditorialDesk.tsx'),'utf8');
  for(const key of ["id:'painel'","id:'capa'","id:'materias'","id:'calendario'",
    "id:'redacao'","id:'anuncios'","id:'arquivo'","id:'alcance'","id:'configuracoes'"])
    assert.ok(code.includes(key),'Original editorial navigation is missing '+key);
  for(const feature of ['onUploadEngraving','onSaveStaff','onSaveStoryModel',
    'onDeleteEdition','onUpload','onRestoreRevision','onResizeBlock',
    'onInsertCommission','onSaveSettings']){
    // Commission callbacks are named onInsertCommission; every capability
    // must remain in the source even if the Cloud adapter needs migration.
    assert.ok(code.includes(feature),'Original editorial control missing: '+feature);
  }
});
test('legacy player and Mail filters remain reference contracts',()=>{
  const player=readFileSync(resolve(root,'src/components/players/players-workspace.tsx'),'utf8');
  for(const id of ["['casa','Casa']","['ficha','Ficha']","['galeria','Galeria']",
    "['calendario','Calendário']","['documentos','Documentos']",
    "['missivas','Missivas']","['jornal','Jornal']","['batalha','Batalha']"])
    assert.ok(player.includes(id),'Original player tab missing: '+id);
  const mail=readFileSync(resolve(root,'src/components/players/missivas-tab.tsx'),'utf8');
  for(const feature of ['mail_page','mail_trash_page','reply_delivery_week',
    'mail-overview','filtersVisible','group_house_ids','schedule_letter_draft',
    'mark_letter_read','restore_campaign_letter','set_letter_round'])
    assert.ok(mail.includes(feature),'Original mailbox filter/action missing: '+feature);
});
