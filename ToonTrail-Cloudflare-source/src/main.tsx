import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Search,
  ShieldCheck,
  Sun,
  Moon,
  Bookmark,
  ExternalLink,
  Menu,
  X,
  Star,
  Library,
  User,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  LogOut,
  Trash2,
  LoaderCircle,
  ArrowLeft,
  TriangleAlert,
} from "lucide-react";
import "./styles.css";

type Link = {
  site: string;
  url: string;
  type: string;
  region?: string;
  access?: string;
};
type Media = {
  id: number;
  title: { english?: string; romaji: string; native?: string };
  kind: string;
  format: string;
  status: string;
  description: string;
  genres: string[];
  chapters?: number;
  coverImage: { large: string; color?: string };
  averageScore: number;
  popularity: number;
  siteUrl: string;
  externalLinks: Link[];
};
type Saved = {
  id: number;
  title: string;
  cover: string;
  kind: string;
  status: string;
  progress: number;
  chapters?: number;
  updatedAt: string;
};
type Me = {
  signedIn: boolean;
  email: string;
  name: string;
  signInUrl: string;
  signOutUrl: string;
  authConfigured?: boolean;
};
type Rating = { average: number; count: number; mine?: number };
type PageInfo = {
  currentPage: number;
  hasNextPage: boolean;
  lastPage?: number;
  total?: number;
};
const verifiedDomains = new Set([
  "webtoons.com",
  "www.webtoons.com",
  "tapas.io",
  "www.tapas.io",
  "mangaplus.shueisha.co.jp",
  "comics.inkr.com",
  "inkr.com",
  "www.inkr.com",
  "comikey.com",
  "www.comikey.com",
  "tappytoon.com",
  "www.tappytoon.com",
  "lezhinus.com",
  "www.lezhinus.com",
  "manta.net",
  "www.manta.net",
  "viz.com",
  "www.viz.com",
  "kodansha.us",
  "www.kodansha.us",
  "crunchyroll.com",
  "www.crunchyroll.com",
]);
const titleOf = (m: Media) => m.title.english || m.title.romaji;
const humanize = (value = "") =>
  value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
const clean = (s = "") =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
const sourceInfo = (link: Link) => {
  try {
    const domain = new URL(link.url).hostname.toLowerCase();
    return { verified: verifiedDomains.has(domain), domain };
  } catch {
    return { verified: false, domain: "" };
  }
};
const betaFeedbackUrl =
  "https://github.com/hanshal18hub-sketch/ToonTrail/issues/new?title=" +
  encodeURIComponent("ToonTrail beta feedback") +
  "&body=" +
  encodeURIComponent(
    "What were you trying to do?\n\nWhat happened?\n\nWhat would make ToonTrail better?\n\nDevice/browser (optional):\n",
  );

