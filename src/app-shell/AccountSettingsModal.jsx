import { useRef, useState } from 'react';
import { Settings, X, Camera, Loader2, Upload, Trash2, Sun, Moon, Smartphone, KeyRound, LogOut, MoonStar } from 'lucide-react';
import { Avatar } from '../uiPrimitives';
import { canUseQuietHours } from '../data';
import { useAppFlag } from '../lib/flags';
import { useQuietHours } from '../hooks/useSupabase';

const HOUR_LABELS = Array.from({ length: 24 }, (_, hour) => ({
  hour,
  label: new Date(2026, 0, 1, hour).toLocaleTimeString('en-US', { hour: 'numeric' }),
}));

export default function AccountSettingsModal({
  currentUser,
  theme,
  onThemeChange,
  canManageAiFeatures,
  aiFeaturesEnabled,
  onToggleAiFeatures,
  pushNotifications,
  onEnablePush,
  onDisablePush,
  onUploadAvatar,
  onRemoveAvatar,
  onProfilePhotoChanged,
  onChangePassword,
  onClose,
  onSignOut,
}) {
  const avatarInputRef = useRef(null);
  const quietFlagOn = useAppFlag('quiet_hours_all');
  const quietHoursVisible = canUseQuietHours(currentUser, quietFlagOn);
  const quietHours = useQuietHours(quietHoursVisible ? currentUser?.id : null);
  const [quietError, setQuietError] = useState('');
  const saveQuiet = async (changes) => {
    setQuietError('');
    try {
      await quietHours.save(changes);
    } catch (error) {
      setQuietError(error.message || 'Could not save quiet hours.');
    }
  };
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordStatus, setPasswordStatus] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarStatus, setAvatarStatus] = useState('');
  const [avatarError, setAvatarError] = useState('');
  const [avatarDragging, setAvatarDragging] = useState(false);

  const handleAvatarFile = async (file) => {
    setAvatarStatus('');
    setAvatarError('');
    if (!file) return;
    setAvatarBusy(true);
    try {
      await onUploadAvatar(file);
      await onProfilePhotoChanged?.();
      setAvatarStatus('Profile photo updated.');
    } catch (error) {
      setAvatarError(error.message || 'Could not update profile photo.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleAvatarInput = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    await handleAvatarFile(file);
  };

  const handleAvatarDrop = async (event) => {
    event.preventDefault();
    setAvatarDragging(false);
    await handleAvatarFile(event.dataTransfer.files?.[0]);
  };

  const handleAvatarRemove = async () => {
    setAvatarStatus('');
    setAvatarError('');
    setAvatarBusy(true);
    try {
      await onRemoveAvatar();
      await onProfilePhotoChanged?.();
      setAvatarStatus('Profile photo removed.');
    } catch (error) {
      setAvatarError(error.message || 'Could not remove profile photo.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const submitPassword = async (event) => {
    event.preventDefault();
    setPasswordStatus('');
    setPasswordError('');
    if (password.length < 8) {
      setPasswordError('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      await onChangePassword(password);
      setPassword('');
      setConfirm('');
      setPasswordStatus('Password updated.');
    } catch (error) {
      setPasswordError(error.message || 'Could not update password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const pushAction = async () => {
    if (pushNotifications.enabled) await onDisablePush();
    else await onEnablePush();
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 2600 }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal-content account-settings-modal" role="dialog" aria-modal="true" aria-label="Account settings">
        <div className="card-header justify-between">
          <div className="flex items-center gap-8">
            <Settings size={16} color="var(--brand)" />
            <span className="text-md font-bold">Account settings</span>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close account settings"><X size={16} /></button>
        </div>
        <div className="account-settings-body">
          <section className="account-settings-card account-settings-profile">
            <Avatar user={currentUser} size={44} />
            <div>
              <div className="text-md font-bold">{currentUser.name}</div>
              <div className="text-sm text-muted">{currentUser.email}</div>
              <div className="text-xs text-muted">{currentUser.title} · {currentUser.department} · {currentUser.role}</div>
            </div>
          </section>

          <section
            className={`account-settings-card account-photo-card ${avatarDragging ? 'dragging' : ''}`}
            onDragEnter={(event) => { event.preventDefault(); setAvatarDragging(true); }}
            onDragOver={(event) => { event.preventDefault(); setAvatarDragging(true); }}
            onDragLeave={(event) => { if (event.currentTarget === event.target) setAvatarDragging(false); }}
            onDrop={handleAvatarDrop}
          >
            <div className="account-photo-preview">
              <Avatar user={currentUser} size={72} />
              <button
                type="button"
                className="account-photo-camera"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarBusy}
                aria-label="Choose profile photo"
              >
                {avatarBusy ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
              </button>
            </div>
            <div className="account-photo-content">
              <div>
                <div className="text-sm font-bold">Profile photo</div>
                <div className="text-xs text-muted">Shown app-wide in comments, owners, rosters, notes, and navigation. Drop an image here or choose one from this device.</div>
              </div>
              <div className="account-photo-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => avatarInputRef.current?.click()} disabled={avatarBusy}>
                  <Upload size={14} /> Choose photo
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleAvatarRemove} disabled={avatarBusy || !currentUser.avatar_url}>
                  <Trash2 size={14} /> Remove
                </button>
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                onChange={handleAvatarInput}
              />
              {avatarStatus && <div className="text-xs text-success">{avatarStatus}</div>}
              {avatarError && <div className="text-xs text-error">{avatarError}</div>}
            </div>
          </section>

          <section className="account-settings-card">
            <div className="account-settings-row">
              <div>
                <div className="text-sm font-bold">Appearance</div>
                <div className="text-xs text-muted">Choose the app theme for this device.</div>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}>
                {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
            </div>
            <div className="account-settings-row">
              <div>
                <div className="text-sm font-bold">Push notifications</div>
                <div className="text-xs text-muted">{pushNotifications.message || (pushNotifications.enabled ? 'Enabled on this device.' : 'Use this device for mobile alerts.')}</div>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={pushAction} disabled={pushNotifications.loading || (!pushNotifications.supported && !pushNotifications.enabled)}>
                {pushNotifications.loading ? <Loader2 size={14} className="animate-spin" /> : <Smartphone size={14} />}
                {pushNotifications.enabled ? 'Disable' : 'Enable'}
              </button>
            </div>
            {quietHoursVisible && (
              <div className="account-settings-row quiet-hours-row" data-testid="quiet-hours-settings">
                <div>
                  <div className="text-sm font-bold flex items-center gap-6"><MoonStar size={13} /> Quiet hours</div>
                  <div className="text-xs text-muted">
                    {quietHours.enabled
                      ? `Pushes hold from ${HOUR_LABELS[quietHours.start]?.label} to ${HOUR_LABELS[quietHours.end]?.label} CT — one catch-up in the morning. Priority alerts still ring.`
                      : 'Hold non-urgent pushes overnight; the bell keeps everything.'}
                  </div>
                  {quietError && <div className="text-xs" style={{ color: 'var(--error)', marginTop: 4 }}>{quietError}</div>}
                  {quietHours.enabled && (
                    <div className="quiet-hours-pickers">
                      <label>From
                        <select value={quietHours.start} onChange={(e) => saveQuiet({ start: Number(e.target.value) })}>
                          {HOUR_LABELS.map(({ hour, label }) => <option key={hour} value={hour}>{label}</option>)}
                        </select>
                      </label>
                      <label>to
                        <select value={quietHours.end} onChange={(e) => saveQuiet({ end: Number(e.target.value) })}>
                          {HOUR_LABELS.map(({ hour, label }) => <option key={hour} value={hour}>{label}</option>)}
                        </select>
                      </label>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={quietHours.enabled}
                  aria-label="Toggle quiet hours"
                  className={`ai-switch ${quietHours.enabled ? 'on' : ''}`}
                  onClick={() => saveQuiet({ enabled: !quietHours.enabled })}
                >
                  <span />
                </button>
              </div>
            )}
            {canManageAiFeatures && (
              <div className="account-settings-row">
                <div>
                  <div className="text-sm font-bold">AI features</div>
                  <div className="text-xs text-muted">{aiFeaturesEnabled ? 'On for your dashboard' : 'Off for now'}</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={aiFeaturesEnabled}
                  aria-label="Toggle AI features in account settings"
                  className={`ai-switch ${aiFeaturesEnabled ? 'on' : ''}`}
                  onClick={() => onToggleAiFeatures(!aiFeaturesEnabled)}
                >
                  <span />
                </button>
              </div>
            )}
          </section>

          <form className="account-settings-card" onSubmit={submitPassword}>
            <div className="flex items-center gap-8" style={{ marginBottom: 12 }}>
              <KeyRound size={15} color="var(--brand)" />
              <div>
                <div className="text-sm font-bold">Change password</div>
                <div className="text-xs text-muted">Update the password for this signed-in account.</div>
              </div>
            </div>
            <div className="account-password-grid">
              <label>
                <span>New password</span>
                <input type="password" value={password} onChange={(event) => { setPassword(event.target.value); setPasswordError(''); setPasswordStatus(''); }} autoComplete="new-password" />
              </label>
              <label>
                <span>Confirm password</span>
                <input type="password" value={confirm} onChange={(event) => { setConfirm(event.target.value); setPasswordError(''); setPasswordStatus(''); }} autoComplete="new-password" />
              </label>
            </div>
            {passwordError && <div className="text-sm text-error" style={{ marginTop: 8 }}>{passwordError}</div>}
            {passwordStatus && <div className="text-sm" style={{ color: 'var(--success)', marginTop: 8 }}>{passwordStatus}</div>}
            <div className="account-settings-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={savingPassword}>
                {savingPassword ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                Save password
              </button>
            </div>
          </form>

          <section className="account-settings-footer">
            <div className="text-xs text-muted">Shortcuts: <span className="mono">c</span> new · <span className="mono">/</span> search · <span className="mono">esc</span> close</div>
            <button type="button" className="btn btn-ghost btn-sm text-error" onClick={onSignOut}><LogOut size={14} /> Sign out</button>
          </section>
        </div>
      </div>
    </div>
  );
}
