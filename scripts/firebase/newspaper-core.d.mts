export class NewspaperError extends Error{
 code:string;constructor(code:string,message:string);
}
export function commissionStory(input:any):any;
export function rejectCommission(input:any):any;
export function markCommissionsSeen(input:any):any[];
export function commissionRow(input:any):Record<string,any>;
export function commissionIdsOf(blocks:unknown):string[];
