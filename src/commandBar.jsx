import { useEffect, useMemo, useRef, useState } from 'react';
import { List, Layers, ClipboardCheck, UserCircle, ArrowRight, Plus, Search } from 'lucide-react';
import { buildCommandResults } from './lib/commandSearch';

// Over-The-Top item 1: one keystroke, one box. Find any task, project, NCR,
// or person; jump to any page; create from anywhere. Search runs over the
// client's in-memory data — objectives, projects, the lean NCR list, and
// profiles are all already loaded, so results are instant as you type and
// RLS is untouched. When multi-tenant data outgrows memory, this provider
// swaps for a server RPC without changing the surface.

const KIND_META = {
  page: { label: 'Pages', Icon: ArrowRight },
  task: { label: 'Tasks', Icon: List },
  project: { label: 'Projects', Icon: Layers },
  ncr: { label: 'NCRs', Icon: ClipboardCheck },
  person: { label: 'People', Icon: UserCircle },
};

export const CommandBar = ({
  open,
  onClose,
  objectives,
  okrProjects,
  ncrReports,
  profiles,
  onOpenObjective,
  onOpenNcr,
  onNavigate,
  onCreateTask,
}) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const results = useMemo(
    () => buildCommandResults({ query, objectives, okrProjects, ncrReports, profiles }),
    [query, objectives, okrProjects, ncrReports, profiles],
  );

  const actions = useMemo(() => (
    query.trim()
      ? [{ kind: 'action', id: 'create-task', title: `Create a task: “${query.trim()}”`, subtitle: 'Opens the guided wizard' }]
      : []
  ), [query]);

  const flat = useMemo(() => [...results, ...actions], [results, actions]);

  useEffect(() => {
    setSelected((prev) => Math.min(prev, Math.max(flat.length - 1, 0)));
  }, [flat.length]);

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-selected="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!open) return null;

  const activate = (item) => {
    if (!item) return;
    onClose();
    if (item.kind === 'page') onNavigate?.(item.id);
    else if (item.kind === 'task') onOpenObjective?.(item.record || item.id);
    else if (item.kind === 'project') onNavigate?.('okr');
    else if (item.kind === 'ncr') onOpenNcr?.(item.id);
    else if (item.kind === 'person') onNavigate?.('organization');
    else if (item.kind === 'action' && item.id === 'create-task') onCreateTask?.(query.trim());
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); setSelected((s) => Math.min(s + 1, flat.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    else if (event.key === 'Enter') { event.preventDefault(); activate(flat[selected]); }
  };

  let lastKind = null;

  return (
    <div className="cmdbar-overlay" role="dialog" aria-modal="true" aria-label="Search everything" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmdbar">
        <div className="cmdbar-input-row">
          <Search size={17} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search tasks, NCRs, projects, people — or jump anywhere…"
            onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={onKeyDown}
            aria-label="Search everything"
          />
          <kbd>esc</kbd>
        </div>
        <div className="cmdbar-results" ref={listRef}>
          {flat.length === 0 && query.trim() && (
            <div className="cmdbar-empty">Nothing matches “{query.trim()}” — try fewer words, or create it below by pressing Enter.</div>
          )}
          {flat.length === 0 && !query.trim() && (
            <div className="cmdbar-empty">Type to search everything — tasks, NCRs, projects, people, pages.</div>
          )}
          {flat.map((item, index) => {
            const meta = item.kind === 'action' ? { label: 'Actions', Icon: Plus } : KIND_META[item.kind];
            const header = meta.label !== lastKind ? meta.label : null;
            lastKind = meta.label;
            const RowIcon = meta.Icon;
            return (
              <div key={`${item.kind}-${item.id}`}>
                {header && <div className="cmdbar-group">{header}</div>}
                <button
                  type="button"
                  className={`cmdbar-row ${index === selected ? 'selected' : ''}`}
                  data-selected={index === selected}
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => activate(item)}
                >
                  <RowIcon size={15} />
                  <span className="cmdbar-title">{item.title}</span>
                  {item.legacy && <span className="cmdbar-badge">LEGACY</span>}
                  {item.subtitle && <span className="cmdbar-sub">{item.subtitle}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="cmdbar-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>⌘K</kbd> anywhere</span>
        </div>
      </div>
    </div>
  );
};
