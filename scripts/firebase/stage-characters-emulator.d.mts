export function buildCharacterPlan(tables:Array<{table:string;rows:Record<string,unknown>[]}>,snapshotId:string):{
 summary:{planValid:boolean};docs:{
  characters:Array<{id:string;payload:any}>;
  links:Array<{id:string;payload:any}>;
  transitions:Array<{id:string;payload:any}>;
 };
};
