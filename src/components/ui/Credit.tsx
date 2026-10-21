/** Organiser credit, shown as a thin frosted strip above every screen. Colours live in index.css (.credit). */
export default function Credit({ as: Tag = 'div' }: { as?: 'header' | 'footer' | 'div' }) {
  return (
    <Tag className="credit relative z-50 border-y px-4 py-1.5 text-center font-mono text-[11px] tracking-[0.08em] backdrop-blur-md backdrop-saturate-150">
      Developed and Hosted by <b className="font-medium">AI TOOLS &amp; CONSULTANCY CLUB</b> | SAII
    </Tag>
  )
}
