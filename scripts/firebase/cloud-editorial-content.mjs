/**
 * Strict Firebase editorial persistence. Keep the existing accepted shape
 * while preserving harmless metadata used by the original Folha Sem Selo
 * designer. No remote image paths, arbitrary files, unverified commission
 * ownership, scheduled publishing or server-generated fields are accepted.
 */
const kinds=['headline','subtitle','article','image','quote','notice'];
const fonts=['padrao','old-english','garamond','fraktur','cinzel','georgia','times'];
const images=['/newspaper/gravuras/castelo_cormyr.jpg','/newspaper/gravuras/conselho_real.jpg','/newspaper/gravuras/mercado_suzail.jpg'];
const templates=['classico','guerra','gazeta'];
const styles=['classico','editorial','condensado','gotica','romana'];
const alignments=['left','center'];
const imageStyles=['vintage','woodcut','original'];
const imageFocus=['top','center','bottom'];
const noticeIcons=['⚜','📜','🏪','⚔','⚠','👑'];
// Only paths created by the server-side immutable newsroom registry are accepted.
// The Cloud transaction also proves the edition and snapshot ownership.
const mediaImage=/^newspaper-media\/[a-f0-9]{64}\/editionImage\/[0-9a-f-]{36}\.(?:png|jpg|webp)$/;
const mediaPdf=/^newspaper-media\/[a-f0-9]{64}\/editionPdf\/[0-9a-f-]{36}\.pdf$/;

export function validateEditorialContent(input,{allowEmptyImages=false}={}){
  const invalid=()=>{throw Error('invalid_editorial_content');};
  if(!input||typeof input!=='object'||Array.isArray(input)||
     Object.keys(input).some(k=>!['title','subtitle','blocks','template','font_style','pdfPath'].includes(k)))invalid();
  const text=(value,max,required=false)=>{
    if(typeof value!=='string'||Buffer.byteLength(value,'utf8')>max||
       (required&&!value.trim()))invalid();
    return value;
  };
  const title=text(input.title,180,true).trim(),subtitle=text(input.subtitle,280);
  if(input.template!==undefined&&!templates.includes(input.template))invalid();
  if(input.font_style!==undefined&&!styles.includes(input.font_style))invalid();
  if(!Array.isArray(input.blocks)||input.blocks.length<1||input.blocks.length>80)invalid();
  const ids=new Set();
  const blocks=input.blocks.map(b=>{
    if(!b||typeof b!=='object'||Array.isArray(b)||
       Object.keys(b).some(k=>!['id','type','text','subtitle','byline','caption',
         'imageSrc','imagePath','titleFont','bodyFont','span','height',
         'icon','align','imageStyle','autoHeight','imageFocus',
         'focusX','focusY','cropZoom','pinned','dropCap','commissionId'].includes(k))||
       typeof b.id!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(b.id)||
       ids.has(b.id)||!kinds.includes(b.type))invalid();
    ids.add(b.id);
    const out={id:b.id,type:b.type,text:text(b.text,16000)};
    if(b.commissionId!==undefined){
      if(b.type!=='article'||typeof b.commissionId!=='string'||
         !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.commissionId))
        invalid();
      out.commissionId=b.commissionId;
    }
    for(const [key,max] of [['subtitle',1000],['byline',200],['caption',600]])
      if(b[key]!==undefined)out[key]=text(b[key],max);
    if(b.imageSrc!==undefined){
      if(!images.includes(b.imageSrc)||b.type!=='image')invalid();
      out.imageSrc=b.imageSrc;
    }
    if(b.imagePath!==undefined){
      if(b.type!=='image'||!mediaImage.test(b.imagePath)||b.imageSrc!==undefined)invalid();
      out.imagePath=b.imagePath;
    }
    for(const key of ['titleFont','bodyFont'])
      if(b[key]!==undefined){if(!fonts.includes(b[key]))invalid();out[key]=b[key];}
    for(const [key,min,max,def] of [['span',3,12,12],['height',90,800,190]]){
      const n=b[key]??def;if(!Number.isSafeInteger(n)||n<min||n>max)invalid();out[key]=n;
    }
    if(b.icon!==undefined){
      if(b.type!=='notice'||!noticeIcons.includes(b.icon))invalid();
      out.icon=b.icon;
    }
    for(const [key,values] of [['align',alignments],['imageStyle',imageStyles],
      ['imageFocus',imageFocus]]){
      if(b[key]!==undefined){
        if(!values.includes(b[key])||(key!=='align'&&b.type!=='image'))invalid();
        out[key]=b[key];
      }
    }
    for(const key of ['autoHeight','pinned','dropCap'])
      if(b[key]!==undefined){
        if(typeof b[key]!=='boolean')invalid();
        if(key==='autoHeight'&&b.type!=='image')invalid();
        out[key]=b[key];
      }
    for(const [key,min,max] of [['focusX',0,100],['focusY',0,100],['cropZoom',1,3]]){
      if(b[key]!==undefined){
        if(b.type!=='image'||typeof b[key]!=='number'||
           !Number.isFinite(b[key])||b[key]<min||b[key]>max)invalid();
        out[key]=b[key];
      }
    }
    if(b.type==='image'&&!out.imageSrc&&!out.imagePath&&!allowEmptyImages)invalid();
    return out;
  });
  const commissions=blocks.filter(b=>b.commissionId).map(b=>b.commissionId);
  if(new Set(commissions).size!==commissions.length)invalid();
  if(!blocks.some(b=>b.text.trim()||b.imageSrc||b.imagePath)||input.pdfPath)invalid();
  if(input.pdfPath!==undefined&&input.pdfPath!==null&&!mediaPdf.test(input.pdfPath))invalid();
  const result={title,subtitle,blocks,
    ...(input.pdfPath?{pdfPath:input.pdfPath}:{}),
    ...(input.template!==undefined?{template:input.template}:{}),
    ...(input.font_style!==undefined?{font_style:input.font_style}:{})};
  if(Buffer.byteLength(JSON.stringify(result),'utf8')>240000)invalid();
  return result;
}
