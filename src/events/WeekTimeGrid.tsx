import { format, isToday } from 'date-fns'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { eventsOn, fmtDate, hourLabel, timeLabel, toMinutes } from '../data/events'
import type { CalEvent, CalViewSettings } from '../types'

interface Placed {
  e: CalEvent
  top: number
  height: number
  col: number
  cols: number
}

/** Lays out one day's timed events: overlapping ones share the width side by side. Events outside the hours are hidden. */
function placeDay(list: CalEvent[], v: CalViewSettings): Placed[] {
  const from = v.startHour * 60
  const to = v.endHour * 60
  const items = list
    .map((e) => ({ e, s: Math.max(from, toMinutes(e.startTime)), f: Math.min(to, Math.max(toMinutes(e.endTime), toMinutes(e.startTime) + 15)) }))
    .filter((x) => x.f > x.s)
    .sort((a, b) => a.s - b.s || b.f - a.f)

  const out: Placed[] = []
  let group: (typeof items[number] & { col: number })[] = []
  let groupEnd = -1
  const flush = () => {
    const cols = Math.max(1, ...group.map((g) => g.col + 1))
    for (const g of group) out.push({ e: g.e, top: ((g.s - from) / 60) * v.hourHeight, height: ((g.f - g.s) / 60) * v.hourHeight, col: g.col, cols })
    group = []
  }
  for (const it of items) {
    if (it.s >= groupEnd && group.length) flush()
    // First column whose last event has finished.
    const taken = new Set(group.filter((g) => g.f > it.s).map((g) => g.col))
    let col = 0
    while (taken.has(col)) col++
    group.push({ ...it, col })
    groupEnd = Math.max(groupEnd, it.f)
  }
  if (group.length) flush()
  return out
}

function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  return now
}

/** One week as a time grid: all-day / multi-day strip on top, hours down the side. */
export function WeekTimeGrid({
  days, events, view, color, draft, card, onOpen, onAdd,
}: {
  days: Date[]
  events: CalEvent[]
  view: CalViewSettings
  color: (category: string) => string
  draft: (e: CalEvent) => boolean
  card: (e: CalEvent, compact?: boolean) => ReactNode
  onOpen: (e: CalEvent, el: HTMLElement) => void
  onAdd: (date: string, hour: number) => void
}) {
  const now = useNow()
  const hours = Array.from({ length: Math.max(1, view.endHour - view.startHour) }, (_, i) => view.startHour + i)
  const bodyH = hours.length * view.hourHeight
  // Recurring events with times sit in the hours like one-day events.
  const isStrip = (e: CalEvent) => e.allDay || (e.startDate !== e.endDate && !e.weekdays?.length)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const nowTop = ((nowMin - view.startHour * 60) / 60) * view.hourHeight

  return (
    <div className="tg" style={{ '--hour-h': `${view.hourHeight}px` } as CSSProperties}>
      <div className="tg-row tg-head">
        <div className="tg-gutter" />
        {days.map((d, i) => (
          <div key={fmtDate(d)} className={isToday(d) ? 'tg-day-head tg-day-head--today' : 'tg-day-head'}>
            {(i === 0 || d.getDate() === 1) && <span className="cal-month-label">{format(d, 'MMM')}</span>}
            <span>{format(d, 'EEE')}</span>
            <strong>{format(d, 'd')}</strong>
          </div>
        ))}
      </div>
      <div className="tg-row tg-strip">
        <div className="tg-gutter tg-gutter-label">All day</div>
        {days.map((d) => (
          <div key={fmtDate(d)} className="tg-strip-day">
            {eventsOn(events, d)
              .filter(isStrip)
              .map((e) => card(e, true))}
          </div>
        ))}
      </div>
      <div className="tg-row tg-body" style={{ height: bodyH }}>
        <div className="tg-gutter">
          {hours.map((h) => (
            <div key={h} className="tg-hour-label" style={{ height: view.hourHeight }}>
              {hourLabel(h)}
            </div>
          ))}
        </div>
        {days.map((d) => {
          const date = fmtDate(d)
          const placed = placeDay(
            eventsOn(events, d).filter((e) => !isStrip(e)),
            view,
          )
          return (
            <div
              key={date}
              className="tg-col"
              title="Double-click to add an event"
              onDoubleClick={(ev) => {
                const y = ev.clientY - ev.currentTarget.getBoundingClientRect().top
                onAdd(date, Math.min(view.endHour - 1, view.startHour + Math.floor(y / view.hourHeight)))
              }}
            >
              {hours.map((h) => (
                <div key={h} className="tg-slot" style={{ height: view.hourHeight }} />
              ))}
              {placed.map((p) => (
                <button
                  key={p.e.id}
                  className={draft(p.e) ? 'ev-card ev-card--draft tg-event' : 'ev-card tg-event'}
                  style={
                    {
                      '--ev': color(p.e.category),
                      top: p.top,
                      height: Math.max(18, p.height - 2),
                      left: `calc(${(p.col / p.cols) * 100}% + 2px)`,
                      width: `calc(${100 / p.cols}% - 4px)`,
                    } as CSSProperties
                  }
                  onClick={(ev) => onOpen(p.e, ev.currentTarget)}
                  onDoubleClick={(ev) => ev.stopPropagation()}
                >
                  <span className="ev-name">{p.e.name}</span>
                  <span className="ev-meta">{timeLabel(p.e)}</span>
                  {p.e.location && <span className="ev-meta">{p.e.location}</span>}
                </button>
              ))}
              {isToday(d) && nowTop >= 0 && nowTop <= bodyH && <div className="tg-now" style={{ top: nowTop }} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
