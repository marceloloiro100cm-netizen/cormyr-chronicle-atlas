import {CUSTOM_IMAGE_MAX_CHARS,CUSTOM_IMAGE_MAX_SIDE} from './custom-images';

const ACCEPTED=new Set(['image/png','image/jpeg','image/webp','image/gif']);

/**
 * Lê a imagem escolhida no aparelho e devolve uma miniatura quadrada
 * (recorte central) em WebP, reduzindo a qualidade até caber no limite.
 * Roda só no navegador; nada é enviado antes da confirmação.
 */
export async function customImageFromFile(file:File):Promise<string>{
 if(!ACCEPTED.has(file.type))throw Error('Escolha uma imagem PNG, JPEG, WebP ou GIF.');
 if(file.size>15*1024*1024)throw Error('A imagem deve ter no máximo 15 MB.');
 const url=URL.createObjectURL(file);
 try{
  const img=await new Promise<HTMLImageElement>((resolve,reject)=>{
   const el=new Image();
   el.onload=()=>resolve(el);
   el.onerror=()=>reject(Error('Não foi possível abrir a imagem.'));
   el.src=url;
  });
  const side=Math.min(img.naturalWidth,img.naturalHeight);
  if(!side)throw Error('Imagem vazia.');
  for(const size of [CUSTOM_IMAGE_MAX_SIDE,160,128]){
   const canvas=document.createElement('canvas');
   canvas.width=size;canvas.height=size;
   const ctx=canvas.getContext('2d');
   if(!ctx)throw Error('O navegador não conseguiu preparar a imagem.');
   ctx.imageSmoothingQuality='high';
   ctx.drawImage(img,(img.naturalWidth-side)/2,(img.naturalHeight-side)/2,side,side,0,0,size,size);
   for(const quality of [0.82,0.7,0.55,0.4]){
    let data=canvas.toDataURL('image/webp',quality);
    // Navegadores sem WebP devolvem PNG: tenta JPEG, que é bem menor.
    if(!data.startsWith('data:image/webp'))data=canvas.toDataURL('image/jpeg',quality);
    if(data.length<=CUSTOM_IMAGE_MAX_CHARS)return data;
   }
  }
  throw Error('A imagem ficou grande demais mesmo reduzida. Tente outra.');
 }finally{URL.revokeObjectURL(url);}
}
