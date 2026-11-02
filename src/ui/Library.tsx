import { useEffect, useRef, useState } from 'react';
import type { DesignRef, SearchPage } from '../sources/types';
import { searchBuiltin } from '../sources/builtin';
import { searchIconify } from '../sources/iconify';
import { searchCommons, type CommonsKind } from '../sources/commons';
import { searchSmithsonian, SMITHSONIAN_KEY_URL } from '../sources/smithsonian';
import { refKey } from '../render/art';
import { usePersistent } from '../state';

type Tab = 'builtin' | 'iconify' | 'commons' | 'smithsonian' | 'patterns' | 'upload';

const TABS: { id: Tab; label: string; hint: string; remote: boolean }[] = [
  { id: 'builtin', label: 'Built in', hint: 'Simple florals and minimal repeats that work offline.', remote: false },
  { id: 'iconify', label: 'Icons', hint: '300,000+ open-source icons from Iconify. Solid shapes make the cleanest rollers.', remote: true },
  { id: 'commons', label: 'Archives', hint: 'Wikimedia Commons, including Biodiversity Heritage Library scans and SVG clip art. Etchings and line drawings threshold best.', remote: true },
  { id: 'smithsonian', label: 'Smithsonian', hint: 'CC0 images from Smithsonian Open Access. Press Enter to search.', remote: true },
  { id: 'patterns', label: 'Patterns', hint: 'Seamless repeats from Pattern Monster (330) and Hero Patterns (87). They fill the whole cell.', remote: false },
  { id: 'upload', label: 'Your images', hint: 'Dark areas become paint. Line art and silhouettes work best.', remote: false },
];

