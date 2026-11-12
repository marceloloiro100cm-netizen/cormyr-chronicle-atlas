export const EXPORT_BUCKETS = [
  "campaign-images",
  "campaign-newspapers",
  "campaign-newspaper-staff",
  "campaign-newspaper-commissions",
  "campaign-newspaper-engravings",
] as const;
export type ExportBucket = (typeof EXPORT_BUCKETS)[number];
export type ExportEntry = { path: string; id: string; updatedAt: string; size: number };
export function safePath(path: string, empty = false): boolean {
  return (
    (empty && path === "") ||
    (path.length > 0 &&
      path.length <= 1024 &&
      path
        .split("/")
        .every(
          (part) =>
            part.length > 0 &&
            ![".", ".."].includes(part) &&
            !/[\\\x00-\x1f<>:"|?*]/.test(part) &&
            !/[. ]$/.test(part) &&
            !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part),
        ))
  );
}
export async function authorizeExport(client: {
  rpc: (name: "is_campaign_admin") => PromiseLike<{ data: unknown; error: unknown }>;
}) {
  const role = await client.rpc("is_campaign_admin");
  if (role.error || role.data !== true) throw new Error("Acesso restrito ao Narrador.");
}
export type Listing = { folders: string[]; files: ExportEntry[]; nextOffset: number | null };
export async function inventory(
  list: (prefix: string, offset: number) => Promise<Listing>,
): Promise<ExportEntry[]> {
  const folders = [""],
    seenFolders = new Set([""]),
    files = new Map<string, ExportEntry>();
  const folded = new Set<string>([""]);
  for (let i = 0; i < folders.length; i++) {
    let offset: number | null = 0;
    do {
      const page: Listing = await list(folders[i]!, offset);
      for (const folder of page.folders) {
        if (!safePath(folder) || seenFolders.has(folder) || folded.has(folder.toLowerCase()))
          throw new Error("Pasta inválida ou repetida na origem.");
        seenFolders.add(folder);
        folded.add(folder.toLowerCase());
        folders.push(folder);
      }
      for (const file of page.files) {
        if (!safePath(file.path) || files.has(file.path) || folded.has(file.path.toLowerCase()))
          throw new Error("Caminho duplicado ou incompatível com exportação.");
        files.set(file.path, file);
        folded.add(file.path.toLowerCase());
      }
      if (page.nextOffset !== null && page.nextOffset <= offset)
        throw new Error("Paginação inválida.");
      offset = page.nextOffset;
    } while (offset !== null);
  }
  return [...files.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
export function sameInventory(a: ExportEntry[], b: ExportEntry[]) {
  return JSON.stringify(a) === JSON.stringify(b);
}
