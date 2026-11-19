/** Source-specific, server-authoritative mail read receipt identities. */
export type MailReceiptSource='imported'|'firebase-cloud';
export const MAIL_SOURCES:readonly MailReceiptSource[];
export function validMailIdentity(source:unknown,id:unknown):boolean;
export function mailReceiptId(uid:string,source:MailReceiptSource,id:string):string;
export function canAcknowledgeMail(actor:unknown,record:unknown,source:MailReceiptSource,id:string):boolean;
