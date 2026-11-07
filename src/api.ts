export type Role = 'CREATOR' | 'REVIEWER' | 'BRAND_ADMIN' | 'MANAGER'
export type User = { id: string; email: string; role: Role; brandId: string }
export type Brand = { id: string; name: string; guidelineVersion: string }
export type Rule = { sourceId: string; kind: string; category: string; severity: string; matchText: string; explanation: string; evidenceText: string; suggestion: string }
export type RuleInput = Omit<Rule, 'sourceId'> & { sourceId: string }
export type Finding = {
  id: string
  category: string
  label: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  excerpt: string
  explanation: string
  evidence: { sourceId: string; evidenceText: string } | null
  suggestedText: string
  state: 'OPEN' | 'ACCEPTED' | 'DISMISSED'
}
export type Decision = { decision: string; reason: string; reviewerEmail: string; createdAt: string }
export type Submission = {
  id: string
  title: string
  content: string
  status: string
  versionNo: number
  guidelineVersion: string | null
  creatorEmail: string
  createdAt: string
  findings: Finding[]
  decisions: Decision[]
}
export type AuthResult = { token: string; user: User }

const API_ROOT = '/api'
const TOKEN_KEY = 'brandguard-token'

export function token() {
  return localStorage.getItem(TOKEN_KEY)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function saveToken(value: string) {
  localStorage.setItem(TOKEN_KEY, value)
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  const accessToken = token()
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  const response = await fetch(`${API_ROOT}${path}`, { ...init, headers })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null
    throw new Error(body?.message ?? `Request failed (${response.status})`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  login: (email: string, password: string) => request<AuthResult>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email: string, password: string) => request<AuthResult>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request<User>('/auth/me'),
  brand: () => request<Brand>('/brands/current'),
  rules: () => request<Rule[]>('/brands/current/rules'),
  createRule: (rule: RuleInput) => request<Rule[]>('/brands/current/rules', { method: 'POST', body: JSON.stringify(rule) }),
  updateRule: (sourceId: string, rule: RuleInput) => request<Rule[]>(`/brands/current/rules/${encodeURIComponent(sourceId)}`, { method: 'PUT', body: JSON.stringify(rule) }),
  archiveRule: (sourceId: string) => request<Rule[]>(`/brands/current/rules/${encodeURIComponent(sourceId)}`, { method: 'DELETE' }),
  submissions: () => request<Submission[]>('/submissions'),
  createSubmission: (title: string, content: string) => request<Submission>('/submissions', { method: 'POST', body: JSON.stringify({ title, content }) }),
  analyze: (id: string) => request<Submission>(`/submissions/${id}/analyze`, { method: 'POST' }),
  revise: (id: string, content: string) => request<Submission>(`/submissions/${id}/revision`, { method: 'PUT', body: JSON.stringify({ content }) }),
  decide: (id: string, decision: string, reason: string) => request<Submission>(`/submissions/${id}/decisions`, { method: 'POST', body: JSON.stringify({ decision, reason }) }),
  updateFinding: (id: string, state: string, reason = '') => request<Submission>(`/findings/${id}`, { method: 'PATCH', body: JSON.stringify({ state, reason }) }),
}
