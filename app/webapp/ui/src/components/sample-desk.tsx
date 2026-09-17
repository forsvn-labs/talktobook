import { cn } from "@/lib/utils"
import type { SampleItem } from "@/lib/api"

const MARKS = ["oxblood", "ink", "ink-2"] as const
const SIZES = ["tall", "short", ""] as const
const TILT = ["-rotate-1", "rotate-0", "rotate-1"] as const

export function SampleDesk({
  samples,
  onOpen,
}: {
  samples: SampleItem[]
  onOpen: (slug: string) => void
}) {
  return (
    <div className="grid items-end gap-5 md:grid-cols-3">
      {samples.map((s, i) => (
        <button
          key={s.slug}
          type="button"
          data-mark={MARKS[i] ?? "ink"}
          data-size={SIZES[i] ?? ""}
          className={cn(
            "spine-book origin-bottom transition-transform duration-200 ease-out",
            TILT[i],
            "hover:rotate-0 focus-visible:rotate-0",
          )}
          onClick={() => onOpen(s.slug)}
        >
          <span className="spine" aria-hidden="true" />
          <span className="leaf">
            <span className="kind">{s.kind}</span>
            <span className="title">{s.title}</span>
            <span className="author">{s.author}</span>
            <span className="blurb">{s.blurb}</span>
            <span className="open">
              Open on the desk
              {s.epub ? " · EPUB" : ""}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}
