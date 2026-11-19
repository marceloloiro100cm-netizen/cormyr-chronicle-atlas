/** Type contract for the server-only Firebase Cloud read boundary. */
export class CloudAccessError extends Error {
  readonly code:string;
  readonly status:number;
  constructor(code:string,status?:number);
}

export interface FirebaseCloudReadonly {
  session(idToken:string):Promise<unknown>;
  /** Aggregate workspace import counts, restricted to authenticated Narrator. */
  inspectWorkspaceImport(idToken:string):Promise<unknown>;
  /** Relationship counts only; no record content or source identifiers. */
  inspectWorkspaceLinks(idToken:string):Promise<unknown>;
  /** Internal server authorization for the original mail filter projection. */
  workspaceMailScope(idToken:string):Promise<{
    uid:string;
    profile:'jogador'|'narrador';
    playerId:string|null;
    memberHouseIds:string[];
  }>;
  /** Narrator-only, on-demand read of unresolved accounts. Never mutates. */
  listAccessRemediation(idToken:string):Promise<unknown>;
  /** Nonmutating preview with current server-verified profile and House data. */
  previewAccessRemediation(idToken:string,targetUid:unknown,proposal:unknown):Promise<unknown>;
  listHouses(idToken:string):Promise<unknown>;
  getHouse(idToken:string,houseId:unknown):Promise<unknown>;
  getCalendar(idToken:string):Promise<unknown>;
  listMailbox(idToken:string):Promise<unknown>;
  listNewspaper(idToken:string):Promise<unknown>;
  getNewspaper(idToken:string,editionId:unknown):Promise<unknown>;
  listSpyAgents(idToken:string,houseId:unknown):Promise<unknown>;
  listSpyDossiers(idToken:string,houseId:unknown):Promise<unknown>;
  listHouseBattles(idToken:string,houseId:unknown):Promise<unknown>;
}

export function createFirebaseCloudReadonly(config:{
  auth:{
    verifyIdToken(token:string,checkRevoked:boolean):Promise<{uid:string}>;
    getUser(uid:string):Promise<{uid:string;disabled:boolean;email?:string}>;
  };
  db:{collection(name:string):any};
  snapshotId:string;
  projectId:string;
  enabled?:boolean;
  env?:Record<string,string|undefined>;
}):FirebaseCloudReadonly;
