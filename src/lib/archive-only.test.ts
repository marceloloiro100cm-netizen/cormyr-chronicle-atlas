import { describe, expect, it } from 'vitest';
import { CORMYR_ARCHIVE_ONLY, shouldBlockLegacyRequest, isFirebasePilotPage, shouldRedirectToFirebasePilot } from './archive-only';

import { readFileSync } from 'node:fs';

describe('Firebase archive-only cutover', () => {
  it('does not eagerly import the retired Supabase session provider into the archive entrypoint', () => {
    const source = readFileSync(new URL('../routes/__root.tsx', import.meta.url), 'utf8');
    expect(source).not.toMatch(/import\s*\{\s*supabase\s*\}\s*from/);
    expect(source).toContain('if (CORMYR_ARCHIVE_ONLY) return;');
    expect(source).toContain("void import('@/integrations/supabase/client')");
  });

  it('keeps the emergency archive mode on until Firebase production acceptance', () => {
    expect(CORMYR_ARCHIVE_ONLY).toBe(true);
  });

  it.each([
    ['/api/public/catalog', 'router'],
    ['/api/public/time', 'router'],
    ['/api/public/translations', 'router'],
    ['/api/public/jobs/drive-sync', 'router'],
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

  it.each([
    '/api/firebase-cloud-treasury',
    '/api/firebase-cloud-construction',
    '/api/firebase-domain',
    '/api/firebase-auth-verify',
  ])('continues to block non-approved Firebase route %s', pathname => {
    expect(shouldBlockLegacyRequest(pathname, 'router')).toBe(true);
    expect(shouldBlockLegacyRequest(pathname, 'serverFn')).toBe(true);
  });

  it('permits exactly the Firebase-only pilot page, never a legacy or nested path', () => {
    expect(isFirebasePilotPage('/firebase-access')).toBe(true);
    expect(isFirebasePilotPage('/auth')).toBe(false);
    expect(isFirebasePilotPage('/jogadores')).toBe(false);
    expect(isFirebasePilotPage('/firebase-access/extra')).toBe(false);
    expect(isFirebasePilotPage('/api/firebase-cloud-read')).toBe(false);
  });

  it('routes only legacy login and player bookmarks to the Firebase pilot', () => {
    expect(shouldRedirectToFirebasePilot('/auth')).toBe(true);
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
