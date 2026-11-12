import { describe, it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), headers: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware() {
      return this;
    },
    inputValidator() {
      return this;
    },
    handler(fn: unknown) {
      return fn;
    },
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: mocks.headers }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { storage: { from: mocks.from } },
}));
import { listExportFiles, signExportFile } from "../lib/storage-export.functions";
const call = (fn: unknown, data: unknown, role: unknown) =>
  (fn as (args: unknown) => Promise<unknown>)({
    data,
    context: { supabase: { rpc: async () => ({ data: role, error: null }) } },
  });
beforeEach(() => vi.clearAllMocks());
describe("export privileged boundary", () => {
  it("never accesses service client for player requests", async () => {
    for (const fn of [listExportFiles, signExportFile])
      await expect(
        call(fn, { bucket: "campaign-images", path: "private.png", prefix: "", offset: 0 }, false),
      ).rejects.toThrow("Narrador");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("lists bounded pages after fresh database authorization", async () => {
    const list = vi.fn(async () => ({
      error: null,
      data: [
        { name: "house", id: null, metadata: null },
        { name: "x.png", id: "id", updated_at: "date", metadata: { size: 3 } },
      ],
    }));
    mocks.from.mockReturnValue({ list });
    expect(
      await call(listExportFiles, { bucket: "campaign-images", prefix: "", offset: 100 }, true),
    ).toEqual({
      folders: ["house"],
      files: [{ path: "x.png", id: "id", updatedAt: "date", size: 3 }],
      nextOffset: null,
    });
    expect(list).toHaveBeenCalledWith("", {
      limit: 100,
      offset: 100,
      sortBy: { column: "name", order: "asc" },
    });
    expect(mocks.headers).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });
  it("returns only a short-lived download URL", async () => {
    const createSignedUrl = vi.fn(async () => ({
      error: null,
      data: { signedUrl: "https://example.test/download" },
    }));
    mocks.from.mockReturnValue({ createSignedUrl });
    expect(
      await call(signExportFile, { bucket: "campaign-images", path: "private.png" }, true),
    ).toEqual({ url: "https://example.test/download" });
    expect(createSignedUrl).toHaveBeenCalledWith("private.png", 60);
  });
});
