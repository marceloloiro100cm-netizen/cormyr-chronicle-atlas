/** Type contract for the server-only Firebase Cloud read boundary. */
export class CloudAccessError extends Error {
  readonly code:string;
  readonly status:number;
  constructor(code:string,status?:number);
}

export interface FirebaseCloudReadonly {
  session(idToken:string):Promise<unknown>;
  listHouses(idToken:string):Promise<unknown>;
  getHouse(idToken:string,houseId:unknown):Promise<unknown>;
  getCalendar(idToken:string):Promise<unknown>;
}

export function createFirebaseCloudReadonly(config:{
  auth:{
    verifyIdToken(token:string,checkRevoked:boolean):Promise<{uid:string}>;
    getUser(uid:string):Promise<{uid:string;disabled:boolean}>;
  };
  db:{collection(name:string):any};
  snapshotId:string;
  projectId:string;
  enabled?:boolean;
  env?:Record<string,string|undefined>;
}):FirebaseCloudReadonly;
