import { useEffect, useMemo, useState } from 'react'
import Login from './Login'
import { api, clearToken, token, type Brand, type Finding, type Rule, type RuleInput, type Submission, type User } from './api'
import {
  Activity,
  Archive,
  ArrowRight,
  BadgeCheck,
  Bell,
  BookOpenCheck,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileCheck2,
  FileText,
  Gauge,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  LogOut,
  MessageSquareText,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Moon,
  Upload,
  X,
} from 'lucide-react'

type View = 'Overview' | 'Submissions' | 'Review queue' | 'Brand library' | 'Analytics'
type ReviewDecision = 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT'
type Theme = 'light' | 'dark'

const navItems: { label: View; icon: typeof LayoutDashboard }[] = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Submissions', icon: FileText },
  { label: 'Review queue', icon: ListChecks },
  { label: 'Brand library', icon: BookOpenCheck },
  { label: 'Analytics', icon: Activity },
]

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function statusLabel(status: string) {
  return ({
    SUBMITTED: 'Submitted',
    ANALYSING: 'Analysing',
    NEEDS_CHANGES: 'Changes requested',
    IN_REVIEW: 'In review',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    FAILED: 'Analysis failed',
  } as Record<string, string>)[status] ?? status.replaceAll('_', ' ').toLowerCase()
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => localStorage.getItem('brandguard-theme') === 'dark' ? 'dark' : 'light')
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('brandguard-theme', theme)
  }, [theme])

  function toggleTheme() {
    setTheme((current) => current === 'light' ? 'dark' : 'light')
  }

  useEffect(() => {
    if (!token()) {
      setAuthReady(true)
      return
    }

    api.me()
      .then(setUser)
      .catch((error: unknown) => setAuthError(errorMessage(error)))
      .finally(() => setAuthReady(true))
  }, [])

  if (!authReady) {
    return <div className="auth-page"><div className="auth-form-wrap"><div className="auth-form-heading"><h2>Loading workspace…</h2></div></div></div>
  }

  if (authError) {
    return <div className="auth-page"><div className="auth-form-wrap"><div className="auth-form-heading"><h2>Workspace unavailable</h2><p>{authError}</p><button className="button button-primary" onClick={() => { clearToken(); setAuthError('') }}>Return to sign in</button></div></div></div>
  }

  if (!user) return <Login onAuthenticated={setUser} theme={theme} onToggleTheme={toggleTheme} />
  return <DashboardApp user={user} theme={theme} onToggleTheme={toggleTheme} onSignOut={() => { clearToken(); setUser(null) }} />
}

