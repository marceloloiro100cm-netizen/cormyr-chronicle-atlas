/**
 * Private read-only access-graph validator for the PostgreSQL -> Firebase
 * migration. This is NOT an authorization implementation or a cloud import.
 * Emits counts only: never reveal UID, email, house, player name or letters.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadVerifiedPrivateTables } from './stage-firestore-emulator.mjs';

const REQUIRED = [
  'auth.users',
  'public.campaign_players',
  'public.campaign_houses',
  'public.house_memberships',
  'public.user_roles',
  'public.campaign_access_profiles',
];

function flag(row, field) {
  const value = row?.[field];
  if (value === 't' || value === 'true') return true;
  if (value === 'f' || value === 'false') return false;
  return value === null || value === undefined ? null : 'invalid';
}

function oneString(v) { return typeof v === 'string' && v.length > 0 ? v : null; }

export function assessPrivateAccessGraph(tables) {
  if (!Array.isArray(tables)) throw new Error('Invalid private source tables');
  const source = new Map(tables.map(entry => [entry.table,entry]));
  const missingTables = REQUIRED.filter(name => !source.has(name));
  const rows = name => source.get(name)?.rows || [];
  const stats = {
    sourceAuthAccounts: rows('auth.users').length,
    players: rows('public.campaign_players').length,
    houses: rows('public.campaign_houses').length,
    memberships: rows('public.house_memberships').length,
    accessProfiles: rows('public.campaign_access_profiles').length,
    adminRoleRecords: 0, editorProfiles: 0, narratorProfiles: 0,
    playerProfiles: 0, accountsWithoutAccessProfile: 0,
    orphanPlayers: 0, duplicatePlayerAccounts: 0,
    orphanMembershipPlayers: 0, missingMembershipHouses: 0,
    orphanProfiles: 0, orphanAdminRoles: 0,
    narratorRoleConflicts: 0,
    editorsWithHouseMembership: 0, editorsWithRosterHouse: 0,
    editorsWithAdminRole: 0,
    invalidAccessProfiles: 0, invalidPermissionFlags: 0,
  };

  const userIds = new Set(rows('auth.users').map(u=>oneString(u?.id)).filter(Boolean));
  const playersById = new Map();
  const playerByUid = new Map();
  const houseIds = new Set(rows('public.campaign_houses').map(h=>oneString(h?.id)).filter(Boolean));
  const adminIds = new Set();
  const profiles = new Map();
  const editorUserIds = new Set();

  for (const p of rows('public.campaign_players')) {
    const playerId = oneString(p.id);
    const uid = oneString(p.user_id);
    if (playerId) playersById.set(playerId,p);
    if (uid) {
      if (!userIds.has(uid)) stats.orphanPlayers++;
      if (playerByUid.has(uid)) stats.duplicatePlayerAccounts++;
      playerByUid.set(uid,p);
    }
    for(const field of ['active','require_password_change']) {
      if (Object.hasOwn(p,field) && flag(p,field)==='invalid') stats.invalidPermissionFlags++;
    }
  }

  for(const role of rows('public.user_roles')) {
    const uid=oneString(role.user_id);
    if (role.role!=='admin') continue;
    stats.adminRoleRecords++;
    if (!uid || !userIds.has(uid)) stats.orphanAdminRoles++;
    if (uid) adminIds.add(uid);
  }

  for (const a of rows('public.campaign_access_profiles')) {
    const uid=oneString(a.user_id);
    if (!uid || !userIds.has(uid)) stats.orphanProfiles++;
    if (!['jogador','editor','narrador'].includes(a.profile) || (uid && profiles.has(uid))) {
      stats.invalidAccessProfiles++;
      continue;
    }
    if (Object.hasOwn(a,'active') && flag(a,'active')==='invalid') stats.invalidPermissionFlags++;
    if(uid) profiles.set(uid,a);
    if(a.profile==='jogador') stats.playerProfiles++;
    if(a.profile==='editor') {
      stats.editorProfiles++;
      if(uid) editorUserIds.add(uid);
    }
    if(a.profile==='narrador') stats.narratorProfiles++;
  }

  for(const uid of userIds) if(!profiles.has(uid)) stats.accountsWithoutAccessProfile++;

  for(const uid of new Set([...profiles.keys(),...adminIds])) {
    const profile=profiles.get(uid)?.profile;
    if ((profile==='narrador')!==adminIds.has(uid)) stats.narratorRoleConflicts++;
  }

  for (const m of rows('public.house_memberships')) {
    const playerId=oneString(m.player_id);
    const houseId=oneString(m.house_id);
    if (!playerId || !playersById.has(playerId)) {
      stats.orphanMembershipPlayers++;
    } else {
      const player=playersById.get(playerId);
      if(editorUserIds.has(player.user_id)) stats.editorsWithHouseMembership++;
    }
    if(!houseId || !houseIds.has(houseId)) stats.missingMembershipHouses++;
    for(const field of ['can_edit','can_edit_attributes']) {
      if(Object.hasOwn(m,field) && flag(m,field)==='invalid') stats.invalidPermissionFlags++;
    }
  }
  for (const uid of editorUserIds) {
    const p=playerByUid.get(uid);
    if(p && oneString(p.roster_house_id)) stats.editorsWithRosterHouse++;
    if(adminIds.has(uid)) stats.editorsWithAdminRole++;
  }

  const blockers = Object.entries(stats)
    .filter(([name,amount]) => amount > 0 && (
      name.startsWith('orphan') || name.startsWith('duplicate') ||
      name.startsWith('missingMembership') || name.startsWith('narratorRole') ||
      name.startsWith('editorsWith') || name.startsWith('invalid')
    )).map(([name,amount])=>({reason:name,count:amount}));

  return {
    formatVersion:1,
    scope:'private-offline-access-graph',
    missingRequiredTables: missingTables,
    counts:stats,
    blockers,
    internallyConsistent: missingTables.length===0 && blockers.length===0,
    cloudWrites:0,
    sourceLiveReconciled:false,
    firestoreRulesPublished:false,
    readyForCloudAuthorization:false,
    rolePolicy: [
      'Narrador: requires an authoritative admin role and narrator profile',
      'Editor: never inherits house membership and cannot send or read letters',
      'Jogador: house access requires active player, password policy, current membership',
      'Roster house or selected house in UI never grants authorization',
      'No custom claims alone for immediate revocation or private letter access',
    ],
  };
}

export async function auditPrivateAccessGraph(normalized) {
  const {tables} = await loadVerifiedPrivateTables(normalized);
  return assessPrivateAccessGraph(tables);
}

if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  if(process.argv.length!==3) {
    console.error('Usage: node scripts/firebase/audit-private-access-graph.mjs PRIVATE_NORMALIZED_DIR');
    process.exitCode=2;
  } else {
    auditPrivateAccessGraph(process.argv[2])
      .then(output=>process.stdout.write(JSON.stringify(output,null,2)+'\n'))
      .catch(()=>{console.error('Private access audit blocked. No identifiers or rows printed.');process.exitCode=1;});
  }
}
