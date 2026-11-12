import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const read=(file:string)=>readFileSync(file,'utf8');
const sql=read('drizzle/migrations/0117_newspaper_commissions.sql');

describe('Notícias contratadas: banco',()=>{
 it('cobra exatamente 1 de Riqueza com livro-caixa, trava e idempotência',()=>{
  expect(sql).toContain('cost_wealth integer NOT NULL DEFAULT 1 CHECK (cost_wealth = 1)');
  expect(sql).toContain("'{permanent,wealth}',to_jsonb(v_old_perm-1)");
  expect(sql).toContain('INSERT INTO public.noble_house_ledger');
  expect(sql).toContain("pg_advisory_xact_lock(hashtextextended('noble:'||p_house,0))");
  expect(sql).toContain('request_key uuid NOT NULL UNIQUE');
  expect(sql).toContain('Sem recursos: exige 1 ponto de Riqueza disponível');
 });
 it('só a RPC escreve; Casas leem apenas os próprios pedidos',()=>{
  expect(sql).toContain('GRANT SELECT ON public.campaign_newspaper_commissions TO authenticated');
  expect(sql).not.toMatch(/GRANT (INSERT|UPDATE)[^;]*campaign_newspaper_commissions/);
  expect(sql).toContain('public.can_edit_campaign_newspaper() OR public.in_campaign_house(house_id,false)');
  expect(sql).toContain('in_campaign_house(p_house,true)');
 });
 it('publicar a edição retira os pedidos das pendências',()=>{
  expect(sql).toContain('settle_newspaper_commissions');
  expect(sql).toContain("SET state='published',newspaper_id=NEW.id");
  expect(sql).toContain("b ? 'commissionId'");
 });
});

describe('Recusa com reembolso e exclusão de rascunho',()=>{
 it('a recusa exige nota, só atua em pendentes e devolve 1 Riqueza com lançamento',()=>{
  expect(sql).toContain('newspaper_reject_commission');
  expect(sql).toContain('Escreva uma nota explicando a recusa');
  expect(sql).toContain("IF v_c.state<>'pending' THEN");
  expect(sql).toContain("+v_c.cost_wealth),false)");
  expect(sql).toContain("'newspaper_commission_refund'");
  expect(sql).toContain("CHECK (state IN ('pending','published','rejected'))");
 });
 it('só rascunhos podem ser excluídos',()=>{
  expect(sql).toContain('delete_campaign_newspaper_draft');
  expect(sql).toContain("IF v_state<>'draft' THEN");
  expect(sql).toContain('DELETE FROM public.campaign_newspaper_revisions WHERE newspaper_id=p_newspaper');
 });
});

describe('Notícias contratadas: interface',()=>{
 it('o login mostra A Folha Sem Selo sem o nome pessoal',()=>{
  expect(read('src/routes/auth.tsx')).toContain('<option value="editor">A Folha Sem Selo</option>');
 });
 it('o jogador contrata na aba Jornal e o Editor-Chefe recebe em Anúncios',()=>{
  expect(read('src/routes/_authenticated/jogadores.tsx')).toContain('houseId:current.id');
  const desk=read('src/components/newspaper/NewspaperEditorialDesk.tsx');
  expect(desk).toContain('CommissionInbox');
  expect(desk).toContain('Notícias contratadas pelas Casas');
  const hub=read('src/components/newspaper/NewspaperHub.tsx');
  expect(hub).toContain('<CommissionForm houseId={houseId}');
  expect(hub).toContain('copyCommissionImageToEdition');
 });
});

