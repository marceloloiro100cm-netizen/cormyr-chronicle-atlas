/** Strict persisted editorial blocks. Plain text and bundled public engravings only. */
const kinds=['headline','subtitle','article','image','quote','notice'];
const fonts=['padrao','old-english','garamond','fraktur','cinzel','georgia','times'];
const images=['/newspaper/gravuras/castelo_cormyr.jpg','/newspaper/gravuras/conselho_real.jpg','/newspaper/gravuras/mercado_suzail.jpg'];
export function validateEditorialContent(input){
  const invalid=()=>{throw Error('invalid_editorial_content');};
  if(!input||typeof input!=='object'||Array.isArray(input)||
     Object.keys(input).some(k=>!['title','subtitle','blocks'].includes(k)))invalid();
  const text=(value,max,required=false)=>{
    if(typeof value!=='string'||Buffer.byteLength(value,'utf8')>max||
       (required&&!value.trim()))invalid();
    return value;
  };
  const title=text(input.title,180,true).trim(),subtitle=text(input.subtitle,280);
  if(!Array.isArray(input.blocks)||input.blocks.length<1||input.blocks.length>80)invalid();
  const ids=new Set();
  const blocks=input.blocks.map(b=>{
    if(!b||typeof b!=='object'||Array.isArray(b)||
       Object.keys(b).some(k=>!['id','type','text','subtitle','byline','caption',
         'imageSrc','titleFont','bodyFont','span','height'].includes(k))||
       typeof b.id!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(b.id)||
       ids.has(b.id)||!kinds.includes(b.type))invalid();
    ids.add(b.id);
    const out={id:b.id,type:b.type,text:text(b.text,16000)};
    for(const [key,max] of [['subtitle',1000],['byline',200],['caption',600]])
      if(b[key]!==undefined)out[key]=text(b[key],max);
    if(b.imageSrc!==undefined){if(!images.includes(b.imageSrc))invalid();out.imageSrc=b.imageSrc;}
    for(const key of ['titleFont','bodyFont'])
      if(b[key]!==undefined){if(!fonts.includes(b[key]))invalid();out[key]=b[key];}
    for(const [key,min,max,def] of [['span',3,12,12],['height',90,800,190]]){
      const n=b[key]??def;if(!Number.isSafeInteger(n)||n<min||n>max)invalid();out[key]=n;
    }
    if(b.type==='image'&&!out.imageSrc)invalid();
    return out;
  });
  if(!blocks.some(b=>b.text.trim()||b.imageSrc))invalid();
  const result={title,subtitle,blocks};
  if(Buffer.byteLength(JSON.stringify(result),'utf8')>240000)invalid();
  return result;
}

