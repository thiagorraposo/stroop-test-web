import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, apiErrorMessage, changeProfessionalPassword, loginProfessional } from '../api/client'
import type { ProfessionalProfile } from '../api/client'

function credentialMessage(error: unknown): string {
  return error instanceof ApiError && error.status === 401
    ? 'Usuário ou senha inválidos.' : apiErrorMessage(error)
}

export function ProfessionalLogin({ onAuthenticated }: { onAuthenticated: (profile: ProfessionalProfile) => void }) {
  const errorId = useId()
  const username = useRef<HTMLInputElement>(null)
  const password = useRef<HTMLInputElement>(null)
  const operation = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; credentials: boolean } | null>(null)
  useEffect(() => {
    const input = password.current
    const clear = () => { if (input) input.value = ''; operation.current?.abort() }
    username.current?.focus()
    window.addEventListener('pagehide', clear)
    return () => { clear(); window.removeEventListener('pagehide', clear) }
  }, [])
  useEffect(() => { if (!busy && error) password.current?.focus() }, [busy, error])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || !username.current || !password.current) return
    const io = new AbortController()
    operation.current = io
    setBusy(true); setError(null)
    const pending = loginProfessional(username.current.value, password.current.value, io.signal)
    password.current.value = ''
    try {
      const profile = await pending
      if (!io.signal.aborted) onAuthenticated(profile)
    } catch (cause) {
      if (!io.signal.aborted) setError({ message: credentialMessage(cause), credentials: cause instanceof ApiError && cause.status === 401 })
    } finally {
      if (!io.signal.aborted) setBusy(false)
    }
  }
  // A região viva fica fora do formulário ocupado: aria-busy pode adiar seus anúncios.
  return <><p role="status" className="professional-login-status">{busy ? 'Verificando credenciais…' : ''}</p>
    <form className="professional-credentials" onSubmit={event => void submit(event)} aria-label="Entrar na área da equipe" aria-busy={busy}>
    <p className="lead">Entre com a conta fornecida pela equipe responsável pela pesquisa.</p>
    <label htmlFor="professional-username">Usuário</label>
    <input id="professional-username" ref={username} name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={128} disabled={busy}
      aria-invalid={error?.credentials || undefined} aria-describedby={error ? errorId : undefined} />
    <label htmlFor="professional-password">Senha</label>
    <input id="professional-password" ref={password} name="password" type="password" autoComplete="current-password" required disabled={busy}
      aria-invalid={error?.credentials || undefined} aria-describedby={error ? errorId : undefined} />
    {error && <p role="alert" id={errorId}>{error.message}</p>}
    <button type="submit" className="button primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
    <p className="quiet">O acesso é reservado à equipe autorizada. Se precisar recuperar o acesso, contate o responsável pela pesquisa.</p>
  </form></>
}

export function ProfessionalPassword({ profile, onEnded }: { profile: ProfessionalProfile; onEnded: () => void }) {
  const hintId = useId()
  const errorId = useId()
  const form = useRef<HTMLFormElement>(null)
  const nextRef = useRef<HTMLInputElement>(null)
  const operation = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; invalid: boolean } | null>(null)
  useEffect(() => {
    const element = form.current
    const clear = () => { element?.reset(); operation.current?.abort() }
    window.addEventListener('pagehide', clear)
    return () => { clear(); window.removeEventListener('pagehide', clear) }
  }, [])
  useEffect(() => { if (!busy && error) nextRef.current?.focus() }, [busy, error])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !form.current) return
    const current = form.current.elements.namedItem('current-password') as HTMLInputElement
    const next = form.current.elements.namedItem('new-password') as HTMLInputElement
    const confirmation = form.current.elements.namedItem('confirm-password') as HTMLInputElement
    if (next.value !== confirmation.value) {
      setError({ message: 'A confirmação da nova senha não corresponde.', invalid: true }); form.current.reset(); next.focus(); return
    }
    const io = new AbortController()
    operation.current = io
    setBusy(true); setError(null)
    const pending = changeProfessionalPassword(current.value, next.value, profile.csrf_token, io.signal)
    form.current.reset()
    try {
      await pending
      if (!io.signal.aborted) onEnded()
    } catch (cause) {
      if (!io.signal.aborted) {
        if (cause instanceof ApiError && cause.status === 401) onEnded()
        else setError({ message: apiErrorMessage(cause), invalid: cause instanceof ApiError && cause.status === 422 })
      }
    } finally { if (!io.signal.aborted) setBusy(false) }
  }
  const describedBy = [hintId, error ? errorId : null].filter(Boolean).join(' ')
  return <details className="password-settings">
    <summary>Alterar senha</summary>
    <p role="status" className="professional-login-status">{busy ? 'Alterando senha…' : ''}</p>
    <form className="professional-credentials" ref={form} onSubmit={event => void submit(event)} aria-label="Alterar senha" aria-busy={busy}>
      <p id={hintId}>Use de 15 a 128 caracteres. A alteração encerra todas as sessões da conta, inclusive esta.</p>
      <label htmlFor="current-password">Senha atual</label>
      <input id="current-password" name="current-password" type="password" autoComplete="current-password" required disabled={busy}
        aria-describedby={error ? errorId : undefined} />
      <label htmlFor="new-password">Nova senha</label>
      <input id="new-password" ref={nextRef} name="new-password" type="password" autoComplete="new-password" required disabled={busy}
        aria-invalid={error?.invalid || undefined} aria-describedby={describedBy} />
      <label htmlFor="confirm-password">Confirmar nova senha</label>
      <input id="confirm-password" name="confirm-password" type="password" autoComplete="new-password" required disabled={busy}
        aria-invalid={error?.invalid || undefined} aria-describedby={describedBy} />
      {error && <p role="alert" id={errorId}>{error.message}</p>}
      <button className="button secondary" disabled={busy}>{busy ? 'Alterando…' : 'Confirmar nova senha e encerrar sessões'}</button>
    </form>
  </details>
}
