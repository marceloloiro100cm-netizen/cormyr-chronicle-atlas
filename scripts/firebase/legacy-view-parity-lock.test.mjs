/**
 * Immutable UI baseline from the last complete (pre-Firebase) Cormyr views.
 *
 * The requested migration must reproduce original screens, filters, controls
 * and their effects. None of these source files is allowed to be silently
 * redesigned or dropped to "simplify" the Firebase migration.
 *
 * The SHA-1 values are Git blob hashes captured on 2026-11-18 from main.
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
  'src/routes/_authenticated/jogadores.tsx':'45396a2796805f54607a86eb157ecd294acc8b81',
  'src/components/players/narrator-missives-hub.tsx':'0d0dd9d9d0a3c5e8df4da7285062551bcb845b9c',
  'src/components/players/missivas-tab.tsx':'a42c089594ea61cc8cae72c5f9aadebc4b957899',
  'src/components/newspaper/NewspaperEditorialDesk.tsx':'55117d8e466edee9ccfaa46356999505cf5268d2',
  'src/components/newspaper/NewspaperHub.tsx':'d92bceeabd4da3db23f4545f037b135afda28846',
  'src/components/newspaper/newspaper-editorial.css':'c203f7f932be078925d9835eb4161fc0d3d49318',
  'src/components/newspaper/NewspaperCanvas.tsx':'bb4fabbaa87b8ff10006c3fab2f302c5c522d196',
  'src/components/players/admin-panel.tsx':'6956b754312d3952477a461102923fba35bd0fa9',
  'src/components/players/ficha-tab.tsx':'accc7b545050949341b9de5fcd46e6da17f6d941',
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
  const player=readFileSync(resolve(root,'src/routes/_authenticated/jogadores.tsx'),'utf8');
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
