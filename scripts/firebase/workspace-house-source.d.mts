/** Server-only type contract for authentic House source projections. */
export class HouseSourceError extends Error {
  readonly code:string;
  readonly status:number;
  constructor(code?:string,status?:number);
}
export type ImportedHouseViewer={
  uid:string;
  profile:'narrador'|'jogador';
  playerId:string|null;
  memberHouseIds:string[];
};
export function loadImportedHouseSheets(
  db:unknown,snapshotId:string,viewer:ImportedHouseViewer,
  houseId?:string,
):Promise<unknown>;
