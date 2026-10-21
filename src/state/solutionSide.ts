import type { SideId } from '../game/types.ts'

/** Which hot-seat side the solution screen opens on. In-memory only; after a refresh the screen picks the first unfinished side. */
let preferred: SideId | null = null
export const openSolutionFor = (side: SideId) => {
  preferred = side
}
export const takePreferredSide = () => preferred
