import { useMemo } from "react"
import { editionBlocks } from "@/lib/edition"
import type { PreviewDoc } from "@/lib/api"

export function BookPage({
  doc,
  folio = "1",
}: {
  doc: PreviewDoc
  folio?: string
}) {
  const blocks = useMemo(() => editionBlocks(doc.markdown), [doc.markdown])
  const title =
    blocks.find((b) => b.type === "title")?.text || doc.title
  const byline =
    blocks.find((b) => b.type === "byline")?.text ||
    (doc.author
      ? `An unofficial reading edition of a conversation by ${doc.author}`
      : "Unofficial reading edition")

  return (
    <article className="book-leaf">
      <p className="running">Unofficial reading edition</p>
      <div className="mark" aria-hidden="true" />
      <h2 className="edition-title">{title}</h2>
      <p className="byline">{byline}</p>
      {blocks.map((block, i) => {
        if (block.type === "title" || block.type === "byline") return null
        if (block.type === "quote") {
          return <blockquote key={i}>{block.text}</blockquote>
        }
        if (block.type === "speaker") {
          return (
            <p key={i}>
              {block.named ? <span className="speaker">{block.name}</span> : null}
              {block.text}
            </p>
          )
        }
        return <p key={i}>{block.text}</p>
      })}
      <p className="folio">{folio}</p>
    </article>
  )
}