describe('Seis facilidades extras',()=>{
 it('o banco limita pedidos pendentes por Casa e registra o aviso de leitura',()=>{
  expect(sql).toContain("c.house_id=p_house AND c.state='pending')>=3");
  expect(sql).toContain('mark_newspaper_commissions_seen');
  expect(sql).toContain('ADD COLUMN IF NOT EXISTS seen_at');
 });
 it('cabeçalho, acervo, histórico e autosave estão ligados na interface',()=>{
  const canvas=read('src/components/newspaper/NewspaperCanvas.tsx');
  expect(canvas).toContain('Editar nome do jornal');
  expect(canvas).toContain('Editar lema do jornal');
  const hub=read('src/components/newspaper/NewspaperHub.tsx');
  expect(hub).toContain('salvo automaticamente');
  expect(hub).toContain('getNewspaperRevisions');
  expect(read('src/components/newspaper/NewspaperEditorialDesk.tsx')).toContain('Acervo de gravuras do Reino');
  expect(read('src/routes/_authenticated/jogadores.tsx')).toContain('useUnseenCommissionAnswers');
 });
});

describe('Brasões do jornal',()=>{
 it('o título usa o brasão do reino e a Redação usa o brasão do jornal',()=>{
  const canvas=read('src/components/newspaper/NewspaperCanvas.tsx');
  expect(canvas).toContain('/newspaper/brasao_reino.webp');
  expect(canvas).not.toContain('leao_');
  expect(read('src/components/newspaper/NewspaperEditorialDesk.tsx')).toContain('/newspaper/brasao_folha.webp');
 });
});

describe('Redação, calendário e folio',()=>{
 const sql2=read('drizzle/migrations/0118_newspaper_staff.sql');
 it('a Redação é restrita ao Editor-Chefe e ao Narrador',()=>{
  expect(sql2).toContain('USING (public.can_edit_campaign_newspaper())');
  expect(sql2).toContain("bucket_id='campaign-newspaper-staff' AND public.can_edit_campaign_newspaper()");
  expect(sql2).not.toMatch(/TO anon/);
 });
 it('o folio mostra só o número da edição e o calendário usa eventos públicos',()=>{
  expect(read('src/components/newspaper/NewspaperCanvas.tsx')).not.toContain('ANO II');
  const cal=read('src/components/newspaper/NewspaperCalendar.tsx');
  expect(cal).toContain('annualEvents');
  expect(cal).not.toContain('calendar_mail_events');
  const desk=read('src/components/newspaper/NewspaperEditorialDesk.tsx');
  expect(desk).toContain("label:'Escrever o Jornal'");
  expect(desk).toContain("label:'Redação'");
  expect(desk).toContain("label:'Calendário'");
 });
});

describe('Modelos, lixeira e número da edição',()=>{
 const sql3=read('drizzle/migrations/0119_newspaper_models_and_delete.sql');
 it('o número da edição apagada volta a ficar livre',()=>{
  expect(sql3).toContain('assign_newspaper_edition_no');
  expect(sql3).toContain('NOT EXISTS (SELECT 1 FROM public.campaign_newspapers n WHERE n.edition_no=g)');
 });
 it('só o Editor-Chefe e o Narrador excluem edições e gerenciam modelos',()=>{
  expect(sql3).toContain("IF auth.uid() IS NULL OR NOT public.can_edit_campaign_newspaper()");
  expect(sql3).toContain('DELETE FROM public.campaign_newspaper_reads WHERE newspaper_id=p_newspaper');
  expect(sql3).toContain('USING (public.can_edit_campaign_newspaper())');
  expect(sql3).not.toMatch(/TO anon/);
 });
 it('a interface usa lixeira, selo em botões e a nova legenda de Matérias',()=>{
  const desk=read('src/components/newspaper/NewspaperEditorialDesk.tsx');
  expect(desk).toContain('Escolha o modelo que você quer utilizar.');
  expect(desk).toContain('folha-archive-trash');
  expect(desk).toContain('folha-icon-picker');
  expect(desk).not.toContain('Selecione uma reportagem para editar no jornal');
 });
});

