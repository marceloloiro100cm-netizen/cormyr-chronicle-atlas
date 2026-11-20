export type Row=Record<string,any>;
export type QueryStep={op:string;args:any[]};
const bad=()=>{throw Error('Consulta não suportada pelo Firebase.');};
/** Filters are applied only AFTER server authorization has removed unreadable rows. */
export function queryRows(source:Row[],steps:QueryStep[]){
 if(!Array.isArray(steps)||steps.length>40)bad();
 let rows=[...source],mode='many',head=false,wantCount=false;
 const orders:{key:string;asc:boolean}[]=[];
 let start=0,end:number|undefined,limit:number|undefined;
 let columns:string[]|null=null;
 for(const step of steps){
  const [key,value]=step.args;
  switch(step.op){
   case 'select':{
    head=Boolean(value?.head);wantCount=Boolean(value?.count);
    if(key===undefined||key==='*'){columns=null;break;}
    if(typeof key!=='string')bad();
    const fields=key.split(',').map((field:string)=>field.trim());
    // Keep the established compatibility behaviour for relationship selectors.
    // Flat header queries can safely omit the large body fields.
    columns=fields.length&&fields.every((field:string)=>/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field))
     ?[...new Set(fields)] as string[]:null;break;
   }
   case 'eq':rows=rows.filter(r=>r[key]===value);break;
   case 'neq':rows=rows.filter(r=>r[key]!==null&&r[key]!==value);break;
   case 'is':rows=rows.filter(r=>(r[key]??null)===value);break;
   case 'in':if(!Array.isArray(value))bad();rows=rows.filter(r=>value.includes(r[key]));break;
   case 'gt':rows=rows.filter(r=>r[key]>value);break;
   case 'gte':rows=rows.filter(r=>r[key]>=value);break;
   case 'lt':rows=rows.filter(r=>r[key]<value);break;
   case 'lte':rows=rows.filter(r=>r[key]<=value);break;
   case 'match':rows=rows.filter(r=>Object.entries(key).every(([k,v])=>r[k]===v));break;
   case 'order':orders.push({key,asc:value?.ascending!==false});break;
   case 'range':if(!Number.isSafeInteger(key)||!Number.isSafeInteger(value)||key<0||value<key)bad();start=key;end=value+1;break;
   case 'limit':if(!Number.isSafeInteger(key)||key<0||key>10000)bad();limit=key;break;
   case 'single':mode='single';break;
   case 'maybeSingle':mode='maybe';break;
   case 'returns':case 'abortSignal':case 'throwOnError':break;
   default:bad();
  }
 }
 const count=rows.length;
 for(const {key,asc} of orders.reverse())rows.sort((a,b)=>a[key]===b[key]?0:((a[key]??'')<(b[key]??'')?-1:1)*(asc?1:-1));
 rows=rows.slice(start,end);if(limit!==undefined)rows=rows.slice(0,limit);
 if(mode!=='many'&&(rows.length>1||(mode==='single'&&rows.length!==1)))throw Error('Registro não encontrado ou ambíguo.');
 if(columns)rows=rows.map(row=>Object.fromEntries(columns!.map(key=>[key,row[key]??null])));
 return {data:head?null:mode==='many'?rows:rows[0]??null,error:null,count:wantCount?count:null};
}
