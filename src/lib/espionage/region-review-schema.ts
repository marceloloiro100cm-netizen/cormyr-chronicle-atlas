import {z} from 'zod';
import {REGIONS} from '@/lib/house/regions';

const regionCodes=Object.keys(REGIONS);
export const spyRegionLinkInput=z.object({
 id:z.string().uuid(),
 fromRegion:z.string().min(1),
 toRegion:z.string().min(1),
 passage:z.enum(['land_neighbor','sea_passage']),
 bidirectional:z.boolean(),
 approved:z.literal(true),
 blocked:z.literal(false),
 visibility:z.literal('public'),
 source:z.string().trim().min(8).max(500),
 reason:z.string().trim().min(10).max(1000),
 requestKey:z.string().uuid(),
}).strict().superRefine((value,ctx)=>{
 if(!regionCodes.includes(value.fromRegion)||!regionCodes.includes(value.toRegion)){
  ctx.addIssue({code:'custom',message:'Regiões devem existir no catálogo oficial.'});
 }
 if(value.fromRegion===value.toRegion)
  ctx.addIssue({code:'custom',message:'Origem e destino precisam ser regiões diferentes.'});
});
