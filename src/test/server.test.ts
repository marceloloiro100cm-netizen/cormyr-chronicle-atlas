import { describe, it, expect } from "vitest";
import { isH3SwallowedErrorBody } from "../server";

describe("isH3SwallowedErrorBody", () => {
  it("should return true for a valid H3 swallowed error payload", () => {
    const validBody = JSON.stringify({ unhandled: true, message: "HTTPError" });
    expect(isH3SwallowedErrorBody(validBody)).toBe(true);
  });

  it("should return false for a valid JSON payload missing expected properties", () => {
    const missingUnhandled = JSON.stringify({ message: "HTTPError" });
    expect(isH3SwallowedErrorBody(missingUnhandled)).toBe(false);

    const missingMessage = JSON.stringify({ unhandled: true });
    expect(isH3SwallowedErrorBody(missingMessage)).toBe(false);
  });

  it("should return false for a valid JSON payload with incorrect property values", () => {
    const incorrectUnhandled = JSON.stringify({ unhandled: false, message: "HTTPError" });
    expect(isH3SwallowedErrorBody(incorrectUnhandled)).toBe(false);

    const incorrectMessage = JSON.stringify({ unhandled: true, message: "OtherError" });
    expect(isH3SwallowedErrorBody(incorrectMessage)).toBe(false);
  });

  it("should return false for a valid JSON payload that is completely unrelated", () => {
    const unrelatedPayload = JSON.stringify({ foo: "bar" });
    expect(isH3SwallowedErrorBody(unrelatedPayload)).toBe(false);
  });

  it("should return false and catch the error when parsing invalid JSON string", () => {
    // These test the `catch` block directly.
    expect(isH3SwallowedErrorBody("invalid json string")).toBe(false);
    expect(isH3SwallowedErrorBody("{")).toBe(false);
    expect(isH3SwallowedErrorBody("")).toBe(false);
  });
});