function DashboardApp({ user, theme, onToggleTheme, onSignOut }: { user: User; theme: Theme; onToggleTheme: () => void; onSignOut: () => void }) {
  const [activeView, setActiveView] = useState<View>('Overview')
  const [brand, setBrand] = useState<Brand | null>(null)
  const [rules, setRules] = useState<Rule[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [selectedFindingId, setSelectedFindingId] = useState('')
  const [draft, setDraft] = useState('')
  const [title, setTitle] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const canCreate = user.role === 'CREATOR' || user.role === 'BRAND_ADMIN'
  const canReview = user.role === 'REVIEWER' || user.role === 'BRAND_ADMIN'
  const profileName = user.email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  const selectedSubmission = submissions.find((submission) => submission.id === selectedId)
  const reviewQueue = submissions.filter((submission) => ['IN_REVIEW', 'NEEDS_CHANGES'].includes(submission.status))

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    Promise.all([api.brand(), api.rules(), api.submissions()])
      .then(([brandResult, ruleResults, submissionResults]) => {
        if (!active) return
        setBrand(brandResult)
        setRules(ruleResults)
        setSubmissions(submissionResults)
        const firstReview = submissionResults.find((submission) => ['IN_REVIEW', 'NEEDS_CHANGES'].includes(submission.status))
        const initial = firstReview ?? submissionResults[0]
        if (initial) {
          setSelectedId(initial.id)
          setSelectedFindingId('')
          setDraft(initial.content)
          setTitle(initial.title)
        }
      })
      .catch((issue: unknown) => {
        if (active) setError(errorMessage(issue))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [reloadKey])

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 3000)
  }

  function updateSubmission(submission: Submission) {
    setSubmissions((current) => [submission, ...current.filter((item) => item.id !== submission.id)])
    setSelectedId(submission.id)
    setDraft(submission.content)
    setTitle(submission.title)
  }

  function selectSubmission(id: string) {
    const submission = submissions.find((item) => item.id === id)
    setSelectedId(id)
    setSelectedFindingId('')
    setDraft(submission?.content ?? '')
    setTitle(submission?.title ?? '')
    setReviewNote('')
  }

  function startNewSubmission() {
    setSelectedId('')
    setSelectedFindingId('')
    setDraft('')
    setTitle('')
    setActiveView('Submissions')
    setError('')
  }

  async function runAnalysis() {
    if (!draft.trim() || !title.trim()) {
      setError('Add a submission title and draft before checking the content.')
      return
    }
    setBusy(true)
    setError('')
    try {
      let submission: Submission
      if (selectedSubmission?.status === 'NEEDS_CHANGES' && draft.trim() !== selectedSubmission.content && user.role === 'CREATOR') {
        submission = await api.revise(selectedSubmission.id, draft.trim())
      } else if (selectedSubmission && draft.trim() === selectedSubmission.content && !['APPROVED', 'REJECTED'].includes(selectedSubmission.status)) {
        submission = selectedSubmission
      } else {
        submission = await api.createSubmission(title.trim(), draft.trim())
      }
      submission = await api.analyze(submission.id)
      updateSubmission(submission)
      notify(submission.findings.length
        ? `${submission.findings.length} finding${submission.findings.length === 1 ? '' : 's'} linked to approved sources`
        : 'No rule matches found. Human review is still required.')
    } catch (issue) {
      setError(errorMessage(issue))
    } finally {
      setBusy(false)
    }
  }

  async function updateFinding(finding: Finding, state: 'ACCEPTED' | 'DISMISSED') {
    setBusy(true)
    setError('')
    try {
      const updated = await api.updateFinding(finding.id, state, state === 'ACCEPTED' ? 'Suggestion applied' : 'Dismissed by user')
      updateSubmission(updated)
      if (state === 'ACCEPTED') {
        const escaped = finding.excerpt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        setDraft((current) => current.replace(new RegExp(escaped, 'i'), finding.suggestedText))
        notify('Suggestion applied. Re-check the revised draft to submit a new version.')
      } else {
        notify('Finding dismissed and saved.')
      }
    } catch (issue) {
      setError(errorMessage(issue))
    } finally {
      setBusy(false)
    }
  }

  async function decide(decision: ReviewDecision) {
    if (!selectedSubmission) return
    if (!reviewNote.trim()) {
      setError('Add a reviewer note before recording a decision.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const updated = await api.decide(selectedSubmission.id, decision, reviewNote.trim())
      updateSubmission(updated)
      setReviewNote('')
      notify(`Decision recorded: ${statusLabel(updated.status)}.`)
    } catch (issue) {
      setError(errorMessage(issue))
    } finally {
      setBusy(false)
    }
  }

  async function saveBrandRule(rule: RuleInput, sourceId?: string) {
    setBusy(true)
    setError('')
    try {
      const updatedRules = sourceId ? await api.updateRule(sourceId, rule) : await api.createRule(rule)
      const updatedBrand = await api.brand()
      setRules(updatedRules)
      setBrand(updatedBrand)
      notify(sourceId ? 'Brand source updated and guideline version published.' : 'Brand source added and guideline version published.')
    } catch (issue) {
      setError(errorMessage(issue))
      throw issue
    } finally {
      setBusy(false)
    }
  }

  async function archiveBrandRule(sourceId: string) {
    setBusy(true)
    setError('')
    try {
      const updatedRules = await api.archiveRule(sourceId)
      const updatedBrand = await api.brand()
      setRules(updatedRules)
      setBrand(updatedBrand)
      notify('Brand source archived and guideline version published.')
    } catch (issue) {
      setError(errorMessage(issue))
      throw issue
    } finally {
      setBusy(false)
    }
  }

  async function loadTextFile(file?: File) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.txt')) {
      setError('Only .txt files are supported. Paste text from a PDF or DOCX instead.')
      return
    }
    try {
      setDraft(await file.text())
      setTitle((current) => current || file.name.replace(/\.txt$/i, ''))
      setSelectedId('')
      setSelectedFindingId('')
      setError('')
      notify(`${file.name} loaded into the draft.`)
    } catch (issue) {
      setError(errorMessage(issue))
    }
  }

  const allFindings = submissions.flatMap((submission) => submission.findings)
  const openCount = allFindings.filter((finding) => finding.state === 'OPEN').length
  const filteredSubmissions = submissions.filter((submission) =>
    `${submission.title} ${submission.creatorEmail} ${submission.status} ${submission.content}`.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><div className="brand-mark"><ShieldCheck size={21} strokeWidth={2.2} /></div><div><div className="brand-name">brandguard<span>ai</span></div><div className="brand-caption">CONTENT ASSURANCE</div></div></div>
        <button className="workspace-switcher" onClick={() => setActiveView('Brand library')}><span className="workspace-avatar">{brand?.name.charAt(0) ?? 'B'}</span><span className="workspace-copy"><strong>{brand?.name ?? 'Brand workspace'}</strong><small>Brand workspace</small></span><ChevronDown size={15} /></button>
        <div className="nav-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {navItems.map(({ label, icon: Icon }) => <button key={label} className={`nav-item ${activeView === label ? 'active' : ''}`} onClick={() => setActiveView(label)}>
            <Icon size={17} strokeWidth={1.8} /><span>{label}</span>{label === 'Review queue' && reviewQueue.length > 0 && <span className="nav-count">{reviewQueue.length}</span>}
          </button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><div className="tip-icon"><LockKeyhole size={15} /></div><div><strong>Human-led review</strong><p>AI findings never auto-approve content.</p></div></div>
          <div className="profile-row"><div className="profile-avatar">{profileName.slice(0, 2).toUpperCase()}</div><div className="profile-copy"><strong>{profileName}</strong><small>{user.role.replaceAll('_', ' ')}</small></div><button className="icon-button small-icon" aria-label="Sign out" onClick={onSignOut}><LogOut size={17} /></button></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>{brand?.name ?? 'Brand workspace'}</span><ChevronRight size={14} /><strong>{activeView}</strong></div>
          <div className="topbar-actions"><label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search workspace" aria-label="Search workspace" /></label><button className="icon-button theme-toggle" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} onClick={onToggleTheme}>{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}</button><button className="icon-button notification-button" aria-label="Notifications" onClick={() => notify('You’re all caught up')}><Bell size={17} /></button><div className="topbar-avatar">{profileName.slice(0, 2).toUpperCase()}</div></div>
        </header>
        <div className="page-content">
          {error && <div className="workspace-alert" role="alert"><span>{error}</span><button className="text-button" onClick={() => { setError(''); setReloadKey((value) => value + 1) }}>Retry</button></div>}
          {loading ? <div className="panel empty-state"><strong>Loading your workspace…</strong></div> : <>
            {activeView === 'Overview' && <Overview
              brand={brand} submissions={filteredSubmissions} openCount={openCount} profileName={profileName} setActiveView={setActiveView}
              startNewSubmission={startNewSubmission} canCreate={canCreate} selectSubmission={selectSubmission}
            />}
            {activeView === 'Submissions' && <Submissions
              brand={brand} submissions={filteredSubmissions} selectedSubmission={selectedSubmission} selectedId={selectedId}
              draft={draft} setDraft={setDraft} title={title} setTitle={setTitle} rules={rules}
              canCreate={canCreate} busy={busy} selectSubmission={selectSubmission} runAnalysis={runAnalysis}
              updateFinding={updateFinding} loadTextFile={loadTextFile} startNewSubmission={startNewSubmission}
              selectedFindingId={selectedFindingId} setSelectedFindingId={setSelectedFindingId}
            />}
            {activeView === 'Review queue' && <ReviewQueue
              submissions={reviewQueue.filter((submission) => filteredSubmissions.some((item) => item.id === submission.id))} selectedSubmission={selectedSubmission} canReview={canReview}
              selectSubmission={selectSubmission} reviewNote={reviewNote} setReviewNote={setReviewNote}
              decide={decide} busy={busy}
            />}
            {activeView === 'Brand library' && <BrandLibrary brand={brand} rules={rules} search={search}
              canManage={user.role === 'BRAND_ADMIN'} busy={busy} saveRule={saveBrandRule} archiveRule={archiveBrandRule} />}
            {activeView === 'Analytics' && <Analytics submissions={submissions} />}
          </>}
        </div>
      </main>
      {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    </div>
  )
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

function Overview({ brand, submissions, openCount, profileName, setActiveView, startNewSubmission, canCreate, selectSubmission }: {
  brand: Brand | null; submissions: Submission[]; openCount: number; profileName: string; setActiveView: (view: View) => void
  startNewSubmission: () => void; canCreate: boolean; selectSubmission: (id: string) => void
}) {
  const pending = submissions.filter((submission) => ['IN_REVIEW', 'NEEDS_CHANGES'].includes(submission.status))
  const analyzed = submissions.filter((submission) => submission.findings.length > 0)
  const linked = analyzed.flatMap((submission) => submission.findings).filter((finding) => finding.evidence).length
  const totalFindings = analyzed.flatMap((submission) => submission.findings).length
  const coverage = totalFindings ? Math.round((linked / totalFindings) * 100) : 0
  return <>
    <PageHeading eyebrow={brand?.name.toUpperCase() ?? 'BRAND WORKSPACE'} title={`Good morning, ${profileName}`} description="Here’s the latest activity across your brand workspace."
      action={canCreate && <button className="button button-primary" onClick={startNewSubmission}><Plus size={16} /> New submission</button>} />
    <section className="metrics-grid" aria-label="Workspace metrics">
      <Metric icon={FileText} label="Submissions" value={String(submissions.length)} trendNote="all time" accent="mint" />
      <Metric icon={CircleAlert} label="Open findings" value={String(openCount)} trendNote="across submissions" accent="coral" />
      <Metric icon={Clock3} label="Awaiting review" value={String(pending.filter((item) => item.status === 'IN_REVIEW').length)} trendNote="in the review queue" accent="blue" />
      <Metric icon={BadgeCheck} label="Evidence coverage" value={`${coverage}%`} trendNote={totalFindings ? `${linked} of ${totalFindings} findings linked` : 'from analyzed submissions'} accent="gold" />
    </section>
    <section className="section-head"><div><div className="eyebrow">RECENT SUBMISSIONS</div><h2>Your workspace activity</h2></div><button className="text-button" onClick={() => setActiveView('Submissions')}>View submissions <ArrowRight size={15} /></button></section>
    <section className="panel source-list">
      {submissions.slice(0, 5).map((submission) =>
        <button className="submission-list-row" key={submission.id} onClick={() => { selectSubmission(submission.id); setActiveView('Submissions') }}>
          <span className="file-icon"><FileText size={17} /></span><span className="submission-list-copy"><strong>{submission.title}</strong><small>{submission.creatorEmail} · Version {submission.versionNo}</small></span>
          <span className={`submission-status ${submission.status.toLowerCase()}`}>{statusLabel(submission.status)}</span><ChevronRight size={16} />
        </button>
      )}
      {!submissions.length && <div className="empty-state"><FileText size={22} /><strong>No submissions yet</strong><span>Start with a content draft to run your first check.</span></div>}
    </section>
    {pending.length > 0 && <div className="overview-queue-link"><button className="button button-secondary" onClick={() => setActiveView('Review queue')}><ListChecks size={15} /> Open review queue ({pending.length})</button></div>}
  </>
}

function Metric({ icon: Icon, label, value, trendNote, accent }: { icon: typeof FileText; label: string; value: string; trendNote: string; accent: string }) {
  return <article className="metric-card"><div className={`metric-icon ${accent}`}><Icon size={17} /></div><div className="metric-label">{label}</div><div className="metric-bottom"><strong>{value}</strong></div><div className="metric-note">{trendNote}</div></article>
}

function FindingRow({ finding, selected, onSelect }: { finding: Finding; selected: boolean; onSelect: () => void }) {
  return <button className={`finding-row ${selected ? 'selected' : ''} ${finding.state !== 'OPEN' ? 'resolved' : ''}`} onClick={onSelect}>
    <span className={`severity-mark ${finding.severity.toLowerCase()}`} /><span className="finding-copy"><strong>{finding.category}</strong><small>{finding.excerpt}</small></span>
    <span className={`severity-label ${finding.severity.toLowerCase()}`}>{finding.state === 'OPEN' ? finding.severity : finding.state}</span>
  </button>
}

function Submissions({ brand, submissions, selectedSubmission, selectedId, draft, setDraft, title, setTitle, rules, canCreate, busy, selectSubmission, runAnalysis, updateFinding, loadTextFile, startNewSubmission, selectedFindingId, setSelectedFindingId }: {
  brand: Brand | null; submissions: Submission[]; selectedSubmission?: Submission; selectedId: string; draft: string; setDraft: (value: string) => void
  title: string; setTitle: (value: string) => void; rules: Rule[]; canCreate: boolean; busy: boolean
  selectSubmission: (id: string) => void; runAnalysis: () => void
  updateFinding: (finding: Finding, state: 'ACCEPTED' | 'DISMISSED') => void
  loadTextFile: (file?: File) => void; startNewSubmission: () => void
  selectedFindingId: string; setSelectedFindingId: (id: string) => void
}) {
  const findings = selectedSubmission?.findings ?? []
  const selectedFinding = findings.find((finding) => finding.id === selectedFindingId) ?? findings.find((finding) => finding.state === 'OPEN')
  const openFindings = findings.filter((finding) => finding.state === 'OPEN')
  const readOnly = !canCreate || ['APPROVED', 'REJECTED'].includes(selectedSubmission?.status ?? '')
  return <>
    <PageHeading eyebrow="CONTENT WORKSPACE" title="Submissions" description={`Create, check, and track content against ${brand?.name ?? 'your brand'}’s approved sources.`}
      action={<div className="heading-actions">{canCreate && <button className="button button-secondary" onClick={startNewSubmission}><Plus size={15} /> New draft</button>}{canCreate && <label className="button button-secondary upload-button"><Upload size={15} /> Upload .txt<input type="file" accept=".txt,text/plain" onChange={(event) => { loadTextFile(event.target.files?.[0]); event.currentTarget.value = '' }} /></label>}</div>} />
    <div className="submission-toolbar">
      <label className="submission-picker"><span>SUBMISSION</span><select value={selectedId} onChange={(event) => selectSubmission(event.target.value)}><option value="">New draft</option>{submissions.map((submission) => <option key={submission.id} value={submission.id}>{submission.title} · v{submission.versionNo}</option>)}</select></label>
      <div className="field-select"><span>BRAND</span><strong>{brand?.name ?? 'Loading…'}</strong><ChevronDown size={14} /></div>
      {selectedSubmission && <div className="submission-id">Version {selectedSubmission.versionNo} · {statusLabel(selectedSubmission.status)}</div>}
    </div>
    <div className="submission-grid">
      <section className="panel editor-panel"><div className="panel-heading"><div><h3>Content draft</h3><p>Text is treated as content, never as instructions to the AI.</p></div><span className="draft-label"><span className={`status-dot ${selectedSubmission?.status === 'APPROVED' ? 'green' : 'amber'}`} />{selectedSubmission ? statusLabel(selectedSubmission.status).toUpperCase() : 'DRAFT'}</span></div>
        {canCreate && <label className="submission-title-field">Submission title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} placeholder="e.g. Spring campaign social post" disabled={readOnly} /></label>}
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Paste your content here..." aria-label="Content draft" readOnly={readOnly} />
        <div className="editor-bottom"><span>{draft.trim() ? draft.trim().split(/\s+/).length : 0} words · {selectedSubmission ? `Version ${selectedSubmission.versionNo}` : 'Unsaved draft'}</span>
          {canCreate && !readOnly && <button className="button button-primary" onClick={runAnalysis} disabled={busy || !draft.trim()}><Sparkles size={16} />{busy ? 'Checking…' : 'Check content'}</button>}</div>
        <div className="privacy-note"><LockKeyhole size={14} /><span>Content checks use the active approved brand rules. A reviewer makes the final decision.</span></div>
      </section>
      <section className="panel results-panel"><div className="panel-heading"><div><div className="eyebrow">ANALYSIS REPORT</div><h3>{selectedSubmission ? `${openFindings.length} open findings` : 'No analysis yet'}</h3></div><span className="version-tag">{selectedSubmission?.guidelineVersion ?? brand?.guidelineVersion ?? '—'}</span></div>
        <div className="result-summary"><div><strong>{openFindings.filter((finding) => finding.severity === 'HIGH').length}</strong><span>High</span></div><div><strong>{openFindings.filter((finding) => finding.severity === 'MEDIUM').length}</strong><span>Medium</span></div><div><strong>{openFindings.filter((finding) => finding.severity === 'LOW').length}</strong><span>Low</span></div><div className="evidence-coverage"><strong>{findings.length ? `${Math.round((findings.filter((finding) => finding.evidence).length / findings.length) * 100)}%` : '—'}</strong><span>Evidence</span></div></div>
        <div className="result-list">{findings.map((finding) => <FindingRow key={finding.id} finding={finding} selected={selectedFinding?.id === finding.id} onSelect={() => setSelectedFindingId(finding.id)} />)}{!findings.length && <div className="empty-state"><ShieldCheck size={22} /><strong>{selectedSubmission ? 'No findings returned' : 'Ready to check'}</strong><span>{selectedSubmission ? 'No active rules matched this content.' : `${rules.length} approved rules are ready to check your draft.`}</span></div>}</div>
        {selectedFinding?.evidence && <div className="evidence-box"><div className="evidence-label"><ShieldCheck size={14} /> APPROVED SOURCE <span>{selectedFinding.evidence.sourceId}</span></div><p>{selectedFinding.evidence.evidenceText}</p></div>}
        {selectedFinding?.state === 'OPEN' && canCreate && <div className="suggestion-card"><div className="suggestion-label"><Sparkles size={14} /> SUGGESTED CORRECTION</div><p>{selectedFinding.suggestedText}</p><div className="suggestion-actions"><button className="button button-primary compact" onClick={() => updateFinding(selectedFinding, 'ACCEPTED')} disabled={busy}><Check size={14} /> Apply suggestion</button><button className="button button-quiet compact" onClick={() => updateFinding(selectedFinding, 'DISMISSED')} disabled={busy}><X size={14} /> Dismiss</button></div></div>}
        {selectedSubmission?.decisions[0] && <div className="manual-review-note"><MessageSquareText size={14} /><span>Latest reviewer note: {selectedSubmission.decisions[0].reason}</span></div>}
        {findings.length > 0 && !selectedSubmission?.decisions[0] && <div className="manual-review-note"><LockKeyhole size={14} /><span>Suggestions do not approve content. A reviewer makes the final decision.</span></div>}
      </section>
    </div>
  </>
}

