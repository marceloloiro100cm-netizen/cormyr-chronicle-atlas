import jsPDF from 'jspdf';
import {buildCharacterResolvedReport,type VerifiedGear} from './equipment-report';
import type {CharacterV2} from './schema';

/** Lote 10: mesmo report model usado na prévia e no arquivo, sem o texto privado V1. */
export function exportCharacterV2Pdf(character:CharacterV2,gear:readonly VerifiedGear[]=[]):Uint8Array{
 return exportCharacterV2ReportPdf(buildCharacterResolvedReport(character,gear));
}
/** A prévia do Narrador recebe somente o relatório filtrado, nunca o snapshot privado original. */
export function exportCharacterV2ReportPdf(report:ReturnType<typeof buildCharacterResolvedReport>):Uint8Array{
 const pdf=new jsPDF({unit:'mm',format:'a4'});
 const margin=17;
 let y=19;
 const section=(heading:string)=>{
  if(y>268){pdf.addPage();y=20;}
  pdf.setFont('helvetica','bold');pdf.setFontSize(12);pdf.text(heading,margin,y);y+=7;
 };
 const row=(label:string,value:string)=>{
  pdf.setFont('helvetica','normal');pdf.setFontSize(9);
  const wrapped=pdf.splitTextToSize(label+': '+value,174) as string[];
  if(y+wrapped.length*5>275){pdf.addPage();y=20;}
  pdf.text(wrapped,margin,y);y+=wrapped.length*5+1;
 };
 pdf.setFontSize(16);pdf.text('Cormyr · Ficha de Personagem V2',margin,y);y+=11;
 section(report.name);row('Casa',report.houseId);row('Versão de regras',report.rulesVersion);
 section('Estatísticas derivadas');
 for(const metric of report.breakdown){
  row(metric.key,String(metric.value)+' ('+metric.formula+')');
  for(const line of metric.lines)row('  · '+line.description,
   (line.amount>=0?'+':'')+line.amount+' ['+line.sourceId+']');
 }
 section('Habilidades');
 for(const [key,value] of Object.entries(report.skillRanks))row(key,String(value));
 section('Armas homologadas');
 if(!report.weapons.length)row('Armas','Nenhuma com dano homologado');
 for(const weapon of report.weapons)row(weapon.label,String(weapon.value)+' · '+weapon.formula);
 section('Pendências de conciliação');
 if(!report.pending.length)row('Situação','Sem pendências de cálculo identificadas');
 for(const warning of report.pending)row('A conferir',warning);
 pdf.setFontSize(8);
 if(y>273){pdf.addPage();y=20;}
 pdf.text('Prévia técnica V2 — não substitui a ficha oficial sem homologação.',margin,y+4);
 return new Uint8Array(pdf.output('arraybuffer'));
}
