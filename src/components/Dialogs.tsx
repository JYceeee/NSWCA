import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

interface ConfirmOpts {
  title: string
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
}

interface Toast {
  id: number
  message: string
  action?: { label: string; run: () => void }
}

interface DialogApi {
  confirm: (o: ConfirmOpts) => Promise<boolean>
  toast: (message: string, action?: Toast['action']) => void
}

const Ctx = createContext<DialogApi | null>(null)

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const next = useRef(0)

  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setPending({ ...o, resolve })), [])
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const toast = useCallback<DialogApi['toast']>(
    (message, action) => {
      const id = ++next.current
      setToasts((t) => [...t, { id, message, action }])
      setTimeout(() => dismiss(id), 6000)
    },
    [dismiss],
  )

  const close = (v: boolean) => {
    pending?.resolve(v)
    setPending(null)
  }

  return (
    <Ctx.Provider value={{ confirm, toast }}>
      {children}
      {pending && (
        <Modal title={pending.title} onClose={() => close(false)} width={420}>
          <div className="modal-body">{pending.message}</div>
          <div className="modal-actions">
            <button className="ui-btn" onClick={() => close(false)}>Cancel</button>
            <button className={pending.danger ? 'ui-btn ui-btn--danger' : 'ui-btn ui-btn--primary'} onClick={() => close(true)} autoFocus>
              {pending.confirmLabel ?? 'Confirm'}
            </button>
          </div>
        </Modal>
      )}
      {createPortal(
        <div className="toasts" role="status">
          {toasts.map((t) => (
            <div key={t.id} className="toast">
              <span>{t.message}</span>
              {t.action && (
                <button
                  className="toast-action"
                  onClick={() => {
                    t.action!.run()
                    dismiss(t.id)
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button className="icon-btn" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  )
}

export function useDialogs() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useDialogs outside DialogProvider')
  return c
}

export function Modal({ title, onClose, children, width = 520 }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width }} role="dialog" aria-modal aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