function ReviewQueue({ submissions, selectedSubmission, canReview, selectSubmission, reviewNote, setReviewNote, decide, busy }: {
  submissions: Submission[]; selectedSubmission?: Submission; canReview: boolean; selectSubmission: (id: string) => void
  reviewNote: string; setReviewNote: (value: string) => void; decide: (decision: ReviewDecision) => void; busy: boolean
}) {
  const selected = submissions.find((item) => item.id === selectedSubmission?.id) ?? submissions[0]
  return <>
    <PageHeading eyebrow="HUMAN REVIEW" title="Review queue" description="Review submitted content and record a reasoned decision." action={<div className="queue-filter"><span className="filter-dot" /> {submissions.length} awaiting review</div>} />
    <div className="review-layout"><section className="panel review-list-panel"><div className="review-list-heading"><div><strong>Needs your attention</strong><small>Prioritised by severity</small></div><span className="table-label">{submissions.length} ITEMS</span></div>
      {submissions.map((submission) => {
        const topSeverity = submission.findings.find((finding) => finding.state === 'OPEN')?.severity ?? 'LOW'
        return <button className={`review-item ${selected?.id === submission.id ? 'active-review' : ''}`} key={submission.id} onClick={() => selectSubmission(submission.id)}>
          <span className={`queue-priority ${topSeverity.toLowerCase()}-priority`}>{topSeverity[0]}</span><span className="review-item-main"><strong>{submission.title}</strong><small>{submission.creatorEmail} · Version {submission.versionNo}</small><span className="review-tags"><span className={`submission-status ${submission.status.toLowerCase()}`}>{statusLabel(submission.status)}</span><span className="review-requested">{submission.findings.filter((finding) => finding.state === 'OPEN').length} open findings</span></span></span><ChevronRight size={16} />
        </button>
      })}
      {!submissions.length && <div className="empty-state"><ListChecks size={22} /><strong>Queue is clear</strong><span>New submissions will appear here after analysis.</span></div>}
    </section>
    {selected && <section className="panel decision-panel"><div className="review-content-head"><div><div className="eyebrow">VERSION {selected.versionNo} · {selected.guidelineVersion ?? 'GUIDELINE'}</div><h3>{selected.title}</h3><p>{selected.creatorEmail}</p></div><span className={`submission-status ${selected.status.toLowerCase()}`}>{statusLabel(selected.status)}</span></div>
      <div className="review-content-text">{selected.content}</div>
      <div className="review-findings">{selected.findings.map((finding) => <article className="review-evidence" key={finding.id}><div className={`evidence-label ${finding.severity.toLowerCase()}`}><CircleAlert size={14} /> {finding.severity} · {finding.category}<span>{finding.evidence?.sourceId ?? 'NO SOURCE'}</span></div><p><strong>{finding.excerpt}</strong> — {finding.explanation}</p>{finding.evidence && <p className="review-evidence-source">Approved source: {finding.evidence.evidenceText}</p>}</article>)}{!selected.findings.length && <div className="review-evidence"><p>No findings were returned for this submission. Review the content before approving.</p></div>}</div>
      {canReview && <><div className="decision-controls"><label htmlFor="decision-reason">REVIEWER NOTE <span>Required for every decision</span></label><textarea id="decision-reason" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Add context for your decision..." /></div>
        <div className="decision-actions"><button className="button button-quiet" onClick={() => decide('REQUEST_CHANGES')} disabled={busy}><MessageSquareText size={15} /> Request changes</button><button className="button button-quiet" onClick={() => decide('REJECT')} disabled={busy}>Reject</button><button className="button button-approve" onClick={() => decide('APPROVE')} disabled={busy}><Check size={15} /> Approve</button></div></>}
      {!canReview && <div className="manual-review-note"><LockKeyhole size={14} /><span>Your role can view submissions but cannot record review decisions.</span></div>}
      {selected.decisions[0] && <div className="review-decision-state"><span className="status-dot green" /> Last decision: <strong>{selected.decisions[0].decision.replaceAll('_', ' ')}</strong> · {selected.decisions[0].reviewerEmail}</div>}
    </section>}
    {!selected && <section className="panel decision-panel empty-state"><strong>Select a submission to review</strong></section>}</div>
  </>
}