describe('Gravuras do Reino e calendário do Editor-Chefe',()=>{
 const sql4=read('drizzle/migrations/0120_newspaper_engravings_calendar.sql');
 it('gravuras e calendário só para o Editor-Chefe e o Narrador',()=>{
  expect(sql4).toContain('campaign_newspaper_engravings');
  expect(sql4).toContain('USING (public.can_edit_campaign_newspaper())');
  expect(sql4).toContain('get_newspaper_calendar_events');
  expect(sql4).toContain('published_date IS NOT NULL');
  expect(sql4).not.toMatch(/TO anon/);
 });
 it('a tela usa o banner, só Jornal e o emblema dourado',()=>{
  const desk=read('src/components/newspaper/NewspaperEditorialDesk.tsx');
  const css=read('src/components/newspaper/newspaper-editorial.css');
  expect(desk).not.toContain('SEGUNDA TEMPORADA');
  expect(desk).toContain('emblema_integrado.webp');
  expect(css).toContain('cab_centro.webp');
  expect(desk).toContain('folha-font-');
 });
});

describe('Pente fino: data do HUB, configurações sem edição e cabeçalho contínuo',()=>{
 const sql5=read('drizzle/migrations/0121_newspaper_settings.sql');
 const hub=read('src/components/newspaper/NewspaperHub.tsx');
 const css=read('src/components/newspaper/newspaper-editorial.css');
 it('o Editor-Chefe lê a data pela projeção pública e nunca fica travado esperando o HUB',()=>{
  expect(read('src/lib/newspaper/data.ts')).toContain("db.rpc('get_public_campaign_time')");
  expect(hub).toContain('useCampaignTime(!editorial)');
  expect(hub).not.toContain('Aguarde a data oficial do HUB Temporal');
 });
 it('as configurações têm tabela própria, só para quem edita o jornal',()=>{
  expect(sql5).toContain('campaign_newspaper_settings');
  expect(sql5).toContain('USING (public.can_edit_campaign_newspaper())');
  expect(sql5).not.toMatch(/TO anon/);
 });
 it('o cabeçalho é uma faixa contínua, sem imagem esticada',()=>{
  expect(css).toContain('cab_fundo.png');
  expect(css).toContain('cab_centro.webp');
  expect(css).not.toContain('cabecalho_folha.webp');
  expect(css).not.toContain('100% 100%');
 });
 it('a folha mostra a data uma vez e a imagem inteira na altura automática',()=>{
  const canvas=read('src/components/newspaper/NewspaperCanvas.tsx');
  expect(canvas).toContain('newspaper-img-auto');
  expect(canvas).toContain('!compactMasthead&&<div className="newspaper-meta"');
  expect(hub).toContain('<NewspaperCanvas compactMasthead edition={displayEdition}');
 });
});

