const HTML = __TOONTRAIL_HTML__;
const CATALOG_SEED = __TOONTRAIL_CATALOG_SEED__;
const CATALOG_SEED_VERSION = __TOONTRAIL_CATALOG_SEED_VERSION__;
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
const MAX_JSON_BYTES = 16 * 1024;
const enc = new TextEncoder();
const b64u = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const unb64u = (value) =>
  Uint8Array.from(
    atob(
      value.replaceAll("-", "+").replaceAll("_", "/") +
        "===".slice((value.length + 3) % 4),
    ),
    (c) => c.charCodeAt(0),
  );
const cookies = (request) =>
  Object.fromEntries(
    (request.headers.get("cookie") || "")
      .split(";")
      .map((v) => v.trim().split(/=(.*)/s))
      .filter((v) => v[0]),
  );
async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(value)));
}
async function signed(secret, payload) {
  const value = b64u(enc.encode(JSON.stringify(payload)));
  return `${value}.${await hmac(secret, value)}`;
}
async function verified(secret, value) {
  if (!value || !secret) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig || (await hmac(secret, body)) !== sig) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(unb64u(body)));
    return data.exp > Date.now() / 1000 ? data : null;
  } catch {
    return null;
  }
}
const cookie = (name, value, maxAge) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
async function viewer(request, env) {
  return verified(env.SESSION_SECRET, cookies(request).toontrail_session);
}
const oauthReady = (env) =>
  Boolean(
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_SECRET,
  );
const sameOrigin = (request) =>
  request.headers.get("origin") === new URL(request.url).origin;
const safeInteger = (value) =>
  Number.isSafeInteger(Number(value)) && Number(value) > 0
    ? Number(value)
    : null;
