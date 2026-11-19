export type OperationalAccess = Record<string, unknown> & {
 userId:string;profile:'narrador'|'jogador'|'editor'|null;
 active:boolean;admin:boolean;requirePasswordChange:boolean;
 playerId:string|null;memberHouseIds:string[];editHouseIds:string[];
 [key:string]:any;
};
export function operationalAccessCollection(db:any,snapshotId:string):any;
export function chooseCurrentAccountAccess(
 uid:string,archived:unknown,overlay:unknown,live:unknown,
):OperationalAccess|null;
export function currentAccountAccess(
 db:any,snapshotId:string,uid:string,
):Promise<OperationalAccess|null>;
export function listCurrentAccountAccess(
 db:any,snapshotId:string,
):Promise<OperationalAccess[]>;
