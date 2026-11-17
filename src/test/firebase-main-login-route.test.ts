import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const src=readFileSync('src/routes/auth.tsx','utf8');

describe('Portal principal de login — migração Firebase',()=>{
 it('usa somente sessão do Firebase e envia à área Firebase, nunca a áreas legadas',()=>{
  expect(src).toContain("firebasePilotAuth");
  expect(src).toContain("auth.signInWithPassword(email.trim(),password)");
  expect(src).toContain("navigate({to:'/firebase-access'})");
  expect(src).not.toContain('supabase');
  expect(src).not.toContain('signInWithPassword({email,password})');
  expect(src).not.toContain("navigate({to:destino})");
  expect(src).not.toContain("'/jogadores'");
 });
 it('não aceita seleção local de Casa ou perfil como autorização',()=>{
  expect(src).not.toContain('campaign-selected-house');
  expect(src).not.toContain('setProfile(');
  expect(src).not.toContain('setHouse(');
  expect(src).toContain('perfil, a Casa e as permissões são conferidos no Firebase');
 });
 it('recuperação de senha é genérica e não permite enumerar contas',()=>{
  expect(src).toContain('requestPasswordReset(email.trim())');
  expect(src).toContain('Se a conta existir e a recuperação estiver disponível');
  expect(src).toContain('firebasePilotLoginFailure(signedIn)');
  expect(src).not.toContain('error.message');
 });
 it('catálogo público indisponível não bloqueia a autenticação',()=>{
  expect(src).toContain('loadFirebasePublicSeasonHouses()');
  expect(src).toContain('O login Firebase continua disponível.');
  expect(src).not.toContain('sessionStorage.setItem');
 });
});
