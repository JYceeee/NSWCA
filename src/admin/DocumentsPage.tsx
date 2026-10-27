import { useState } from 'react'
import { useDialogs } from '../components/Dialogs'
import { Icon } from '../components/Icon'
import { downloadPairingTemplate } from '../events/pairings'
import { downloadPlayersTemplate, PLAYER_COLUMNS } from '../events/players'
import { COLUMNS as EVENT_COLUMNS, downloadTemplate as downloadEventsTemplate } from '../events/spreadsheet'

interface Doc {
  id: string
  name: string
  file: string
  description: string
  usedIn: string
  columns: readonly string[]
  download: () => Promise<void>
}

const DOCS: Doc[] = [
  {
    id: 'players',
    name: 'Players template',
    file: 'players-template.xlsx',
    description: 'A list of players to import into a tournament.',
    usedIn: 'Tournament page › View entries › Import',
    columns: PLAYER_COLUMNS,
    download: downloadPlayersTemplate,
  },
  {
    id: 'events',
    name: 'Events template',
    file: 'events-template.xlsx',
    description: 'Events to bulk-import into the calendar.',
    usedIn: 'Upcoming events › Import / Export › Import events',
    columns: EVENT_COLUMNS,
    download: downloadEventsTemplate,
  },
  {
    id: 'pairings',
    name: 'Pairings template',
    file: 'pairings-template.xlsx',
    description: 'One round’s pairings, in the layout Vega and Swiss-Manager exports use.',
    usedIn: 'Tournament page › Pairings › Upload round',
    columns: ['Bo.', 'No.', 'Fed', 'Tit', 'White Player', 'Pts', 'Result', 'Pts', 'No.', 'Tit', 'Black Player', 'Fed'],
    download: downloadPairingTemplate,
  },
]

/** Admin › Document: templates to download. */
export function DocumentsPage() {
  const { toast } = useDialogs()
  const [busy, setBusy] = useState<string | null>(null)
  const get = async (d: Doc) => {
    setBusy(d.id)
    try {
      await d.download()
    } catch {
      toast(`Could not create ${d.file}`)
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="brand-page doc-page">
      <header className="page-head">
        <h1>Document</h1>
        <p>Templates and documents to download.</p>
      </header>
      <div className="doc-list">
        {DOCS.map((d) => (
          <section key={d.id} className="doc-item">
            <span className="doc-icon">
              <Icon name="grid" size={22} />
            </span>
            <div className="doc-main">
              <strong>{d.name}</strong>
              <span>{d.description}</span>
              <span className="muted small">
                Columns: {d.columns.join(', ')} · Used in {d.usedIn}
              </span>
            </div>
            <button className="ui-btn" disabled={busy === d.id} onClick={() => get(d)}>
              <Icon name="download" size={15} /> {busy === d.id ? 'Preparing…' : 'Download'}
            </button>
          </section>
        ))}
      </div>
    </div>
  )
}
