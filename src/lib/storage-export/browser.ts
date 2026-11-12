import { inventory, sameInventory } from "./core";
import type { ExportBucket, ExportEntry, Listing } from "./core";
// Minimal File System Access interfaces; unsupported browsers get a visible fallback instruction.
export type FileHandle = {
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: Blob | string): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
};
export type Directory = {
  getDirectoryHandle(name: string, options: { create: boolean }): Promise<Directory>;
  getFileHandle(name: string, options: { create: boolean }): Promise<FileHandle>;
};
type RecordEntry = ExportEntry & { sha256: string };
type Manifest = { version: 1; bucket: ExportBucket; complete: boolean; files: RecordEntry[] };
async function hash(file: Blob) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
async function write(handle: FileHandle, content: Blob | string) {
  const stream = await handle.createWritable();
  try {
    await stream.write(content);
    await stream.close();
  } catch (e) {
    await stream.abort().catch(() => {});
    throw e;
  }
}
async function target(root: Directory, path: string, create: boolean) {
  const parts = path.split("/");
  let dir = root;
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create });
  return dir.getFileHandle(parts.at(-1)!, { create });
}
export async function exportBucket(options: {
  root: Directory;
  bucket: ExportBucket;
  list: (prefix: string, offset: number) => Promise<Listing>;
  sign: (path: string) => Promise<{ url: string }>;
  signal: AbortSignal;
  progress: (message: string) => void;
}) {
  const { root, bucket, list, sign, signal, progress } = options;
  const check = () => {
    if (signal.aborted)
      throw new Error("Exportação pausada. Selecione a mesma pasta para retomar.");
  };
  const scan = () =>
    inventory(async (prefix, offset) => {
      check();
      return list(prefix, offset);
    });
  progress("Conferindo todas as pastas…");
  const before = await scan();
  const dir = await root.getDirectoryHandle(bucket, { create: true });
  const meta = await root.getFileHandle(`${bucket}.manifest.json`, { create: true });
  let prior: Manifest | null = null;
  try {
    const raw = JSON.parse(await (await meta.getFile()).text());
    if (raw.version === 1 && raw.bucket === bucket && Array.isArray(raw.files)) prior = raw;
  } catch {
    /* Empty/new checkpoint is not a completed backup. */
  }
  const completed: RecordEntry[] = [];
  const save = async (complete: boolean) =>
    write(meta, JSON.stringify({ version: 1, bucket, complete, files: completed }, null, 2));
  // Mark incomplete before any writes, including after a previous successful run.
  await save(false);
  for (const entry of before) {
    check();
    progress(`${completed.length}/${before.length} arquivos · ${entry.path}`);
    if (entry.size > 128 * 1024 * 1024)
      throw new Error(
        "Arquivo acima de 128 MB: exportação requer ferramenta de streaming. Os demais arquivos salvos permanecem na pasta.",
      );
    const old = prior?.files.find(
      (f) =>
        f.path === entry.path &&
        f.id === entry.id &&
        f.updatedAt === entry.updatedAt &&
        f.size === entry.size,
    );
    if (old) {
      try {
        const local = await (await target(dir, entry.path, false)).getFile();
        if (local.size === entry.size && (await hash(local)) === old.sha256) {
          completed.push(old);
          await save(false);
          continue;
        }
      } catch {
        /* Re-download missing or corrupt local file. */
      }
    }
    const { url } = await sign(entry.path);
    const response = await fetch(url, { signal, cache: "no-store", credentials: "omit" });
    if (!response.ok) throw new Error("Download interrompido. Retome selecionando a mesma pasta.");
    const blob = await response.blob();
    if (blob.size !== entry.size)
      throw new Error(
        "Tamanho diferente da origem. Retome quando os arquivos não estiverem sendo alterados.",
      );
    const sha256 = await hash(blob),
      handle = await target(dir, entry.path, true);
    await write(handle, blob);
    if ((await hash(await handle.getFile())) !== sha256)
      throw new Error("Falha na conferência do arquivo gravado.");
    completed.push({ ...entry, sha256 });
    await save(false);
  }
  check();
  progress("Conferindo se a origem mudou durante a cópia…");
  if (!sameInventory(before, await scan()))
    throw new Error(
      "A origem mudou durante a exportação. Selecione a mesma pasta e execute novamente.",
    );
  await save(true);
  progress(`${completed.length} arquivos exportados e conferidos. Manifesto salvo junto à pasta.`);
}
