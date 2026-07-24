import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const worker = await readFile(
  new URL("../server/worker-template.js", import.meta.url),
  "utf8",
);
const knownLinks = JSON.parse(
  await readFile(new URL("../data/known-official-links.json", import.meta.url), "utf8"),
);
const start = worker.indexOf("const knownOfficialLinks");
const end = worker.indexOf("const mediaFromRow", start);
assert.notEqual(start, -1, "known official link definitions must exist");
assert.notEqual(end, -1, "provider link block must be extractable");

const context = vm.createContext({ URL, encodeURIComponent });
vm.runInContext(
  `${worker.slice(start, end).replace("__TOONTRAIL_KNOWN_OFFICIAL_LINKS__", JSON.stringify(knownLinks))}; globalThis.providerDiscoveryLinks = providerDiscoveryLinks; globalThis.knownOfficialLinks = knownOfficialLinks;`,
  context,
);

test("Witch Hat Atelier resolves to its confirmed official reading page", () => {
  const links = context.providerDiscoveryLinks({
    id: 1038865,
    english_title: "Witch Hat Atelier",
    romaji_title: "Tongari Boushi no Atelier",
    kind: "Manga",
  });

  assert.ok(links.length >= 1);
  const readingPage = links.find((link) => link.type === "OFFICIAL_READING_PAGE");
  assert.equal(readingPage?.url, "https://s.kmanga.kodansha.com/ldg?t=10065");
  assert.match(readingPage?.site || "", /Witch Hat Atelier/);
});

test("unverified titles never receive guessed provider links", () => {
  for (const kind of ["Manga", "Manhwa", "Manhua"]) {
    const links = context.providerDiscoveryLinks({
      id: 999999999,
      english_title: "A Title With Spaces",
      romaji_title: "Fallback Title",
      kind,
    });

    assert.deepEqual(Array.from(links), []);
  }
});

test("confirmed links are HTTPS title pages from official or creator-authorized sources", () => {
  for (const links of context.knownOfficialLinks.values()) {
    for (const link of links) {
      const url = new URL(link.url);
      assert.equal(url.protocol, "https:");
      assert.notEqual(url.pathname, "/");
      assert.doesNotMatch(link.type, /SEARCH/);
      assert.ok(
        /^OFFICIAL_/.test(link.type) ||
          (link.type === "CREATOR_READING_PAGE" && link.sourceClass === "CREATOR"),
      );
      assert.ok(link.region);
      assert.ok(link.access);
      if (link.rank !== undefined) {
        assert.ok(Number.isFinite(link.rank));
        assert.ok(link.rank > 0);
      }
    }
  }
});

test("ranked alternatives prefer direct reading destinations", () => {
  for (const links of context.knownOfficialLinks.values()) {
    const ranked = [...links].sort(
      (a, b) =>
        (a.rank ?? (a.type.includes("READING") ? 100 : 300)) -
        (b.rank ?? (b.type.includes("READING") ? 100 : 300)),
    );
    const readingIndex = ranked.findIndex((link) => link.type.includes("READING"));
    const seriesIndex = ranked.findIndex((link) => link.type.includes("SERIES"));
    if (readingIndex >= 0 && seriesIndex >= 0) {
      assert.ok(readingIndex < seriesIndex);
    }
  }
});

test("community source suggestions stay in a private pending review queue", () => {
  assert.match(worker, /CREATE TABLE IF NOT EXISTS source_suggestions/);
  assert.match(worker, /review_status TEXT NOT NULL DEFAULT 'PENDING'/);
  assert.match(worker, /path === "\/api\/source-suggestions"/);
  assert.match(worker, /return json\(\{ ok: true, status: "PENDING" \}, 201\)/);
  assert.doesNotMatch(
    worker,
    /external_links_json[^;\n]*source_suggestions|source_suggestions[^;\n]*external_links_json/,
  );
});

