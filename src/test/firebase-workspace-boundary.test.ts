import {describe,it,expect} from 'vitest';
import {shouldBlockLegacyRequest} from '@/lib/archive-only';

describe('official Firebase council request boundary',()=>{
 it('lets the exact workspace API reach its Firebase authentication handler',()=>{
  expect(shouldBlockLegacyRequest('/api/firebase-workspace','api')).toBe(false);
 });
 it('does not reopen legacy server functions or adjacent API routes',()=>{
  expect(shouldBlockLegacyRequest('/api/firebase-workspace','serverFn')).toBe(true);
  for(const path of ['/api/firebase-workspace/','/api/firebase-workspace-extra','/api/legacy','/mcp'])
   expect(shouldBlockLegacyRequest(path,'api')).toBe(true);
 });
});
