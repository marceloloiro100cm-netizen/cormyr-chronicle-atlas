/** Typed signature for the private, service-only immutable workspace reader. */
export const WORKSPACE_ROOT:string;
export const workspaceTables:ReadonlySet<string>;
export function readWorkspaceTable(
  db:unknown,snapshotId:string,table:string
):Promise<Record<string,unknown>[]>;
