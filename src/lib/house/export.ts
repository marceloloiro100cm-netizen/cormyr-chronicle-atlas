import { houseReport, type ReportLedger, type ReportSection } from './report';
import {vassalArchiveReport,type VassalArchiveProfile} from './vassal-archive';
import {vassalWorkbookReport,type VassalWorkbook} from './vassal-workbook';
import { campaignMonth } from './regions';
import type { HouseState, CatalogItem } from './types';

export async function exportHouseExcel(state:HouseState,name:string,catalog:CatalogItem[]=[],ledger:ReportLedger[]=[]) {
 const XLSX=await import('xlsx'),wb=XLSX.utils.book_new();
 for(const section of houseReport(state,name,catalog,ledger)) {
  const rows=[section.headers,...section.rows],ws=XLSX.utils.aoa_to_sheet(rows);
  if(section.title==='Recursos')section.rows.forEach((row,i)=>{const number=i+2;ws['E'+number]={t:'n',f:`B${number}-C${number}-D${number}`,v:Number(row[4]??0)};});
   ws['!cols']=section.headers.map((header,i)=>({wch:Math.min(55,Math.max(16,header.length+2,...section.rows.map(row=>String(row[i]??'').length)))}));
  ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:Math.max(0,rows.length-1),c:section.headers.length-1}})};
  XLSX.utils.book_append_sheet(wb,ws,section.title.slice(0,31));
 }
 XLSX.writeFile(wb,`Casa-${name}-Cormyr.xlsx`);
}

export async function exportHousePdf(state:HouseState,name:string,catalog:CatalogItem[]=[],ledger:ReportLedger[]=[]) {
 return renderHousePdf(houseReport(state,name,catalog,ledger),name,`${campaignMonth(state.month)} | Registro privado da casa`);
}

/** Same full house-report PDF layout; sections unavailable in a catalogue-only
 * house are explicitly marked 'Não cadastrado', never fabricated as zero. */
export async function exportVassalArchivePdf(profile:VassalArchiveProfile){
 return renderHousePdf(vassalArchiveReport(profile),profile.name,'Acervo público de Cormyr | Dados mecânicos ainda não cadastrados');
}
/** Full PDF with exactly the workbook values; this read-only import does not
 * create transactions or assign unknown troop costs. */
export async function exportVassalWorkbookPdf(sheet:VassalWorkbook){
 return renderHousePdf(vassalWorkbookReport(sheet),sheet.name,
  'Importação da planilha da vassala · dados de consulta, não conciliados no livro-caixa');
}

async function renderHousePdf(sections:ReportSection[],name:string,subtitle:string){
 const [{jsPDF},{default:autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')]);
 const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
 pdf.setFont('times','bold');pdf.setFontSize(22);pdf.text(`Casa ${name}`,14,18);
 pdf.setFont('helvetica','normal');pdf.setFontSize(10);pdf.text(subtitle,14,26);
 let y=34;
 for(const section of sections) {
  if(y>170){pdf.addPage();y=16;}
  pdf.setFont('times','bold');pdf.setFontSize(14);pdf.text(section.title,14,y);y+=4;
  autoTable(pdf,{startY:y,head:[section.headers],body:section.rows.length?section.rows:[['Nenhum registro']],theme:'grid',styles:{font:'helvetica',fontSize:8,overflow:'linebreak',cellPadding:2},margin:{top:14,bottom:16,left:14,right:14}});y=((pdf as typeof pdf & {lastAutoTable?:{finalY:number}}).lastAutoTable?.finalY??y)+12;
 }
 const pages=pdf.getNumberOfPages();
 for(let n=1;n<=pages;n++){pdf.setPage(n);pdf.setFont('helvetica','normal');pdf.setFontSize(8);pdf.text(`Cormyr | Casa ${name} | ${n} / ${pages}`,14,202);}
 pdf.save(`Casa-${name}-Cormyr.pdf`);
}