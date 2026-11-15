import test from 'node:test';
import assert from 'node:assert/strict';
import {probeDriveFolder} from './probe-google-drive-homologation.mjs';
test('homologation probe reads a bounded number and reports no file paths or data',async()=>{
 const ids=Array.from({length:30},(_,i)=>({id:'secret-file-'+i}));
 const read=[];
 const adapter={list:async()=>ids,read:async id=>{read.push(id);return {secret:'private'};}};
 const r=await probeDriveFolder(adapter,'folder-id',{maxFiles:2});
 assert.equal(r.listedJsonFiles,30);
 assert.equal(r.validatedEnvelopes,2);
 assert.equal(r.scanLimited,true);
 assert.equal(r.googleDriveWrites,0);
 assert.equal(r.readyForCutover,false);
 assert.equal(read.length,2);
 assert.equal(JSON.stringify(r).includes('secret'),false);
});
test('invalid probe scope or failed read is not reported as success',async()=>{
 await assert.rejects(probeDriveFolder({list:async()=>[]},'folder',{maxFiles:1000}));
 await assert.rejects(probeDriveFolder({list:async()=>[{id:'a'}],read:async()=>{throw Error('invalid');}},'folder'));
});
