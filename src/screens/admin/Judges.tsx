import { useCallback, useEffect, useState } from 'react'
import Button from '../../components/ui/Button.tsx'
import { useGame } from '../../state/GameContext.tsx'
import type { Reply } from '../../state/remote.ts'

type JudgeRow = NonNullable<Reply['judges']>[number]
const field = 'block w-full min-w-0 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none'

/** Event lead only: judge accounts. Passwords are sent once over this request and never shown again. */
export default function Judges() {
  const { manageJudges, superadmin, mode } = useGame()
  const [rows, setRows] = useState<JudgeRow[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [resets, setResets] = useState<Record<string, string>>({})

  const refresh = useCallback(() => manageJudges({ type: 'listJudges' }).then((r) => r.ok && setRows(r.judges ?? [])), [manageJudges])
  useEffect(() => {
    if (superadmin) void refresh()
  }, [superadmin, refresh])
  if (mode !== 'remote' || !superadmin) return null

  const run = async (p: Promise<Reply>) => {
    const r = await p
    setMsg({ ok: r.ok, message: r.message })
    await refresh()
    return r
  }

  return (
    <section className="mt-12 border-t border-line pt-8" aria-labelledby="judges">
      <h2 id="judges" className="lbl">Judge accounts</h2>
      <p className="mt-3 max-w-xl text-sm text-ink-soft">Each judge signs in with their own name and password; their actions are recorded under that name. Passwords need 8 to 200 characters.</p>
      <ul className="mt-4 divide-y divide-line border-y border-line text-sm">
        {rows.length === 0 && <li className="py-3 text-muted">No judges yet.</li>}
        {rows.map((j) => (
          <li key={j.name} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <span>
              {j.name} <span className="text-muted">· added {new Date(j.createdAt).toLocaleString()} · {j.sessions} active {j.sessions === 1 ? 'session' : 'sessions'}</span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <input
                type="password"
                autoComplete="new-password"
                aria-label={`New password for ${j.name}`}
                placeholder="New password"
                value={resets[j.name] ?? ''}
                onChange={(e) => setResets({ ...resets, [j.name]: e.target.value })}
                className={`${field} w-40`}
              />
              <Button
                variant="secondary"
                disabled={(resets[j.name] ?? '').length < 8}
                onClick={() => run(manageJudges({ type: 'resetJudgePassword', name: j.name, password: resets[j.name] })).then((r) => r.ok && setResets({ ...resets, [j.name]: '' }))}
              >
                Reset password
              </Button>
              <Button variant="danger" onClick={() => (window.confirm(`Revoke ${j.name}? Their sessions end immediately.`) ? run(manageJudges({ type: 'revokeJudge', name: j.name })) : undefined)}>
                Revoke
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <form
        className="mt-5 flex max-w-xl flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void run(manageJudges({ type: 'addJudge', name: name.trim(), password })).then((r) => {
            if (r.ok) {
              setName('')
              setPassword('')
            }
          })
        }}
      >
        <label className="block">
          <span className="text-sm font-medium">Judge name</span>
          <input value={name} maxLength={40} autoComplete="off" onChange={(e) => setName(e.target.value)} className={`${field} mt-1.5 w-44`} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Password</span>
          <input type="password" value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} className={`${field} mt-1.5 w-44`} />
        </label>
        <Button type="submit" disabled={!name.trim() || password.length < 8}>Add judge</Button>
      </form>
      {msg && <p className={`mt-3 text-sm ${msg.ok ? 'text-success' : 'text-danger'}`} role="status">{msg.message}</p>}
    </section>
  )
}
