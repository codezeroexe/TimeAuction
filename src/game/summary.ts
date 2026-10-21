import { sidesOf } from './auction.ts'
import type { Session, SideId } from './types.ts'

export interface UnitSummary {
  id: SideId
  name: string
  initial: number
  spent: number
  final: number
  acquired: string[]
  /** initial − spent === final, recomputed from the purchase events rather than trusted. */
  reconciled: boolean
}

export function summarise(s: Session): Record<SideId, UnitSummary> {
  const one = (id: SideId): UnitSummary => {
    const unit = s.sides[id]
    const purchases = s.events.filter((e) => e.type === 'purchase' && e.sideId === id)
    const spent = purchases.reduce((sum, e) => sum + (e.amount ?? 0), 0)
    const acquired = purchases.map((e) => e.techId!)
    return {
      id,
      name: unit.name,
      initial: unit.wallet.initial,
      spent,
      final: unit.wallet.balance,
      acquired,
      reconciled:
        unit.wallet.initial - spent === unit.wallet.balance &&
        unit.wallet.balance >= 0 &&
        acquired.length === unit.portfolio.length &&
        acquired.every((t) => unit.portfolio.includes(t)),
    }
  }
  return Object.fromEntries(sidesOf(s).map((id) => [id, one(id)]))
}