function BrandLibrary({ brand, rules, search, canManage, busy, saveRule, archiveRule }: {
  brand: Brand | null; rules: Rule[]; search: string; canManage: boolean; busy: boolean
  saveRule: (rule: RuleInput, sourceId?: string) => Promise<void>; archiveRule: (sourceId: string) => Promise<void>
}) {
  const [editing, setEditing] = useState<RuleInput | null>(null)
  const [formError, setFormError] = useState('')
  const entries = rules.filter((rule) => `${rule.sourceId} ${rule.category} ${rule.matchText} ${rule.evidenceText}`.toLowerCase().includes(search.toLowerCase()))

  async function submitRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing) return
    setFormError('')
    try {
      await saveRule(editing, rules.some((rule) => rule.sourceId === editing.sourceId) ? editing.sourceId : undefined)
      setEditing(null)
    } catch (issue) {
      setFormError(errorMessage(issue))
    }
  }

  return <>
    <PageHeading eyebrow="APPROVED KNOWLEDGE" title="Brand library" description="The active, versioned sources grounding each content check."
      action={canManage && <button className="button button-primary" onClick={() => { setFormError(''); setEditing({ sourceId: '', kind: 'FACT_CONFLICT', category: '', severity: 'MEDIUM', matchText: '', explanation: '', evidenceText: '', suggestion: '' }) }}><Plus size={15} /> Add source</button>} />
    <div className="library-summary"><div className="library-version"><span className="version-badge"><BookOpenCheck size={17} /></span><div><strong>{brand?.name ?? 'Brand'} · Guideline {brand?.guidelineVersion ?? '—'}</strong><small>{rules.length} active approved rules</small></div><span className="active-pill"><i /> ACTIVE</span></div></div>
    <div className="library-filters"><span className="filter-tab selected">All sources <span>{entries.length}</span></span></div>
    {editing && <form className="panel rule-editor" onSubmit={submitRule}>
      <div className="panel-heading"><div><h3>{rules.some((rule) => rule.sourceId === editing.sourceId) ? 'Edit approved source' : 'Add approved source'}</h3><p>Publishing changes advances the active guideline version.</p></div><button type="button" className="icon-button" aria-label="Close editor" onClick={() => setEditing(null)}><X size={17} /></button></div>
      <div className="rule-editor-grid">
        <label>Source ID<input required pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}" maxLength={60} value={editing.sourceId} disabled={rules.some((rule) => rule.sourceId === editing.sourceId)} onChange={(event) => setEditing({ ...editing, sourceId: event.target.value })} /></label>
        <label>Kind<select value={editing.kind} onChange={(event) => setEditing({ ...editing, kind: event.target.value })}><option value="FACT_CONFLICT">Fact conflict</option><option value="TERMINOLOGY">Terminology</option><option value="RULE_VIOLATION">Rule violation</option><option value="STYLE">Style</option></select></label>
        <label>Category<input required maxLength={80} value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value })} /></label>
        <label>Severity<select value={editing.severity} onChange={(event) => setEditing({ ...editing, severity: event.target.value })}><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select></label>
        <label className="rule-editor-wide">Trigger text<input required maxLength={500} value={editing.matchText} onChange={(event) => setEditing({ ...editing, matchText: event.target.value })} /></label>
        <label className="rule-editor-wide">Approved evidence<textarea required maxLength={10000} value={editing.evidenceText} onChange={(event) => setEditing({ ...editing, evidenceText: event.target.value })} /></label>
        <label className="rule-editor-wide">Explanation<textarea required maxLength={10000} value={editing.explanation} onChange={(event) => setEditing({ ...editing, explanation: event.target.value })} /></label>
        <label className="rule-editor-wide">Suggested wording<input required maxLength={500} value={editing.suggestion} onChange={(event) => setEditing({ ...editing, suggestion: event.target.value })} /></label>
      </div>
      {formError && <div className="workspace-alert" role="alert">{formError}</div>}
      <div className="rule-editor-actions"><button type="button" className="button button-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Publishing…' : 'Publish source'}</button></div>
    </form>}
    <section className="panel source-list">{entries.map((rule) => <article className="source-row" key={rule.sourceId}><span className={`source-icon ${rule.severity.toLowerCase()}`}><BookOpenCheck size={18} /></span><div className="source-main"><div className="source-type">{rule.kind.replaceAll('_', ' ')} <span>·</span> {rule.sourceId}</div><strong>{rule.matchText}</strong><p>{rule.evidenceText}</p><small>Suggested wording: {rule.suggestion}</small></div><span className={`severity-label ${rule.severity.toLowerCase()}`}>{rule.severity}</span>{canManage && <div className="source-actions"><button className="icon-button small-icon" aria-label={`Edit ${rule.sourceId}`} onClick={() => { setFormError(''); setEditing({ ...rule }) }}><Pencil size={15} /></button><button className="icon-button small-icon" aria-label={`Archive ${rule.sourceId}`} disabled={busy} onClick={async () => { if (!window.confirm(`Archive ${rule.sourceId}? Existing findings will retain this source as evidence.`)) return; try { await archiveRule(rule.sourceId) } catch (issue) { setFormError(errorMessage(issue)) } }}><Archive size={15} /></button></div>}</article>)}{!entries.length && <div className="empty-state">No approved sources match “{search}”.</div>}</section>
    <div className="library-footnote"><LockKeyhole size={14} /><span>Only active, approved sources can be cited as evidence in a finding.</span></div>
  </>
}

