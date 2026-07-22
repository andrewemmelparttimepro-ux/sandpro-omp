import { Bell, X } from 'lucide-react';
import { Badge } from '../uiPrimitives';

export default function NotificationPanel({ notifications, onMarkAllRead, onClose, onClickNotif }) {
  const unread = notifications.filter((item) => !item.isRead).length;
  const getColor = (type) => {
    const map = { assignment: 'var(--info)', delegation: 'var(--brand)', mention: 'var(--brand)', comment: 'var(--accent-8)', status_change: 'var(--warning)', due_soon: 'var(--warning)', overdue: 'var(--error)', blocker: 'var(--error)', acknowledgement: 'var(--success)' };
    return map[type] || 'var(--accent-7)';
  };
  const orderedNotifications = [...notifications].sort((left, right) => {
    const unreadRank = Number(!right.isRead) - Number(!left.isRead);
    if (unreadRank !== 0) return unreadRank;
    const priorityRank = Number(right.priority === 'priority') - Number(left.priority === 'priority');
    if (priorityRank !== 0) return priorityRank;
    return new Date(right.ts || 0) - new Date(left.ts || 0);
  });

  return (
    <div className="notification-dropdown" onClick={(event) => event.stopPropagation()}>
      <div className="card-header justify-between">
        <div className="flex items-center gap-8">
          <Bell size={14} color="var(--brand)" />
          <span className="text-md font-bold">Notifications</span>
          {unread > 0 && <Badge color="var(--error)">{unread}</Badge>}
        </div>
        <div className="flex items-center gap-4">
          {unread > 0 && <button className="btn btn-xs btn-ghost" onClick={onMarkAllRead}>Mark all read</button>}
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
      </div>
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {notifications.length === 0 ? <div className="text-sm text-muted" style={{ padding: 24, textAlign: 'center' }}>No notifications</div> :
          orderedNotifications.map((item) => (
            <div key={item.id} onClick={() => onClickNotif(item)} className={`notification-item ${!item.isRead ? 'unread' : ''} ${item.priority === 'priority' ? 'priority' : ''} flex gap-10 cursor-pointer`} style={{
              padding: '12px 16px', borderBottom: '1px solid var(--accent-4)',
              background: item.isRead ? 'transparent' : 'rgba(var(--sandpro-orange-rgb),0.03)'
            }} onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--accent-4)'; }} onMouseLeave={(event) => { event.currentTarget.style.background = item.isRead ? 'transparent' : 'rgba(var(--sandpro-orange-rgb),0.03)'; }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: (item.priority === 'priority' ? 'var(--brand)' : getColor(item.type)) + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Bell size={13} color={item.priority === 'priority' ? 'var(--brand)' : getColor(item.type)} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="text-sm" style={{ lineHeight: 1.4, color: item.isRead ? 'var(--accent-8)' : 'var(--accent-10)' }}>{item.message}</div>
                <div className="notification-meta text-xs text-muted" style={{ marginTop: 2 }}>
                  {new Date(item.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {item.priority === 'priority' && <span className="notification-priority-badge">Jake priority</span>}
                </div>
              </div>
              {!item.isRead && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand)', flexShrink: 0, marginTop: 6 }} />}
            </div>
          ))}
      </div>
    </div>
  );
}
