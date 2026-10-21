import type { AuctionEventType } from '../../game/types.ts'

export const EVENT_LABELS: Record<AuctionEventType, string> = {
  session_created: 'Session created',
  auction_started: 'Auction started',
  lot_opened: 'Lot opened',
  bid_accepted: 'Bid accepted',
  bid_rejected: 'Bid rejected',
  pass: 'Pass',
  sold: 'Sold',
  unsold: 'Unsold',
  purchase: 'Purchase',
  auction_complete: 'Auction complete',
}

export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
