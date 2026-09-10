import { useMemo } from "react"
import { CheckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import type { SpineManifest, TocNode } from "@/lib/types"

function readSet(manifest: SpineManifest | null): Set<string> {
  const articles = manifest?.read?.articles || {}
  const set = new Set<string>()
  for (const [id, v] of Object.entries(articles)) {
    if (v?.read) set.add(id)
  }
  return set
}

function isArticle(n: TocNode): boolean {
  return (
    n.kind === "article" ||
    (n.articleId || "").startsWith("chap-") ||
    (n.articleId || "").startsWith("bits-bytes")
  )
}

export function ContentsSheet({
  open,
  onOpenChange,
  mode,
  manifest,
  unreadOnly,
  onToggleUnreadOnly,
  onContinue,
  onJump,
  onToggleRead,
  onRemember,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  mode: "zip" | "spine" | "draft" | null
  manifest: SpineManifest | null
  unreadOnly: boolean
  onToggleUnreadOnly: () => void
  onContinue: () => void
  onJump: (href: string) => void
  onToggleRead: (id: string, read: boolean, href: string) => void
  onRemember: (id: string, href: string) => void
}) {
  const reads = useMemo(() => readSet(manifest), [manifest])
  const rows: React.ReactNode[] = []

  const walk = (nodes: TocNode[] | undefined, lvl: number) => {
    for (const n of nodes || []) {
      const article = isArticle(n)
      if (unreadOnly && article && n.articleId && reads.has(n.articleId)) {
        if (n.children?.length) walk(n.children, lvl + 1)
        continue
      }
      rows.push(
        <div
          key={`${n.href}-${n.label}-${lvl}`}
          className={cn(
            "flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent",
            lvl === 2 && "pl-5",
            lvl >= 3 && "pl-8",
            article && n.articleId && reads.has(n.articleId) && "opacity-60",
          )}
        >
          {mode === "spine" && article && n.articleId ? (
            <Checkbox
              checked={reads.has(n.articleId)}
              onCheckedChange={(v) =>
                onToggleRead(n.articleId!, !!v, n.href)
              }
              aria-label={`Mark ${n.label} read`}
              className="mt-0.5"
            />
          ) : null}
          <button
            type="button"
            className="min-w-0 flex-1 text-left text-sm"
            onClick={() => {
              onJump(n.href)
              if (n.articleId) onRemember(n.articleId, n.href)
              onOpenChange(false)
            }}
          >
            {n.label}
          </button>
        </div>,
      )
      if (n.children?.length) walk(n.children, lvl + 1)
    }
  }
  walk(manifest?.toc, 1)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Contents</SheetTitle>
          <SheetDescription>
            {mode === "spine"
              ? "Jump chapters, mark articles read, continue where you left off."
              : "Jump within this book."}
          </SheetDescription>
        </SheetHeader>

        {mode === "spine" && (
          <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onToggleUnreadOnly}
              >
                {unreadOnly ? "Show all" : "Unread only"}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={onContinue}>
                <CheckIcon data-icon="inline-start" />
                Continue
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {(manifest?.progress || []).length
                ? (manifest?.progress || [])
                    .map((p) => `${p.label} ${p.read}/${p.total}`)
                    .join(" · ")
                : "No article progress yet"}
            </p>
          </div>
        )}

        <Separator />
        <ScrollArea className="min-h-0 flex-1 px-2 py-2">
          {!rows.length ? (
            <p className="px-2 py-6 text-sm text-muted-foreground">
              Open a book to see contents.
            </p>
          ) : (
            <div className="flex flex-col gap-0.5 pb-6">{rows}</div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
