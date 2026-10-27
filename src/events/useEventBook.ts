import { useRef } from 'react'
import { useBrand, useSelected } from '../store/BrandStore'
import type { EventBook } from '../types'
import { syncPlayers } from './playerList'

/**
 * The event book, plus `commit` – saves events, categories and players straight away (computed once, so saved and draft match).
 * Every commit files new entries into All players (see syncPlayers).
 */
export function useEventBook() {
  const book = useSelected('events')
  const { updateNow } = useBrand()
  const ref = useRef(book)
  ref.current = book
  const commit = (fn: (b: EventBook) => EventBook) => {
    const next = syncPlayers(fn(ref.current))
    ref.current = next
    updateNow('events', book.id, (b) => ({ ...b, events: next.events, categories: next.categories, players: next.players }))
  }
  return { book, commit }
}
