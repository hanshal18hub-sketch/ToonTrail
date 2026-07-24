const origin = (process.env.TOONTRAIL_ORIGIN ||
  "https://toontrail-beta.hanshal18-github.workers.dev").replace(/\/$/, "");
const timeoutMs = Number(process.env.LINK_CHECK_TIMEOUT_MS || 15_000);
const links = new Map();

for (let page = 1; page <= 100; page += 1) {
  const response = await fetch(`${origin}/api/catalog?page=${page}`);
  if (!response.ok) throw new Error(`Catalogue page ${page} returned ${response.status}`);
  const data = await response.json();
  for (const media of data.media || []) {
    for (const link of media.externalLinks || []) {
      links.set(link.url, {
        id: media.id,
        title: media.title?.english || media.title?.romaji || String(media.id),
        site: link.site,
        url: link.url,
      });
    }
  }
  if (!data.pageInfo?.hasNextPage) break;
}

const results = [];
for (const link of links.values()) {
  try {
    let response = await fetch(link.url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "ToonTrail-LinkAudit/1.0" },
    });
    // Some valid sites do not implement HEAD correctly and return a false 404.
    if ([403, 404, 405].includes(response.status)) {
      response = await fetch(link.url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "user-agent": "Mozilla/5.0 ToonTrail-LinkAudit/1.0",
          range: "bytes=0-0",
        },
      });
    }
    const warning = [401, 403, 429].includes(response.status);
    results.push({ ...link, status: response.status, finalUrl: response.url, warning });
  } catch (error) {
    try {
      const response = await fetch(link.url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs * 2),
        headers: {
          "user-agent": "Mozilla/5.0 ToonTrail-LinkAudit/1.0",
          range: "bytes=0-0",
        },
      });
      results.push({
        ...link,
        status: response.status,
        finalUrl: response.url,
        warning: [401, 403, 429].includes(response.status),
      });
    } catch (retryError) {
      results.push({
        ...link,
        status: 0,
        warning: true,
        error: retryError instanceof Error ? retryError.message : String(retryError),
      });
    }
  }
}

console.table(
  results.map(({ id, title, site, status, warning, finalUrl, error }) => ({
    id,
    title,
    site,
    status,
    result: warning ? `REVIEW${error ? `: ${error}` : ""}` : error ? `ERROR: ${error}` : "OK",
    finalUrl,
  })),
);

const broken = results.filter(
  ({ status, warning }) =>
    (!warning && status === 0) || status === 404 || status === 410 || status >= 500,
);
const warnings = results.filter(({ warning }) => warning);
if (broken.length) {
  console.error("Broken destinations:");
  for (const link of broken) {
    console.error(`- ${link.id} ${link.title}: ${link.url} (${link.status || link.error})`);
  }
}
console.log(
  `Checked ${results.length} confirmed links: ${broken.length} broken, ${warnings.length} need manual review.`,
);
if (broken.length) process.exitCode = 1;

