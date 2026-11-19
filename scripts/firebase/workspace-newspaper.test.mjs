import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectNewspaperSource,projectWorkspaceNewspapers,
  canInspectWorkspaceRevisions,WorkspaceNewspaperError}
from './workspace-newspaper.mjs';
const ed=(id,no,state,version)=>({
 id,edition_no:no,state,version,publication_revision:1,
 title:'A Folha Sem Selo',subtitle:'Crônica',blocks:[{text:'Editorial'}],
});
const a=ed('e1',1,'published',3),b=ed('e2',2,'draft',2);
const rev=(id,edition,prev)=>({
 id,newspaper_id:edition,previous_version:prev,snapshot:{title:'Antigo'},
});
test('original newspaper is scoped: only editor and narrator can see drafts and audits',()=>{
 const rows=[a,b],revisions=[rev(1,'e1',1),rev(2,'e1',2),rev(3,'e2',1)];
 const player=projectWorkspaceNewspapers(rows,revisions,{uid:'p1',profile:'jogador'});
 assert.equal(player.total,1);
 assert.equal(player.items[0].id,'e1');
 assert.equal(player.revisionsAudited,undefined);
 assert.ok(!JSON.stringify(player).includes('e2'));
 const editor=projectWorkspaceNewspapers(rows,revisions,{uid:'editor',profile:'editor'});
 assert.equal(editor.total,2);
 assert.equal(editor.revisionsAudited,3);
 assert.equal(editor.items[0].revisions,1);
 assert.equal(canInspectWorkspaceRevisions({profile:'editor'}),true);
 assert.equal(canInspectWorkspaceRevisions({profile:'jogador'}),false);
});
test('audit classifies extraneous revisions without deleting either edition',()=>{
 const s=inspectNewspaperSource([a],[rev(1,'e1',1),rev(2,'e1',1),rev(3,'e1',4)]);
 assert.equal(s.get('e1').revisions,3);
 assert.equal(s.get('e1').duplicateVersions,1);
 assert.equal(s.get('e1').versionsOutOfRange,1);
 assert.equal(s.get('e1').missingVersionSlots,1);
 assert.throws(()=>inspectNewspaperSource([a],[rev(9,'missing',2)]),
  WorkspaceNewspaperError);
});
test('unknown states, non-array blocks and duplicate edition IDs fail closed',()=>{
 assert.throws(()=>inspectNewspaperSource([a,{...a}],[]),WorkspaceNewspaperError);
 assert.throws(()=>inspectNewspaperSource([{...a,blocks:{}}],[]),WorkspaceNewspaperError);
 assert.throws(()=>inspectNewspaperSource([{...a,state:'secret'}],[]),WorkspaceNewspaperError);
});
