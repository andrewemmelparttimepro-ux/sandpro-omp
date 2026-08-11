import { LayoutDashboard, Target, Plus, ClipboardCheck, Users } from 'lucide-react';

// Over-The-Top item 3: the thumb bar. Every daily destination reachable with
// a thumb, standing up, in sunlight — Create sits in the middle because
// capturing work IS the daily action. Renders only on mobile viewports.
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Tasks', Icon: LayoutDashboard },
  { id: 'okr', label: 'OKR', Icon: Target },
  { id: 'create', label: 'New', Icon: Plus, isAction: true },
  { id: 'ncr', label: 'NCR', Icon: ClipboardCheck },
  { id: 'organization', label: 'Org', Icon: Users },
];

export const MobileNav = ({ activePage, onNavigate, onCreate }) => (
  <nav className="mobile-bottom-nav" aria-label="Primary">
    {NAV_ITEMS.map(({ id, label, Icon, isAction }) => (
      <button
        key={id}
        type="button"
        className={`mobile-bottom-nav-item ${isAction ? 'action' : ''} ${!isAction && activePage === id ? 'active' : ''}`}
        aria-label={isAction ? 'Create new' : label}
        aria-current={!isAction && activePage === id ? 'page' : undefined}
        onClick={() => (isAction ? onCreate() : onNavigate(id))}
      >
        <Icon size={isAction ? 24 : 20} strokeWidth={isAction ? 2.4 : 2} />
        {!isAction && <span>{label}</span>}
      </button>
    ))}
  </nav>
);