export function Library({ inMix, onAdd }: { inMix: Set<string>; onAdd: (ref: DesignRef) => void }) {
  const [tab, setTab] = usePersistent<Tab>('library.tab', 'builtin');
  // An empty query lists everything in local sources and searches "flower" in remote ones.
  const [query, setQuery] = useState('');
  const [page, setPage] = useState<SearchPage>({ items: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uploaded, setUploaded] = useState(0);
  const [solidOnly, setSolidOnly] = usePersistent('library.solidOnly', true);
  const [commonsKind, setCommonsKind] = usePersistent<CommonsKind>('library.commonsKind', 'art');
  const [bhlOnly, setBhlOnly] = usePersistent('library.bhlOnly', false);
  const [siKey, setSiKey] = usePersistent('library.smithsonianKey', '');
  const info = TABS.find((t) => t.id === tab)!;
  const latest = useRef(0);
  const grid = useRef<HTMLDivElement>(null);
  const revealFrom = useRef(-1); // index of the first card a Load more added

  const run = async (cursor?: string) => {
    const id = ++latest.current;
    setBusy(true); setError('');
    try {
      const q = query.trim();
      let res: SearchPage;
      switch (tab) {
        case 'builtin': res = searchBuiltin(q); break;
        case 'iconify': res = await searchIconify(q || 'flower', cursor, solidOnly); break;
        // Blank searches in these photo-heavy sources default to illustrations, which threshold far better than photos.
        case 'commons': res = await searchCommons(q || 'botanical illustration', cursor, commonsKind, bhlOnly); break;
        case 'smithsonian': res = await searchSmithsonian(q || 'botanical illustration', cursor, siKey); break;
        case 'patterns': {
          // The pattern libraries are about 1 MB, so they load the first time this tab opens.
          const [{ searchPatternMonster }, { searchHeroPatterns }] = await Promise.all([import('../sources/patternMonster'), import('../sources/heroPatterns')]);
          const pm = searchPatternMonster(q), hp = searchHeroPatterns(q);
          res = { items: [...hp.items, ...pm.items] };
          break;
        }
        default: res = { items: [] };
      }
      if (id !== latest.current) return; // a newer search replaced this one
      setPage((prev) => {
        if (cursor) revealFrom.current = prev.items.length;
        return cursor ? { items: [...prev.items, ...res.items], next: res.next } : res;
      });
    } catch (e) {
      if (id === latest.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === latest.current) setBusy(false);
    }
  };

  // Switching tab or changing an option searches straight away.
  useEffect(() => { run(); }, [tab, solidOnly, commonsKind, bhlOnly]);

  // Typing filters local sources at once and searches Iconify and Commons after a short pause.
  // Smithsonian waits for Enter, because its demo key allows only about ten searches an hour.
  const lastQuery = useRef(query);
  useEffect(() => {
    if (lastQuery.current === query) return; // the effect above already searched for this query
    lastQuery.current = query;
    if (!info.remote) { run(); return; }
    if (tab === 'smithsonian') return;
    const t = setTimeout(run, 450);
    return () => clearTimeout(t);
  }, [query]);

  // After Load more, scroll the grid so the first new card shows, since new cards land below the fold.
  useEffect(() => {
    if (revealFrom.current < 0) return;
    grid.current?.children[revealFrom.current]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    revealFrom.current = -1;
  }, [page]);

  const choose = (id: Tab) => { if (id !== tab) { setTab(id); setPage({ items: [] }); } };

  const upload = (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      if (!file.type.startsWith('image/')) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result);
        onAdd({ source: 'upload', id: `${file.name}-${Date.now()}`, title: file.name, thumb: url, data: url, credit: { source: 'Your image', license: 'your own' } });
        setUploaded((n) => n + 1);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <section className="panel library" aria-labelledby="library-title">
      <h2 id="library-title">Design library</h2>
      {/* A standard tab list: arrow keys and Home/End move between tabs, and only the selected tab is in the Tab order. */}
      <div className="tabs" role="tablist" aria-labelledby="library-title" onKeyDown={(e) => {
        const i = TABS.findIndex((t) => t.id === tab);
        const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        const t = TABS[(next + TABS.length) % TABS.length];
        choose(t.id);
        document.getElementById(`tab-${t.id}`)?.focus();
      }}>
        {TABS.map((t) => (
          <button key={t.id} id={`tab-${t.id}`} role="tab" aria-selected={t.id === tab} aria-controls="library-panel"
            tabIndex={t.id === tab ? 0 : -1} className={t.id === tab ? 'tab on' : 'tab'} onClick={() => choose(t.id)}>{t.label}</button>
        ))}
      </div>
      <div id="library-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
      <p className="hint">{info.hint}</p>

      {tab === 'upload' ? (
        <label className="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}>
          Drop images here or <u>choose files</u>
          {/* Clearing the value lets the same file be picked again, since an unchanged selection fires no change event. */}
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
        </label>
      ) : (
        <form className="search" onSubmit={(e) => { e.preventDefault(); run(); }}>
          <input type="search" value={query} placeholder={info.remote ? 'Search: fern, tulip, olive branch…' : 'Filter…'} onChange={(e) => setQuery(e.target.value)} />
          {info.remote && <button type="submit">Search</button>}
        </form>
      )}

      {tab === 'upload' && uploaded > 0 && <p className="ok">Added {uploaded} image{uploaded > 1 ? 's' : ''} to your mix.</p>}
      {tab === 'iconify' && (
        <label className="check"><input type="checkbox" checked={solidOnly} onChange={(e) => setSolidOnly(e.target.checked)} /> Solid shapes only</label>
      )}
      {tab === 'commons' && (
        <div className="opts">
          <select value={commonsKind} onChange={(e) => setCommonsKind(e.target.value as CommonsKind)}>
            <option value="art">Illustrations &amp; scans</option>
            <option value="clipart">Clip art (SVG)</option>
          </select>
          <label className="check"><input type="checkbox" checked={bhlOnly} onChange={(e) => setBhlOnly(e.target.checked)} /> Biodiversity Heritage Library only</label>
        </div>
      )}
      {tab === 'smithsonian' && (
        <label>API key
          <input type="text" value={siKey} placeholder="DEMO_KEY" onChange={(e) => setSiKey(e.target.value.trim())} />
          <span className="hint">DEMO_KEY allows only a few searches an hour. <a href={SMITHSONIAN_KEY_URL} target="_blank" rel="noreferrer">Get a free key</a>.</span>
        </label>
      )}

      {error && <p className="warn">{error}</p>}
      <div className="grid" ref={grid}>
        {page.items.map((ref) => {
          const added = inMix.has(refKey(ref));
          return (
            <button key={refKey(ref)} className={added ? 'card added' : 'card'} title={`${ref.title}\n${ref.credit.source} · ${ref.credit.license}`} onClick={() => onAdd(ref)}>
              <img src={ref.thumb} alt="" loading="lazy" crossOrigin={/^https?:/.test(ref.thumb) ? 'anonymous' : undefined} />
              <span>{ref.title}</span>
            </button>
          );
        })}
      </div>
      {busy && <p className="hint">Loading…</p>}
      {!busy && !error && tab !== 'upload' && page.items.length === 0 && <p className="hint">No results. Try a simpler word, like fern, wave or star.</p>}
      {page.items.length > 0 && <p className="hint">{page.items.length} results{page.next ? '' : ', no more to load'}.</p>}
      {page.next && !busy && <button className="secondary more" onClick={() => run(page.next)}>Load more</button>}
      </div>
    </section>
  );
}
