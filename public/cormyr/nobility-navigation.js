/* Navegação do catálogo público de Nobreza.
 * Só interpreta vínculos explícitos do catálogo, sem inferir vassalagens de textos.
 */
(function(root){
 'use strict';
 const norm=value=>String(value??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/^casa\s+/,'').trim();
 const TYPES=Object.freeze([
  {value:'',label:'Todas as categorias'},
  {value:'royal',label:'Casa Real'},
  {value:'major',label:'Casa Maior'},
  {value:'vassal',label:'Casa vassala'},
  {value:'historical',label:'Casa histórica'},
  {value:'unconfirmed',label:'Vínculo a confirmar'},
 ]);
 function kindOf(house){
  if(!house)return 'unconfirmed';
  const kind=house.hierarchy?.kind;
  if(kind==='historical')return 'historical';
  if(kind==='crown'||house.catalogClassification==='royal')return 'royal';
  if(kind==='regional'||house.catalogClassification==='major')return 'major';
  if(kind==='documented'&&house.hierarchy?.parent)return 'vassal';
  return 'unconfirmed';
 }
 const matchesKind=(house,kind)=>!kind||kindOf(house)===kind;
 function relations(houses,house){
  const list=Array.isArray(houses)?houses:[];
  const own=norm(house?.name);
  const parentName=norm(house?.hierarchy?.parent);
  const parent=parentName?list.find(h=>norm(h.name)===parentName&&h.nobleId!==house?.nobleId)||null:null;
  const recorded=list.filter(h=>h.nobleId!==house?.nobleId&&norm(h.hierarchy?.parent)===own)
   .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  return {
   parent,
   direct:recorded.filter(h=>['documented','regional'].includes(h.hierarchy?.kind)),
   historical:recorded.filter(h=>h.hierarchy?.kind==='historical'),
   pending:recorded.filter(h=>!['documented','regional','historical'].includes(h.hierarchy?.kind)),
  };
 }
 function outline(body){
  const items=Array.isArray(body)?body:[];
  const entries=items.map((part,index)=>part?.type==='heading'?{index,id:'noble-history-section-'+index,title:String(part.text||'').trim()}:null)
   .filter(Boolean);
  return {entries,show:entries.length>6};
 }
 root.CORMYR_NOBILITY_NAV=Object.freeze({TYPES,kindOf,matchesKind,relations,outline});
})(window);
