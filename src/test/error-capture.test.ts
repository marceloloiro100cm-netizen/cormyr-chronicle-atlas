import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { describeError, consumeLastCapturedError } from "@/lib/error-capture";

describe("error-capture", () => {
  describe("describeError", () => {
    it("handles plain strings", () => {
      expect(describeError("just a string error")).toBe("just a string error");
    });

    it("handles plain objects", () => {
      expect(describeError({ foo: "bar" })).toBe('{"foo":"bar"}');
    });

    it("handles circular objects gracefully", () => {
      const obj: any = { foo: "bar" };
      obj.self = obj;
      expect(describeError(obj)).toBe("[object Object]");
    });

    it("handles null and undefined", () => {
      expect(describeError(null)).toBe("");
      expect(describeError(undefined)).toBe("");
    });

    it("formats standard Error", () => {
      const error = new Error("Something went wrong");
      // The output relies on error.stack, which includes "Error: Something went wrong\n    at..."
      const result = describeError(error);
      expect(result).toContain("Error: Something went wrong");
      expect(result).toContain("error-capture.test.ts");
    });

    it("formats Error without a stack trace", () => {
      const error = new Error("No stack here");
      error.stack = undefined; // simulate missing stack
      const result = describeError(error);
      expect(result).toBe("Error: No stack here");
    });

    it("formats Error with status and statusCode properties", () => {
      const error = new Error("HTTP error") as any;
      error.status = 500;
      error.stack = undefined;
      expect(describeError(error)).toBe("Error: HTTP error (status 500)");

      const error2 = new Error("HTTP error 2") as any;
      error2.statusCode = 404;
      error2.stack = undefined;
      expect(describeError(error2)).toBe("Error: HTTP error 2 (status 404)");
    });

    it("follows error causes", () => {
      const rootError = new Error("Root cause");
      rootError.stack = "Error: Root cause\n  at root()";

      const middleError = new Error("Middle error", { cause: rootError });
      middleError.stack = "Error: Middle error\n  at middle()";

      const topError = new Error("Top error", { cause: middleError });
      topError.stack = "Error: Top error\n  at top()";

      const result = describeError(topError);

      expect(result).toBe(
        "Error: Top error\n  at top()\n" +
        "caused by: Error: Middle error\n  at middle()\n" +
        "caused by: Error: Root cause\n  at root()"
      );
    });

    it("limits cause depth to 5", () => {
      let currentError = new Error("Level 0");
      currentError.stack = "Error: Level 0";

      for (let i = 1; i <= 6; i++) {
        const nextError = new Error(`Level ${i}`, { cause: currentError });
        nextError.stack = `Error: Level ${i}`;
        currentError = nextError;
      }

      const result = describeError(currentError);

      // Since max depth is 5, it should show levels 6, 5, 4, 3, 2 and drop 1 and 0.
      expect(result).toContain("Error: Level 6");
      expect(result).toContain("Error: Level 5");
      expect(result).toContain("Error: Level 4");
      expect(result).toContain("Error: Level 3");
      expect(result).toContain("Error: Level 2");
      expect(result).not.toContain("Error: Level 1");
      expect(result).not.toContain("Error: Level 0");
    });

    it("limits description length to 8000 chars", () => {
      const longMessage = "a".repeat(10000);
      const error = new Error(longMessage);
      error.stack = `Error: ${longMessage}`;

      const result = describeError(error);
      expect(result.length).toBe(8000);
    });
  });

  describe("consumeLastCapturedError and console.error override", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Reset the captured error state by consuming it
      consumeLastCapturedError();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("captures errors passed to console.error", () => {
      const error = new Error("Test error");
      const originalConsoleError = console.error;

      // Temporarily mock console.error to avoid logging during test
      const mockConsoleError = vi.fn();
      console.error = mockConsoleError;

      try {
        // This triggers the overridden console.error which records the error
        originalConsoleError(error);

        const captured = consumeLastCapturedError();
        expect(captured).toBe(error);
      } finally {
        console.error = originalConsoleError;
      }
    });

    it("expires captured error after TTL", () => {
      const error = new Error("Test error");
      const originalConsoleError = console.error;

      const mockConsoleError = vi.fn();
      console.error = mockConsoleError;

      try {
        originalConsoleError(error);

        // Advance time past TTL (5000ms)
        vi.advanceTimersByTime(5001);

        const captured = consumeLastCapturedError();
        expect(captured).toBeUndefined();
      } finally {
        console.error = originalConsoleError;
      }
    });

    it("returns undefined if no error captured", () => {
      expect(consumeLastCapturedError()).toBeUndefined();
    });
  });
});
