export const IMAGE_LIMIT = 5 * 1024 * 1024;
export function validateImage(file: {size:number;type:string}) {
  if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)) throw new Error('Use uma imagem JPG, PNG, WebP ou GIF.');
  if (file.size > IMAGE_LIMIT) throw new Error('Cada imagem pode ter até 5 MB.');
}
export function imageToken(path:string,caption:string) {
  return `[cormyr-image:${path}|${caption.replace(/[\]\r\n|]/g,' ')}]`;
}
export function contentParts(content:string) {
  const result:({text:string}|{path:string;caption:string})[]=[];
  const regex=/\[cormyr-image:([a-zA-Z0-9_./-]+)\|([^\]\n]*)\]/g;
  let start=0;
  for(const match of content.matchAll(regex)) {
    const index=match.index??0;
    if(index>start)result.push({text:content.slice(start,index)});
    result.push({path:match[1]??'',caption:match[2]??''});start=index+match[0].length;
  }
  if(start<content.length)result.push({text:content.slice(start)});
  return result;
}

export function namedCharacters(contents:string[]) {
  const names=new Set<string>();
  for(const content of contents)for(const match of content.matchAll(/(?:^|\n)Nome(?: do Personagem)?\s*[:·]\s*["“]?([^\n·]+)/gi)) {
    const name=(match[1]??'').replace(/["”]/g,'').trim().replace(/\.$/,'');
    if(name&&name.length<120&&name.split(/\s+/).length>=2&&!['Nome do Personagem','Posição'].includes(name))names.add(name);
  }
  return [...names];
}

export function narrativeText(content:string) {
  return contentParts(content).flatMap(part=>'text' in part?[part.text]:[]).join('\n').trim();
}
/** Embedded media tokens are untrusted document text. Accept IDs, never arbitrary URLs or HTML. */
export type CampaignMediaPart={text:string}|{kind:'youtube'|'drive';id:string;title:string};
export function campaignMediaParts(content:string):CampaignMediaPart[]{
 const parts:CampaignMediaPart[]=[];
 const token=/\[cormyr-(youtube|drive):([A-Za-z0-9_-]{11,100})\|([^\]\r\n]{1,150})\]/g;
 let cursor=0;
 for(const match of content.matchAll(token)){
  const kind=match[1] as 'youtube'|'drive',id=match[2]??'';
  if((kind==='youtube'&&id.length!==11)||(kind==='drive'&&id.length<15))continue;
  const at=match.index??0;
  if(at>cursor)parts.push({text:content.slice(cursor,at)});
  parts.push({kind,id,title:match[3]??''});
  cursor=at+match[0].length;
 }
 if(cursor<content.length)parts.push({text:content.slice(cursor)});
 return parts;
}
