export function deletedEditionsCollection(db:unknown,snapshotId:string):unknown;
export function deletedEditionDocId(id:string):string;
export function deletedNewspaperIds(db:unknown,snapshotId:string):Promise<Set<string>>;
export function markNewspaperDeleted(db:unknown,snapshotId:string,input:{
  id:unknown;actorUid:string;draftOnly?:boolean;state?:string|null;
}):Promise<{id:string;deleted:true}>;
