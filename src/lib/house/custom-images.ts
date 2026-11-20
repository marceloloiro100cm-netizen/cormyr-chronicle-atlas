import {z} from 'zod';
import type {CustomImages,HouseState} from './types';

/**
 * Retratos próprios da Casa (espiões e unidades militares). A imagem viaja
 * como miniatura WebP/JPEG/PNG embutida (data URL) dentro da Ficha, então
 * herda exatamente as mesmas permissões de leitura e escrita da Casa, sem
 * depender de um bucket público. É só apresentação: não altera regras,
 * recursos, custos ou resultados.
 */
export const CUSTOM_IMAGE_MAX_CHARS=24_000;
export const CUSTOM_IMAGE_MAX_SIDE=192;
const MAX_PER_KIND=60;
const DATA_URL=/^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/;

export type CustomImageTarget='spy'|'unit';
const argsSchema=z.object({
 target:z.enum(['spy','unit']),
 id:z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/),
 image:z.string().max(CUSTOM_IMAGE_MAX_CHARS),
});

export function isCustomImageDataUrl(value:unknown):value is string{
 return typeof value==='string'&&value.length<=CUSTOM_IMAGE_MAX_CHARS&&DATA_URL.test(value);
}

/** Grava (ou remove, com image vazia) o retrato de um espião ou unidade. */
export function setCustomImage(state:HouseState,args:Record<string,unknown>):HouseState{
 const input=argsSchema.parse(args);
 if(input.image&&!isCustomImageDataUrl(input.image))
  throw Error('Imagem inválida: envie PNG, JPEG ou WebP.');
 if(input.target==='unit'&&!state.units.some(u=>u.id===input.id&&!u.destroyed))
  throw Error('Unidade indisponível.');
 const next=structuredClone(state);
 const images:CustomImages={...(next.customImages??{})};
 const key=input.target==='spy'?'spies':'units';
 const bucket:Record<string,string>={...(images[key]??{})};
 if(input.image)bucket[input.id]=input.image;else delete bucket[input.id];
 if(Object.keys(bucket).length>MAX_PER_KIND)
  throw Error('Limite de retratos próprios desta Casa atingido.');
 images[key]=bucket;
 next.customImages=images;
 return next;
}

/** Retrato próprio, validado de novo na leitura (nunca confia no que veio salvo). */
export function customImageFor(state:Pick<HouseState,'customImages'>|null|undefined,
 target:CustomImageTarget,id:string):string|null{
 const value=state?.customImages?.[target==='spy'?'spies':'units']?.[id];
 return isCustomImageDataUrl(value)?value:null;
}
