import { File as NodeFile, Blob as NodeBlob } from "node:buffer";
import { webcrypto } from "node:crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { authorizeExport, inventory, safePath } from "../lib/storage-export/core";
import { exportBucket } from "../lib/storage-export/browser";
import type { Directory, FileHandle } from "../lib/storage-export/browser";
const entry = { path: "public-house/ashkar/0.png", id: "id", updatedAt: "2026-11-12", size: 3 };
function disk() {
  const files = new Map<string, Blob>();
  const dir = (prefix = ""): Directory => ({
    getDirectoryHandle: async (name) => dir(`${prefix}${name}/`),
    getFileHandle: async (name, { create }) => {
      const path = prefix + name;
      if (!create && !files.has(path)) throw new Error("missing");
      return {
        getFile: async () => new File([files.get(path) ?? ""], name),
        createWritable: async () => {
          let pending: Blob;
          return {
            write: async (value) => {
              pending = new Blob([value]);
            },
            close: async () => {
              files.set(path, pending);
            },
            abort: async () => {},
          };
        },
      };
    },
  });
  return { root: dir(), files };
}
beforeEach(() => {
  vi.stubGlobal("File", NodeFile);
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => vi.unstubAllGlobals());
describe("storage export", () => {
  it("fails closed for non-admin, errors, truthy non-booleans", async () => {
    for (const data of [false, null, "true", 1])
      await expect(authorizeExport({ rpc: async () => ({ data, error: null }) })).rejects.toThrow();
    await expect(
      authorizeExport({ rpc: async () => ({ data: true, error: { message: "failed" } }) }),
    ).rejects.toThrow();
    await expect(
      authorizeExport({ rpc: async () => ({ data: true, error: null }) }),
    ).resolves.toBeUndefined();
  });
  it("rejects traversal and platform aliases", () => {
    for (const path of ["../x", "/x", "a//b", "a\\b", "a/CON.png", "a/x.", "a/./b"])
      expect(safePath(path)).toBe(false);
    expect(safePath(entry.path)).toBe(true);
  });
  it("walks folders and all pages, including empty folders", async () => {
    const calls: string[] = [];
    const result = await inventory(async (prefix, offset) => {
      calls.push(`${prefix}:${offset}`);
      return prefix === ""
        ? {
            folders: offset === 0 ? ["public-house", "empty"] : [],
            files: [],
            nextOffset: offset === 0 ? 100 : null,
          }
        : prefix === "public-house"
          ? { folders: [], files: [entry], nextOffset: null }
          : { folders: [], files: [], nextOffset: null };
    });
    expect(result).toEqual([entry]);
    expect(calls).toEqual([":0", ":100", "public-house:0", "empty:0"]);
  });
  it("rejects repeated pages and case collisions", async () => {
    await expect(
      inventory(async () => ({ folders: [], files: [], nextOffset: 0 })),
    ).rejects.toThrow("Paginação");
    await expect(
      inventory(async () => ({ folders: ["House", "house"], files: [], nextOffset: null })),
    ).rejects.toThrow();
  });
  it("preserves paths, resumes verified files and repairs corrupt copies", async () => {
    const { root, files } = disk();
    const fetcher = vi.fn(async () => new Response("abc"));
    vi.stubGlobal("fetch", fetcher);
    const opts = {
      root,
      bucket: "campaign-images" as const,
      list: async () => ({ folders: [], files: [entry], nextOffset: null }),
      sign: async () => ({ url: "https://example.test/signed" }),
      signal: new AbortController().signal,
      progress: () => {},
    };
    await exportBucket(opts);
    expect(await files.get(`campaign-images/${entry.path}`)?.text()).toBe("abc");
    expect(JSON.parse(await files.get("campaign-images.manifest.json")!.text()).complete).toBe(
      true,
    );
    await exportBucket(opts);
    expect(fetcher).toHaveBeenCalledTimes(1);
    files.set(`campaign-images/${entry.path}`, new Blob(["bad"]));
    await exportBucket(opts);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("keeps incomplete checkpoint for changed source or truncated downloads", async () => {
    const { root, files } = disk();
    vi.stubGlobal("fetch", async () => new Response("abc"));
    let scans = 0;
    const opts = {
      root,
      bucket: "campaign-images" as const,
      list: async () => ({
        folders: [],
        files: [{ ...entry, updatedAt: String(scans++) }],
        nextOffset: null,
      }),
      sign: async () => ({ url: "https://example.test/signed" }),
      signal: new AbortController().signal,
      progress: () => {},
    };
    await expect(exportBucket(opts)).rejects.toThrow("origem mudou");
    expect(JSON.parse(await files.get("campaign-images.manifest.json")!.text()).complete).toBe(
      false,
    );
    vi.stubGlobal("fetch", async () => new Response("ab"));
    await expect(exportBucket(opts)).rejects.toThrow("Tamanho diferente");
  });
  it("stops before access when paused", async () => {
    const abort = new AbortController();
    abort.abort();
    const list = vi.fn();
    await expect(
      exportBucket({
        root: disk().root,
        bucket: "campaign-images",
        list,
        sign: vi.fn(),
        signal: abort.signal,
        progress: () => {},
      }),
    ).rejects.toThrow("pausada");
    expect(list).not.toHaveBeenCalled();
  });
});
