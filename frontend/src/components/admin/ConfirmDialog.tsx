import { useEffect, useRef } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode, SyntheticEvent } from 'react'

interface ConfirmDialogProps {
  // Whether it is showing: the question it asks, what follows from saying yes, and the two answers.
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}

// Asks staff to confirm a step that cannot be undone (an order completed or cancelled, a transfer closed
// as not received), in the panel's own look, with answers that say what they do. A native <dialog>
// opened with showModal(): the page behind it cannot be reached by mouse, keyboard, or screen reader,
// and Escape closes it. Focus starts on the safe answer and goes back to whatever opened it (Chromium
// does that itself on close, so the browser tests pass either way; it is done here for browsers that
// do not).
export default function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    cancelRef.current?.focus()
    return () => {
      dialog.close()
      opener?.focus()
    }
  }, [open])

  // Escape, as the browser reports it: closed through state, like the "cancel" answer.
  function handleCancelEvent(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault()
    onCancel()
  }

  // The page behind is out of reach, but Tab would still leave for the browser's own toolbar: keep it
  // going round the two answers instead (CLAUDE.md: dialogs trap focus).
  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  // A click on the dimmed page around the box (the dialog element itself, outside its content) is
  // "cancel" too.
  function handleClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) onCancel()
  }

  // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the click is only the backdrop (Escape is the keyboard's way out), and the key handler only keeps Tab inside.
  return <dialog className="admin-dialog" ref={dialogRef} aria-labelledby="admin-dialog-title" aria-describedby="admin-dialog-body" onCancel={handleCancelEvent} onClick={handleClick} onKeyDown={handleKeyDown}>
    {open && <div className="admin-dialog-content">
      <h2 id="admin-dialog-title">{title}</h2>
      <div id="admin-dialog-body" className="admin-dialog-body">{children}</div>
      <div className="admin-dialog-actions">
        <button className="button button-primary" type="button" onClick={onConfirm}>{confirmLabel}</button>
        <button className="button button-outline" type="button" ref={cancelRef} onClick={onCancel}>{cancelLabel}</button>
      </div>
    </div>}
  </dialog>
}
