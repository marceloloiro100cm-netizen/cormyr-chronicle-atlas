import { RESOURCE_KEYS, type Resources, zeroResources } from './types';
export type ImportCell = { address: string; value: unknown; formula?: string };
export type ImportSheet = { name: string; rows: ImportCell[][] };
export type ImportPreview = { source: string; house: string|null; resources: Resources|null; units: Record<string,unknown>[]; issues: string[]; events: string[]; original: ImportSheet[] };
const norm=(v:unknown)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const RESOURCE_ALIASES=[['defesa'],['influencia'],['terras','lan'],['lei'],['populacao'],['poder'],['riqueza','riquiza']];
export function previewWorkbook(sheets:ImportSheet[],source:string):ImportPreview {
  const issues:string[]=[],units:Record<string,unknown>[]=[],events:string[]=[];let house:string|null=null,resources:Resources|null=null;
  for(const sheet of sheets) {
    for(const row of sheet.rows)for(const cell of row)if(typeof cell.value==='string'&&/^#(?:REF!|DIV\/0!|VALUE!|N\/A|NAME\?)/.test(cell.value))issues.push(`${sheet.name}!${cell.address}: ${cell.value} — conciliar lançamentos válidos; não ocultar o erro.`);
    const identity=sheet.rows.find(row=>row.some(c=>norm(c.value)==='nome')&&row.some(c=>['regiao','susserano','suserano'].includes(norm(c.value))));
    if(identity){const i=identity.findIndex(c=>norm(c.value)==='nome');const value=identity[i+1]?.value;if(value)house=String(value);}
    const header=sheet.rows.findIndex(row=>RESOURCE_ALIASES.every(aliases=>row.some(c=>aliases.includes(norm(c.value)))));
    if(header>=0) {
      const row=sheet.rows[header]??[],cols=RESOURCE_ALIASES.map(aliases=>row.findIndex(c=>aliases.includes(norm(c.value))));
      const candidates=sheet.rows.slice(header+1).filter(row=>['total','modificador'].includes(norm(row[0]?.value)));
      const values=candidates.find(row=>norm(row[0]?.value)==='total')??candidates[0];
      if(values){resources=zeroResources();RESOURCE_KEYS.forEach((r,i)=>{const v=values[cols[i]??-1]?.value;if(typeof v==='number') {if(resources)resources[r]=v;}else issues.push(`${sheet.name}: ${r} vazio ou não numérico; vazio não equivale a zero.`);});}
    }
    const unitHeader=sheet.rows.findIndex(row=>row.some(c=>norm(c.value)==='casa nobre')&&row.some(c=>norm(c.value)==='treinamento'));
    if(unitHeader>=0) {
      const headings=sheet.rows[unitHeader]??[];
      for(const row of sheet.rows.slice(unitHeader+1)) {
        const mapped=Object.fromEntries(headings.map((c,i)=>[norm(c.value),row[i]?.value??null]).filter(([key])=>Boolean(key)));
        const affiliation=String(mapped['casa nobre']??'').trim(),type=String(mapped['tipo']??'').trim();
        if(!affiliation||!type)continue;
        if(house&&norm(affiliation)!==norm(house)){issues.push(`${sheet.name}: unidade de ${affiliation} não pertence à Casa ${house}; importação bloqueada.`);continue;}
        units.push(mapped);
      }
    }
    const start=sheet.rows.findIndex(row=>row.some(c=>norm(c.value)==='eventos historicos'));
    if(start>=0)for(const row of sheet.rows.slice(start+1)) {const nonempty=row.filter(c=>c.value!==null&&c.value!==undefined&&String(c.value).trim());if(nonempty.length>1)break;const text=String(nonempty[0]?.value??'').trim();if(text&&!['bonus','total'].includes(norm(text)))events.push(text);}
  }
  if(!house)issues.push('Casa não identificada pelo cabeçalho; vínculo requer conciliação.');
  if(!resources)issues.push('Recursos não identificados por cabeçalhos.');
  issues.push('Valores legados não comprovam a origem de cada ganho/alocação. Aprovação do Narrador necessária; nenhum bônus regional reaplicado.');
  return {source,house,resources,units,issues:[...new Set(issues)],events,original:sheets};
}
export async function readWorkbook(file:File):Promise<ImportPreview> {
  const XLSX=await import('xlsx'),wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellFormula:true,cellDates:false});
  const sheets:ImportSheet[]=wb.SheetNames.map(name=>{const ws=wb.Sheets[name];if(!ws)return {name,rows:[]};const range=XLSX.utils.decode_range(ws['!ref']??'A1');const rows:ImportCell[][]=[];for(let r=range.s.r;r<=Math.min(range.e.r,2000);r++){const row:ImportCell[]=[];for(let c=range.s.c;c<=Math.min(range.e.c,100);c++){const address=XLSX.utils.encode_cell({r,c}),cell=ws[address];row.push({address,value:cell?.t==='e'?cell.w??'#REF!':cell?.v??null,formula:cell?.f});}rows.push(row);}return {name,rows};});
  return previewWorkbook(sheets,file.name);
}