function App() {
  const [dark, setDark] = useState(false),
    [menu, setMenu] = useState(false),
    [tab, setTab] = useState<"discover" | "library">("discover"),
    [legal, setLegal] = useState(location.pathname),
    [query, setQuery] = useState(""),
    [submitted, setSubmitted] = useState(""),
    [page, setPage] = useState(1),
    [kind, setKind] = useState("ALL"),
    [genre, setGenre] = useState("ALL"),
    [status, setStatus] = useState("ALL"),
    [pageInfo, setPageInfo] = useState<PageInfo>({
      currentPage: 1,
      hasNextPage: false,
    }),
    [media, setMedia] = useState<Media[]>([]),
    [active, setActive] = useState<Media | null>(null),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState(""),
    [me, setMe] = useState<Me | null>(null),
    [library, setLibrary] = useState<Saved[]>([]),
    [ratings, setRatings] = useState<Record<number, Rating>>({});
  useEffect(() => {
    const v = localStorage.getItem("toontrail-theme");
    setDark(
      v ? v === "dark" : matchMedia("(prefers-color-scheme:dark)").matches,
    );
    fetch("/api/me")
      .then((r) => r.json())
      .then(setMe);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("toontrail-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    loadCatalog();
  }, [submitted, page, kind, genre, status]);
  useEffect(() => {
    if (me?.signedIn) loadLibrary();
  }, [me?.signedIn]);
  async function loadCatalog() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        q: submitted,
        kind,
        genre,
        status,
      });
      const r = await fetch(`/api/catalog?${params}`);
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setMedia(d.media || []);
      setPageInfo(d.pageInfo || { currentPage: page, hasNextPage: false });
      const ids = (d.media || []).map((m: Media) => m.id).join(",");
      if (ids)
        fetch(`/api/ratings?ids=${ids}`)
          .then((x) => x.json())
          .then((x) => setRatings((v) => ({ ...v, ...x.ratings })));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Catalogue unavailable");
    } finally {
      setLoading(false);
    }
  }
  async function loadLibrary() {
    const r = await fetch("/api/library");
    if (r.ok) setLibrary((await r.json()).items || []);
  }
  const savedIds = useMemo(() => new Set(library.map((x) => x.id)), [library]);
  function requireSignIn() {
    if (!me?.signedIn) {
      if (me?.authConfigured === false) {
        setNotice("Google sign-in is being configured. Please try again soon.");
        return false;
      }
      setNotice("Sign in to save titles, update progress, and rate stories.");
      setTimeout(() => (location.href = me?.signInUrl || "/auth/google"), 700);
      return false;
    }
    return true;
  }
  async function saveMedia(m: Media, status = "PLANNING", progress = 0) {
    if (!requireSignIn()) return;
    const body = {
      id: m.id,
      title: titleOf(m),
      cover: m.coverImage.large,
      kind: m.kind,
      status,
      progress,
      chapters: m.chapters,
    };
    const r = await fetch("/api/library", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      await loadLibrary();
      setNotice(
        status === "PLANNING" ? "Added to your library" : "Progress updated",
      );
    } else setNotice((await r.json()).error);
  }
  async function removeSaved(id: number) {
    await fetch(`/api/library/${id}`, { method: "DELETE" });
    await loadLibrary();
    setNotice("Removed from library");
  }
  async function updateSaved(item: Saved, patch: Partial<Saved>) {
    const r = await fetch("/api/library", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...item, ...patch }),
    });
    if (r.ok) {
      await loadLibrary();
      setNotice("Library updated");
    }
  }
  async function rate(id: number, score: number) {
    if (!requireSignIn()) return;
    const r = await fetch("/api/rating", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mediaId: id, score }),
    });
    if (r.ok) {
      const d = await fetch(`/api/ratings?ids=${id}`).then((x) => x.json());
      setRatings((v) => ({ ...v, ...d.ratings }));
      setNotice("Rating saved");
    }
  }
  async function openMedia(m: Media) {
    setActive(m);
    try {
      const r = await fetch(`/api/catalog/${m.id}`);
      if (r.ok) setActive((await r.json()).media);
    } catch {}
  }
  const search = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSubmitted(query.trim());
  };
  function navigate(path: string) {
    history.pushState({}, "", path);
    setLegal(path);
    setMenu(false);
    scrollTo(0, 0);
  }
  function goHome() {
    navigate("/");
    setTab("discover");
    setActive(null);
    setQuery("");
    setSubmitted("");
    setKind("ALL");
    setGenre("ALL");
    setStatus("ALL");
    setPage(1);
    setNotice("");
    requestAnimationFrame(() => {
      document.getElementById("main-content")?.focus({ preventScroll: true });
      scrollTo({ top: 0, behavior: "smooth" });
    });
  }
  useEffect(() => {
    const pop = () => setLegal(location.pathname);
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, []);
  const legalPage = ["/privacy", "/terms", "/delete-account"].includes(legal);
  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header>
        <button
          className="brand"
          onClick={goHome}
          aria-label="ToonTrail home — clear search and filters"
        >
          <span aria-hidden="true">TT</span>ToonTrail
        </button>
        <nav className={menu ? "open" : ""} aria-label="Primary navigation">
          <button
            aria-current={!legalPage && tab === "discover" ? "page" : undefined}
            className={!legalPage && tab === "discover" ? "active" : ""}
            onClick={() => {
              navigate("/");
              setTab("discover");
            }}
          >
            Discover
          </button>
          <button
            aria-current={!legalPage && tab === "library" ? "page" : undefined}
            className={!legalPage && tab === "library" ? "active" : ""}
            onClick={() => {
              navigate("/");
              setTab("library");
            }}
          >
            My Library{" "}
            {library.length > 0 && (
              <i aria-label={`${library.length} saved titles`}>
                {library.length}
              </i>
            )}
          </button>
          <a href="/#how" onClick={() => setMenu(false)}>
            How it works
          </a>
        </nav>
        <div className="head-actions">
          <button
            className="icon"
            onClick={() => setDark(!dark)}
            aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
            title={`Switch to ${dark ? "light" : "dark"} mode`}
          >
            {dark ? <Sun /> : <Moon />}
          </button>
          <button
            className="menu"
            onClick={() => setMenu(!menu)}
            aria-expanded={menu}
            aria-label={`${menu ? "Close" : "Open"} navigation menu`}
          >
            {menu ? <X /> : <Menu />}
          </button>
          {me?.signedIn ? (
            <button
              className="account"
              onClick={async () => {
                await fetch(me.signOutUrl, { method: "POST" });
                location.href = "/";
              }}
              aria-label={`Sign out ${me.name || me.email}`}
              title="Sign out"
            >
              <User />
              <span>{me.name || "Signed in"}</span>
              <LogOut />
            </button>
          ) : (
            <button
              className="signin"
              onClick={requireSignIn}
              aria-label={
                me?.authConfigured === false
                  ? "Sign-in setup pending"
                  : "Continue with Google"
              }
            >
              {me?.authConfigured === false
                ? "Sign-in setup pending"
                : (
                  <>
                    <span className="signin-full">Continue with Google</span>
                    <span className="signin-short">Sign in</span>
                  </>
                )}
            </button>
          )}
        </div>
      </header>
      {notice && (
        <div className="toast" role="status" aria-live="polite">
          <span>{notice}</span>
          <button
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            <X />
          </button>
        </div>
      )}
      <main id="main-content" tabIndex={-1}>
        {legalPage ? (
          <LegalPage path={legal} me={me} onNavigate={navigate} />
        ) : tab === "discover" ? (
          <>
            <section className="hero" aria-labelledby="hero-title">
              <div className="eyebrow">
                <ShieldCheck /> Official-source discovery
              </div>
              <h1 id="hero-title">
                Every story.
                <br />
                <em>One safe path.</em>
              </h1>
              <p>
                Search a real global catalogue of manga, manhwa, and manhua.
                Save your place, organise your library, rate stories, and follow
                clearly labelled reading links.
              </p>
              <form className="searchbox" role="search" onSubmit={search}>
                <Search aria-hidden="true" />
                <label className="sr-only" htmlFor="catalog-search">
                  Search the catalogue
                </label>
                <input
                  id="catalog-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search any title, alias, or original name"
                  autoComplete="off"
                />
                <button>Search catalogue</button>
              </form>
              <div className="trust" aria-label="ToonTrail benefits">
                <span>
                  <ShieldCheck />
              Clear source labels
                </span>
                <span>
                  <Library />
                  Persistent library
                </span>
                <span>
                  <Star />
                  Reader ratings
                </span>
              </div>
            </section>
            <section className="catalog">
              <div className="section-head">
                <div>
                  <span className="kicker">
                    {submitted ? "Search results" : "Popular now"}
                  </span>
                  <h2>
                    {submitted
                      ? `Results for “${submitted}”`
                      : "Explore the catalogue"}
                  </h2>
                </div>
                {submitted && (
                  <button
                    className="text-btn"
                    onClick={() => {
                      setQuery("");
                      setSubmitted("");
                      setPage(1);
                    }}
                  >
                    <X />
                    Clear search
                  </button>
                )}
              </div>
              <div className="filters" aria-label="Catalogue filters">
                <label>
                  Format
                  <select
                    value={kind}
                    onChange={(e) => {
                      setKind(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="ALL">All formats</option>
                    <option value="MANGA">Manga</option>
                    <option value="MANHWA">Manhwa</option>
                    <option value="MANHUA">Manhua</option>
                  </select>
                </label>
                <label>
                  Genre
                  <select
                    value={genre}
                    onChange={(e) => {
                      setGenre(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="ALL">All genres</option>
                    {[
                      "Action",
                      "Adventure",
                      "Comedy",
                      "Drama",
                      "Fantasy",
                      "Horror",
                      "Mystery",
                      "Romance",
                      "Sci-Fi",
                      "Slice of Life",
                      "Sports",
                      "Supernatural",
                    ].map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="ALL">Any status</option>
                    <option value="RELEASING">Ongoing</option>
                    <option value="FINISHED">Completed</option>
                    <option value="HIATUS">On hiatus</option>
                  </select>
                </label>
                {(kind !== "ALL" || genre !== "ALL" || status !== "ALL") && (
                  <button
                    onClick={() => {
                      setKind("ALL");
                      setGenre("ALL");
                      setStatus("ALL");
                      setPage(1);
                    }}
                  >
                    <X />
                    Reset filters
                  </button>
                )}
                <span>
                  {pageInfo.total
                    ? `${pageInfo.total.toLocaleString()} titles`
                    : ""}
                </span>
              </div>
              <div aria-live="polite" className="sr-only">
                {loading
                  ? "Loading catalogue"
                  : `${media.length} titles shown on page ${page}`}
              </div>
              {loading ? (
                <div className="loading" role="status">
                  <LoaderCircle />
                  Finding stories…
                </div>
              ) : media.length === 0 ? (
                <div className="no-items">
                  <Search />
                  <h3>No matching titles</h3>
                  <p>Try another spelling or reset one of the filters.</p>
                </div>
              ) : (
                <div className="catalog-grid" aria-label="Catalogue results">
                  {media.map((m) => {
                    const saved = savedIds.has(m.id);
                    const cardTitle = `title-${m.id}`;
                    return (
                      <article
                        className="media-card"
                        key={m.id}
                        aria-labelledby={cardTitle}
                      >
                        <button
                          className="poster"
                          onClick={() => openMedia(m)}
                          aria-label={`View details for ${titleOf(m)}`}
                        >
                          {m.coverImage.large ? (
                            <>
                              <img
                                className="poster-backdrop"
                                src={m.coverImage.large}
                                alt=""
                                aria-hidden="true"
                                loading="lazy"
                              />
                              <img
                                className="poster-image"
                                src={m.coverImage.large}
                                alt={`${titleOf(m)} cover`}
                                loading="lazy"
                                decoding="async"
                              />
                            </>
                          ) : (
                            <span className="cover-art">
                              <b>
                                {titleOf(m)
                                  .split(" ")
                                  .slice(0, 2)
                                  .map((x) => x[0])
                                  .join("")}
                              </b>
                            </span>
                          )}
                          <span>{m.kind}</span>
                        </button>
                        <div className="media-copy">
                          <div>
                            <span className="type">
                              {m.format?.replaceAll("_", " ")}
                            </span>
                            <button
                              className="bookmark"
                              onClick={() =>
                                saved ? removeSaved(m.id) : saveMedia(m)
                              }
                              aria-label={`${saved ? "Remove" : "Save"} ${titleOf(m)} ${saved ? "from" : "to"} your library`}
                              aria-pressed={saved}
                              title={
                                saved
                                  ? "Remove from library"
                                  : "Save to library"
                              }
                            >
                              <Bookmark
                                fill={saved ? "currentColor" : "none"}
                              />
                            </button>
                          </div>
                          <button
                            id={cardTitle}
                            className="title-link"
                            onClick={() => openMedia(m)}
                          >
                            {titleOf(m)}
                          </button>
                          <p title={m.title.native || m.title.romaji}>
                            {m.title.native || m.title.romaji}
                          </p>
                          <div
                            className="score"
                            aria-label={
                              ratings[m.id]?.count
                                ? `${ratings[m.id].average} out of 5 from ${ratings[m.id].count} readers`
                                : "Not yet rated"
                            }
                          >
                            <Star fill="currentColor" aria-hidden="true" />{" "}
                            {ratings[m.id]?.average || "—"}{" "}
                            <small>
                              {ratings[m.id]?.count
                                ? `(${ratings[m.id].count} readers)`
                                : "Not yet rated"}
                            </small>
                          </div>
                          <button
                            className="card-details"
                            onClick={() => openMedia(m)}
                          >
                            View details <ChevronRight />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              <nav className="pagination" aria-label="Catalogue pages">
                <button
                  disabled={page === 1}
                  onClick={() => {
                    setPage((p) => p - 1);
                    scrollTo(0, 500);
                  }}
                >
                  <ChevronLeft />
                  Previous
                </button>
                <span aria-current="page">
                  Page {page}
                  {pageInfo.lastPage ? ` of ${pageInfo.lastPage}` : ""}
                </span>
                <button
                  disabled={!pageInfo.hasNextPage}
                  onClick={() => {
                    setPage((p) => p + 1);
                    scrollTo(0, 500);
                  }}
                >
                  Next
                  <ChevronRight />
                </button>
              </nav>
            </section>
          </>
        ) : (
          <LibraryView
            me={me}
            items={library}
            onSignIn={requireSignIn}
            onUpdate={updateSaved}
            onRemove={removeSaved}
          />
        )}
        {!legalPage && <section className="how" id="how">
          <span className="kicker">Built for a proper beta</span>
          <h2>Discovery, decisions, and progress in one place.</h2>
          <div className="steps">
            <div>
              <b>01</b>
              <h3>Search real titles</h3>
              <p>
                Find works by English, romanised, or native names across manga,
                manhwa, and manhua.
              </p>
            </div>
            <div>
              <b>02</b>
              <h3>Choose transparently</h3>
              <p>
              Direct title pages and provider searches are clearly separated so
              users always know what will open.
              </p>
            </div>
            <div>
              <b>03</b>
              <h3>Build your library</h3>
              <p>
                Sign in to bookmark, organise, rate, and continue from the
                chapter you last recorded.
              </p>
            </div>
          </div>
        </section>}
      </main>
      <footer>
        <div>
          <button className="brand footer-brand" onClick={goHome}>
            <span>TT</span>ToonTrail
          </button>
          <p>A safer path to official manga, manhwa, and manhua sources.</p>
        </div>
        <nav aria-label="Legal">
          <a
            className="feedback-link"
            href={betaFeedbackUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Send Beta Feedback
            <ExternalLink />
          </a>
          <button onClick={() => navigate("/privacy")}>Privacy Policy</button>
          <button onClick={() => navigate("/terms")}>Terms of Use</button>
          <button onClick={() => navigate("/delete-account")}>
            Delete My Account/Data
          </button>
        </nav>
        <small>© 2026 ToonTrail. ToonTrail does not host comic pages.</small>
      </footer>
      {active && (
        <Detail
          media={active}
          saved={savedIds.has(active.id)}
          rating={ratings[active.id]}
          onClose={() => setActive(null)}
          onSave={saveMedia}
          onRemove={removeSaved}
          onRate={rate}
        />
      )}
    </div>
  );
}

function LegalPage({
  path,
  me,
  onNavigate,
}: {
  path: string;
  me: Me | null;
  onNavigate: (p: string) => void;
}) {
  const [confirm, setConfirm] = useState(""),
    [deleting, setDeleting] = useState(false),
    [error, setError] = useState("");
  async function deleteAccount() {
    if (confirm !== "DELETE" || !me?.signedIn) return;
    setDeleting(true);
    setError("");
    try {
      const r = await fetch("/api/account", { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Deletion failed");
      location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deletion failed");
      setDeleting(false);
    }
  }
  if (path === "/privacy")
    return (
      <article className="legal-page">
        <button className="back-link" onClick={() => onNavigate("/")}>
          <ArrowLeft />
          Back to ToonTrail
        </button>
        <span className="kicker">Legal</span>
        <h1>Privacy Policy</h1>
        <p className="effective">Effective 20 July 2026</p>
        <p>
          This policy explains how ToonTrail handles information when you browse
          the catalogue or sign in.
        </p>
        <h2>Information we collect</h2>
        <ul>
          <li>
            <b>Google account identity:</b> after you choose to sign in, Google
            provides a unique account identifier, verified email address, and
            display name. ToonTrail stores these details with your account
            creation date, most recent login date, most recent meaningful
            account activity, and total login count. ToonTrail does not receive
            or store your Google password.
          </li>
          <li>
            <b>Your ToonTrail activity:</b> saved titles, reading status,
            chapter progress, and ratings.
          </li>
          <li>
            <b>Basic service data:</b> Cloudflare may process request
            information such as IP address, browser details, timestamps, and
            security events to deliver and protect the service. ToonTrail does
            not build permanent IP, device, location, search-history, or
            external-reading histories for individual users.
          </li>
        </ul>
        <h2>How we use information</h2>
        <p>
          We use it to authenticate you, sync your library and progress,
          understand account adoption through limited aggregate statistics,
          calculate reader ratings, prevent abuse, and operate and improve
          ToonTrail. We do not sell personal information, use it for targeted
          advertising, or track what you read after leaving ToonTrail.
        </p>
        <h2>Google data and tokens</h2>
        <p>
          ToonTrail requests only the <code>openid</code>, <code>email</code>,
          and <code>profile</code> scopes. Google access tokens are used only to
          verify your identity during sign-in and are not retained in the
          ToonTrail database.
        </p>
        <h2>Sharing and storage</h2>
        <p>
          Information is processed using Google for sign-in and Cloudflare for
          hosting, security, and database services. We disclose information only
          to operate the service, comply with law, or protect users and the
          service.
        </p>
        <h2>Retention and your choices</h2>
        <p>
          Your saved account data remains until you delete it or the service
          removes it under these Terms. You may browse without signing in, sign
          out at any time, remove individual library entries, or permanently
          delete your account record, library, ratings, and associated
          ToonTrail data from the deletion page.
        </p>
        <h2>Children</h2>
        <p>
          ToonTrail is not directed to children under 13, or the minimum
          digital-consent age required where they live. Do not create an account
          if you do not meet that requirement.
        </p>
        <h2>Changes and contact</h2>
        <p>
          Material changes will be posted here with a revised effective date.
          Privacy questions and requests can be submitted through the public{" "}
          <a
            href="https://github.com/hanshal18hub-sketch/ToonTrail/issues"
            target="_blank"
            rel="noreferrer"
          >
            ToonTrail support tracker
          </a>
          . Do not include passwords or other sensitive information in a public
          issue.
        </p>
      </article>
    );
  if (path === "/terms")
    return (
      <article className="legal-page">
        <button className="back-link" onClick={() => onNavigate("/")}>
          <ArrowLeft />
          Back to ToonTrail
        </button>
        <span className="kicker">Legal</span>
        <h1>Terms of Use</h1>
        <p className="effective">Effective 19 July 2026</p>
        <p>
          By using ToonTrail, you agree to these Terms. If you do not agree, do
          not use the service.
        </p>
        <h2>What ToonTrail provides</h2>
        <p>
          ToonTrail is a discovery, organisation, and link-directory service. It
          does not host manga, manhwa, manhua, or comic pages. External reading
          links lead to third-party services that have their own availability,
          prices, licences, privacy practices, and terms.
        </p>
        <h2>Your account</h2>
        <p>
          You may browse without an account. Google sign-in is required for
          personalised features such as bookmarks, library status, progress, and
          ratings. You are responsible for protecting your Google account and
          for activity performed through it.
        </p>
        <h2>Acceptable use</h2>
        <ul>
          <li>
            Do not misuse, disrupt, scrape at unreasonable volume, probe, or
            attempt to bypass the service's security.
          </li>
          <li>
            Do not submit unlawful, fraudulent, abusive, or misleading content
            or ratings.
          </li>
          <li>Do not use ToonTrail to infringe copyright or other rights.</li>
        </ul>
        <h2>Catalogue and external links</h2>
        <p>
          We aim to label sources carefully, but do not guarantee that catalogue
          details, ratings, links, chapter counts, licensing, regional
          availability, or third-party safety are complete or continuously
          accurate. A “verified provider” label identifies a recognised
          publisher or licensed platform domain; it is not a guarantee about
          every page or offering.
        </p>
        <h2>Intellectual property</h2>
        <p>
          Comic titles, cover art, descriptions, and third-party trademarks
          belong to their respective owners. ToonTrail's own branding,
          interface, and original software are protected by applicable law.
          Inclusion does not imply endorsement.
        </p>
        <h2>Service changes and account action</h2>
        <p>
          We may change, suspend, or discontinue features and may restrict
          accounts that threaten the service or violate these Terms. You may
          permanently delete your ToonTrail account data at any time.
        </p>
        <h2>Disclaimer and liability</h2>
        <p>
          ToonTrail is provided “as is” and “as available,” without guarantees
          of uninterrupted operation or accuracy. To the extent permitted by
          law, ToonTrail is not responsible for losses caused by third-party
          sites, unavailable content, or misuse of the service. Nothing here
          limits rights that cannot legally be limited.
        </p>
        <h2>Changes and contact</h2>
        <p>
          Updated Terms will be posted here with a new effective date. Questions
          may be submitted through the{" "}
          <a
            href="https://github.com/hanshal18hub-sketch/ToonTrail/issues"
            target="_blank"
            rel="noreferrer"
          >
            ToonTrail support tracker
          </a>
          .
        </p>
      </article>
    );
  return (
    <article className="legal-page delete-page">
      <button className="back-link" onClick={() => onNavigate("/")}>
        <ArrowLeft />
        Back to ToonTrail
      </button>
      <span className="kicker">Account controls</span>
      <h1>Delete My Account/Data</h1>
      <p>
        Permanently delete the information associated with your ToonTrail
        account.
      </p>
      {!me?.signedIn ? (
        <section className="delete-card">
          <User />
          <h2>Sign in first</h2>
          <p>
            We must verify the Google account whose data you want to delete.
          </p>
          <a
            className="signin legal-signin"
            href={me?.signInUrl || "/auth/google"}
          >
            Continue with Google
          </a>
        </section>
      ) : (
        <section className="delete-card danger">
          <TriangleAlert />
          <h2>This cannot be undone</h2>
          <p>
            This will permanently delete your ToonTrail account record, login
            count, recent activity dates, library entries, bookmarks, reading
            status, chapter progress, and ratings associated with{" "}
            <b>{me.email}</b>. Your Google account itself will not be deleted.
          </p>
          <label>
            Type <b>DELETE</b> to confirm
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button
            className="delete-account"
            disabled={confirm !== "DELETE" || deleting}
            onClick={deleteAccount}
          >
            {deleting ? (
              <>
                <LoaderCircle />
                Deleting…
              </>
            ) : (
              <>
                <Trash2 />
                Permanently delete my ToonTrail data
              </>
            )}
          </button>
        </section>
      )}
      <h2>What happens next?</h2>
      <p>
        Your ToonTrail session is ended immediately after deletion. If you sign
        in again later, a new empty ToonTrail account will be created. You can
        separately revoke ToonTrail's Google access from your Google Account
        permissions.
      </p>
    </article>
  );
}

function LibraryView({
  me,
  items,
  onSignIn,
  onUpdate,
  onRemove,
}: {
  me: Me | null;
  items: Saved[];
  onSignIn: () => boolean;
  onUpdate: (i: Saved, p: Partial<Saved>) => void;
  onRemove: (id: number) => void;
}) {
  if (!me?.signedIn)
    return (
      <section className="empty-library">
        <Library />
        <span className="kicker">Your personal space</span>
        <h1>Sign in to build your library.</h1>
        <p>
          Bookmarks, reading status, and chapter progress will sync with your
          ToonTrail account.
        </p>
        <button className="signin" onClick={onSignIn}>
          {me?.authConfigured === false
            ? "Sign-in setup pending"
            : "Continue with Google"}
        </button>
      </section>
    );
  const reading = items.filter((i) => i.status === "READING").length,
    completed = items.filter((i) => i.status === "COMPLETED").length;
  return (
    <section className="library-page">
      <div className="section-head">
        <div>
          <span className="kicker">Synced to your account</span>
          <h1>My Library</h1>
        </div>
        <span>{items.length} saved titles</span>
      </div>
      {items.length > 0 && (
        <div className="library-summary" aria-label="Library summary">
          <div>
            <b>{reading}</b>
            <span>Reading</span>
          </div>
          <div>
            <b>{items.length - reading - completed}</b>
            <span>Up next</span>
          </div>
          <div>
            <b>{completed}</b>
            <span>Completed</span>
          </div>
        </div>
      )}
      {items.length === 0 ? (
        <div className="no-items">
          <BookOpen />
          <h2>Your shelf is waiting.</h2>
          <p>Bookmark a title from Discover to add it here.</p>
        </div>
      ) : (
        <div className="library-list">
          {items.map((i) => (
            <article key={i.id}>
              {i.cover ? (
                <img src={i.cover} alt={`${i.title} cover`} loading="lazy" />
              ) : (
                <div
                  className="library-cover"
                  aria-label={`${i.title} cover unavailable`}
                >
                  {i.title
                    .split(" ")
                    .slice(0, 2)
                    .map((x) => x[0])
                    .join("")}
                </div>
              )}
              <div>
                <span className="type">{i.kind}</span>
                <h3>{i.title}</h3>
                <label>
                  Status
                  <select
                    aria-label={`Reading status for ${i.title}`}
                    value={i.status}
                    onChange={(e) => onUpdate(i, { status: e.target.value })}
                  >
                    <option value="PLANNING">Plan to read</option>
                    <option value="READING">Reading</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="PAUSED">Paused</option>
                    <option value="DROPPED">Dropped</option>
                  </select>
                </label>
              </div>
              <label>
                Current chapter
                <input
                  aria-label={`Current chapter for ${i.title}`}
                  type="number"
                  min="0"
                  max={i.chapters || 99999}
                  value={i.progress}
                  onChange={(e) =>
                    onUpdate(i, {
                      progress: Number(e.target.value),
                      status: Number(e.target.value) > 0 ? "READING" : i.status,
                    })
                  }
                />
                <small>
                  {i.chapters ? `of ${i.chapters}` : "Enter your progress"}
                </small>
              </label>
              <button
                className="delete"
                onClick={() => onRemove(i.id)}
                aria-label={`Remove ${i.title} from your library`}
              >
                <Trash2 />
                Remove
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Detail({
  media,
  saved,
  rating,
  onClose,
  onSave,
  onRemove,
  onRate,
}: {
  media: Media;
  saved: boolean;
  rating?: Rating;
  onClose: () => void;
  onSave: (m: Media, s?: string, p?: number) => void;
  onRemove: (id: number) => void;
  onRate: (id: number, s: number) => void;
}) {
  const links = media.externalLinks || [],
    dialog = useRef<HTMLElement>(null),
    close = useRef<HTMLButtonElement>(null);
  const [fullDescription, setFullDescription] = useState(false);
  const description = clean(media.description);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    document.body.classList.add("dialog-open");
    close.current?.focus();
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && dialog.current) {
        const controls = [
          ...dialog.current.querySelectorAll<HTMLElement>(
            "a[href],button:not([disabled]),input,select",
          ),
        ];
        if (!controls.length) return;
        const first = controls[0],
          last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    addEventListener("keydown", keys);
    return () => {
      removeEventListener("keydown", keys);
      document.body.classList.remove("dialog-open");
      previous?.focus();
    };
  }, [onClose]);
  const report = `https://github.com/hanshal18hub-sketch/ToonTrail/issues/new?title=${encodeURIComponent(`Broken or incorrect link: ${titleOf(media)}`)}&body=${encodeURIComponent(`Title: ${titleOf(media)}\nToonTrail ID: ${media.id}\nProblem with the link or availability label:\n`)}`;
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        ref={dialog}
        className="detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
      >
        <button
          ref={close}
          className="close"
          onClick={onClose}
          aria-label="Close title details"
        >
          <X />
        </button>
        <div className="detail-hero">
          {media.coverImage.large ? (
            <img src={media.coverImage.large} alt={`${titleOf(media)} cover`} />
          ) : (
            <div className="detail-cover">
              {titleOf(media)
                .split(" ")
                .slice(0, 2)
                .map((x) => x[0])
                .join("")}
            </div>
          )}
          <div>
            <span className="type">
              {media.kind} · {humanize(media.status)}
            </span>
            <h2 id="detail-title">{titleOf(media)}</h2>
            <p className="aliases">
              {[media.title.native, media.title.romaji]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="tags">
              {media.genres.slice(0, 5).map((g) => (
                <span key={g}>{g}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="title-facts">
          <span>
            <b>{media.chapters || "—"}</b> Chapters
          </span>
          <span>
            <b>{humanize(media.format) || "—"}</b> Format
          </span>
          <span>
            <b>{humanize(media.status) || "—"}</b> Status
          </span>
        </div>
        <section className="description-block" aria-labelledby="about-title">
          <h3 id="about-title">About this title</h3>
          <p className={fullDescription ? "" : "description-collapsed"}>
            {description || "No description is currently available."}
          </p>
          {description.length > 560 && (
            <button
              className="description-toggle"
              onClick={() => setFullDescription((value) => !value)}
              aria-expanded={fullDescription}
            >
              {fullDescription ? "Show less" : "Show full description"}
            </button>
          )}
        </section>
        <div className="rating-box">
          <div>
            <b>Your rating</b>
            <small>
              {rating?.count
                ? `${rating.average}/5 from ${rating.count} ToonTrail reader${rating.count === 1 ? "" : "s"}`
                : "Be the first ToonTrail reader to rate this"}
            </small>
          </div>
          <div
            className="stars"
            role="group"
            aria-label={`Rate ${titleOf(media)}`}
          >
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                onClick={() => onRate(media.id, s)}
                aria-label={`Rate ${s} out of 5 stars`}
                aria-pressed={(rating?.mine || 0) === s}
              >
                <Star
                  fill={(rating?.mine || 0) >= s ? "currentColor" : "none"}
                />
              </button>
            ))}
          </div>
        </div>
        <div className="source-heading">
          <div>
            <span className="kicker">Safe destinations</span>
            <h3>Official reading and discovery options</h3>
          </div>
          <small>{links.length} option{links.length === 1 ? "" : "s"}</small>
        </div>
        {links.length ? (
          links.map((link, i) => {
            const info = sourceInfo(link);
            const isSearch = link.type?.includes("SEARCH");
            const provider = link.site.split("—")[0].trim();
            const statusLabel = isSearch
              ? "Official provider search"
              : info.verified
                ? "Verified title page"
                : "External resource";
            return (
              <article
                className={`source ${isSearch ? "source-search" : "source-direct"}`}
                key={link.url}
              >
                <div className="rank" aria-hidden="true">
                  {i + 1}
                </div>
                <div className="source-copy">
                  <div className="provider-heading">
                    <b>{provider}</b>
                    <span
                      className={info.verified ? "verified" : "unverified"}
                    >
                      {info.verified ? (
                        isSearch ? (
                          <Search />
                        ) : (
                          <ShieldCheck />
                        )
                      ) : null}
                      {statusLabel}
                    </span>
                  </div>
                  <small className="provider-domain">{info.domain}</small>
                  <div className="availability">
                    <span>
                      {link.region || "Availability varies by region"}
                    </span>
                    <span>{link.access || "Chapter access may vary"}</span>
                  </div>
                </div>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${isSearch ? "Search for" : "Read"} ${titleOf(media)} on ${link.site} (opens in a new tab)`}
                >
                  {isSearch ? `Search ${provider}` : "Read officially"}
                  <ExternalLink />
                </a>
              </article>
            );
          })
        ) : (
          <div className="source-empty">
            <ShieldCheck />
            <div>
              <b>Official links are being verified</b>
              <small>
                We will show a reading destination only after its publisher or
                licensed platform has been confirmed.
              </small>
            </div>
          </div>
        )}
        <div className="link-note">
          <ShieldCheck />
          <p>
            <b>How to read these labels:</b> a verified title page is a confirmed
            match. An official provider search is safe to visit, but that
            platform may not carry this title in your region.
          </p>
        </div>
        <a
          className="report-link"
          href={report}
          target="_blank"
          rel="noopener noreferrer"
        >
          <TriangleAlert />
          Report a broken or incorrect link
        </a>
        <button
          className="save"
          onClick={() => (saved ? onRemove(media.id) : onSave(media))}
          aria-pressed={saved}
        >
          {saved ? "Remove from My Library" : "Save to My Library"}
        </button>
      </aside>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
