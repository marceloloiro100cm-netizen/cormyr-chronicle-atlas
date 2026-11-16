import { describe, expect, it } from 'vitest';
import { CORMYR_ARCHIVE_ONLY, shouldBlockLegacyRequest, isFirebasePilotPage } from './archive-only';

describe('Firebase archive-only cutover', () => {
  it('keeps the emergency archive mode on until Firebase production acceptance', () => {
    expect(CORMYR_ARCHIVE_ONLY).toBe(true);
  });

  it.each([
    ['/api/public/catalog', 'router'],
    ['/api/public/time', 'router'],
    ['/api/public/translations', 'router'],
    ['/api/public/gm-content', 'router'],
    ['/api/public/jobs/drive-sync', 'router'],
    ['/api/firebase-auth-verify', 'router'],
    ['/api/firebase-domain', 'router'],
    ['/api/firebase-cloud-read', 'serverFn'],
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
    ['/unrelated', 'router'],
  ])('keeps public static route %s reachable', (pathname, type) => {
    expect(shouldBlockLegacyRequest(pathname, type)).toBe(false);
  });

  it('permits exactly the Firebase-only pilot page, never a legacy or nested path', () => {
    expect(isFirebasePilotPage('/firebase-access')).toBe(true);
    expect(isFirebasePilotPage('/auth')).toBe(false);
    expect(isFirebasePilotPage('/jogadores')).toBe(false);
    expect(isFirebasePilotPage('/firebase-access/extra')).toBe(false);
    expect(isFirebasePilotPage('/api/firebase-cloud-read')).toBe(false);
  });

  it('does not confuse path prefixes', () => {
    expect(shouldBlockLegacyRequest('/apiary', 'router')).toBe(false);
    expect(shouldBlockLegacyRequest('/mcp-evasion', 'router')).toBe(false);
  });
});