function Analytics({ submissions }: { submissions: Submission[] }) {
  const findings = submissions.flatMap((submission) => submission.findings)
  const high = findings.filter((finding) => finding.severity === 'HIGH').length
  const evidenceCount = findings.filter((finding) => finding.evidence).length
  const evidenceRate = findings.length ? Math.round(evidenceCount / findings.length * 100) : 0
  const approved = submissions.filter((submission) => submission.status === 'APPROVED').length
  const categoryCounts = useMemo(() => findings.reduce<Record<string, number>>((counts, finding) => {
    counts[finding.category] = (counts[finding.category] ?? 0) + 1
    return counts
  }, {}), [findings])
  const maxCount = Math.max(1, ...Object.values(categoryCounts))
  return <>
    <PageHeading eyebrow="GOVERNANCE INSIGHTS" title="Analytics" description="A live summary of submissions and findings in your workspace." />
    <section className="metrics-grid analytics-metrics">
      <Metric icon={FileCheck2} label="Approved submissions" value={String(approved)} trendNote={`${submissions.length} total submissions`} accent="mint" />
      <Metric icon={CircleAlert} label="High-severity findings" value={String(high)} trendNote={`${findings.length} findings total`} accent="coral" />
      <Metric icon={Gauge} label="Evidence coverage" value={`${evidenceRate}%`} trendNote={`${evidenceCount} findings with a source`} accent="blue" />
      <Metric icon={Clock3} label="Awaiting decision" value={String(submissions.filter((item) => ['IN_REVIEW', 'NEEDS_CHANGES'].includes(item.status)).length)} trendNote="current review queue" accent="gold" />
    </section>
    <article className="panel chart-panel"><div className="panel-heading"><div><h3>Findings by category</h3><p>{findings.length} findings across {submissions.length} submissions</p></div></div>
      <div className="live-category-list">{Object.entries(categoryCounts).map(([category, count]) => <div className="live-category-row" key={category}><span>{category}</span><div className="progress-track"><span style={{ width: `${count / maxCount * 100}%` }} /></div><strong>{count}</strong></div>)}{!findings.length && <div className="empty-state">Run an analysis to see findings here.</div>}</div>
    </article>
  </>
}
