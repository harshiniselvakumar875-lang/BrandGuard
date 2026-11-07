// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Login from './Login'
import { api, saveToken } from './api'

vi.mock('./api', () => ({
  api: {
    login: vi.fn(),
    register: vi.fn(),
  },
  saveToken: vi.fn(),
}))

const authenticatedUser = {
  id: 'user-id',
  email: 'creator@example.com',
  role: 'CREATOR' as const,
  brandId: 'brand-id',
}

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('authenticates with the selected local development account', async () => {
    const user = userEvent.setup()
    const onAuthenticated = vi.fn()
    vi.mocked(api.login).mockResolvedValue({ token: 'signed-token', user: authenticatedUser })
    render(<Login onAuthenticated={onAuthenticated} theme="light" onToggleTheme={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Reviewer' }))
    expect((screen.getByLabelText('Work email') as HTMLInputElement).value).toBe('reviewer@brandguard.local')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(authenticatedUser))
    expect(api.login).toHaveBeenCalledWith('reviewer@brandguard.local', 'ReviewPass123!')
    expect(saveToken).toHaveBeenCalledWith('signed-token')
  })

  it('shows an API error and re-enables sign-in after a failed request', async () => {
    const user = userEvent.setup()
    vi.mocked(api.login).mockRejectedValue(new Error('Email or password is incorrect.'))
    render(<Login onAuthenticated={vi.fn()} theme="light" onToggleTheme={vi.fn()} />)
    await user.type(screen.getByLabelText('Work email'), 'creator@example.com')
    await user.type(screen.getByLabelText('Password'), 'incorrect')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Email or password is incorrect.')
    expect((screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('prevents registration with a password shorter than 12 characters', async () => {
    const user = userEvent.setup()
    render(<Login onAuthenticated={vi.fn()} theme="light" onToggleTheme={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    const password = screen.getByLabelText('Password') as HTMLInputElement
    expect(password.minLength).toBe(12)
    await user.type(screen.getByLabelText('Work email'), 'new@example.com')
    await user.type(password, 'short')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(api.register).not.toHaveBeenCalled()
    expect((await screen.findByRole('alert')).textContent).toContain('Password must be at least 12 characters.')
  })

  it('exposes a theme toggle on the sign-in screen', async () => {
    const user = userEvent.setup()
    const onToggleTheme = vi.fn()
    render(<Login onAuthenticated={vi.fn()} theme="light" onToggleTheme={onToggleTheme} />)

    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
    expect(onToggleTheme).toHaveBeenCalledOnce()
  })
})
