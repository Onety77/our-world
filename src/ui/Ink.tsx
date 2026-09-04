import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type RefObject,
} from 'react'

export interface InkProps {
  value: string
  onChange(value: string): void
  className?: string
  label: string
  placeholder?: string
  onKeyDown?(event: KeyboardEvent<HTMLTextAreaElement>): void
  /*
    Whether this field has the keyboard.

    Passed through rather than watched from outside because only the field
    knows, and two places now need to: the night screen makes room for search
    results while somebody is looking, and a composer that is being written in
    is a composer that keeps its own spaces.
  */
  onFocus?(): void
  onBlur?(): void
  /** Focus it as soon as it appears. */
  autoFocus?: boolean
  /** The element itself, for places that deliberately restore the cursor. */
  innerRef?: RefObject<HTMLTextAreaElement | null>
}

/**
 * The garden's plain-text writing surface.
 *
 * This is deliberately a real textarea. iOS owns the keyboard's form
 * assistant and exposes no web API for hiding it; changing this to a
 * contenteditable element does not escape WebKit's native text editor and only
 * makes selection, dictation, composition and accessibility less dependable.
 */
export function Ink({
  value,
  onChange,
  className,
  label,
  placeholder,
  onKeyDown,
  onFocus,
  onBlur,
  autoFocus,
  innerRef,
}: InkProps) {
  const own = useRef<HTMLTextAreaElement>(null)
  const box = innerRef ?? own

  // Keep the single-line resting shape and grow only when the message wraps.
  // CSS caps the result; overflow remains scrollable for long drafts.
  const fit = () => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  useEffect(() => {
    fit()
  }, [value])

  useEffect(() => {
    if (autoFocus) box.current?.focus()
  }, [autoFocus])

  return (
    <textarea
      ref={box}
      className={className}
      value={value}
      rows={1}
      aria-label={label}
      placeholder={placeholder}
      inputMode="text"
      enterKeyHint="enter"
      autoComplete="off"
      autoCorrect="on"
      autoCapitalize="sentences"
      spellCheck
      translate="no"
      wrap="soft"
      onChange={(event) => onChange(event.currentTarget.value)}
      onInput={fit}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  )
}