describe('Melhorias do Jornal: acervo editável, agendamento, atalhos e recursos',()=>{
 const m=read('drizzle/migrations/0122_newspaper_acervo_and_schedule.sql');
 const desk=read('src/components/newspaper/NewspaperEditorialDesk.tsx');
 const data=read('src/lib/newspaper/data.ts');
 const editing=read('src/lib/newspaper/editing.ts');
 it('a migration roda numa transação e não abre nada para visitantes',()=>{
  expect(m.trim().startsWith('--')).toBe(true);
  expect(m).toMatch(/^BEGIN;/m);expect(m).toMatch(/^COMMIT;/m);
  expect(m).not.toMatch(/TO anon/);
 });
 it('as gravuras originais viram linhas do acervo, com origem exclusiva e caminho restrito',()=>{
  expect(m).toContain('ALTER COLUMN image_path DROP NOT NULL');
  expect(m).toContain('CHECK ((image_path IS NOT NULL) <> (public_src IS NOT NULL))');
  expect(m).toContain("'^/newspaper/gravuras/[A-Za-z0-9_.-]+$'");
  for(const f of ['castelo_cormyr.jpg','conselho_real.jpg','mercado_suzail.jpg'])expect(m).toContain('/newspaper/gravuras/'+f);
  expect(m).toContain('ON CONFLICT DO NOTHING');
 });
 it('a folha deixou de listar gravuras fixas: só o acervo do banco aparece',()=>{
  expect(desk).not.toContain('NEWSPAPER_ENGRAVINGS.map');
  expect(data).toContain('restoreOriginalEngravings');
  expect(read('src/lib/newspaper/model.ts')).toContain('NEWSPAPER_ENGRAVINGS');
 });
 it('a publicação agendada é decidida pelo relógio do HUB, nunca pelo chamador',()=>{
  expect(m).toContain('publish_due_campaign_newspapers');
  expect(m).toContain('SECURITY DEFINER');
  expect(m).toContain('FROM public.campaign_calendar');
  expect(m).toContain("WHERE state = 'draft' AND publish_on IS NOT NULL");
  expect(m).toContain('REVOKE ALL ON FUNCTION public.publish_due_campaign_newspapers() FROM PUBLIC, anon');
  expect(data).toContain("db.rpc('publish_due_campaign_newspapers')");
  expect(editing).toContain('date.year*100000+date.month*1000+inMonth');
  expect(m).toContain('substr(p,1,4)::bigint*100000 + (substr(p,6,2)::int-1)*1000 + substr(p,9,2)::int*2');
 });
 it('atalhos de Ctrl+Z, Y, C, X, V e D valem para blocos e deixam o texto com o navegador',()=>{
  const hook=read('src/components/newspaper/useNewspaperShortcuts.ts');
  for(const e of ["'copy'","'cut'","'paste'","'keydown'"])expect(hook).toContain(e);
  expect(hook).toContain('isTextTarget(event.target)');
  expect(desk).toContain('useNewspaperShortcuts');
 });
 it('os brasões são WebP, as fontes do título são do próprio site e não há PNG sobrando',()=>{
  expect(desk).toContain('/newspaper/brasao_folha.webp');
  const css=read('src/components/newspaper/newspaper.css');
  expect(css).toContain('/newspaper/fonts/UnifrakturMaguntia-Book.woff');
  expect(css).toContain('/newspaper/fonts/Cinzel-Variable.woff');
  expect(css.split('\n')[0]).not.toContain('UnifrakturMaguntia');
 });
});

describe('Relatório de revisão: o que foi aceito e o que ficou de fora',()=>{
 const canvas=read('src/components/newspaper/NewspaperCanvas.tsx');
 const css=read('src/components/newspaper/newspaper.css');
 const hub=read('src/components/newspaper/NewspaperHub.tsx');
 it('bloco fixo é um botão visível, não um menu de botão direito (que quebra a correção ortográfica e o toque)',()=>{
  expect(canvas).toContain('newspaper-lock-button');
  expect(canvas).not.toContain('onContextMenu');
  expect(hub).toContain('movePreservingPinned');
  expect(hub).toContain('reorderPreservingPinned');
  expect(hub).toContain('Bloco fixo: destrave o cadeado antes de remover.');
 });
 it('o refluxo vale só para o arraste; presets e controle numérico continuam livres',()=>{
  expect(hub).toContain('resizeWithReflow(source,id,patch)');
  expect(canvas).toContain('base:edition.blocks');
 });
 it('as colunas da fileira têm a mesma altura e a letra capitular usa a fonte hospedada',()=>{
  expect(css).toMatch(/\.newspaper-grid\{[^}]*align-items:stretch/);
  expect(css).toContain('.newspaper-dropcap::first-letter');
 });
 it('a exportação da folha segue pelo recurso de impressão do navegador, sem biblioteca nova de captura',()=>{
  const pkg=read('package.json');
  for(const lib of ['pdfme','html2canvas','html2pdf'])expect(pkg).not.toContain(lib);
  expect(read('src/components/newspaper/NewspaperEditorialDesk.tsx')).toContain('window.print()');
 });
 it('a auditoria não grava nada: só compara o pedido (imutável) com a folha',()=>{
  const audit=read('src/lib/newspaper/audit.ts');
  expect(audit).not.toMatch(/supabase|\.rpc\(|\.from\(/);
 });
});
