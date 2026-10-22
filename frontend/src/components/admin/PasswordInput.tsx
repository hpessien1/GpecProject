import { useEffect, useRef, useState } from 'react'
import type { InputHTMLAttributes } from 'react'

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  id: string
}

// A password box with a Show/Hide button, so admins can check what they typed. The password is
// hidden again when its form is submitted, so browsers still recognise it and offer to save it.
// Spelling checks stay off: some browsers send checked text to an online service.
export default function PasswordInput(props: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const form = inputRef.current?.form
    if (!form) return
    const hide = () => setIsVisible(false)
    form.addEventListener('submit', hide)
    return () => form.removeEventListener('submit', hide)
  }, [])

  return <div className="admin-password">
    <input {...props} ref={inputRef} type={isVisible ? 'text' : 'password'} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
    <button type="button" aria-controls={props.id} aria-label={isVisible ? 'Hide password' : 'Show password'} onClick={() => setIsVisible((visible) => !visible)}>
      {isVisible ? 'Hide' : 'Show'}
    </button>
  </div>
}
