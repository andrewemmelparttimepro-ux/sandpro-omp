import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Search, X } from 'lucide-react';
import { FieldKeyContext, NCR_GLOSSARY, flattenGlossaryTerms } from './glossaryData';

// ============================================================================
// FIELD KEY (Decoder) — context-aware glossary components
//
// Confusing labels become "defined terms": hover/focus shows an instant
// definition, click opens the full Field Key panel scrolled to that exact
// term. A floating Key button and the "?" keyboard shortcut open the panel
// from anywhere on the page. Built NCR-first, but the provider accepts any
// glossary, so Objectives / Fix-It / Org vocabularies can mount later.
// Glossary data + useFieldKey hook live in src/glossaryData.js.
// ============================================================================

const isTypingTarget = (target) => {
  const tag = target?.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
};

export const FieldKeyProvider = ({ children, groups = NCR_GLOSSARY, keyLabel = 'Field Key', subtitle = 'What every NCR field, role, and flag actually means.', showLauncher = true }) => {
  const [open, setOpen] = useState(false);
  const [focusTermId, setFocusTermId] = useState(null);

  useEffect(() => {
    // Quiet providers (app-level Definitions) skip the "?" hotkey so a nested
    // page-level provider (NCR Field Key) keeps sole ownership of it.
    if (!showLauncher) return undefined;
    const onKeyDown = (event) => {
      if (event.key === '?' && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget(event.target)) {
        event.preventDefault();
        setFocusTermId(null);
        setOpen(prev => !prev);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showLauncher]);

  const value = useMemo(() => ({
    open,
    groups,
    openKey: (termId = null) => {
      setFocusTermId(termId);
      setOpen(true);
    },
    closeKey: () => setOpen(false),
  }), [open, groups]);

  return (
    <FieldKeyContext.Provider value={value}>
      {children}
      {showLauncher && <FieldKeyLauncher label={keyLabel} />}
      {open && <FieldKeyPanel groups={groups} focusTermId={focusTermId} onClose={() => setOpen(false)} keyLabel={keyLabel} subtitle={subtitle} />}
    </FieldKeyContext.Provider>
  );
};

export const DefinedTerm = ({ id, children, className = '' }) => {
  const ctx = useContext(FieldKeyContext);
  const term = useMemo(() => (ctx ? flattenGlossaryTerms(ctx.groups).find(item => item.id === id) : null), [ctx, id]);
  if (!term) return children ?? null;
  return (
    <button
      type="button"
      className={`defined-term ${className}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        ctx.openKey(id);
      }}
      aria-label={`${term.term}: open definition in field key`}
    >
      <span className="defined-term-text">{children ?? term.term}</span>
      <span className="defined-term-pop" role="tooltip" aria-hidden="true">
        <strong>{term.term}</strong>
        <span>{term.def}</span>
        <em>Click to open the full key</em>
      </span>
    </button>
  );
};

export const FieldKeyHint = ({ label = 'What do these mean?', termId = null }) => {
  const ctx = useContext(FieldKeyContext);
  if (!ctx) return null;
  return (
    <button type="button" className="fieldkey-hint" onClick={() => ctx.openKey(termId)}>
      <BookOpen size={12} /> {label}
    </button>
  );
};

const FieldKeyLauncher = ({ label }) => {
  const ctx = useContext(FieldKeyContext);
  if (!ctx || ctx.open) return null;
  return (
    <button type="button" className="fieldkey-launcher" onClick={() => ctx.openKey(null)} title='Open the field key (or press "?")'>
      <BookOpen size={15} />
      <span>{label}</span>
      <kbd>?</kbd>
    </button>
  );
};

const FieldKeyPanel = ({ groups, focusTermId, onClose, keyLabel, subtitle }) => {
  const [query, setQuery] = useState('');
  const focusRef = useRef(null);

  useEffect(() => {
    if (focusTermId && focusRef.current) {
      focusRef.current.scrollIntoView({ block: 'center' });
    }
  }, [focusTermId]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = groups
    .map(group => ({
      ...group,
      terms: normalizedQuery
        ? group.terms.filter(term => [term.term, ...(term.aka || []), term.def, term.example].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery))
        : group.terms,
    }))
    .filter(group => group.terms.length > 0);

  return (
    <div className="fieldkey-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="fieldkey-panel" role="dialog" aria-label={keyLabel} aria-modal="true">
        <div className="fieldkey-head">
          <div>
            <div className="fieldkey-title"><BookOpen size={16} /> {keyLabel}</div>
            <p>{subtitle}</p>
          </div>
          <button type="button" className="fieldkey-close" onClick={onClose} aria-label="Close field key"><X size={16} /></button>
        </div>
        <div className="fieldkey-search">
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search terms (observer, NPT, past due...)"
            autoFocus
          />
        </div>
        <div className="fieldkey-body">
          {visibleGroups.map(group => (
            <section key={group.id} className="fieldkey-group">
              <h4>{group.label}</h4>
              {group.blurb && <p className="fieldkey-blurb">{group.blurb}</p>}
              {group.terms.map(term => (
                <article
                  key={term.id}
                  ref={term.id === focusTermId ? focusRef : undefined}
                  className={`fieldkey-term ${term.id === focusTermId ? 'fieldkey-term-focus' : ''}`}
                >
                  <div className="fieldkey-term-head">
                    <strong>{term.term}</strong>
                    {(term.aka || []).map(alias => <span key={alias} className="fieldkey-aka">{alias}</span>)}
                  </div>
                  <p>{term.def}</p>
                  {term.example && <p className="fieldkey-example">{term.example}</p>}
                </article>
              ))}
            </section>
          ))}
          {visibleGroups.length === 0 && <p className="fieldkey-empty">No terms match &ldquo;{query}&rdquo;.</p>}
        </div>
        <div className="fieldkey-foot">Dotted-underlined labels anywhere on this page open this key. Press <kbd>?</kbd> to toggle it.</div>
      </aside>
    </div>
  );
};
