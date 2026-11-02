import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,it,expect} from 'vitest';

const source=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8');
describe('Limpeza da interface solicitada, sem remover relógio ou rotas',()=>{
 it('oculta conta e botões superiores redundantes, mantendo funções de conta e navegação',()=>{
  const council=source('src/routes/_authenticated/jogadores.tsx');
  const shell=source('src/components/campaign-shell.tsx');
  expect(council).not.toContain('{data.user.email}</p>');
  expect(council).not.toContain('Atualizar acervo público</Button>');
  expect(council).not.toContain('Atualizar</Button><ChangePasswordButton/>');
  expect(council).toContain('<ChangePasswordButton/>');
  expect(council).toContain('onClick={signout}>Sair');
  expect(council).toContain('Acessar como jogador…');
  expect(shell).not.toContain('t(\'nav.playerCouncil\')');
  expect(shell).toContain('t(\'nav.kingdomAndRegions\')');
  expect(shell).toContain('<LanguageSwitcher />');
 });
 it('oculta o rótulo do arquivo e a data duplicada, mantendo relógio atualizado e idioma',()=>{
  const html=source('public/cormyr/index.html');
  const time=source('public/cormyr/campaign-time.js');
  expect(html).not.toContain('<span>Arquivo da campanha</span>');
  expect(html).not.toContain('id="public-campaign-time-detail"');
  expect(html).toContain('id="public-campaign-current-time"');
  expect(html).toContain('id="public-language-switcher"');
  expect(time).toContain("current.textContent=data.period");
  expect(time).toContain("fetch('/api/public/time'");
  expect(time).not.toContain('public-campaign-time-detail');
  expect(html).toContain('id="random" class="solid" type="button">Evento Aleatório</button>');
 });
});
