// Over-The-Top item 9: the lock that explains itself. Renders on a control
// the current user can't use — says why, names who can, and offers one-tap
// request-access that pings the right people. Renders nothing when the user
// isn't in the legibility pilot, when the capability isn't locked for them,
// or when the capability id is unknown.
import { useEffect, useRef, useState } from 'react';
import { Lock, Send, Check } from 'lucide-react';
import { getProfiles } from './data';
import { useAppFlag } from './lib/flags';
import {
  buildRequestMessage,
  canSeePermissionLegibility,
  requestRecipients,
  requestStampKey,
  resolveCapability,
} from './permissionLegibility';

const stampStorage = {
  get: (key) => { try { return window.localStorage.getItem(key); } catch { return null; } },
  set: (key, value) => { try { window.localStorage.setItem(key, value); } catch { /* session-only */ } },
};

export const LockedHint = ({
  capability,
  currentUser,
  ctx = {},
  createNotification,
  addToast,
  variant = 'chip', // chip | tab | icon
  label = "Why can't I?",
}) => {
  const flagOn = useAppFlag('permission_legibility');
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentNames, setSentNames] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  if (!canSeePermissionLegibility(currentUser, flagOn)) return null;
  const resolved = resolveCapability(capability, currentUser, getProfiles(), ctx);
  if (!resolved || !resolved.locked) return null;

  const stampKey = requestStampKey(currentUser.id, capability);
  const alreadyAskedToday = Boolean(stampStorage.get(stampKey)) || Boolean(sentNames);
  const recipients = requestRecipients(resolved.allowedUsers);
  const whoCan = resolved.allowedUsers.slice(0, 6).map((p) => p.name).filter(Boolean);

  const requestAccess = async (event) => {
    event.stopPropagation();
    if (sending || alreadyAskedToday || !createNotification || recipients.length === 0) return;
    setSending(true);
    try {
      const message = buildRequestMessage(currentUser, resolved);
      for (const recipient of recipients) {
        await createNotification(recipient.id, 'access_request', null, message, {
          senderId: currentUser.id,
          detailLabel: 'Access request',
          detailText: `Locked control: ${resolved.label}. ${resolved.why}`,
        });
      }
      stampStorage.set(stampKey, new Date().toISOString());
      const firstNames = recipients.map((p) => (p.name || '').split(' ')[0]).filter(Boolean).join(', ');
      setSentNames(firstNames);
      addToast?.({ type: 'success', message: `Request sent — ${firstNames} got a heads-up.` });
    } catch {
      addToast?.({ type: 'error', message: 'The request did not send. Try again.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <span className={`locked-hint locked-hint-${variant}`} ref={rootRef} data-testid="locked-hint" data-capability={capability}>
      <button
        type="button"
        className="locked-hint-chip"
        onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}
        aria-expanded={open}
        aria-label={`${resolved.label} is locked — see why`}
        title={`${resolved.label} is locked for you`}
      >
        <Lock size={variant === 'icon' ? 14 : 12} />
        {variant !== 'icon' && <span>{variant === 'tab' ? resolved.label : label}</span>}
      </button>
      {open && (
        <span className="locked-hint-pop" role="dialog" aria-label={`Why ${resolved.label} is locked`}>
          <strong>{resolved.label}</strong>
          <p>{resolved.why}</p>
          {whoCan.length > 0 && (
            <p className="locked-hint-who">
              <b>Who can:</b> {whoCan.join(', ')}{resolved.allowedUsers.length > whoCan.length ? ` +${resolved.allowedUsers.length - whoCan.length} more` : ''}
            </p>
          )}
          {createNotification && recipients.length > 0 && (
            <button type="button" className="locked-hint-request" onClick={requestAccess} disabled={sending || alreadyAskedToday}>
              {alreadyAskedToday ? <Check size={12} /> : <Send size={12} />}
              {alreadyAskedToday ? (sentNames ? `Sent — ${sentNames} got a heads-up` : 'Requested today') : sending ? 'Sending…' : 'Request access'}
            </button>
          )}
        </span>
      )}
    </span>
  );
};
