import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root=resolve(import.meta.dirname,'../..');
test('Calendário do Narrador usa o HUB Firebase sem montar RPC legada',()=>{
 const src=readFileSync(resolve(root,'src/components/players/players-workspace.tsx'),'utf8');
 assert.match(src,/import \{FirebaseNarratorWeekDraft\} from '@\/components\/calendar\/FirebaseNarratorWeekDraft';/);
 assert.ok(src.includes("section==='calendario'?firebaseWorkspaceClient()!==null?<FirebaseNarratorWeekDraft/>:<NarratorCalendar/>"));
 assert.equal(src.includes('section===\'calendario\'?<>{firebaseWorkspaceClient()'),false);
});
test('HUB temporal mantém endpoint Firebase de avanço e autenticação própria',()=>{
 const src=readFileSync(resolve(root,'src/components/calendar/FirebaseNarratorWeekDraft.tsx'),'utf8');
 assert.ok(src.includes("'/api/firebase-narrator-week'"));
 assert.ok(src.includes("requestWeek<{openRound:number;publishedEvents?"));
 assert.ok(src.includes("('advance'"));
 assert.ok(src.includes("credentials:'omit'"));
});
