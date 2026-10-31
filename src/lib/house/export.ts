import { houseReport, type ReportLedger } from './report';
import { campaignMonth } from './regions';
import type { HouseState, CatalogItem } from './types';

export async function exportHouseExcel(state:HouseState,name:string,catalog:CatalogItem[]=[],ledger:ReportLedger[]=[]) {
 const XLSX=await import('xlsx'),wb=XLSX.utils.book_new();
 for(const section of houseReport(state,name,catalog,ledger)) {
  const rows=[section.headers,...section.rows],ws=XLSX.utils.aoa_to_sheet(rows);
  if(section.title==='Recursos'){
   for(let index=2;index<=rows.length;index++){
     const address='E'+index;
     ws[address]={t:'n',f:`B${index}-C${index}-D${index}`,v:Number(section.rows[index-2]?.[4]??0)};
   }
 }
  ws['!cols']=section.headers.map((header,i)=>({wch:Math.min(55,Math.max(16,header.length+2,...section.rows.map(row=>String(row[i]??'').length)))}));
  ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:Math.max(0,rows.length-1),c:section.headers.length-1}})};
  XLSX.utils.book_append_sheet(wb,ws,section.title.slice(0,31));
 }
 XLSX.writeFile(wb,`Casa-${name}-Cormyr.xlsx`);
}

export async function exportHousePdf(state:HouseState,name:string,catalog:CatalogItem[]=[],ledger:ReportLedger[]=[]) {
 const [{jsPDF},{default:autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')]);
 const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
 pdf.setFont('times','bold');pdf.setFontSize(22);pdf.text(`Casa ${name}`,14,18);
 pdf.setFont('helvetica','normal');pdf.setFontSize(10);pdf.text(`${campaignMonth(state.month)} | Registro privado da casa`,14,26);
 let y=34;
 for(const section of houseReport(state,name,catalog,ledger)) {
  if(y>170){pdf.addPage();y=16;}
  pdf.setFont('times','bold');pdf.setFontSize(14);pdf.text(section.title,14,y);y+=4;
  autoTable(pdf,{startY:y,head:[section.headers],body:section.rows.length?section.rows:[['Nenhum registro']],theme:'grid',styles:{font:'helvetica',fontSize:8,overflow:'linebreak',cellPadding:2},margin:{top:14,bottom:16,left:14,right:14}});
  y=((pdf as unknown as {lastAutoTable?:{finalY?:number}}).lastAutoTable?.finalY??y)+12;
 }
 const pages=pdf.getNumberOfPages();
 for(let n=1;n<=pages;n++){pdf.setPage(n);pdf.setFont('helvetica','normal');pdf.setFontSize(8);pdf.text(`Cormyr | Casa ${name} | ${n} / ${pages}`,14,202);}
 pdf.save(`Casa-${name}-Cormyr.pdf`);
}