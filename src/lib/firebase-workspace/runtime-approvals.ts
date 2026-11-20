/* eslint-disable @typescript-eslint/no-explicit-any -- limite do Firebase Admin. */
import {createHash} from 'node:crypto';

/**
 * Aprovações do runtime Firebase (campaignCloudRuntime/{snapshot}), ligadas
 * pelo Narrador em Contas (20/11/2026). As chaves do apphosting.yaml só
 * abrem as rotas; cada serviço ainda exige a aprovação abaixo antes de gravar.
 * Só estes campos booleanos podem ser alterados, sempre com auditoria.
 */
export const RUNTIME_APPROVALS=[
 ['houseOpsWriteApproved','Operações da Casa (compras, unidades, vassalos, Sorte, imagens)'],
 ['houseRulesWriteApproved','Edição de regras e catálogo pelo Narrador'],
 ['recordsReadApproved','Registros operacionais: leitura'],
 ['recordsWriteApproved','Registros operacionais: gravação (textos, personagens, documentos, NPCs)'],
 ['spyReadApproved','Espionagem operacional: leitura'],
 ['spyWriteApproved','Espionagem operacional: ações dos espiões e missões'],
 ['representationReadApproved','Acessar como jogador: leitura'],
 ['representationWriteApproved','Acessar como jogador: ações'],
 ['newspaperWriteApproved','Jornal: gravação e publicação de edições'],
 ['newspaperCommissionsReadApproved','Notícias contratadas: leitura'],
 ['newspaperCommissionsWriteApproved','Notícias contratadas: pedidos e recusas'],
 ['privateMediaReadApproved','Arquivos privados: leitura de imagens'],
 ['privateMediaWriteApproved','Arquivos privados: envio de imagens'],
 ['constructionReadApproved','Obras: leitura'],
 ['constructionWriteApproved','Obras: compras e andamento'],
 ['mailWriteApproved','Missivas: envio e respostas'],
] as const;
export type RuntimeApprovalKey=typeof RUNTIME_APPROVALS[number][0];
const KEYS=new Set<string>(RUNTIME_APPROVALS.map(([k])=>k));

export class RuntimeApprovalError extends Error{
 constructor(readonly code:string,readonly status:number){super(code);}
}

export async function readRuntimeApprovals(db:any,snapshotId:string){
 const doc=await db.collection('campaignCloudRuntime').doc(snapshotId).get();
 const v=doc.exists?doc.data():{};
 return {
  runtimeActive:v?.status==='active'&&v?.applicationEnabled===true,
  items:RUNTIME_APPROVALS.map(([key,label])=>({key,label,approved:v?.[key]===true})),
 };
}

export async function setRuntimeApprovals(db:any,snapshotId:string,actorUid:string,changes:unknown){
 if(!changes||typeof changes!=='object'||Array.isArray(changes))
  throw new RuntimeApprovalError('invalid_approval',400);
 const entries=Object.entries(changes as Record<string,unknown>);
 if(entries.length<1||entries.length>KEYS.size||
    entries.some(([k,v])=>!KEYS.has(k)||typeof v!=='boolean'))
  throw new RuntimeApprovalError('invalid_approval',400);
 const root=db.collection('campaignCloudRuntime').doc(snapshotId);
 const now=new Date().toISOString();
 await db.runTransaction(async(tx:any)=>{
  const doc=await tx.get(root);
  if(!doc.exists)throw new RuntimeApprovalError('runtime_not_found',409);
  const before=Object.fromEntries(entries.map(([k])=>[k,doc.data()?.[k]===true]));
  tx.update(root,Object.fromEntries(entries));
  tx.create(root.collection('runtimeApprovalAudits').doc(
   createHash('sha256').update(actorUid+':'+now+':'+JSON.stringify(entries)).digest('hex')),
   {actorUid,occurredAt:now,before,after:Object.fromEntries(entries)});
 });
 return readRuntimeApprovals(db,snapshotId);
}
