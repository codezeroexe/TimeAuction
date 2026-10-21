import type { CSSProperties, ReactNode } from 'react'

/** Art for one twist. viewBox 0 0 120 200. `uid` keeps SVG ids unique per instance; `from` and `to` are the metric as 0–1 fractions (only the generic gauge reads them). */
export type Body = (p: { uid: string; from: number; to: number }) => ReactNode

/** Stagger index for CSS transition delays (`--i`). */
export const cssVar = (i: number) => ({ '--i': i }) as CSSProperties
