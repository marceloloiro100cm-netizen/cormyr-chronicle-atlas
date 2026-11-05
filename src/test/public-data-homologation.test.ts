import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {PUBLIC_TRANSLATION_ENTITY_TYPES,isPublicTranslationEntityType}
 from '@/lib/i18n/public-translations';

const read=(path:string)=>readFileSync(path,'utf8');

describe('Homologação · catálogo e traduções públicos com privilégio mínimo',()=>{
 it('permite apenas tipos de tradução destinados ao público',()=>{
  expect(PUBLIC_TRANSLATION_ENTITY_TYPES).toEqual(['region','house','constitution']);
  for(const type of ['record','event','adventure','catalog_item','festival']){
   expect(isPublicTranslationEntityType(type)).toBe(false);
  }
  expect(isPublicTranslationEntityType('house')).toBe(true);
 });
 it('não inclui arquivo integral no JSON do catálogo público',()=>{
  const route=read('src/routes/api/public/catalog.ts');
  expect(route).toContain("select('id,name,region,classification,updated_at,gallery,narrative_text')");
  expect(route).not.toContain("'id,name,region,classification,archive_data");
  expect(route).toContain("playerHouses:players.data");
 });
 it('limita tanto a rota pública como a função server-side das traduções',()=>{
  const route=read('src/routes/api/public/translations.ts');
  const fn=read('src/lib/i18n/i18n.functions.ts');
  expect(route).toContain(".in('entity_type', [...PUBLIC_TRANSLATION_ENTITY_TYPES])");
  expect(fn).toContain(".in('entity_type', [...PUBLIC_TRANSLATION_ENTITY_TYPES])");
  expect(fn).toContain("!isPublicTranslationEntityType(data.entityType)");
  expect(fn).not.toContain(".eq('locale', data.locale);");
  expect(fn).toContain("createClient<Database>(url,key");
  expect(fn).toContain("auth:{persistSession:false,autoRefreshToken:false}");
  expect(fn).not.toContain("supabaseAdmin");
  expect(fn).toContain("cache:'no-store'");
 });
 it('mantém a leitura da ficha autenticada do vassalo, mas tira archive_data do papel anon',()=>{
  const sql=read('docs/security/sql/2026_11_04_homolog_public_read_boundaries.sql');
  const vassal=read('src/components/house/vassal-sheet-preview.tsx');
  expect(sql).toContain('REVOKE SELECT (archive_data) ON TABLE public.house_catalog FROM anon;');
  expect(sql).not.toContain('FROM authenticated;');
  expect(vassal).toContain("select('id,name,region,public_reviewed,archive_data')");
 });
 it('bloqueia traduções de entidades privadas e não expõe casas não aprovadas',()=>{
  const sql=read('docs/security/sql/2026_11_04_homolog_public_read_boundaries.sql');
  expect(sql).toContain('DROP POLICY IF EXISTS campaign_translations_read_all');
  expect(sql).toContain('FOR SELECT TO anon, authenticated');
  expect(sql).toContain("entity_type IN ('region','house','constitution')");
  expect(sql).toContain('c.public_reviewed IS TRUE');
  expect(sql).toContain('COMMIT;');
 });
});