const httpsUrl = (value, max = 1000) => {
  try {
    const text = String(value || "").slice(0, max),
      url = new URL(text);
    return url.protocol === "https:" ? text : "";
  } catch {
    return "";
  }
};
async function readJson(request) {
  if (
    !(request.headers.get("content-type") || "")
      .toLowerCase()
      .startsWith("application/json")
  )
    return {
      error: json({ error: "Content-Type must be application/json" }, 415),
    };
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_JSON_BYTES)
    return { error: json({ error: "Request body is too large" }, 413) };
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES)
    return { error: json({ error: "Request body is too large" }, 413) };
  try {
    return { value: JSON.parse(text) };
  } catch {
    return { error: json({ error: "Invalid JSON" }, 400) };
  }
}
async function limited(binding, key) {
  if (!binding) return false;
  try {
    return !(await binding.limit({ key })).success;
  } catch {
    return false;
  }
}
async function actorKey(request, env, scope, me) {
  const actor = me?.sub || request.headers.get("cf-connecting-ip") || "unknown";
  return `${scope}:${await hmac(env.SESSION_SECRET || "toontrail", actor)}`;
}
async function recordLogin(env, profile) {
  if (!env.DB) return;
  try {
    await init(env.DB);
    await env.DB.prepare(
      "INSERT INTO user_accounts(google_sub,email,display_name,created_at,last_login_at,last_activity_at,login_count) VALUES(?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,last_login_at=CURRENT_TIMESTAMP,last_activity_at=CURRENT_TIMESTAMP,login_count=user_accounts.login_count+1",
    )
      .bind(
        String(profile.sub),
        String(profile.email).toLowerCase(),
        String(profile.name || "").slice(0, 120),
      )
      .run();
  } catch (error) {
    console.error("Account sign-in record failed", error);
  }
}
async function touchAccount(db, me) {
  if (!me?.sub) return;
  await db
    .prepare(
      "UPDATE user_accounts SET last_activity_at=CURRENT_TIMESTAMP WHERE google_sub=?",
    )
    .bind(me.sub)
    .run();
}
async function init(db) {
  await db.batch([
    db.prepare(
      "CREATE TABLE IF NOT EXISTS user_accounts (google_sub TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_login_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_activity_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, login_count INTEGER NOT NULL DEFAULT 1 CHECK(login_count > 0))",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS user_accounts_last_activity_idx ON user_accounts(last_activity_at DESC)",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS user_library (user_email TEXT NOT NULL, media_id INTEGER NOT NULL, title TEXT NOT NULL, cover_url TEXT, media_type TEXT, status TEXT NOT NULL DEFAULT 'PLANNING', progress INTEGER NOT NULL DEFAULT 0, chapters INTEGER, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_email, media_id))",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS user_library_user_updated_idx ON user_library(user_email, updated_at DESC)",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS user_ratings (user_email TEXT NOT NULL, media_id INTEGER NOT NULL, score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_email, media_id))",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS user_ratings_media_idx ON user_ratings(media_id)",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS catalog_titles (id INTEGER PRIMARY KEY, source TEXT NOT NULL, source_id TEXT, english_title TEXT, romaji_title TEXT NOT NULL, native_title TEXT, kind TEXT NOT NULL, format TEXT NOT NULL, status TEXT NOT NULL, description TEXT, genres_json TEXT NOT NULL DEFAULT '[]', chapters INTEGER, cover_url TEXT, average_score INTEGER NOT NULL DEFAULT 0, popularity INTEGER NOT NULL DEFAULT 0, site_url TEXT, external_links_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS catalog_kind_status_idx ON catalog_titles(kind,status)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS catalog_popularity_idx ON catalog_titles(popularity DESC)",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    ),
  ]);
}
const CURATED_COVERS = {
  10001: "https://us-a.tapas.io/sa/71/026a5d2a-9a64-45fa-8ec1-ef2a719d5524.jpg",
  10002: "https://us-a.tapas.io/sa/19/1f9bdc5e-da7c-424a-b510-d2e5c77759ff.jpg",
  10003:
    "https://swebtoon-phinf.pstatic.net/20251108_229/17625507016773FMqp_JPEG/4%29%20Thumb_Poster_2154.jpg?type=crop540_540",
  10004:
    "https://swebtoon-phinf.pstatic.net/20250204_46/17386458444547o1b2_JPEG/95.jpg?type=crop540_540",
  10005:
    "https://swebtoon-phinf.pstatic.net/20250204_219/17386458996443rqh1_JPEG/1436.jpg?type=crop540_540",
  10006: "https://us-a.tapas.io/sa/bd/34d7a6aa-ae4d-4f68-bbde-0557c41ae751.jpg",
  10007: "https://us-a.tapas.io/sa/a8/d8f5026f-0286-45fd-99b2-784fabf425c5.jpg",
  10008: "https://us-a.tapas.io/sa/b2/290189a5-7a6c-4365-a51b-60b68ad61f3c.jpg",
  10009: "https://dw9to29mmj727.cloudfront.net/social/91-OP_600x314.jpg",
  10010:
    "https://dw9to29mmj727.cloudfront.net/social/2465-SocialShareAssets_ChainsawMan_600x314.jpg",
  10011:
    "https://dw9to29mmj727.cloudfront.net/social/2376-SocialShareAssets_SpyFamily_600x314.jpg",
  10012:
    "https://dw9to29mmj727.cloudfront.net/social/3049-SocialShareAssets_KaijuNo8_600x314.jpg",
  10013:
    "https://dw9to29mmj727.cloudfront.net/social/3289-SocialShareAssets_Dandadan_600x314.jpg",
  10014:
    "https://i1.inkr.com/p/image/ce9e9f6a48b047e118708ef7a6bd1698.png/462.webp/thumbnail-apotheosis.webp",
  10015:
    "https://i1.inkr.com/p/image/1b8789dbb967f5273837df243d43204d.png/462.webp/thumbnail-tales-of-demons-and-gods.webp",
  10016:
    "https://i1.inkr.com/p/image/64cfffb9b4ae2f86fa96bc69b490016f.png/462.webp/thumbnail-apocalypse-online.webp",
};
const item = (
  id,
  english,
  romaji,
  native,
  kind,
  status,
  description,
  genres,
  links,
) => ({
  id,
  title: { english, romaji, native },
  kind,
  format: kind,
  status,
  description,
  genres,
  chapters: null,
  coverImage: { large: CURATED_COVERS[id] || "", color: null },
  averageScore: 0,
  popularity: 0,
  siteUrl: links[0].url,
  externalLinks: links.map((x) => ({
    site: x.site,
    url: x.url,
    type: x.type || "OFFICIAL",
    language: "English",
    region: x.region || "Availability varies by region",
    access: x.access || "Chapter access may vary",
    isDisabled: false,
  })),
});
const CATALOG = [
  item(
    10001,
    "Solo Leveling",
    "Solo Leveling",
    "나 혼자만 레벨업",
    "Manhwa",
    "COMPLETED",
    "Sung Jinwoo, once known as humanity's weakest hunter, receives an extraordinary chance to level up beyond normal limits.",
    ["Action", "Fantasy"],
    [
      {
        site: "Tapas — official English comic",
        url: "https://tapas.io/series/solo-leveling-comic/info",
      },
    ],
  ),
  item(
    10002,
    "Solo Leveling: Ragnarok",
    "Solo Leveling: Ragnarok",
    "나 혼자만 레벨업: 라그나로크",
    "Manhwa",
    "RELEASING",
    "Sung Suho faces a new threat as gates spill monsters into the world and his inherited powers awaken.",
    ["Action", "Fantasy"],
    [
      {
        site: "Tapas — official English comic",
        url: "https://tapas.io/series/solo-leveling-ragnarok/info",
      },
    ],
  ),
  item(
    10003,
    "Omniscient Reader",
    "Omniscient Reader's Viewpoint",
    "전지적 독자 시점",
    "Manhwa",
    "RELEASING",
    "An office worker's favourite web novel becomes reality, leaving him as the only person who knows how the story ends.",
    ["Action", "Fantasy", "Isekai"],
    [
      {
        site: "WEBTOON — official English series",
        url: "https://www.webtoons.com/en/action/omniscient-reader/list?title_no=2154",
      },
    ],
  ),
  item(
    10004,
    "Tower of God",
    "Tower of God",
    "신의 탑",
    "Manhwa",
    "RELEASING",
    "A young man enters a mysterious tower where each floor presents a new test, society, and danger.",
    ["Action", "Fantasy"],
    [
      {
        site: "WEBTOON — official English platform",
        url: "https://www.webtoons.com/en/fantasy/tower-of-god/list?title_no=95",
      },
    ],
  ),
  item(
    10005,
    "True Beauty",
    "True Beauty",
    "여신강림",
    "Manhwa",
    "COMPLETED",
    "A shy comic fan gains confidence through makeup while navigating identity, friendship, and romance.",
    ["Romance", "Drama"],
    [
      {
        site: "WEBTOON — official English series",
        url: "https://www.webtoons.com/en/romance/truebeauty/list?title_no=1436",
      },
    ],
  ),
  item(
    10006,
    "Tomb Raider King",
    "Tomb Raider King",
    "도굴왕",
    "Manhwa",
    "COMPLETED",
    "A betrayed relic explorer returns to the past before supernatural tombs appeared and uses his knowledge to change his fate.",
    ["Action", "Fantasy"],
    [
      {
        site: "Tapas — official English comic",
        url: "https://tapas.io/series/tomb-raider-king/info",
      },
    ],
  ),
  item(
    10007,
    "Latna Saga: Survival of a Sword King",
    "Survival Story of a Sword King",
    "이계 검왕 생존기",
    "Manhwa",
    "RELEASING",
    "A man trapped in a broken tutorial for years finally enters another world where outsiders are feared.",
    ["Action", "Fantasy", "Isekai"],
    [
      {
        site: "Tapas — official English comic",
        url: "https://tapas.io/series/latna-saga-survival-of-a-sword-king/info",
      },
    ],
  ),
  item(
    10008,
    "Leveling Up Alone",
    "Leveling Up Alone",
    "나 홀로 주문 사용자",
    "Manhwa",
    "COMPLETED",
    "A powerless porter receives unexpected abilities in a world protected by supernatural hunters.",
    ["Action", "Fantasy"],
    [
      {
        site: "Tapas — official English comic",
        url: "https://tapas.io/series/leveling-up-alone/info",
      },
    ],
  ),
  item(
    10009,
    "One Piece",
    "One Piece",
    "ワンピース",
    "Manga",
    "RELEASING",
    "Monkey D. Luffy sails with his crew in search of the legendary treasure known as the One Piece.",
    ["Adventure", "Action", "Fantasy"],
    [
      {
        site: "MANGA Plus — official title page",
        url: "https://mangaplus.shueisha.co.jp/titles/100020",
        access: "Latest chapters are free; catalogue access varies",
      },
      {
        site: "VIZ Shonen Jump — official chapter page",
        url: "https://www.viz.com/shonenjump/chapters/one-piece",
        region: "Available in supported VIZ territories",
        access: "Free chapters; membership for archive access",
      },
    ],
  ),
  item(
    10010,
    "Chainsaw Man",
    "Chainsaw Man",
    "チェンソーマン",
    "Manga",
    "RELEASING",
    "A young devil hunter merges with his chainsaw devil companion and is drawn into a violent supernatural world.",
    ["Action", "Horror", "Supernatural"],
    [
      {
        site: "MANGA Plus — official title page",
        url: "https://mangaplus.shueisha.co.jp/titles/100037",
        access: "Latest chapters are free; catalogue access varies",
      },
      {
        site: "VIZ Shonen Jump — official chapter page",
        url: "https://www.viz.com/shonenjump/chapters/chainsaw-man",
        region: "Available in supported VIZ territories",
        access: "Free chapters; membership for archive access",
      },
    ],
  ),
  item(
    10011,
    "SPY x FAMILY",
    "SPY x FAMILY",
    "SPY×FAMILY",
    "Manga",
    "RELEASING",
    "A spy, an assassin, and a telepath form a family while each hides their true identity.",
    ["Comedy", "Action", "Family"],
    [
      {
        site: "MANGA Plus — official title page",
        url: "https://mangaplus.shueisha.co.jp/titles/100056",
        access: "Latest chapters are free; catalogue access varies",
      },
      {
        site: "VIZ Shonen Jump — official chapter page",
        url: "https://www.viz.com/shonenjump/chapters/spy-x-family",
        region: "Available in supported VIZ territories",
        access: "Free chapters; membership for archive access",
      },
    ],
  ),
  item(
    10012,
    "Kaiju No. 8",
    "Kaiju No. 8",
    "怪獣8号",
    "Manga",
    "COMPLETED",
    "A cleanup worker gains kaiju powers while pursuing his old dream of joining the defence force.",
    ["Action", "Science Fiction"],
    [
      {
        site: "MANGA Plus — official title page",
        url: "https://mangaplus.shueisha.co.jp/titles/200053",
        access: "Available chapters vary by language and region",
      },
      {
        site: "VIZ Shonen Jump — official chapter page",
        url: "https://www.viz.com/shonenjump/chapters/kaiju-no-8",
        region: "Available in supported VIZ territories",
        access: "Free chapters; membership for archive access",
      },
    ],
  ),
  item(
    10013,
    "Dandadan",
    "Dandadan",
    "ダンダダン",
    "Manga",
    "RELEASING",
    "Two students clash over ghosts and aliens before discovering that both kinds of supernatural threat are real.",
    ["Action", "Comedy", "Supernatural"],
    [
      {
        site: "MANGA Plus — official title page",
        url: "https://mangaplus.shueisha.co.jp/titles/400007",
        access: "Available chapters vary by language and region",
      },
      {
        site: "VIZ Shonen Jump — official chapter page",
        url: "https://www.viz.com/shonenjump/chapters/dandadan",
        region: "Available in supported VIZ territories",
        access: "Latest free chapters may redirect to MANGA Plus",
      },
    ],
  ),
  item(
    10014,
    "Apotheosis",
    "Apotheosis",
    "百炼成神",
    "Manhua",
    "RELEASING",
    "A fallen young master begins a cultivation journey through a world of martial power and dangerous rivals.",
    ["Action", "Cultivation", "Fantasy"],
    [
      {
        site: "INKR — official English series",
        url: "https://comics.inkr.com/title/155-apotheosis",
      },
    ],
  ),
  item(
    10015,
    "Tales of Demons and Gods",
    "Tales of Demons and Gods",
    "妖神记",
    "Manhua",
    "RELEASING",
    "A powerful spiritualist is reborn into his younger self and uses memories of his former life to protect his city.",
    ["Action", "Cultivation", "Fantasy"],
    [
      {
        site: "INKR — official English series",
        url: "https://comics.inkr.com/title/480-tales-of-demons-and-gods",
      },
    ],
  ),
  item(
    10016,
    "Apocalypse Online",
    "Apocalypse Online",
    "诸界末日在线",
    "Manhua",
    "RELEASING",
    "A fighter returns to an earlier point in an apocalyptic timeline with knowledge that may avert disaster.",
    ["Action", "Fantasy", "Science Fiction"],
    [
      {
        site: "INKR — official English series",
        url: "https://comics.inkr.com/title/1075-apocalypse-online",
      },
    ],
  ),
];
const catalogRow = (value) => ({
  id: value.id,
  source: value.source || "curated",
  sourceId: value.sourceId || String(value.id),
  english: value.english ?? value.title?.english ?? "",
  romaji: value.romaji ?? value.title?.romaji ?? value.english ?? "",
  native: value.native ?? value.title?.native ?? "",
  kind: value.kind || "Manga",
  format: value.format || value.kind || "Manga",
  status:
    (value.status === "COMPLETED" ? "FINISHED" : value.status) || "HIATUS",
  description: value.description || "",
  genres: value.genres || [],
  chapters: value.chapters || null,
  cover: value.cover ?? value.coverImage?.large ?? "",
  score: value.score ?? value.averageScore ?? 0,
  popularity: value.popularity || 0,
  siteUrl: value.siteUrl || value.links?.[0]?.url || "",
  links: value.links ?? value.externalLinks ?? [],
});
async function seedCatalog(db) {
  const meta = await db
    .prepare("SELECT value FROM app_meta WHERE key='catalog_seed_version'")
    .first();
  if (meta?.value === CATALOG_SEED_VERSION) return;
  const values = [...CATALOG_SEED.map(catalogRow), ...CATALOG.map(catalogRow)];
  for (let offset = 0; offset < values.length; offset += 40) {
    const statements = values
      .slice(offset, offset + 40)
      .map((v) =>
        db
          .prepare(
            "INSERT INTO catalog_titles(id,source,source_id,english_title,romaji_title,native_title,kind,format,status,description,genres_json,chapters,cover_url,average_score,popularity,site_url,external_links_json,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET source=excluded.source,source_id=excluded.source_id,english_title=excluded.english_title,romaji_title=excluded.romaji_title,native_title=excluded.native_title,kind=excluded.kind,format=excluded.format,status=excluded.status,description=excluded.description,genres_json=excluded.genres_json,chapters=excluded.chapters,cover_url=excluded.cover_url,average_score=excluded.average_score,popularity=excluded.popularity,site_url=excluded.site_url,external_links_json=CASE WHEN excluded.external_links_json='[]' THEN catalog_titles.external_links_json ELSE excluded.external_links_json END,updated_at=CURRENT_TIMESTAMP",
          )
          .bind(
            v.id,
            v.source,
            v.sourceId,
            v.english,
            v.romaji,
            v.native,
            v.kind,
            v.format,
            v.status,
            v.description,
            JSON.stringify(v.genres),
            v.chapters,
            httpsUrl(v.cover),
            v.score,
            v.popularity,
            httpsUrl(v.siteUrl),
            JSON.stringify(v.links),
          ),
      );
    await db.batch(statements);
  }
  await db
    .prepare(
      "INSERT INTO app_meta(key,value) VALUES('catalog_seed_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .bind(String(CATALOG_SEED_VERSION))
    .run();
}
const parseJson = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};
const mediaFromRow = (row) => ({
  id: row.id,
  title: {
    english: row.english_title || undefined,
    romaji: row.romaji_title,
    native: row.native_title || undefined,
  },
  kind: row.kind,
  format: row.format,
  status: row.status,
  description: row.description || "",
  genres: parseJson(row.genres_json, []),
  chapters: row.chapters,
  coverImage: { large: row.cover_url || "", color: null },
  averageScore: row.average_score || 0,
  popularity: row.popularity || 0,
  siteUrl: row.site_url || "",
  externalLinks: parseJson(row.external_links_json, []),
});
async function d1Catalog(url, db) {
  const page = Math.max(
      1,
      Math.min(1000, Number(url.searchParams.get("page")) || 1),
    ),
    search = (url.searchParams.get("q") || "").trim().slice(0, 120),
    kind = url.searchParams.get("kind") || "ALL",
    genre = (url.searchParams.get("genre") || "ALL").slice(0, 40),
    status = url.searchParams.get("status") || "ALL";
  const where = [],
    bind = [];
  if (search) {
    where.push(
      "(LOWER(english_title) LIKE ? OR LOWER(romaji_title) LIKE ? OR LOWER(native_title) LIKE ?)",
    );
    const term = `%${search.toLowerCase()}%`;
    bind.push(term, term, term);
  }
  if (["MANGA", "MANHWA", "MANHUA"].includes(kind)) {
    where.push("UPPER(kind)=?");
    bind.push(kind);
  }
  if (genre !== "ALL") {
    where.push("genres_json LIKE ?");
    bind.push(`%\"${genre.replaceAll('"', "")}\"%`);
  }
  if (["RELEASING", "FINISHED", "HIATUS"].includes(status)) {
    where.push("status=?");
    bind.push(status);
  }
  const clause = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const totalRow = await db
    .prepare(`SELECT COUNT(*) total FROM catalog_titles${clause}`)
    .bind(...bind)
    .first();
  const total = Number(totalRow?.total) || 0,
    offset = (page - 1) * 18;
  const rows = await db
    .prepare(
      `SELECT * FROM catalog_titles${clause} ORDER BY popularity DESC, english_title COLLATE NOCASE LIMIT 18 OFFSET ?`,
    )
    .bind(...bind, offset)
    .all();
  return json({
    media: rows.results.map(mediaFromRow),
    pageInfo: {
      currentPage: page,
      hasNextPage: offset + 18 < total,
      lastPage: Math.max(1, Math.ceil(total / 18)),
      total,
    },
    catalogueMode: "cloudflare-d1",
  });
}
const ANILIST_QUERY = `query($page:Int,$search:String,$country:CountryCode,$status:MediaStatus,$genre:String){Page(page:$page,perPage:18){pageInfo{currentPage hasNextPage lastPage total}media(type:MANGA,isAdult:false,search:$search,countryOfOrigin:$country,status:$status,genre:$genre,sort:POPULARITY_DESC){id title{english romaji native}format status description genres chapters coverImage{large color}averageScore popularity siteUrl countryOfOrigin externalLinks{site url type}}}}`;
async function catalog(url) {
  const search = url.searchParams.get("q")?.trim() || null;
  const page = Math.max(
    1,
    Math.min(1000, Number(url.searchParams.get("page")) || 1),
  );
  const kind = url.searchParams.get("kind") || "ALL",
    genre = url.searchParams.get("genre") || "ALL",
    status = url.searchParams.get("status") || "ALL";
  const country =
    kind === "MANGA"
      ? "JP"
      : kind === "MANHWA"
        ? "KR"
        : kind === "MANHUA"
          ? "CN"
          : null;
  try {
    const response = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": "ToonTrail/0.1 (catalogue discovery)",
      },
      body: JSON.stringify({
        query: ANILIST_QUERY,
        variables: {
          page,
          search,
          country,
          status: status === "ALL" ? null : status,
          genre: genre === "ALL" ? null : genre,
        },
      }),
    });
    if (!response.ok) throw Error(`AniList returned ${response.status}`);
    const data = await response.json();
    if (data.errors || !data.data?.Page)
      throw Error("AniList catalogue unavailable");
    const media = data.data.Page.media.map((m) => ({
      ...m,
      kind:
        m.countryOfOrigin === "KR"
          ? "Manhwa"
          : m.countryOfOrigin === "CN"
            ? "Manhua"
            : "Manga",
      externalLinks: (m.externalLinks || []).filter((x) => x.url),
    }));
    return json({
      media,
      pageInfo: data.data.Page.pageInfo,
      catalogueMode: "anilist-live",
    });
  } catch (error) {
    try {
      const genreIds = {
        Action: 1,
        Adventure: 2,
        Comedy: 4,
        Drama: 8,
        Fantasy: 10,
        Horror: 14,
        Mystery: 7,
        Romance: 22,
        "Sci-Fi": 24,
        "Slice of Life": 36,
        Sports: 30,
        Supernatural: 37,
      };
      const params = new URLSearchParams({
        page: String(page),
        limit: "18",
        order_by: "popularity",
        sort: "asc",
        sfw: "true",
      });
      if (search) params.set("q", search);
      if (kind !== "ALL") params.set("type", kind.toLowerCase());
      if (genre !== "ALL" && genreIds[genre])
        params.set("genres", String(genreIds[genre]));
      if (status === "RELEASING") params.set("status", "publishing");
      if (status === "FINISHED") params.set("status", "complete");
      const response = await fetch(`https://api.jikan.moe/v4/manga?${params}`, {
        headers: {
          accept: "application/json",
          "user-agent": "ToonTrail/0.1 (catalogue discovery)",
        },
      });
      if (!response.ok) throw Error(`Jikan returned ${response.status}`);
      const data = await response.json();
      let media = (data.data || []).map((m) => ({
        id: m.mal_id,
        title: {
          english: m.title_english || m.title,
          romaji: m.title || m.title_english,
          native: m.title_japanese || "",
        },
        kind: /manhwa/i.test(m.type)
          ? "Manhwa"
          : /manhua/i.test(m.type)
            ? "Manhua"
            : "Manga",
        format: m.type || "Manga",
        status: /finished/i.test(m.status)
          ? "FINISHED"
          : /hiatus/i.test(m.status)
            ? "HIATUS"
            : "RELEASING",
        description: m.synopsis || "",
        genres: (m.genres || []).map((g) => g.name),
        chapters: m.chapters || null,
        coverImage: {
          large:
            m.images?.webp?.large_image_url ||
            m.images?.jpg?.large_image_url ||
            m.images?.jpg?.image_url ||
            "",
          color: null,
        },
        averageScore: m.score ? Math.round(m.score * 10) : 0,
        popularity: m.members || 0,
        siteUrl: m.url || "",
        externalLinks: [],
      }));
      if (status === "HIATUS")
        media = media.filter((m) => m.status === "HIATUS");
      const p = data.pagination || {};
      return json({
        media,
        pageInfo: {
          currentPage: p.current_page || page,
          hasNextPage: Boolean(p.has_next_page),
          lastPage: p.last_visible_page,
          total: p.items?.total,
        },
        catalogueMode: "jikan-live",
      });
    } catch (secondaryError) {}
    const term = search?.toLowerCase();
    let filtered = CATALOG.filter(
      (x) =>
        (kind === "ALL" || x.kind.toUpperCase() === kind) &&
        (genre === "ALL" || x.genres.includes(genre)) &&
        (status === "ALL" ||
          (status === "FINISHED"
            ? x.status === "COMPLETED"
            : x.status === status)),
    );
    if (term)
      filtered = filtered.filter((x) =>
        [x.title.english, x.title.romaji, x.title.native, x.kind, ...x.genres]
          .join(" ")
          .toLowerCase()
          .includes(term),
      );
    const start = (page - 1) * 18,
      media = filtered.slice(start, start + 18);
    return json({
      media,
      pageInfo: {
        currentPage: page,
        hasNextPage: start + 18 < filtered.length,
        lastPage: Math.max(1, Math.ceil(filtered.length / 18)),
        total: filtered.length,
      },
      catalogueMode: "curated-fallback",
      ...(url.searchParams.get("debug") === "1"
        ? { fallbackReason: String(error) }
        : {}),
    });
  }
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(
      request.method,
    );
    if (mutating && !sameOrigin(request))
      return json({ error: "Request origin was not accepted" }, 403);
    if (
      path.startsWith("/auth/") &&
      (await limited(
        env.AUTH_RATE_LIMITER,
        await actorKey(request, env, "auth"),
      ))
    )
      return json(
        { error: "Too many sign-in requests. Please wait and try again." },
        429,
      );
    if (
      path.startsWith("/api/catalog") &&
      (await limited(
        env.PUBLIC_API_RATE_LIMITER,
        await actorKey(request, env, "catalog"),
      ))
    )
      return json(
        {
          error:
            "Too many catalogue requests. Please wait a minute and try again.",
        },
        429,
      );
    if (path === "/auth/google" && request.method === "GET") {
      if (!oauthReady(env))
        return new Response("Google sign-in is not configured", {
          status: 503,
        });
      const state = crypto.randomUUID();
      const stateValue = await signed(env.SESSION_SECRET, {
        state,
        exp: Math.floor(Date.now() / 1000) + 600,
      });
      const redirectUri =
        env.GOOGLE_REDIRECT_URI || `${url.origin}/auth/google/callback`;
      const target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      target.search = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        state,
        prompt: "select_account",
      }).toString();
      return new Response(null, {
        status: 302,
        headers: {
          location: target.toString(),
          "set-cookie": cookie("toontrail_oauth", stateValue, 600),
          "cache-control": "no-store",
        },
      });
    }
    if (path === "/auth/google/callback" && request.method === "GET") {
      if (!oauthReady(env))
        return new Response("Google sign-in is not configured", {
          status: 503,
        });
      const stateData = await verified(
        env.SESSION_SECRET,
        cookies(request).toontrail_oauth,
      );
      if (!stateData || stateData.state !== url.searchParams.get("state"))
        return new Response("Invalid or expired sign-in request", {
          status: 400,
        });
      const code = url.searchParams.get("code");
      if (!code)
        return new Response("Google did not return an authorization code", {
          status: 400,
        });
      const redirectUri =
        env.GOOGLE_REDIRECT_URI || `${url.origin}/auth/google/callback`;
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      if (!tokenResponse.ok)
        return new Response("Google sign-in could not be completed", {
          status: 502,
        });
      const tokens = await tokenResponse.json();
      const profileResponse = await fetch(
        "https://openidconnect.googleapis.com/v1/userinfo",
        { headers: { authorization: `Bearer ${tokens.access_token}` } },
      );
      if (!profileResponse.ok)
        return new Response("Google profile could not be verified", {
          status: 502,
        });
      const profile = await profileResponse.json();
      if (!profile.email || profile.email_verified !== true)
        return new Response("A verified Google email is required", {
          status: 403,
        });
      await recordLogin(env, profile);
      const session = await signed(env.SESSION_SECRET, {
        sub: profile.sub,
        email: profile.email,
        name: String(profile.name || "").slice(0, 120),
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
      });
      return new Response(null, {
        status: 302,
        headers: {
          location: "/",
          "set-cookie": cookie("toontrail_session", session, 60 * 60 * 24 * 30),
          "cache-control": "no-store",
        },
      });
    }
    if (path === "/auth/logout" && request.method === "POST")
      return new Response(null, {
        status: 204,
        headers: {
          "set-cookie": cookie("toontrail_session", "", 0),
          "cache-control": "no-store",
        },
      });
    if (path === "/api/catalog" && request.method === "GET") {
      if (!env.DB)
        return json({ error: "Catalogue database is not configured" }, 503);
      await init(env.DB);
      await seedCatalog(env.DB);
      return d1Catalog(url, env.DB);
    }
    if (/^\/api\/catalog\/\d+$/.test(path) && request.method === "GET") {
      if (!env.DB)
        return json({ error: "Catalogue database is not configured" }, 503);
      await init(env.DB);
      await seedCatalog(env.DB);
      const row = await env.DB.prepare(
        "SELECT * FROM catalog_titles WHERE id=?",
      )
        .bind(Number(path.split("/").pop()))
        .first();
      return row
        ? json({ media: mediaFromRow(row) })
        : json({ error: "Title not found" }, 404);
    }
    if (path === "/api/me" && request.method === "GET") {
      const me = await viewer(request, env);
      return json({
        signedIn: !!me,
        email: me?.email || "",
        name: me?.name || "",
        signInUrl: "/auth/google",
        signOutUrl: "/auth/logout",
        authConfigured: oauthReady(env),
      });
    }
    if (path.startsWith("/api/")) {
      if (!env.DB) return json({ error: "Database is not configured" }, 503);
      await init(env.DB);
      const me = await viewer(request, env);
      const email = me?.email || "";
      if (
        mutating &&
        (await limited(
          env.WRITE_RATE_LIMITER,
          await actorKey(request, env, path, me),
        ))
      )
        return json(
          { error: "Too many changes. Please wait a minute and try again." },
          429,
        );
      if (path === "/api/ratings" && request.method === "GET") {
        const ids = (url.searchParams.get("ids") || "")
          .split(",")
          .map(Number)
          .filter(Boolean)
          .slice(0, 50);
        if (!ids.length) return json({ ratings: {} });
        const marks = ids.map(() => "?").join(",");
        const result = await env.DB.prepare(
          `SELECT media_id,ROUND(AVG(score),1) average,COUNT(*) count FROM user_ratings WHERE media_id IN (${marks}) GROUP BY media_id`,
        )
          .bind(...ids)
          .all();
        const mine = email
          ? await env.DB.prepare(
              `SELECT media_id,score FROM user_ratings WHERE user_email=? AND media_id IN (${marks})`,
            )
              .bind(email, ...ids)
              .all()
          : { results: [] };
        const ratings = {};
        for (const row of result.results)
          ratings[row.media_id] = { average: row.average, count: row.count };
        for (const row of mine.results)
          ratings[row.media_id] = {
            ...(ratings[row.media_id] || { average: 0, count: 0 }),
            mine: row.score,
          };
        return json({ ratings });
      }
      if (!email)
        return json(
          { error: "Sign in required", signInUrl: "/auth/google" },
          401,
        );
      if (path === "/api/library" && request.method === "GET") {
        const rows = await env.DB.prepare(
          "SELECT media_id id,title,cover_url cover,media_type kind,status,progress,chapters,updated_at updatedAt FROM user_library WHERE user_email=? ORDER BY updated_at DESC",
        )
          .bind(email)
          .all();
        return json({ items: rows.results });
      }
      if (path === "/api/library" && request.method === "POST") {
        const parsed = await readJson(request);
        if (parsed.error) return parsed.error;
        const b = parsed.value;
        const id = safeInteger(b.id),
          progress = Math.max(
            0,
            Math.min(100000, Math.trunc(Number(b.progress) || 0)),
          );
        if (
          !id ||
          typeof b.title !== "string" ||
          !b.title.trim() ||
          b.title.length > 240
        )
          return json({ error: "Invalid title" }, 400);
        const allowed = [
          "PLANNING",
          "READING",
          "COMPLETED",
          "PAUSED",
          "DROPPED",
        ];
        const status = allowed.includes(b.status) ? b.status : "PLANNING";
        const kinds = ["Manga", "Manhwa", "Manhua"],
          kind = kinds.includes(b.kind) ? b.kind : "Manga",
          chapters = safeInteger(b.chapters);
        await env.DB.prepare(
          "INSERT INTO user_library(user_email,media_id,title,cover_url,media_type,status,progress,chapters,updated_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_email,media_id) DO UPDATE SET title=excluded.title,cover_url=excluded.cover_url,media_type=excluded.media_type,status=excluded.status,progress=excluded.progress,chapters=excluded.chapters,updated_at=CURRENT_TIMESTAMP",
        )
          .bind(
            email,
            id,
            b.title.trim(),
            httpsUrl(b.cover),
            kind,
            status,
            progress,
            chapters,
          )
          .run();
        await touchAccount(env.DB, me);
        return json({ ok: true });
      }
      if (path.startsWith("/api/library/") && request.method === "DELETE") {
        const id = safeInteger(path.split("/").pop());
        if (!id) return json({ error: "Invalid title" }, 400);
        await env.DB.prepare(
          "DELETE FROM user_library WHERE user_email=? AND media_id=?",
        )
          .bind(email, id)
          .run();
        await touchAccount(env.DB, me);
        return json({ ok: true });
      }
      if (path === "/api/rating" && request.method === "POST") {
        const parsed = await readJson(request);
        if (parsed.error) return parsed.error;
        const b = parsed.value;
        const id = safeInteger(b.mediaId),
          score = Number(b.score);
        if (!id || !Number.isInteger(score) || score < 1 || score > 5)
          return json({ error: "Rating must be 1–5" }, 400);
        await env.DB.prepare(
          "INSERT INTO user_ratings(user_email,media_id,score,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_email,media_id) DO UPDATE SET score=excluded.score,updated_at=CURRENT_TIMESTAMP",
        )
          .bind(email, id, score)
          .run();
        await touchAccount(env.DB, me);
        return json({ ok: true });
      }
      if (path === "/api/account" && request.method === "DELETE") {
        await env.DB.batch([
          env.DB.prepare("DELETE FROM user_library WHERE user_email=?").bind(
            email,
          ),
          env.DB.prepare("DELETE FROM user_ratings WHERE user_email=?").bind(
            email,
          ),
          env.DB.prepare(
            "DELETE FROM user_accounts WHERE google_sub=? OR email=?",
          ).bind(me.sub, email),
        ]);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            ...JSON_HEADERS,
            "set-cookie": cookie("toontrail_session", "", 0),
          },
        });
      }
      return json({ error: "Not found" }, 404);
    }
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response("Method not allowed", { status: 405 });
    return new Response(request.method === "HEAD" ? null : HTML, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=60",
        "strict-transport-security": "max-age=31536000; includeSubDomains",
        "cross-origin-opener-policy": "same-origin",
        "cross-origin-resource-policy": "same-origin",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "strict-origin-when-cross-origin",
        "permissions-policy":
          "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
        "content-security-policy":
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' https: data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; upgrade-insecure-requests",
      },
    });
  },
};
