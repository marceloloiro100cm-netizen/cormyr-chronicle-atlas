import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {isPublicTranslationEntityType} from './public-translations';
import {projectFirebaseDynamicTranslations} from './firebase-dynamic-dictionary';

const SHA=/^[a-f0-9]{64}$/;

export const loadDynamicTranslations=createServerFn({method:'POST'})
  .inputValidator(z.object({
    locale:z.enum(['pt','en','es','de']),
    entityType:z.enum([
      'house','region','event','adventure','catalog_item','record',
      'festival','constitution',
    ]).optional(),
  }))
  .handler(async({data})=>{
    if(data.locale==='pt'||
       data.entityType&&!isPublicTranslationEntityType(data.entityType))
      return {};
    const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
    // Explicit fail-closed release gate. No alternate data provider is used.
    if(process.env['CORMYR_FIREBASE_PUBLIC_TRANSLATIONS_ENABLED']!=='true'||
       !SHA.test(snapshotId)||process.env['FIRESTORE_EMULATOR_HOST']||
       process.env['FIREBASE_AUTH_EMULATOR_HOST'])return {};
    try{
      const [{publicContentFirestore},{readApprovedFirebasePublicTranslations}]=
        await Promise.all([
          import('@/lib/public/firebase-public-content-admin.server'),
          import('@/lib/public/firebase-public-content.server'),
        ]);
      const result=await readApprovedFirebasePublicTranslations({
        db:await publicContentFirestore(),snapshotId,projectId:'cormyr',
        enabled:true,locale:data.locale,
      });
      return projectFirebaseDynamicTranslations(result,data.entityType);
    }catch{
      // No provider messages or private snapshots in errors sent to browsers.
      // The i18n context already falls back to bundled Portuguese text.
      return {};
    }
  });

/**
 * Translation editing requires a NEW Firebase narrator-authorized, versioned
 * workflow with an approved public-review stage. Keep legacy writes disabled.
 * This function performs no authentication bypass and NO database writes.
 */
export const upsertTranslationsBatch=createServerFn({method:'POST'})
  .inputValidator(z.object({
    items:z.array(z.object({
      entity_type:z.enum([
        'house','region','event','adventure','catalog_item','record',
        'festival','constitution',
      ]),
      entity_id:z.string().min(1),
      field_name:z.string().min(1),
      locale:z.enum(['pt','en','es','de']),
      translated_text:z.string(),
    })).max(1000),
  }))
  .handler(async():Promise<{message:string}>=>{
    throw new Error(
      'Edicao de traducoes desabilitada ate a homologacao do editor Firebase.',
    );
  });
