import { useState } from "react"
import { FileTextIcon, Loader2Icon, SearchIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { cn, fmtSize } from "@/lib/utils"
import type { BookMeta, Shelf } from "@/lib/types"

export function LibraryRail({
  shelves,
  loading,
  error,
  query,
  onQuery,
  activePath,
  onSelect,
  onFetch,
  fetching,
}: {
  shelves: Shelf[]
  loading: boolean
  error: string | null
  query: string
  onQuery: (q: string) => void
  activePath: string | null
  onSelect: (book: BookMeta) => void
  onFetch: (url: string) => Promise<void>
  fetching: boolean
}) {
  const [url, setUrl] = useState("")
  const q = query.trim().toLowerCase()
  const filtered = shelves
    .map((shelf) => ({
      ...shelf,
      books: shelf.books.filter(
        (b) =>
          !q ||
          b.title.toLowerCase().includes(q) ||
          (b.author || "").toLowerCase().includes(q) ||
          b.path.toLowerCase().includes(q),
      ),
    }))
    .filter((s) => s.books.length > 0 || (!q && shelves.length > 0))

  const total = shelves.reduce((n, s) => n + s.books.length, 0)

  const submitFetch = async () => {
    const trimmed = url.trim()
    if (!trimmed || fetching) return
    await onFetch(trimmed)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-sidebar text-sidebar-foreground">
      <div className="flex flex-col gap-2 px-3 pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-sm font-semibold tracking-tight">Shelf</h1>
          <span className="text-xs text-muted-foreground tabular-nums">
            {loading ? "…" : `${total}`}
          </span>
        </div>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void submitFetch()
          }}
        >
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a URL or YouTube link…"
            className="h-8 min-w-0 bg-background/40 text-sm"
            aria-label="Fetch URL"
            disabled={fetching}
          />
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={fetching || !url.trim()}
              className="h-8"
            >
              {fetching ? (
                <Loader2Icon className="animate-spin" data-icon="inline-start" />
              ) : null}
              Fetch
            </Button>
          </div>
        </form>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search shelf…"
            className="h-8 min-w-0 bg-background/40 pl-8 text-sm"
            aria-label="Search shelf"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-2 pb-3">
        {loading && (
          <div className="flex flex-col gap-2 px-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="px-2 py-4 text-sm text-destructive">{error}</div>
        )}

        {!loading && !error && total === 0 && (
          <Empty className="border-0 py-10">
            <EmptyHeader>
              <EmptyTitle>Shelf is empty</EmptyTitle>
              <EmptyDescription>
                Paste a URL or YouTube link above, or open the Drive library
                folder so EPUBs download.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {!loading &&
          !error &&
          filtered.map((shelf) => (
            <div key={shelf.name} className="mb-3">
              <div className="px-2 py-1.5 text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                {shelf.name} · {shelf.books.length}
              </div>
              {!shelf.books.length ? (
                <p className="px-2 pb-2 text-xs text-muted-foreground">
                  {shelf.name === "Inbox"
                    ? "Fetched posts land here until you keep, make a book, or discard them."
                    : "No books — open the Drive folder so files download."}
                </p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {shelf.books.map((b) => (
                    <li key={b.path}>
                      <button
                        type="button"
                        onClick={() => onSelect(b)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
                          "hover:bg-sidebar-accent",
                          activePath === b.path &&
                            "bg-sidebar-accent ring-1 ring-sidebar-ring/40",
                        )}
                      >
                        {b.mode === "draft" ? (
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground">
                            <FileTextIcon className="size-4" />
                          </span>
                        ) : (
                          <img
                            src={`/api/cover?path=${encodeURIComponent(b.path)}`}
                            alt=""
                            className="size-9 shrink-0 rounded-sm object-cover bg-muted"
                            onError={(e) => {
                              ;(e.target as HTMLImageElement).style.visibility =
                                "hidden"
                            }}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium">
                            {b.title}
                          </div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {b.mode === "draft"
                              ? "Draft · not on the Kobo yet"
                              : `${b.author || "—"} · ${fmtSize(b.size)}`}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 text-[10px] font-normal",
                            b.mode === "spine" &&
                              "border-primary/40 text-primary",
                            b.mode === "draft" &&
                              "border-amber-400/50 text-amber-200",
                          )}
                        >
                          {b.mode}
                        </Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
      </ScrollArea>
    </div>
  )
}
