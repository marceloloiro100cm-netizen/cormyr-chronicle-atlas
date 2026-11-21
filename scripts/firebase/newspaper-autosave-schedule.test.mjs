import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {test} from 'node:test';
import assert from 'node:assert/strict';

// This contract prevents accidental loss of an editor's official HUB
// publication date when the eight-second auto-save writes a draft.
const code=readFileSync(resolve(process.cwd(),'src/components/newspaper/NewspaperHub.tsx'),'utf8');

test('Jornal autosave never resets publish_on while editing a scheduled draft',()=>{
 const start=code.indexOf('void updateNewspaperEdition(draft,{');
 assert.ok(start>=0,'The editor draft autosave action must remain present');
 const end=code.indexOf('}).then(result=>',start);
 assert.ok(end>start,'The autosave success handler must remain present');
 const payload=code.slice(start,end);
 assert.match(payload,/state:'draft'/);
 assert.match(payload,/pdf_path:draft\.pdf_path/);
 assert.match(payload,/publish_on:draft\.publish_on\?\?null/);
 assert.ok(!/publish_on:\s*null\s*[,}]/.test(payload),'Autosave must not clear the schedule');
});
