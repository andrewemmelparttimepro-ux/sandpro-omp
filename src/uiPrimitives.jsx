const getAvatarInitials = (user) => {
  const explicit = String(user?.initials || '').trim();
  if (explicit) return explicit.slice(0, 3).toUpperCase();
  const name = String(user?.name || '').trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    return parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  const id = String(user?.id || '').trim();
  return id ? id.slice(0, 2).toUpperCase() : '??';
};

export const Avatar = ({ user, size = 32 }) => (
  user?.avatar_url ? (
    <img src={user.avatar_url} alt={user.name || 'User'} className="avatar" style={{ width: size, height: size, objectFit: 'cover', background: user?.color || 'var(--accent-7)' }} />
  ) : (
    <div className="avatar" style={{ width: size, height: size, background: user?.color || 'var(--accent-7)', fontSize: size * 0.35 }}>
      {getAvatarInitials(user)}
    </div>
  )
);

export const Badge = ({ children, color = '#ff7f02', outline = false }) => (
  <span className="badge" style={{
    background: outline ? 'transparent' : color + '22',
    color,
    border: outline ? `1px solid ${color}44` : 'none'
  }}>
    {children}
  </span>
);
