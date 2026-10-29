import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

interface RouteOverlayProps {
  name: string
  kind: 'drawer' | 'form'
  returnHash: string
  children: ReactNode
}

export function RouteOverlay({ name, kind, returnHash, children }: RouteOverlayProps) {
  const panelRef = useRef<HTMLElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector<HTMLElement>('[data-overlay-heading]')?.focus({ preventScroll: true })
    return () => {
      document.body.style.overflow = previousOverflow
      if (window.location.hash === returnHash) {
        const opener = openerRef.current
        window.setTimeout(() => {
          if (opener?.isConnected && opener !== document.body) opener.focus({ preventScroll: true })
          else document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true })
        }, 0)
      }
    }
  }, [returnHash])

  function close() {
    window.history.replaceState(window.history.state, '', returnHash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
    if (event.key !== 'Tab' || !panelRef.current) return
    const controls = [...panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="-1"]')]
      .filter((element) => element.getClientRects().length > 0 || element.hasAttribute('data-overlay-heading'))
    if (controls.length === 0) return
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div className={`overlay-backdrop overlay-${kind}`} onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
      <section ref={panelRef} role="dialog" aria-modal="true" aria-label={name} className="overlay-panel" onKeyDown={onKeyDown}>
        <button type="button" className="overlay-close" aria-label={`关闭${name}`} onClick={close}>×</button>
        {children}
      </section>
    </div>,
    document.body,
  )
}
