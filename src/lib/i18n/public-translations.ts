/** Traduções permitidas em respostas sem sessão de campanha.
 * Tipos privados (record, event, adventure, catalog_item, festival)
 * não podem ser devolvidos por uma função pública com service role.
 */
export const PUBLIC_TRANSLATION_ENTITY_TYPES=['region','house','constitution'] as const;
export function isPublicTranslationEntityType(value:string):boolean{
 return PUBLIC_TRANSLATION_ENTITY_TYPES.some(type=>type===value);
}
