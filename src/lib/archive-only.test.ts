import { describe, expect, it } from 'vitest';
import { CORMYR_ARCHIVE_ONLY, shouldBlockLegacyRequest, isFirebasePilotPage, isPublicReaderPage, shouldRedirectToFirebasePilot } from './archive-only';

import { readFileSync } from 'node:fs';

describe('Firebase archive-only cutover', () => {
  it('does not eagerly import the retired Supabase session provider into the archive entrypoint', () => {
    const source = readFileSync('src/routes/__root.tsx', 'utf8');
    expect(source).not.toMatch(/import\s*\{\s*supabase\s*\}\s*from/);
    expect(source).toContain('if (CORMYR_ARCHIVE_ONLY) return;');
    expect(source).toContain("void import('@/integrations/supabase/client')");
  });

  it('keeps the emergency archive mode on until Firebase production acceptance', () => {
    expect(CORMYR_ARCHIVE_ONLY).toBe(true);
  });

  it.each([
    ['/api/firebase-auth-verify', 'router'],
    ['/api/firebase-domain', 'router'],
    ['/api/firebase-cloud-read', 'serverFn'],
    ['/api/firebase-cloud-mail', 'serverFn'],
    ['/api/firebase-cloud-newspaper', 'serverFn'],
    ['/api/public/gm-content', 'serverFn'],
    ['/mcp', 'router'],
    ['/.well-known/oauth-protected-resource', 'router'],
    ['/jogadores', 'serverFn'],
    ['/_serverFn/custom-handler', 'serverFn'],
  ])('blocks legacy route %s', (pathname, type) => {
    expect(shouldBlockLegacyRequest(pathname, type)).toBe(true);
  });

  it.each([
    ['/', 'router'],
    ['/cormyr/', 'router'],
    ['/cormyr/index.html', 'router'],
    ['/cormyr/assets/cormyr.jpg', 'router'],
    ['/spy-portraits/tillet.jpg', 'router'],
    ['/api/firebase-cloud-read', 'router'],
    ['/api/firebase-cloud-mail', 'router'],
    ['/api/firebase-cloud-newspaper', 'router'],
    ['/api/public/gm-content', 'router'],
    ['/api/public/newspaper', 'router'],
    ['/api/public/newspaper-image', 'router'],
    ['/api/public/newspaper-staff-photo', 'router'],
    ['/api/public/time', 'router'],
    ['/api/public/catalog', 'router'],
    ['/api/public/translations', 'router'],
    ['/api/public/house-gallery', 'router'],
    ['/api/public/gallery-image', 'router'],
    ['/api/public/jobs/drive-sync', 'router'],
    ['/api/firebase-cloud-treasury', 'router'],
    ['/api/firebase-cloud-construction', 'router'],
    ['/unrelated', 'router'],
  ])('keeps public static route %s reachable', (pathname, type) => {
    expect(shouldBlockLegacyRequest(pathname, type)).toBe(false);
  });

  it.each([
    '/api/firebase-cloud-house-quote',
    '/api/firebase-operational-economy',
    '/api/firebase-house-reconciliation-audit',
    '/api/firebase-treasury-audit',
  ])('allows independent read-only Firebase route %s without opening serverFns', pathname => {
    expect(shouldBlockLegacyRequest(pathname, 'router')).toBe(false);
    expect(shouldBlockLegacyRequest(pathname, 'serverFn')).toBe(true);
    expect(shouldBlockLegacyRequest(pathname + '/unexpected', 'router')).toBe(true);
  });

  it('allows only the Firebase Narrator House-activation API through archive mode',()=>{
    const endpoint='/api/firebase-house-activation';
    for(const kind of ['router','api'])
      expect(shouldBlockLegacyRequest(endpoint,kind)).toBe(false);
    // Server functions and similarly named legacy APIs stay blocked.
    expect(shouldBlockLegacyRequest(endpoint,'serverFn')).toBe(true);
    for(const suffix of ['/','-old','/legacy','/extra'])
      expect(shouldBlockLegacyRequest(endpoint+suffix,'router')).toBe(true);
    expect(shouldBlockLegacyRequest('/api/firebase-domain','router')).toBe(true);
  });

  it.each([
    '/api/firebase-domain',
    '/api/firebase-auth-verify',
  ])('continues to block non-approved Firebase route %s', pathname => {
    expect(shouldBlockLegacyRequest(pathname, 'router')).toBe(true);
    expect(shouldBlockLegacyRequest(pathname, 'serverFn')).toBe(true);
  });

  it.each([
    '/api/firebase-accounts',
    '/api/firebase-house-source',
    '/api/firebase-house-operation',
    '/api/firebase-house-rules',
    '/api/firebase-private-media',
    '/api/firebase-newspaper-staff-photo',
    '/api/firebase-newspaper-media',
  ])('routes migrated endpoint %s to its own authorization boundary', pathname => {
    for(const kind of ['router','api'])
      expect(shouldBlockLegacyRequest(pathname,kind)).toBe(false);
    expect(shouldBlockLegacyRequest(pathname,'serverFn')).toBe(true);
    for(const suffix of ['/','-old','/legacy','/extra'])
      expect(shouldBlockLegacyRequest(pathname+suffix,'router')).toBe(true);
  });

  it('allows only the exact Firebase House gallery list, retaining archive-only protections',()=>{
    const endpoint='/api/public/house-gallery';
    for(const type of ['router','api'])
      expect(shouldBlockLegacyRequest(endpoint,type)).toBe(false);
    expect(shouldBlockLegacyRequest(endpoint,'serverFn')).toBe(true);
    for(const suffix of ['/','/legacy','/extra','-old'])
      expect(shouldBlockLegacyRequest(endpoint+suffix,'router')).toBe(true);
    expect(shouldBlockLegacyRequest('/api/legacy-gallery','router')).toBe(true);
  });

  it.each([
    '/api/public/newspaper-image',
    '/api/public/newspaper-staff-photo',
  ])('passes the exact GET-only newspaper media route %s to its own guarded handler', endpoint => {
    for(const handlerType of ['router','api'])
      expect(shouldBlockLegacyRequest(endpoint,handlerType)).toBe(false);
    expect(shouldBlockLegacyRequest(endpoint,'serverFn')).toBe(true);
    for(const suffix of ['/','/extra','-old','-export'])
      expect(shouldBlockLegacyRequest(endpoint+suffix,'router')).toBe(true);
  });

  it('permits only exact Firebase login, reset and independently secured pilot pages', () => {
    for(const p of ['/auth','/reset-password','/firebase-access'])
      expect(isFirebasePilotPage(p)).toBe(true);
    for(const p of ['/jogadores','/auth/extra','/reset-password/extra',
      '/firebase-access/extra','/diagnostico','/api/firebase-cloud-read'])
      expect(isFirebasePilotPage(p)).toBe(false);
  });

  it('abre só a página pública do jornal e sua API, sem liberar serverFns', () => {
    expect(isPublicReaderPage('/jornal')).toBe(true);
    for(const p of ['/jornal/extra','/jornais','/jogadores'])expect(isPublicReaderPage(p)).toBe(false);
    expect(shouldBlockLegacyRequest('/api/public/newspaper','serverFn')).toBe(true);
    expect(shouldBlockLegacyRequest('/api/public/newspaper/extra','router')).toBe(true);
  });

  it('routes legacy player bookmarks to the Firebase pilot, without bypassing login', () => {
    expect(shouldRedirectToFirebasePilot('/auth')).toBe(false);
    expect(shouldRedirectToFirebasePilot('/reset-password')).toBe(false);
    expect(shouldRedirectToFirebasePilot('/jogadores')).toBe(true);
    expect(shouldRedirectToFirebasePilot('/diagnostico')).toBe(false);
    expect(shouldRedirectToFirebasePilot('/api/firebase-cloud-read')).toBe(false);
    expect(shouldRedirectToFirebasePilot('/jogadores/secret')).toBe(false);
    expect(shouldRedirectToFirebasePilot('/firebase-access')).toBe(false);
  });

  it('does not confuse path prefixes', () => {
    expect(shouldBlockLegacyRequest('/apiary', 'router')).toBe(false);
    expect(shouldBlockLegacyRequest('/mcp-evasion', 'router')).toBe(false);
  });
});
