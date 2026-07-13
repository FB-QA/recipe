import { describe, it, expect } from "vitest";
import { isSafeImportUrl } from "@/lib/import/url-guard";

describe("isSafeImportUrl", () => {
  it("blocks non-http(s) schemes and junk", async () => {
    expect(await isSafeImportUrl("file:///etc/passwd")).toBe(false);
    expect(await isSafeImportUrl("ftp://example.com")).toBe(false);
    expect(await isSafeImportUrl("not a url")).toBe(false);
  });

  it("blocks private, link-local, and cloud-metadata addresses", async () => {
    expect(await isSafeImportUrl("http://10.0.0.1/x")).toBe(false);
    expect(await isSafeImportUrl("http://192.168.1.1/x")).toBe(false);
    expect(await isSafeImportUrl("http://172.16.9.9/x")).toBe(false);
    expect(await isSafeImportUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(await isSafeImportUrl("http://100.64.0.1/x")).toBe(false);
  });

  it("allows a public address", async () => {
    expect(await isSafeImportUrl("https://1.1.1.1/recipe")).toBe(true);
  });
});
