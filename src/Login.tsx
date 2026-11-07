import { useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Moon, ShieldCheck, Sun } from 'lucide-react'
import { api, saveToken, type User } from './api'
import './auth.css'

type LoginProps = { onAuthenticated: (user: User) => void; theme: 'light' | 'dark'; onToggleTheme: () => void }

const localAccounts = [
  { label: 'Creator', email: 'creator@brandguard.local', password: 'CreatorPass123!' },
  { label: 'Reviewer', email: 'reviewer@brandguard.local', password: 'ReviewPass123!' },
  { label: 'Admin', email: 'admin@brandguard.local', password: 'AdminPass123!' },
]

export default function Login({ onAuthenticated, theme, onToggleTheme }: LoginProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (mode === 'register' && password.length < 12) {
      setError('Password must be at least 12 characters.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = mode === 'login' ? await api.login(email, password) : await api.register(email, password)
      saveToken(result.token)
      onAuthenticated(result.user)
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Unable to sign in. Try again.')
    } finally {
      setBusy(false)
    }
  }

  function fillAccount(account: typeof localAccounts[number]) {
    setMode('login')
    setEmail(account.email)
    setPassword(account.password)
    setError('')
  }

  return <main className="auth-page">
    <section className="auth-intro">
      <div className="auth-brand"><span className="auth-mark"><ShieldCheck size={23} /></span><span>brandguard<span>ai</span></span></div>
      <div className="auth-message"><div className="eyebrow">BRAND ASSURANCE WORKSPACE</div><h1>Every claim.<br />Grounded in evidence.</h1><p>Keep your brand consistent from first draft to final approval, with the rules and sources behind every decision.</p>
        <div className="auth-proof"><div className="proof-line"><span className="proof-check">✓</span><span><strong>Approved knowledge</strong><small>One source of truth for your team</small></span></div><div className="proof-line"><span className="proof-check">✓</span><span><strong>Evidence-linked review</strong><small>Every finding points back to its rule</small></span></div><div className="proof-line"><span className="proof-check">✓</span><span><strong>Human-owned decisions</strong><small>Reviewers remain in control</small></span></div></div>
      </div>
      <div className="auth-foot">CHECK. COMPLY. PUBLISH. <span>·</span> PRIVATE BRAND WORKSPACE</div>
    </section>
    <section className="auth-form-side"><button type="button" className="icon-button auth-theme-toggle" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} onClick={onToggleTheme}>{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}</button><div className="auth-form-wrap">
      <div className="auth-form-heading"><div className="auth-lock"><LockKeyhole size={17} /></div><div className="eyebrow">BRIGHTPATH INSTITUTE</div><h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2><p>{mode === 'login' ? 'Sign in to your brand workspace.' : 'Join the workspace as a content creator.'}</p></div>
      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="auth-email">Work email</label><input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" />
        <label htmlFor="auth-password">Password</label><div className="password-field"><input id="auth-password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 12 : 1} maxLength={mode === 'register' ? 100 : undefined} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'register' ? 'At least 12 characters' : 'Enter your password'} /><button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="button button-primary auth-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}<ArrowRight size={16} /></button>
      </form>
      <div className="auth-switch">{mode === 'login' ? 'New to this workspace?' : 'Already have an account?'} <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>{mode === 'login' ? 'Create account' : 'Sign in'}</button></div>
      {import.meta.env.DEV && <div className="dev-accounts"><div className="dev-accounts-head"><span>LOCAL DEVELOPMENT ACCOUNTS</span><span>DEV</span></div><div className="dev-account-buttons">{localAccounts.map((account) => <button key={account.label} onClick={() => fillAccount(account)}>{account.label}</button>)}</div><p>Available when the API starts with seeded users enabled.</p></div>}
      <div className="auth-secure-note"><LockKeyhole size={13} /> Passwords are protected. Access is role-based.</div>
    </div></section>
  </main>
}
