import { useState } from 'react'
import Button from '../components/ui/Button.tsx'
import { downloadText } from '../components/ui/download.ts'

/** Shown instead of the app when saved data cannot be read. Nothing is overwritten until the user decides. */
export default function Recovery({ raw, error, onReset }: { raw: string; error: string; onReset: () => void }) {
  const [sure, setSure] = useState(false)
  const [saved, setSaved] = useState(false)
  return (
    <div className="page-shell bg-paper text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto max-w-3xl px-5 py-4 font-display text-xl tracking-[0.22em] sm:px-8">TIMEAUCTION</div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-14 sm:px-8">
        <h1 className="font-display text-5xl leading-[1.02]">Saved game data could not be read</h1>
        <p className="mt-5 text-[15px] leading-relaxed text-ink-soft">
          {error} The data has been left untouched in this browser. You can download a copy for inspection, then start a
          fresh local event.
        </p>
        <p className="mt-3 text-sm text-muted">{raw.length.toLocaleString()} characters of saved data found.</p>

        <div className="mt-10 border-t border-line pt-8">
          <Button
            variant="secondary"
            onClick={() => {
              downloadText(`timeauction-damaged-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.json`, raw)
              setSaved(true)
            }}
          >
            Download damaged data
          </Button>
          {saved && <p className="mt-2 text-sm text-success">Download started.</p>}
        </div>

        <div className="mt-10 border-t border-line pt-8">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-0.5 accent-accent" />
            <span>I understand that resetting permanently erases every registration, run, score and feedback stored in this browser.</span>
          </label>
          <Button variant="danger-solid" className="mt-5" disabled={!sure} onClick={onReset}>
            Reset and start a new event
          </Button>
        </div>
      </main>
    </div>
  )
}
