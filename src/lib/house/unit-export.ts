import {TRAINING,UNIT_TYPES,unitStats} from './engine';
import {UNIT_EQUIPMENT,houseWeaponBonuses} from './equipment';
import {unitXpSummary} from './unit-progression';
import {UNIT_SKILLS,UNIT_SKILL_NAMES,type HouseState,type Unit} from './types';

/** Downloads only the unit already visible to the current authenticated viewer. */
export async function exportUnitPdf(unit:Unit,state:HouseState,houseName:string){
 const [{jsPDF},{default:autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')]);
 const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
 const xp=unitXpSummary(unit),stats=unitStats(unit);
 const docWidth=210,pad=15;
 const shieldColor:[number,number,number]=[75,43,91];
 const gold:[number,number,number]=[183,141,75];
 const safe=(text:unknown)=>String(text??'').replace(/[\u0000-\u001f]/g,' ').trim();
 const line=(value:unknown,max=175)=>pdf.splitTextToSize(safe(value),max);
 pdf.setFillColor(...shieldColor);pdf.rect(0,0,docWidth,43,'F');
 pdf.setTextColor(248,238,212);pdf.setFont('times','bold');pdf.setFontSize(13);
 pdf.text('CASA '+houseName.toLocaleUpperCase('pt-BR')+' · FICHA DE UNIDADE',pad,14);
 pdf.setFontSize(19);pdf.text(line(unit.name),pad,26);
 pdf.setFont('helvetica','normal');pdf.setFontSize(9);
 pdf.text(unit.types.map(id=>UNIT_TYPES.find(t=>t.id===id)?.name??id).join(' / ')+' · '+(TRAINING[unit.training as keyof typeof TRAINING]?.name??unit.training),pad,36);
 const section=(name:string,y:number)=>{pdf.setFillColor(...gold);pdf.rect(pad,y,180,0.8,'F');pdf.setTextColor(52,39,55);pdf.setFont('times','bold');pdf.setFontSize(13);pdf.text(name,pad,y+6);};
 section('Estatísticas e experiência',49);
 const statRows=[
 ['Defesa',stats.defense,'Saúde',stats.health+' / '+stats.maxHealth],
 ['Disciplina',stats.discipline,'Movimento',stats.movement+' m'],
 ['Armadura',unit.armor,'Efetivo',Math.max(0,unit.strength-unit.casualties)+' / '+unit.strength],
 ['Comandante',unit.commanderName||'Sem comandante','Origem',unit.origin||'Não informada'],
 ['Treinamento',xp.training+' XP','XP livre',xp.available],
 ['XP bônus / histórico',xp.bonus,'XP investido',xp.spent],
 ['Déficit de XP',xp.deficit,'Baixas',unit.casualties],
 ];
 autoTable(pdf,{startY:60,head:[],body:statRows.map(row=>row.map(safe)),theme:'grid',margin:{left:pad,right:pad},
  styles:{font:'helvetica',fontSize:8,cellPadding:2,textColor:[47,35,50]},columnStyles:{0:{cellWidth:32,fontStyle:'bold'},1:{cellWidth:55},2:{cellWidth:36,fontStyle:'bold'},3:{cellWidth:57}}});
 let y=(pdf as typeof pdf & {lastAutoTable?:{finalY:number}}).lastAutoTable?.finalY??122;
 y+=6;section('Habilidades (graduacões de 1 a 12)',y);
 const skills=UNIT_SKILLS.map(key=>[
  UNIT_SKILL_NAMES[key],
  key in unit.skills ? String(unit.skills[key as keyof typeof unit.skills]):String(unit.extraSkills?.[key as keyof NonNullable<Unit['extraSkills']>]??2),
 ]);
 autoTable(pdf,{startY:y+10,head:[['Habilidade','Graduação','Habilidade','Graduação']],body:Array.from({length:10},(_,i)=>[
  ...skills[i*2]!,...skills[i*2+1]!
 ]),theme:'grid',margin:{left:pad,right:pad},
 styles:{font:'helvetica',fontSize:9,cellPadding:2,textColor:[45,35,48]},headStyles:{fillColor:shieldColor,textColor:[255,249,237]}});
 y=(pdf as typeof pdf & {lastAutoTable?:{finalY:number}}).lastAutoTable?.finalY??220;
 if(y>235){pdf.addPage();y=17;}else y+=6;
 section('Armas, armaduras e modificadores',y);
 const gear=UNIT_EQUIPMENT.find(item=>item.id===(unit.equipmentTypeId??unit.types[0]));
 const bonuses=houseWeaponBonuses(state);
 const gearRows=gear?[
  ['Armadura',unit.equipment.includes('armor')?gear.improved.armor:gear.initial.armor],
  ['Penalidade',unit.equipment.includes('armor')?gear.improved.penalty:gear.initial.penalty],
  ['Volume',unit.equipment.includes('armor')?gear.improved.bulk:gear.initial.bulk],
  ['Armas de Luta',unit.equipment.includes('fighting')?gear.improved.fighting:gear.initial.fighting],
  ['Armas de Pontaria',unit.equipment.includes('marksmanship')?gear.improved.marksmanship:gear.initial.marksmanship],
  ['Bônus da Casa (Luta/Pontaria)',bonuses.fighting+' / '+bonuses.marksmanship],
 ]:[['Conjunto não definido','Revisão necessária']];
 autoTable(pdf,{startY:y+10,body:gearRows.map(r=>r.map(safe)),theme:'grid',margin:{left:pad,right:pad},
 styles:{fontSize:8,font:'helvetica',cellPadding:2},columnStyles:{0:{fontStyle:'bold',cellWidth:75}}});
 y=(pdf as typeof pdf & {lastAutoTable?:{finalY:number}}).lastAutoTable?.finalY??y+55;
 if(y>248){pdf.addPage();y=18;}else y+=7;
 section('Situação e observações',y);
 pdf.setTextColor(48,38,52);pdf.setFont('helvetica','normal');pdf.setFontSize(9);
 pdf.text(line('Situação: '+(unit.situation||'Não informada')+'\n'+(unit.notes||'Sem observações adicionais')),pad,y+12);
 const pages=pdf.getNumberOfPages();
 for(let n=1;n<=pages;n++){pdf.setPage(n);pdf.setFont('helvetica','normal');pdf.setFontSize(8);pdf.setTextColor(100,87,95);pdf.text('Cormyr Chronicle · Casa '+safe(houseName)+' · '+n+' / '+pages,pad,289);}
 const fileName=(safe(houseName)+'-'+safe(unit.name)).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9-]+/g,'-').replace(/^-|-$/g,'').slice(0,95);
 pdf.save('Ficha-Unidade-'+fileName+'.pdf');
}
