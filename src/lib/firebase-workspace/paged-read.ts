/**
 * Leitura integral e limitada de uma consulta do Firestore, em páginas.
 *
 * Antes, cada coleção operacional era lida com `limit(N+1)` e a operação
 * falhava ao passar de N (500 cartas, 500 lançamentos, 2.000 recibos...).
 * Com o uso normal da campanha esses tetos seriam alcançados no meio da
 * temporada. Aqui a coleção continua sendo lida POR INTEIRO (as checagens de
 * integridade de quem chama seguem vendo o conjunto completo, nunca uma fatia),
 * mas em páginas ordenadas pelo id do documento, com um teto de segurança bem
 * maior. Passar do teto continua sendo falha fechada: quem chama recebe
 * `overLimit:true` e lança o próprio erro, sem expor conjunto parcial.
 */
export const PAGED_READ_PAGE_SIZE=500;

export type PagedReadResult<D>={docs:D[];overLimit:boolean};

type QueryLike={
 limit:(n:number)=>any;
 orderBy?:(field:string)=>any;
};

export async function readAllPaged<D=any>(
 query:QueryLike,maxDocs:number,pageSize=PAGED_READ_PAGE_SIZE,
):Promise<PagedReadResult<D>>{
 if(!Number.isSafeInteger(maxDocs)||maxDocs<1||
    !Number.isSafeInteger(pageSize)||pageSize<1)
  throw new Error('invalid_paged_read');
 // Duplos de teste (e consultas sem ordenação) só oferecem limit().get():
 // uma leitura única até o teto preserva o mesmo contrato.
 if(typeof query.orderBy!=='function'){
  const snap=await query.limit(maxDocs+1).get();
  const docs=Array.isArray(snap?.docs)?snap.docs as D[]:null;
  if(!docs)return {docs:[],overLimit:true};
  return docs.length>maxDocs?{docs:[],overLimit:true}:{docs,overLimit:false};
 }
 const ordered=query.orderBy('__name__');
 const docs:D[]=[];
 let cursor:unknown;
 for(;;){
  const remaining=maxDocs+1-docs.length;
  const size=Math.min(pageSize,remaining);
  const page=cursor===undefined?ordered.limit(size):ordered.startAfter(cursor).limit(size);
  const snap=await page.get();
  if(!Array.isArray(snap?.docs))return {docs:[],overLimit:true};
  docs.push(...snap.docs as D[]);
  if(docs.length>maxDocs)return {docs:[],overLimit:true};
  if(snap.docs.length<size)return {docs,overLimit:false};
  cursor=snap.docs[snap.docs.length-1];
 }
}
