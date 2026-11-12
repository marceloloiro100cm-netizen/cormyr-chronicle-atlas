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
  expect(canvas).toContain('/newspaper/brasao_reino.png');
  expect(canvas).not.toContain('leao_');
  expect(read('src/components/newspaper/NewspaperEditorialDesk.tsx')).toContain('/newspaper/brasao_folha.png');
 });
});
