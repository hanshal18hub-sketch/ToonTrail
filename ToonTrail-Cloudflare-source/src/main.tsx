Exit code: 0
Wall time: 1.8 seconds
Total output lines: 1937
Output:
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
  MessageSquare,
  Send,
} from "lucide-react";
import "./styles.css";

type Link = {
  site: string;
  url: string;
  type: string;
  language?: string;
  region?: string;
  access?: string;
  accessMode?: "FREE" | "FREE_SELECTED" | "WAIT_OR_ADS" | "SUBSCRIPTION" | "PURCHASE" | "LIBRARY" | "MIXED";
  completeness?: "COMPLETE" | "ONGOING" | "SELECTED_CHAPTERS" | "PREVIEW" | "VOLUME" | "UNKNOWN";
  requiresAccount?: boolean;
  verificationStatus?: "VERIFIED_AUTHORIZED" | "CREATOR_AUTHORIZED" | "REGION_UNTESTED";
  rank?: number;
  sourceClass?: "PUBLISHER" | "AUTHORIZED_PLATFORM" | "CREATOR" | "LIBRARY" | "RETAILER";
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
const linkRank = (link: Link) => {
  if (Number.isFinite(link.rank)) return Number(link.rank);
  if (link.type?.includes("READING")) return 100;
  if (link.sourceClass === "LIBRARY") return 200;
  if (link.type?.includes("SERIES")) return 300;
  return 400;
};
const accessBadge = (link: Link) => {
  // Keep source-choice labels derived from the audited access description.
  const access = (link.access || "").toLowerCase();
  if (
    /complete available archive/.test(access) &&
    /without (payment or )?login/.test(access)
  )
    return { label: "Complete free", tone: "free" };
  if (/selected chapters|some episodes|free preview|preview is free/.test(access))
    return { label: "Partial free", tone: "partial" };
  if (link.sourceClass === "LIBRARY")
    return { label: "Library", tone: "library" };
  if (/membership|subscription|account|points/.test(access))
    return { label: "Account / subscription", tone: "account" };
  if (/purchase|buy|retailer/.test(access))
    return { label: "Purchase", tone: "purchase" };
  if (link.type?.includes("READING"))
    return { label: "Read online", tone: "reading" };
  return { label: "Title information", tone: "info" };
};
function App() {
  const [dark, setDark] = useState(false),
    [menu, setMenu] = useState(false),
    [tab, setTab] = useState<"discover" | "library">(
      location.pathname === "/library" ? "library" : "discover",
    ),
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
    [feedbackOpen, setFeedbackOpen] = useState(false),
    [feedbackDraft, setFeedbackDraft] = useState({ category: "GENERAL", message: "" }),
    [sourceSuggestion, setSourceSuggestion] = useState<Media | null>(null),
    [me, setMe] = useState<Me | null>(null),
    [library, setLibrary] = useState<Saved[]>([]),
    [savingIds, setSavingIds] = useState<Set<number>>(new Set()),
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
    if (r.ok) {
      const items: Saved[] = (await r.json()).items || [];
      setLibrary(items);
      const ids = items.map((item) => item.id).join(",");
      if (ids) {
        const result = await fetch(`/api/ratings?ids=${ids}`);
        if (result.ok) {
          const data = await result.json();
          setRatings((current) => ({ ...current, ...data.ratings }));
        }
      }
    } else if (r.status === 401) {
      setMe((current) => current ? { ...current, signedIn: false } : current);
      setLibrary([]);
      setNotice("Your session expired. Sign in again to restore your synced library.");
    }
  }
  const savedIds = useMemo(() => new Set(library.map((x) => x.id)), [library]);
  function requireSignIn() {
    if (!me?.signedIn) {
      if (me?.authConfigured === false) {
        setNotice("Google sign-in is being configured. Please try again soon.");
        return false;
      }
      setNotice("Sign in to save titles, update progress, and rate stories.");
      const returnTo = location.pathname === "/library" ? "/library" : "/";
      const signInUrl = me?.signInUrl || "/auth/google";
      setTimeout(() => {
        const separator = signInUrl.includes("?") ? "&" : "?";
        location.href = `${signInUrl}${separator}returnTo=${encodeURIComponent(returnTo)}`;
      }, 700);
      return false;
    }
    return true;
  }
  async function saveMedia(m: Media, status = "PLANNING", progress = 0) {
    if (!requireSignIn()) return;
    if (savingIds.has(m.id)) return;
    const body = {
      id: m.id,
      title: titleOf(m),
      cover: m.coverImage.large,
      kind: m.kind,
      status,
      progress,
      chapters: m.chapters,
    };
    const optimistic: Saved = { ...body, updatedAt: new Date().toISOString() };
    const previous = library;
    setSavingIds((current) => new Set(current).add(m.id));
    setLibrary((current) => [optimistic, ...current.filter((item) => item.id !== m.id)]);
    try {
      const r = await fetch("/api/library", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        setLibrary(previous);
        if (r.status === 401) {
          setMe((current) => current ? { ...current, signedIn: false } : current);
          setNotice("Your session expired. Please sign in again; your library was not changed.");
        } else setNotice((await r.json()).error || "Could not save this title");
        return;
      }
      setNotice(status === "PLANNING" ? "Added to your library" : "Progress updated");
    } finally {
      setSavingIds((current) => {
        const next = new Set(current);
        next.delete(m.id);
        return next;
      });
    }
  }
  async function removeSaved(id: number) {
    if (savingIds.has(id)) return;
    const previous = library;
    setSavingIds((current) => new Set(current).add(id));
    setLibrary((current) => current.filter((item) => item.id !== id));
    const r = await fetch(`/api/library/${id}`, { method: "DELETE" });
    if (!r.ok) {
      setLibrary(previous);
      setNotice("Could not remove this title. Please try again.");
    } else setNotice("Removed from library");
    setSavingIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }
  async function updateSaved(item: Saved, patch: Partial<Saved>) {
    if (savingIds.has(item.id)) return;
    const previous = library;
    const updated = { ...item, ...patch };
    setSavingIds((current) => new Set(current).add(item.id));
    setLibrary((current) => current.map((entry) => entry.id === item.id ? updated : entry));
    const r = await fetch("/api/library", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...item, ...patch }),
    });
    if (r.ok) setNotice("Library updated");
    else {
      setLibrary(previous);
      setNotice(r.status === 401 ? "Your session expired. Please sign in again." : "Could not update your library.");
      if (r.status === 401)
        setMe((current) => current ? { ...current, signedIn: false } : current);
    }
    setSavingIds((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
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
  async function openMediaById(id: number) {
    const r = await fetch(`/api/catalog/${id}`);
    if (!r.ok) {
      setNotice("Could not load this title's reading options.");
      return;
    }
    setActive((await r.json()).media);
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
    const pop = () => {
      setLegal(location.pathname);
      setTab(location.pathname === "/library" ? "library" : "discover");
      setActive(null);
    };
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
          aria-label="ToonTrail home â€” clear search and filters"
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
              navigate("/library");
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
            <div className="account" aria-label={`Signed in as ${me.name || me.email}`}>
              <User />
              <span>{me.name || "Signed in"}</span>
              <button
                className="signout"
                onClick={async () => {
                  await fetch(me.signOutUrl, { method: "POST" });
                  location.href = "/";
                }}
                aria-label={`Sign out ${me.name || me.email}`}
                title="Sign out"
              >
                <LogOut />
              </button>
            </div>
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
          <LegalPage
            path={legal}
            me={me}
            onNavigate={navigate}
            onFeedback={() => {
              setFeedbackDraft({ category: "GENERAL", message: "" });
              setFeedbackOpen(true);
            }}
          />
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
                      ? `Results for â€œ${submitted}â€`
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
                </l…7745 tokens truncated…osses caused by third-party
          sites, unavailable content, or misuse of the service. Nothing here
          limits rights that cannot legally be limited.
        </p>
        <h2>Changes and contact</h2>
        <p>
          Updated Terms will be posted here with a new effective date. Questions
          may be submitted through the account-free{" "}
          <button className="inline-feedback" onClick={onFeedback}>
            ToonTrail feedback form
          </button>.
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
                Deletingâ€¦
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
  onOpen,
  onRate,
  ratings,
  savingIds,
}: {
  me: Me | null;
  items: Saved[];
  onSignIn: () => boolean;
  onUpdate: (i: Saved, p: Partial<Saved>) => void;
  onRemove: (id: number) => void;
  onOpen: (id: number) => void;
  onRate: (id: number, score: number) => void;
  ratings: Record<number, Rating>;
  savingIds: Set<number>;
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
            <LibraryItem
              key={i.id}
              item={i}
              rating={ratings[i.id]}
              saving={savingIds.has(i.id)}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onOpen={onOpen}
              onRate={onRate}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function LibraryItem({
  item,
  rating,
  saving,
  onUpdate,
  onRemove,
  onOpen,
  onRate,
}: {
  item: Saved;
  rating?: Rating;
  saving: boolean;
  onUpdate: (i: Saved, p: Partial<Saved>) => void;
  onRemove: (id: number) => void;
  onOpen: (id: number) => void;
  onRate: (id: number, score: number) => void;
}) {
  const [progress, setProgress] = useState(String(item.progress));
  useEffect(() => setProgress(String(item.progress)), [item.progress]);
  function commitProgress() {
    const next = Math.max(0, Math.min(item.chapters || 99999, Number(progress) || 0));
    setProgress(String(next));
    if (next !== item.progress)
      onUpdate(item, {
        progress: next,
        status: next > 0 && item.status === "PLANNING" ? "READING" : item.status,
      });
  }
  return (
    <article className={saving ? "is-saving" : ""}>
      <button className="library-poster" onClick={() => onOpen(item.id)} aria-label={`Open ${item.title} details and reading options`}>
        {item.cover ? (
          <img src={item.cover} alt={`${item.title} cover`} loading="lazy" />
        ) : (
          <span className="library-cover" aria-label={`${item.title} cover unavailable`}>
            {item.title.split(" ").slice(0, 2).map((x) => x[0]).join("")}
          </span>
        )}
      </button>
      <div className="library-title">
        <span className="type">{item.kind}</span>
        <button className="library-title-link" onClick={() => onOpen(item.id)}>{item.title}</button>
        <label>
          Status
          <select
            aria-label={`Reading status for ${item.title}`}
            value={item.status}
            disabled={saving}
            onChange={(e) => onUpdate(item, { status: e.target.value })}
          >
            <option value="PLANNING">Plan to read</option>
            <option value="READING">Reading</option>
            <option value="COMPLETED">Completed</option>
            <option value="PAUSED">Paused</option>
            <option value="DROPPED">Dropped</option>
          </select>
        </label>
      </div>
      <div className="library-progress">
        <label>
          Current chapter
          <input
            aria-label={`Current chapter for ${item.title}`}
            type="number"
            inputMode="numeric"
            min="0"
            max={item.chapters || 99999}
            value={progress}
            disabled={saving}
            onChange={(e) => setProgress(e.target.value)}
            onBlur={commitProgress}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setProgress(String(item.progress));
            }}
          />
          <small>{item.chapters ? `of ${item.chapters}` : "Press Enter or leave the field to save"}</small>
        </label>
      </div>
      <div className="library-rating">
        <span>Your rating</span>
        <div className="stars" role="group" aria-label={`Rate ${item.title}`}>
          {[1, 2, 3, 4, 5].map((score) => (
            <button key={score} disabled={saving} onClick={() => onRate(item.id, score)} aria-label={`${score} star${score > 1 ? "s" : ""}`} aria-pressed={rating?.mine === score}>
              <Star fill={(rating?.mine || 0) >= score ? "currentColor" : "none"} />
            </button>
          ))}
        </div>
        <small>{rating?.mine ? `${rating.mine} of 5` : "Not rated yet"}</small>
      </div>
      <div className="library-actions">
        <button className="read-options" onClick={() => onOpen(item.id)}>
          <BookOpen /> Read / view options
        </button>
        <button className="delete" disabled={saving} onClick={() => onRemove(item.id)} aria-label={`Remove ${item.title} from your library`}>
          <Trash2 /> Remove
        </button>
      </div>
    </article>
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
  onFeedback,
  onSuggestSource,
}: {
  media: Media;
  saved: boolean;
  rating?: Rating;
  onClose: () => void;
  onSave: (m: Media, s?: string, p?: number) => void;
  onRemove: (id: number) => void;
  onRate: (id: number, s: number) => void;
  onFeedback: () => void;
  onSuggestSource: () => void;
}) {
  const links = [...(media.externalLinks || [])].sort(
      (a, b) => linkRank(a) - linkRank(b),
    ),
    linkGroups = [
      {
        label: "Read now",
        description: "Direct chapter or full-work destinations",
        links: links.filter((link) => link.type?.includes("READING")),
      },
      {
        label: "More verified options",
        description: "Publisher, library, discovery, and purchase pages",
        links: links.filter((link) => !link.type?.includes("READING")),
      },
    ].filter((group) => group.links.length),
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
              {media.kind} Â· {humanize(media.status)}
            </span>
            <h2 id="detail-title">{titleOf(media)}</h2>
            <p className="aliases">
              {[media.title.native, media.title.romaji]
                .filter(Boolean)
                .join(" Â· ")}
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
            <b>{media.chapters || "â€”"}</b> Chapters
          </span>
          <span>
            <b>{humanize(media.format) || "â€”"}</b> Format
          </span>
          <span>
            <b>{humanize(media.status) || "â€”"}</b> Status
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
            <h3>Verified reading and discovery options</h3>
          </div>
          <small>{links.length} option{links.length === 1 ? "" : "s"}</small>
        </div>
        {links.length ? (
          linkGroups.map((group) => (
            <section className="source-group" key={group.label}>
              <div className="source-group-heading">
                <div>
                  <b>{group.label}</b>
                  <small>{group.description}</small>
                </div>
                <span>{group.links.length}</span>
              </div>
              {group.links.map((link) => {
            const info = sourceInfo(link);
            const badge = accessBadge(link);
            const isSearch = link.type?.includes("SEARCH");
            const isReading = link.type?.includes("READING");
            const provider = link.site.split("â€”")[0].trim();
            const trusted = info.verified || link.sourceClass === "CREATOR";
            const statusLabel = isSearch
              ? "Verified provider search"
              : trusted
                ? isReading
                  ? link.sourceClass === "CREATOR"
                    ? "Creator-authorized source"
                    : "Verified reading source"
                  : "Verified title page"
                : "External resource";
            return (
              <article
                className={`source ${isSearch ? "source-search" : "source-direct"}`}
                key={link.url}
              >
                <div className="rank" aria-hidden="true">
                  {links.indexOf(link) + 1}
                </div>
                <div className="source-copy">
                  <div className="provider-heading">
                    <b>{provider}</b>
                    <span
                      className={trusted ? "verified" : "unverified"}
                    >
                      {trusted ? (
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
                  <div className="access-summary">
                    <span className={`access-badge access-${badge.tone}`}>
                      {badge.label}
                    </span>
                    <span>
                      {link.region || "Availability varies by region"}
                    </span>
                    <span>{link.language || "Language not specified"}</span>
                    <span>{link.completeness ? humanize(link.completeness) : "Coverage varies"}</span>
                    <span>{link.requiresAccount ? "Account required" : "No account indicated"}</span>
                  </div>
                  <small className="access-detail">
                    {link.access || "Chapter access may vary"}
                  </small>
                </div>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${isSearch ? "Search for" : isReading ? "Read" : "View verified options for"} ${titleOf(media)} on ${link.site} (opens in a new tab)`}
                >
                  {isSearch
                    ? `Search ${provider}`
                    : isReading
                      ? "Read here"
                      : "View options"}
                  <ExternalLink />
                </a>
              </article>
            );
              })}
            </section>
          ))
        ) : (
          <div className="source-empty">
            <ShieldCheck />
            <div>
              <b>Reading links are being verified</b>
              <small>
                We show a destination only after its right to host the work,
                title match, and site safety have been confirmed.
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
        <button
          className="report-link"
          onClick={onFeedback}
        >
          <TriangleAlert />
          Report a broken or incorrect link
        </button>
        <button className="suggest-source" onClick={onSuggestSource}>
          <ExternalLink />
          Suggest another regional source
        </button>
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

