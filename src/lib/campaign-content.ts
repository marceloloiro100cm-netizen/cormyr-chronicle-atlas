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