import { useCallback, useEffect, useRef, useState } from "react"
import {
  DownloadIcon,
  InboxIcon,
  KeyboardIcon,
  PaletteIcon,
  PanelLeftCloseIcon,
  PanelLeftIcon,
} from "lucide-react"
import { toast } from "sonner"
import { BookCommand } from "@/components/book-command"
import { ContentsSheet } from "@/components/contents-sheet"
import { DeviceStage } from "@/components/device-stage"
import { IngestSheet } from "@/components/ingest-sheet"
import { LibraryRail } from "@/components/library-rail"
import { StyleSheet } from "@/components/style-sheet"
import { SyncSheet } from "@/components/sync-sheet"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { useReader } from "@/hooks/use-reader"
import { useDeskSplit } from "@/hooks/use-mobile"
import { api, formatIngestResult, type CookResult } from "@/lib/api"
import { DEVICES, type DeviceId } from "@/lib/devices"
import type { BookMeta, Shelf } from "@/lib/types"

function draftMeta(path: string, title?: string): BookMeta {
  return {
    path,
    title: title || path.split("/").pop() || "draft",
    author: "inbox",
    mode: "draft",
  }
}

export function App() {
  const [shelves, setShelves] = useState<Shelf[]>([])
  const [libLoading, setLibLoading] = useState(true)
  const [libError, setLibError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [device, setDevice] = useState<DeviceId>("clara")
  const [eink, setEink] = useState(DEVICES.clara.einkDefault)
  const [dark, setDark] = useState(false)
  const [fontPct, setFontPct] = useState("100")
  const [contentsOpen, setContentsOpen] = useState(false)
  const [ingestOpen, setIngestOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const [styleOpen, setStyleOpen] = useState(false)
  const [styleSeed, setStyleSeed] = useState("")
  const [fetching, setFetching] = useState(false)
  const [cookOpen, setCookOpen] = useState(false)
  const [rebuildLibrary, setRebuildLibrary] = useState(true)
  const [makeOpen, setMakeOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [cookDomain, setCookDomain] = useState("business")
  const deskSplit = useDeskSplit()
  const [shelfUser, setShelfUser] = useState<boolean | null>(null)
  const shelfOpen = shelfUser ?? deskSplit

  const viewerRef = useRef<HTMLDivElement>(null)
  const spineRef = useRef<HTMLIFrameElement>(null)

  const reader = useReader({ fontPct, dark, viewerRef, spineRef })

  const loadLibrary = useCallback(async () => {
    setLibLoading(true)
    setLibError(null)
    try {
      const data = await api.library()
      setShelves(data.shelves || [])
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Shelf unreachable — is the API running?"
      setLibError(msg)
      toast.error(msg)
    }
    setLibLoading(false)
  }, [])

  const openDraft = useCallback(
    (path: string, title?: string) => {
      void reader.openBook(draftMeta(path, title))
      setIngestOpen(false)
    },
    [reader],
  )

  const previewFromCook = useCallback(
    (data: CookResult) => {
      const first = data.drafts?.[0]
      const path = first?.path || (data.ok ? data.path : undefined)
      if (path) openDraft(path, first?.title || data.title)
    },
    [openDraft],
  )

  const fetchUrl = async (url: string) => {
    setFetching(true)
    try {
      const data = await api.cook({ url })
      const msg = formatIngestResult(data)
      if (data.ok === false) {
        toast.error(msg)
      } else {
        toast.success(msg)
        await loadLibrary()
        previewFromCook(data)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fetch failed.")
    }
    setFetching(false)
  }

  useEffect(() => {
    void loadLibrary()
  }, [loadLibrary])

  useEffect(() => {
    if (libLoading || !shelves.length) return
    const want = new URLSearchParams(location.search).get("open")
    if (!want) return
    for (const shelf of shelves) {
      const hit = shelf.books.find((b) => b.path.includes(want))
      if (hit) {
        void reader.openBook(hit)
        break
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deep-link once after load
  }, [libLoading])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!reader.canTurn) return
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return
      if (e.key === "ArrowLeft") void reader.prev()
      if (e.key === "ArrowRight") void reader.next()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [reader])

  useEffect(() => {
    const onDragOver = (e: DragEvent) => e.preventDefault()
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      const f = e.dataTransfer?.files?.[0]
      if (!f || !f.name.endsWith(".epub")) return
      void reader.openZipFile(f)
    }
    document.body.addEventListener("dragover", onDragOver)
    document.body.addEventListener("drop", onDrop)
    return () => {
      document.body.removeEventListener("dragover", onDragOver)
      document.body.removeEventListener("drop", onDrop)
    }
  }, [reader])

  const changeDevice = (id: DeviceId) => {
    setDevice(id)
    setEink(DEVICES[id].einkDefault)
    requestAnimationFrame(() => reader.relayout())
  }

  const selectBook = (book: BookMeta) => {
    void reader.openBook(book)
  }

  useEffect(() => {
    const id = window.requestAnimationFrame(() => reader.relayout())
    const t = window.setTimeout(() => reader.relayout(), 220)
    return () => {
      window.cancelAnimationFrame(id)
      window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scale the device when the shelf moves
  }, [shelfOpen])

  const runDraftAction = async (
    label: string,
    fn: () => Promise<unknown>,
    close?: () => void,
  ) => {
    try {
      const data = (await fn()) as Parameters<typeof formatIngestResult>[0]
      const msg = formatIngestResult(data)
      if (data && typeof data === "object" && data.ok === false) {
        toast.error(msg)
        return
      }
      toast.success(msg)
      close?.()
      await loadLibrary()
      return data
    } catch (e) {
      toast.error(e instanceof Error ? e.message : label)
    }
  }

  const openStyle = async () => {
    try {
      const text = await api.epubStyle()
      if (!text.trim()) {
        toast.error("Library CSS is missing from this checkout.")
        return
      }
      setStyleSeed(text)
      setStyleOpen(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load library CSS.")
    }
  }

  const draftPath = reader.current?.mode === "draft" ? reader.current.path : null

  const rail = (
    <LibraryRail
      shelves={shelves}
      loading={libLoading}
      error={libError}
      query={query}
      onQuery={setQuery}
      activePath={reader.current?.path ?? null}
      onSelect={selectBook}
      onFetch={fetchUrl}
      fetching={fetching}
    />
  )

  const stage = (
    <DeviceStage
      device={device}
      onDevice={changeDevice}
      eink={eink}
      onEink={setEink}
      dark={dark}
      onDark={setDark}
      fontPct={fontPct}
      onFont={setFontPct}
      canTurn={reader.canTurn}
      pageInfo={reader.pageInfo}
      status={reader.status}
      error={reader.error}
      current={reader.current}
      hasBook={!!reader.mode}
      onPrev={() => void reader.prev()}
      onNext={() => void reader.next()}
      onContents={() => setContentsOpen(true)}
      onCook={() => {
        setRebuildLibrary(true)
        setCookOpen(true)
      }}
      onMakeBook={() => setMakeOpen(true)}
      onDiscard={() => setDiscardOpen(true)}
      viewerRef={viewerRef}
      spineRef={spineRef}
    />
  )

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-2 overflow-hidden border-b border-border bg-card/40 px-3">
          <Button
            type="button"
            size="sm"
            variant={shelfOpen ? "secondary" : "ghost"}
            className="shrink-0"
            aria-pressed={shelfOpen}
            aria-label={shelfOpen ? "Hide shelf" : "Show shelf"}
            onClick={() => setShelfUser(!shelfOpen)}
          >
            {shelfOpen ? (
              <PanelLeftCloseIcon data-icon="inline-start" />
            ) : (
              <PanelLeftIcon data-icon="inline-start" />
            )}
            Shelf
          </Button>
          <div className="min-w-0 truncate text-sm font-semibold tracking-tight">
            E-reader
          </div>
          <div className="hidden min-w-0 truncate text-xs text-muted-foreground md:block">
            Private desk
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="shrink-0"
              onClick={() => setIngestOpen(true)}
            >
              <InboxIcon data-icon="inline-start" />
              <span className="hidden sm:inline">Ingest</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="shrink-0"
              onClick={() => void openStyle()}
            >
              <PaletteIcon data-icon="inline-start" />
              <span className="hidden sm:inline">Style</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="shrink-0"
              onClick={() => setSyncOpen(true)}
            >
              <DownloadIcon data-icon="inline-start" />
              <span className="hidden sm:inline">Sync</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="hidden sm:inline-flex"
              onClick={() =>
                window.dispatchEvent(
                  new KeyboardEvent("keydown", { key: "k", metaKey: true }),
                )
              }
            >
              <KeyboardIcon data-icon="inline-start" />
              ⌘K
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <aside
            className={
              shelfOpen
                ? "h-full min-h-0 w-[min(20rem,40%)] min-w-0 shrink-0 overflow-hidden border-r border-sidebar-border transition-[width] duration-200 ease-out"
                : "h-full min-h-0 w-0 min-w-0 overflow-hidden transition-[width] duration-200 ease-out"
            }
          >
            <div className="h-full w-full">{rail}</div>
          </aside>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {stage}
          </div>
        </div>
      </div>

      <ContentsSheet
        open={contentsOpen}
        onOpenChange={setContentsOpen}
        mode={reader.mode}
        manifest={reader.manifest}
        unreadOnly={reader.unreadOnly}
        onToggleUnreadOnly={reader.toggleUnreadOnly}
        onContinue={() => void reader.continueReading()}
        onJump={(href) => void reader.jumpTo(href)}
        onToggleRead={(id, read, href) =>
          void reader.toggleRead(id, read, href)
        }
        onRemember={(id, href) => void reader.rememberContinue(id, href)}
      />
      <IngestSheet
        open={ingestOpen}
        onOpenChange={setIngestOpen}
        onLibraryRefresh={() => void loadLibrary()}
        onDraftReady={openDraft}
      />
      <StyleSheet
        open={styleOpen}
        seed={styleSeed}
        onOpenChange={setStyleOpen}
        onSaved={(next) => {
          setStyleSeed(next)
          void reader.reloadCss()
        }}
        onLibraryRefresh={() => void loadLibrary()}
      />
      <SyncSheet open={syncOpen} onOpenChange={setSyncOpen} shelves={shelves} />
      <BookCommand shelves={shelves} onSelect={selectBook} />
      <Toaster position="bottom-right" theme="dark" richColors closeButton />

      <AlertDialog open={cookOpen} onOpenChange={setCookOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cook this into Hung Library?</AlertDialogTitle>
            <AlertDialogDescription>
              Copies the markdown into `_hq/vault/library/{cookDomain}/`.
              Rebuild writes Drive library/generated/. Send to cook starts a
              nested worker that rewrites this one draft first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Select value={cookDomain} onValueChange={setCookDomain}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="business">business</SelectItem>
              <SelectItem value="career">career</SelectItem>
              <SelectItem value="finance">finance</SelectItem>
              <SelectItem value="health">health</SelectItem>
              <SelectItem value="experience">experience</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Checkbox
              id="cook-rebuild"
              checked={rebuildLibrary}
              onCheckedChange={(v) => setRebuildLibrary(v === true)}
            />
            <Label htmlFor="cook-rebuild" className="font-normal">
              Rebuild Hung Library
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!draftPath) return
                void runDraftAction("Send to cook failed.", () =>
                  api.sendAgent(draftPath, cookDomain),
                )
              }}
            >
              Send to cook
            </Button>
            <AlertDialogAction
              onClick={() => {
                if (!draftPath) return
                void runDraftAction("Cook failed.", () =>
                  api.cookToBook({
                    path: draftPath,
                    domain: cookDomain,
                    rebuild: rebuildLibrary,
                  }),
                )
              }}
            >
              Cook
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={makeOpen} onOpenChange={setMakeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make a standalone EPUB?</AlertDialogTitle>
            <AlertDialogDescription>
              Builds from this draft with an ASCII cover and copies it to Drive
              library/generated/. Cover providers live under Ingest.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!draftPath) return
                void runDraftAction("Make EPUB failed.", () =>
                  api.makeBook({
                    path: draftPath,
                    title: reader.current?.title,
                    cover: "ascii",
                    shelf: "generated",
                  }),
                )
              }}
            >
              Make EPUB
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              Deletes the inbox markdown. This does not touch the vault or Drive
              library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!draftPath) return
                void runDraftAction(
                  "Discard failed.",
                  () => api.discardDraft(draftPath),
                  () => reader.destroy(),
                )
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  )
}
