/**
 * Lê tabelas canônicas do snapshot privado verificado, exclusivamente no
 * servidor. Não depende de backfill de outra cópia e não altera o acervo.
 */
import {archiveValues} from './workspace-import.mjs';

const HASH=/^[a-f0-9]{64}$/;
const TABLES={campaign_characters:5000,character_source_links:15000,
 character_year_transitions:3000};
export class CharacterSourceError extends Error{
 constructor(code){super(code);this.code=code;}
}
const fail=(code)=>{throw new CharacterSourceError(code);};
const validColumn=s=>typeof s==='string'&&/^[a-z][a-z_0-9]{0,95}$/.test(s);

export async function readVerifiedCharacterSource(db,snapshotId,table){
 const max=TABLES[table];
 if(!HASH.test(snapshotId)||max===undefined||
    typeof db?.collection!=='function')
  fail('character_source_invalid');
 const source=db.collection('migrationPrivateSnapshots').doc(snapshotId);
 const marker=await source.get();
 const root=marker.exists?marker.data():null;
 if(root?.status!=='complete'||root.private!==true)
  fail('character_source_not_ready');
 const found=await source.collection('tables')
  .where('sourceTable','==','public.'+table).limit(2).get();
 if(!Array.isArray(found.docs)||found.docs.length!==1)
  fail('character_source_table_missing');
 const meta=found.docs[0],record=meta.data();
 if(record?.sourceTable!=='public.'+table||
    !Array.isArray(record.columns)||record.columns.length===0||
    record.columns.length>160||!record.columns.every(validColumn)||
    new Set(record.columns).size!==record.columns.length||
    !Number.isSafeInteger(record.rowCount)||record.rowCount<0||
    record.rowCount>max)
  fail('character_source_table_invalid');
 const docs=await meta.ref.collection('rows').limit(max+1).get();
 if(!Array.isArray(docs.docs)||docs.docs.length!==record.rowCount)
  fail('character_source_count_mismatch');
 const output=await Promise.all(docs.docs.map(async doc=>{
  let values;
  try{values=await archiveValues(doc,record.columns);}
  catch{return fail('character_source_integrity_failed');}
  if(!Array.isArray(values)||values.length!==record.columns.length)
   fail('character_source_integrity_failed');
  return Object.fromEntries(record.columns.map((column,index)=>
   [column,values[index]]));
 }));
 return output;
}
