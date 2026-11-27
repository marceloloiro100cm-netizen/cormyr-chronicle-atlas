/* Apresentação editorial das Casas Nobres.
 * Nunca altera o catálogo ou os documentos históricos de origem.
 * A remoção de duplicatas exige equivalência exata após normalização tipográfica.
 */
(function(root){
 'use strict';
 const clean=value=>String(value??'').replace(/\uFEFF/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
 const normalize=value=>clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR')
  .replace(/[“”"']/g,'').replace(/\s*cv\b/gi,' CV').replace(/\s+/g,' ')
  .replace(/[.,;:!?]+$/g,'').replace(/^casa\s+/,'').trim();
 const isMissingPlace=value=>/^(?:sem cidade|sem castelo|não informado|nao informado|não definido|nao definido|—|-)?$/i.test(clean(value));
 const labelKeys={
  nome:'leader',idade:'age',raca:'race',titulo:'titles',titulos:'titles',
  suserano:'suzerain',fundacao:'founding',brasao:'symbol',cores:'colors',
  lema:'motto',castelo:'castle',cidade:'city',
 };
 const sourceLabels=new Set(Object.keys(labelKeys).concat(['fama','vassalos','mansao em suzail','regente','regencia','condicao','precedencia','ramo']));
 const hues={
  branco:'#f5f1e8',preto:'#25252c',vermelho:'#a93236',azul:'#356ca4',
  verde:'#48764a',roxo:'#714c82',prata:'#aeb9c5',ouro:'#c79a37',
  dourado:'#c79a37',amarelo:'#d4b348',laranja:'#cf742f',bronze:'#ad7849',
  cinza:'#85858b',marrom:'#806044',vinho:'#772f4e',lilas:'#ac8bb7',
  ferro:'#66656b',ambar:'#cd923e',rosa:'#b77390',
 };
 function colorTokens(value){
  const raw=clean(value);
  if(!raw)return [];
  const parts=raw.split(/\s*(?:,|&|\be\b)\s*/i).map(clean).filter(Boolean);
  return parts.map(part=>{
   const label=part.charAt(0).toLocaleUpperCase('pt-BR')+part.slice(1);
   const key=normalize(part).split(/[\s-]/)[0];
   return {label,swatch:hues[key]||null};
  });
 }
 function originalValue(key,house){
  if(key==='suzerain')return house?.hierarchy?.parent||'';
  return house?.[key]||'';
 }
 function matchesStructured(key,value,house){
  const expected=originalValue(key,house);
  return Boolean(clean(expected))&&normalize(expected)===normalize(value);
 }
 function parseHistory(raw,house){
  const lines=String(raw??'').replace(/\uFEFF/g,'').split(/\r?\n/);
  const preface=[],supplemental=[];
  let position=0,sawMetadata=false,removedHouseHeading=false;
  while(position<lines.length&&position<42){
   const line=clean(lines[position]);
   if(!line){position++;continue;}
   // O nome da Casa já está no cabeçalho estruturado.
   if(!removedHouseHeading&&normalize(line)===normalize(house?.name||'')&&position<5){
    removedHouseHeading=true;position++;continue;
   }
   const matched=line.match(/^([^:]{2,45}):\s*(.+)$/);
   const label=matched?clean(matched[1]):'';
   const key=normalize(label);
   if(matched&&sourceLabels.has(key)){
    sawMetadata=true;
    const value=clean(matched[2]);
    const field=labelKeys[key];
    // Apenas valores efetivamente repetidos são omitidos do corpo apresentado.
    if(!field||!matchesStructured(field,value,house))supplemental.push({label,value});
    position++;
    continue;
   }
   if(!sawMetadata&&preface.length<3&&line.length<=165&&position<8){
    preface.push(line);position++;continue;
   }
   break;
  }
  const body=lines.slice(position).map(clean).filter(Boolean).map(line=>{
   if(/^[_━─—-]{4,}$/.test(line))return {type:'separator',text:''};
   const isHeading=line.length>=4&&line.length<100&&!/[.!?;:]["”'’»]?$/.test(line)&&!line.includes(':')&&!/^[“"'‘«\d•–—]/.test(line);
   return {type:isHeading?'heading':'paragraph',text:line};
  });
  return {preface,supplemental,body};
 }
 root.CORMYR_NOBILITY_FORMAT=Object.freeze({clean,normalize,isMissingPlace,colorTokens,parseHistory});
})(window);
