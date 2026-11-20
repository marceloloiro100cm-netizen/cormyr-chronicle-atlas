export const SESSION_MS:number;
export const ACTIONS:Set<string>;
export class PrivateGmError extends Error{code:string;}
export function startRepresentation(input:{
 actorUid:string;
 player:{id:string;userId:string;active:boolean;requirePasswordChange:boolean};
 playerAccess:any;now?:Date;
}):{session:{actor:string;playerId:string;startedAt:string;expiresAt:string};
 audit:{actor:string;targetPlayer:string;action:string;details:object;createdAt:string}};
export function requireSession(input:{
 session:any;player:any;playerAccess:any;now?:Date;
}):{role:string;uid:string;playerId:string;
 memberHouseIds:Set<string>;editHouseIds:Set<string>};
