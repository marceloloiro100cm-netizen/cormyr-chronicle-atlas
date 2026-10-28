import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import server, { isH3SwallowedErrorBody } from "../server";
import { consumeLastCapturedError } from "../lib/error-capture";

vi.mock("../lib/error-capture", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/error-capture")>();
  return {
    ...actual,
    consumeLastCapturedError: vi.fn(),
  };
});

const mockFetch = vi.fn();
vi.mock("@tanstack/react-start/server-entry", () => ({
  default: {
    fetch: (...args: any[]) => mockFetch(...args),
  },
}));

describe("server", () => {
  describe("isH3SwallowedErrorBody", () => {
    it("should return true for a valid H3 swallowed error payload", () => {
      const validBody = JSON.stringify({ unhandled: true, message: "HTTPError" });
      expect(isH3SwallowedErrorBody(validBody)).toBe(true);
    });

    it("should return false for a valid JSON payload missing expected properties", () => {
      expect(isH3SwallowedErrorBody(JSON.stringify({ message: "HTTPError" }))).toBe(false);
      expect(isH3SwallowedErrorBody(JSON.stringify({ unhandled: true }))).toBe(false);
    });

    it("should return false for a valid JSON payload with incorrect property values", () => {
      expect(isH3SwallowedErrorBody(JSON.stringify({ unhandled: false, message: "HTTPError" }))).toBe(false);
      expect(isH3SwallowedErrorBody(JSON.stringify({ unhandled: true, message: "OtherError" }))).toBe(false);
    });

    it("should return false for a valid JSON payload that is completely unrelated", () => {
      expect(isH3SwallowedErrorBody(JSON.stringify({ foo: "bar" }))).toBe(false);
    });

    it("should return false and catch the error when parsing invalid JSON string", () => {
      expect(isH3SwallowedErrorBody("invalid json string")).toBe(false);
      expect(isH3SwallowedErrorBody("{")).toBe(false);
      expect(isH3SwallowedErrorBody("")).toBe(false);
    });
  });

  describe("server fetch", () => {
    let originalConsoleError: any;

    beforeEach(() => {
      mockFetch.mockReset();
      vi.mocked(consumeLastCapturedError).mockReset();
      originalConsoleError = console.error;
      console.error = vi.fn(); // Suppress console.error during tests
    });

    afterEach(() => {
      console.error = originalConsoleError;
    });

    it("should return normal response", async () => {
      const req = new Request("http://localhost/");
      mockFetch.mockResolvedValue(new Response("OK", { status: 200 }));

      const res = await server.fetch(req, {}, {});
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("OK");
    });

    it("should catch fetch error and return 500 error page", async () => {
      const req = new Request("http://localhost/");
      mockFetch.mockRejectedValue(new Error("Test server error"));

      const res = await server.fetch(req, {}, {});
      expect(res.status).toBe(500);
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(console.error).toHaveBeenCalled();
    });

    it("should normalize h3 swallowed error", async () => {
      const req = new Request("http://localhost/");
      const errorBody = JSON.stringify({ unhandled: true, message: "HTTPError" });

      mockFetch.mockResolvedValue(new Response(errorBody, {
        status: 500,
        headers: { "content-type": "application/json" }
      }));
      vi.mocked(consumeLastCapturedError).mockReturnValue(new Error("Original swallowed error"));

      const res = await server.fetch(req, {}, {});
      expect(res.status).toBe(500);
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(console.error).toHaveBeenCalledWith(expect.any(Error));
      expect(vi.mocked(console.error).mock.calls[0][0].message).toBe("Original swallowed error");
    });

    it("should normalize h3 swallowed error (fallback without original error)", async () => {
      const req = new Request("http://localhost/");
      const errorBody = JSON.stringify({ unhandled: true, message: "HTTPError" });

      mockFetch.mockResolvedValue(new Response(errorBody, {
        status: 500,
        headers: { "content-type": "application/json" }
      }));
      vi.mocked(consumeLastCapturedError).mockReturnValue(undefined);

      const res = await server.fetch(req, {}, {});
      expect(res.status).toBe(500);
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(console.error).toHaveBeenCalledWith(expect.any(Error));
      expect(vi.mocked(console.error).mock.calls[0][0].message).toContain("h3 swallowed SSR error");
    });

    it("should not normalize >= 500 responses that are not JSON", async () => {
      const req = new Request("http://localhost/");
      mockFetch.mockResolvedValue(new Response("Internal Server Error HTML", {
        status: 502,
        headers: { "content-type": "text/html" }
      }));

      const res = await server.fetch(req, {}, {});
      expect(res.status).toBe(502);
      expect(await res.text()).toBe("Internal Server Error HTML");
    });

    it("should not normalize >= 500 responses that are JSON but not swallowed errors", async () => {
      const req = new Request("http://localhost/");
      const errorBody = JSON.stringify({ error: "Something else" });
      mockFetch.mockResolvedValue(new Response(errorBody, {
        status: 500,
        headers: { "content-type": "application/json" }
      }));

      const res = await server.fetch(req, {}, {});
      expect(res.status).toBe(500);
      expect(await res.text()).toBe(errorBody);
    });
  });
});
