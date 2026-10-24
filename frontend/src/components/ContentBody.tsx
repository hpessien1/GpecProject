import { Fragment } from 'react'
import type { ReactNode } from 'react'

interface ContentBodyProps {
  // Text staff wrote in the admin panel (Site content).
  text: string
}

type Block = { kind: 'paragraph', lines: string[] } | { kind: 'list', items: string[] }

// Staff write plain text: a blank line starts a new paragraph, a line starting with "- " is a bullet,
// and [square brackets] mark something still to be confirmed. Nothing they type is read as HTML.
function toBlocks(text: string): Block[] {
  const blocks: Block[] = []
  let current: Block | null = null
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) {
      current = null
      continue
    }
    const bullet = /^[-•]\s+(.*)$/.exec(line)
    if (bullet) {
      if (current?.kind !== 'list') blocks.push(current = { kind: 'list', items: [] })
      current.items.push(bullet[1])
    } else {
      if (current?.kind !== 'paragraph') blocks.push(current = { kind: 'paragraph', lines: [] })
      current.lines.push(line)
    }
  }
  return blocks
}

// [placeholder] parts highlighted, so nobody mistakes missing company information for fact.
function withPlaceholders(text: string): ReactNode {
  return text.split(/(\[[^\]\n]+\])/).map((part, index) => /^\[[^\]\n]+\]$/.test(part)
    ? <mark key={index} className="placeholder-text">{part.slice(1, -1)}</mark>
    : <Fragment key={index}>{part}</Fragment>)
}

export default function ContentBody({ text }: ContentBodyProps) {
  return <>{toBlocks(text).map((block, index) => block.kind === 'list'
    ? <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{withPlaceholders(item)}</li>)}</ul>
    // A single line break inside a paragraph is kept, e.g. for an address.
    : <p key={index}>{block.lines.map((line, lineIndex) => <Fragment key={lineIndex}>{lineIndex > 0 && <br />}{withPlaceholders(line)}</Fragment>)}</p>)}</>
}
