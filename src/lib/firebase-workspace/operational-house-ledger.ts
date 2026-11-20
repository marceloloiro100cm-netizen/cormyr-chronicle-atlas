/** Livro-razão por Casa sem alterar as entradas importadas. */
const ID=/^[^/\u0000-\u001f\u007f]{1,128}$/;
export class OperationalLedgerError extends Error{
 constructor(readonly code:string){super(code);}
}
export type HouseLedgerRow={id:string;house_id:string;action:string;
 explanation:string;rule:string;created_at:string;actor:string;
 version:number;campaign_month:number};
export function mergeHouseLedger(
 archived:Record<string,unknown>[],
 operational:HouseLedgerRow[],houseId:string,
):Record<string,unknown>[]{
 if(typeof houseId!=='string'||!ID.test(houseId))
  throw new OperationalLedgerError('invalid_house');
 const result=[...archived.filter(r=>r['house_id']===houseId)];
 const seen=new Set(result.map(r=>String(r['id'])));
 for(const row of operational){
  if(!row||row.house_id!==houseId||!ID.test(row.id)||
    !Number.isSafeInteger(row.version)||row.version<1||
    seen.has(row.id)||
    typeof row.action!=='string'||typeof row.created_at!=='string'||
    !Number.isFinite(Date.parse(row.created_at)))
   throw new OperationalLedgerError('invalid_house_ledger');
  seen.add(row.id);result.push({...row});
 }
 return result.sort((a,b)=>String(b['created_at']).localeCompare(
  String(a['created_at']))).slice(0,100);
}
export async function readOperationalHouseLedger(
 db:any,snapshotId:string,houseId?:string,
):Promise<HouseLedgerRow[]>{
 if(!/^[a-f0-9]{64}$/.test(snapshotId)||(houseId!==undefined&&!ID.test(houseId)))
  throw new OperationalLedgerError('invalid_house');
 const root=db.collection('campaignCloudRuntime').doc(snapshotId);
 const live=await root.get();
 if(!live.exists||live.data()?.status!=='active'||live.data()?.private!==true||
   live.data()?.sourceSnapshotReconciled!==true||
   live.data()?.sourceSnapshotId!==snapshotId||
   live.data()?.applicationEnabled!==true||
   live.data()?.houseOpsWriteApproved!==true)
   throw new OperationalLedgerError('house_ops_unavailable');
 const snap=await root.collection('houseOperationLedger').limit(501).get();
 if(!Array.isArray(snap.docs)||snap.docs.length>500)
   throw new OperationalLedgerError('house_ledger_over_limit');
 const selected:HouseLedgerRow[]=[];
 for(const doc of snap.docs){
  const d=doc.data();
  if(!d||!ID.test(d.id)||d.id!==doc.id||
     !ID.test(d.actorUid)||typeof d.houseId!=='string'||
     !ID.test(d.houseId)||typeof d.action!=='string'||
     !Number.isSafeInteger(d.version)||d.version<1||
     typeof d.created_at!=='string'||
     !Number.isFinite(Date.parse(d.created_at)))
   throw new OperationalLedgerError('invalid_ledger_document');
  if(houseId===undefined||d.houseId===houseId)selected.push({
   id:d.id,house_id:d.houseId,action:d.action,
   explanation:d.explanation,rule:d.rule,created_at:d.created_at,
   actor:d.actorUid,version:d.version,campaign_month:d.campaignMonth,
  });
 }
 return selected;
}
