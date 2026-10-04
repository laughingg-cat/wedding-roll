// @vitest-environment node

import { describe, expect, it } from "vitest";

import { csv, sha256 } from "./export-utils";

describe("export utilities", () => {
  it("escapes commas, quotes, and newlines in CSV manifests", () => {
    expect(csv([["name", "note"], ["Maya, Jr.", "said \"hi\"\nthen left"]])).toBe(
      'name,note\n"Maya, Jr.","said ""hi""\nthen left"\n',
    );
  });

  it("neutralizes spreadsheet formulas in guest-controlled cells", () => {
    expect(csv([["name"], ["=HYPERLINK(\"https://bad.example\")"], [" +SUM(1,2)"]])).toBe(
      'name\n"\'=HYPERLINK(""https://bad.example"")"\n"\' +SUM(1,2)"\n',
    );
  });

  it("creates stable sha256 checksums", () => {
    expect(sha256(Buffer.from("wedding"))).toBe("afd1a8fffb87f7a091c924e0b851f41be19d55450cf7946a5f03cc02221b6481");
  });
});
