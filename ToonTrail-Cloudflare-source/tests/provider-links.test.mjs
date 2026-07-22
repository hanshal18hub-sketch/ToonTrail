import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const worker = await readFile(
  new URL("../server/worker-template.js", import.meta.url),
  "utf8",
);
const start = worker.indexOf("const knownOfficialLinks");
const end = worker.indexOf("const mediaFromRow", start);
assert.notEqual(start, -1, "known official link definitions must exist");
assert.notEqual(end, -1, "provider link block must be extractable");

const context = vm.createContext({ URL, encodeURIComponent });
vm.runInContext(
  `${worker.slice(start, end)}; globalThis.providerDiscoveryLinks = providerDiscoveryLinks;`,
  context,
);

test("Witch Hat Atelier resolves to its confirmed official reading page", () => {
  const links = context.providerDiscoveryLinks({
    id: 1038865,
    english_title: "Witch Hat Atelier",
    romaji_title: "Tongari Boushi no Atelier",
    kind: "Manga",
  });

  assert.equal(links.length, 1);
  assert.equal(links[0].type, "OFFICIAL_READING_PAGE");
  assert.equal(links[0].url, "https://s.kmanga.kodansha.com/ldg?t=10065");
  assert.match(links[0].site, /Witch Hat Atelier/);
});

test("generic discovery links always retain the requested title", () => {
  for (const kind of ["Manga", "Manhwa", "Manhua"]) {
    const links = context.providerDiscoveryLinks({
      id: 999999999,
      english_title: "A Title With Spaces",
      romaji_title: "Fallback Title",
      kind,
    });

    assert.ok(links.length > 0);
    for (const link of links) {
      const decoded = decodeURIComponent(link.url).toLowerCase();
      assert.match(decoded, /a title with spaces/);
      assert.match(link.type, /SEARCH/);
    }
  }
});

