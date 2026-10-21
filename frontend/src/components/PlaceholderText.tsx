import { Fragment } from 'react'

interface PlaceholderTextProps {
  text: string
}

// Shows [[placeholder]] parts of site copy highlighted, so nobody mistakes missing company
// information for fact (AGENTS.md: placeholders are never presented as fact).
export default function PlaceholderText({ text }: PlaceholderTextProps) {
  return <>{text.split(/(\[\[[^\]]+\]\])/).map((part, index) => part.startsWith('[[')
    ? <mark key={index} className="placeholder-text">{part.slice(2, -2)}</mark>
    : <Fragment key={index}>{part}</Fragment>)}</>
}
