import {describe,it,expect} from 'vitest';
import {isPublicArchiveFile,isPrincipalArchiveDocument} from '@/lib/archive-policy';
describe('Fontes públicas oficiais',()=>{
 it('não importa missivas futuras ou respostas',()=>{expect(isPublicArchiveFile('Missiva Semana 3')).toBe(false);expect(isPublicArchiveFile('Resposta Grantass')).toBe(false);});
 it('não importa fichas privadas nem arquivos técnicos',()=>{expect(isPublicArchiveFile('Ficha Kael')).toBe(false);expect(isPublicArchiveFile('cormyr-letter-123.json')).toBe(false);expect(isPublicArchiveFile('Gestão do Site - Não Mexer')).toBe(false);});
 it('identifica documento principal sem diferenças de acento ou capitalização',()=>{expect(isPrincipalArchiveDocument('CASA ASHKAR','Ashkar')).toBe(true);expect(isPrincipalArchiveDocument('Outra Casa','Ashkar')).toBe(false);});
});