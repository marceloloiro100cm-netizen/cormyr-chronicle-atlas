import { describe, it, expect, vi } from "vitest";
import { isH3SwallowedErrorBody, normalizeCatastrophicSsrResponse, preventStaleWorkspaceHtml } from "../server";
import { renderErrorPage } from "../lib/error-page";

describe("normalizeCatastrophicSsrResponse", () => {
  it("should return the original response if status < 500", async () => {
    const response = new Response("ok", { status: 200 });
    const result = await normalizeCatastrophicSsrResponse(response);
    expect(result).toBe(response);
  });

  it("should return the original response if status is 500 but content-type is not application/json", async () => {
    const response = new Response("error", {
      status: 500,
      headers: { "content-type": "text/plain" },
    });
    const result = await normalizeCatastrophicSsrResponse(response);
    expect(result).toBe(response);
  });

  it("should return the original response if status is 500 and content-type is application/json but body is not h3 swallowed error", async () => {
    const response = new Response(JSON.stringify({ error: "Standard error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
    const result = await normalizeCatastrophicSsrResponse(response);
    expect(result).toBe(response);
  });

  it("should return a new 500 HTML response if it is a swallowed h3 error", async () => {
    const response = new Response(
      JSON.stringify({ unhandled: true, message: "HTTPError" }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await normalizeCatastrophicSsrResponse(response);

    expect(result).not.toBe(response);
    expect(result.status).toBe(500);
    expect(result.headers.get("content-type")).toBe("text/html; charset=utf-8");
    const bodyText = await result.text();
    expect(bodyText).toBe(renderErrorPage());

    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

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

describe("Firebase editor HTML is never cached across App Hosting releases", () => {
  it.each(['/firebase-access','/auth','/reset-password','/jornal'])(
    "marks %s HTML as private no-store while preserving headers and contents",
    async (path) => {
      const response = new Response("<main>Redação</main>",{
        status:200,headers:{'Content-Type':'text/html; charset=utf-8',
          'Set-Cookie':'session=example; HttpOnly','ETag':'"version-1"'},
      });
      const result=preventStaleWorkspaceHtml(
        new Request('https://atlas.cormyr.com.br'+path),response);
      expect(result).not.toBe(response);
      expect(result.headers.get('cache-control')).toContain('no-store');
      expect(result.headers.get('set-cookie')).toBe('session=example; HttpOnly');
      expect(result.headers.get('etag')).toBe('"version-1"');
      expect(await result.text()).toContain('Redação');
    });
  it("does not change APIs, asset responses, POST, or non-HTML content",()=>{
    const scenarios=[
      ['https://atlas.cormyr.com.br/api/firebase-newspaper-staff-photo','GET','text/html'],
      ['https://atlas.cormyr.com.br/assets/main-old.js','GET','text/html'],
      ['https://atlas.cormyr.com.br/firebase-access','POST','text/html'],
      ['https://atlas.cormyr.com.br/firebase-access','GET','application/json'],
    ] as const;
    for(const [url,method,contentType] of scenarios){
      const response=new Response('ok',{headers:{'content-type':contentType,
        'Cache-Control':'public, max-age=3600'}});
      expect(preventStaleWorkspaceHtml(new Request(url,{method}),response)).toBe(response);
    }
  });
});
