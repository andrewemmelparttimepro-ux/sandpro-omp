import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { DEFAULT_DEPARTMENT, getDepartmentOptions } from '../data';

export default function LoginScreen({ onSignIn, onSignUp, onResetPassword, brandLogoSrc }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('signin');
  const [resetSent, setResetSent] = useState(false);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState(DEFAULT_DEPARTMENT);

  const handleSubmit = async (event) => {
    if (event) event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (mode === 'reset') {
      if (!normalizedEmail) {
        setError('Email required');
        return;
      }
    } else if (!normalizedEmail || !password) {
      setError('Email and password required');
      return;
    }
    if (normalizedEmail !== email) setEmail(normalizedEmail);
    setError('');
    setLoading(true);
    try {
      if (mode === 'reset') {
        if (!normalizedEmail) {
          setError('Email required');
          setLoading(false);
          return;
        }
        await onResetPassword(normalizedEmail);
        setResetSent(true);
        setLoading(false);
        return;
      }
      if (mode === 'signin') {
        await onSignIn(normalizedEmail, password);
      } else {
        if (!name) {
          setError('Name is required');
          setLoading(false);
          return;
        }
        const initials = name.split(' ').map((part) => part[0]).join('').toUpperCase().slice(0, 2);
        const colors = ['#ff7f02', '#3B82F6', '#8B5CF6', '#10B981', '#EC4899', '#F59E0B', '#06B6D4', '#84CC16'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        await onSignUp(normalizedEmail, password, { name, initials, title, department, role: 'contributor', color });
      }
    } catch (err) {
      const message = err.message || 'Authentication failed';
      setError(/rate limit|security purposes|after \\d+ seconds/i.test(message)
        ? 'A reset email was requested recently. Please wait about one minute, then try again.'
        : message);
    }
    setLoading(false);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: 'var(--accent-1)', backgroundImage: 'radial-gradient(circle at 50% 30%, var(--accent-3) 0%, var(--accent-1) 70%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420, padding: 'clamp(24px, 5vw, 40px)', background: 'var(--accent-2)', border: '1px solid var(--accent-5)', borderRadius: 20 }}>
        <div className="auth-brand-lockup" style={{ marginBottom: 32 }}>
          <img src={brandLogoSrc} alt="SandPro OMP" />
        </div>
        <p className="text-sm text-muted" style={{ textAlign: 'center', marginBottom: 24 }}>Objective Management Platform</p>

        <div className="nav-pills" style={{ marginBottom: 20 }}>
          <button onClick={() => { setMode('signin'); setError(''); setResetSent(false); }} className={`nav-pill ${mode === 'signin' ? 'active' : ''}`} style={{ flex: 1, justifyContent: 'center' }}>Sign In</button>
          <button onClick={() => { setMode('signup'); setError(''); setResetSent(false); }} className={`nav-pill ${mode === 'signup' ? 'active' : ''}`} style={{ flex: 1, justifyContent: 'center' }}>Sign Up</button>
        </div>

        {resetSent && (
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--success-bg)', border: '1px solid rgba(16,185,129,0.2)', marginBottom: 16, textAlign: 'center' }}>
            <p className="text-sm" style={{ color: 'var(--success)', margin: 0 }}>Password reset link sent! Check your email.</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <>
              <div style={{ marginBottom: 14 }}>
                <label className="text-xs font-semibold text-muted" style={{ display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Full Name *</label>
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Jake Feil" style={{ width: '100%' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label className="text-xs font-semibold text-muted" style={{ display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Title</label>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="CEO" style={{ width: '100%' }} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted" style={{ display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Department</label>
                  <select value={department} onChange={(event) => setDepartment(event.target.value)} style={{ width: '100%' }}>
                    {getDepartmentOptions(department).map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}
          <div style={{ marginBottom: 14 }}>
            <label className="text-xs font-semibold text-muted" style={{ display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email</label>
            <input value={email} onChange={(event) => { setEmail(event.target.value); setError(''); }} placeholder="you@sandpro.com" style={{ width: '100%' }} autoComplete="email" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label className="text-xs font-semibold text-muted" style={{ display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Password</label>
            <input type="password" value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} placeholder="Min 6 characters" style={{ width: '100%' }} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
          </div>
          {error && <p className="text-sm text-error" style={{ marginBottom: 12 }}>{error}</p>}
          <button type="submit" className="btn btn-primary w-full" style={{ justifyContent: 'center', padding: '12px 16px', fontSize: 14 }} disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : mode === 'reset' ? 'Send Reset Link' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
          {mode === 'signin' && (
            <button type="button" onClick={() => { setMode('reset'); setError(''); }} className="text-sm" style={{ color: 'var(--brand)', marginTop: 8, display: 'block', textAlign: 'center', width: '100%' }}>
              Forgot password?
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
