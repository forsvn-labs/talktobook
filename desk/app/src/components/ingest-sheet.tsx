import { useState } from "react"
import { toast } from "sonner"
import { Loader2Icon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
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
import { api, formatIngestResult, type CookResult } from "@/lib/api"

export function IngestSheet({
  open,
  onOpenChange,
  onLibraryRefresh,
  onDraftReady,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onLibraryRefresh: () => void
  onDraftReady?: (path: string, title?: string) => void
}) {
  const [filePath, setFilePath] = useState("")
  const [transcript, setTranscript] = useState("")
  const [importPath, setImportPath] = useState("")
  const [importShelf, setImportShelf] = useState<"books" | "generated">("books")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [pane, setPane] = useState<"file" | "transcript" | "epub">("file")
  const [buildOpen, setBuildOpen] = useState(false)
  const [buildConfirm, setBuildConfirm] = useState(false)
  const [dumpCookOpen, setDumpCookOpen] = useState(false)
  const [dumpConfirm, setDumpConfirm] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importConfirm, setImportConfirm] = useState(false)

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true)
    setStatus(label)
    try {
      const data = (await fn()) as Parameters<typeof formatIngestResult>[0]
      const msg = formatIngestResult(data)
      if (data && typeof data === "object" && data.ok === false) {
        setStatus(msg)
        toast.error(msg)
      } else {
        setStatus(msg)
        toast.success(msg)
        const cook = data as CookResult
        const first = cook?.drafts?.[0]
        const path = first?.path || (cook?.ok ? cook.path : undefined)
        if (path) onDraftReady?.(path, first?.title || cook.title)
        onLibraryRefresh()
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ingest failed."
      setStatus(msg)
      toast.error(msg)
    }
    setBusy(false)
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg"
        >
          <SheetHeader>
            <SheetTitle>Ingest</SheetTitle>
            <SheetDescription>
              Files, a pasted transcript, or an EPUB already on this Mac.
              YouTube and article URLs go on the Shelf. Vault and Drive writes
              still need Confirm.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-5 px-4 py-4">
            <div role="tablist" className="flex gap-1 rounded-lg bg-muted p-1">
              {(
                [
                  ["file", "File"],
                  ["transcript", "Transcript"],
                  ["epub", "EPUB"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={pane === id}
                  className={
                    pane === id
                      ? "h-8 flex-1 rounded-md bg-background text-sm"
                      : "h-8 flex-1 rounded-md text-sm text-muted-foreground"
                  }
                  onClick={() => setPane(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {pane === "file" && (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="cook-path">File</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="cook-path"
                      value={filePath}
                      onChange={(e) => setFilePath(e.target.value)}
                      placeholder="/path/to/file.pdf"
                      disabled={busy}
                    />
                    <Button
                      type="button"
                      disabled={busy || !filePath.trim()}
                      onClick={() =>
                        run("Adding file…", () =>
                          api.cook({ path: filePath.trim() }),
                        )
                      }
                    >
                      Add
                    </Button>
                  </div>
                </Field>
              </FieldGroup>
            )}

            {pane === "transcript" && (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="ingest-tr">Paste transcript</FieldLabel>
                  <Textarea
                    id="ingest-tr"
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    rows={6}
                    disabled={busy}
                    placeholder="Paste a timestamped transcript…"
                  />
                  <Button
                    type="button"
                    className="mt-2"
                    disabled={busy || transcript.trim().length < 20}
                    onClick={() =>
                      run("Adding transcript…", () =>
                        api.ingestTranscript(transcript),
                      )
                    }
                  >
                    Add
                  </Button>
                </Field>
              </FieldGroup>
            )}

            {pane === "epub" && (
              <div className="flex flex-col gap-3">
                <div className="text-sm font-medium">Existing EPUB</div>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="import-epub">Path</FieldLabel>
                    <Input
                      id="import-epub"
                      value={importPath}
                      onChange={(e) => setImportPath(e.target.value)}
                      placeholder="/path/to/book.epub"
                      disabled={busy}
                    />
                  </Field>
                  <div className="flex flex-wrap items-end gap-2">
                    <Field className="min-w-40 flex-1">
                      <FieldLabel>Shelf</FieldLabel>
                      <Select
                        value={importShelf}
                        onValueChange={(v) =>
                          setImportShelf(v as "books" | "generated")
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="books">Licensed books</SelectItem>
                          <SelectItem value="generated">
                            Generated (operator)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy || !importPath.trim()}
                      onClick={() => setImportOpen(true)}
                    >
                      Import
                    </Button>
                  </div>
                </FieldGroup>
              </div>
            )}

            {status && (
              <Alert>
                <AlertTitle>Status</AlertTitle>
                <AlertDescription>{status}</AlertDescription>
              </Alert>
            )}

            <Separator />

            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  run("Adding dump inbox…", () => api.cook({ dump: true }))
                }
              >
                Add dump inbox
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => setDumpCookOpen(true)}
              >
                Cook dump to library
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setBuildOpen(true)}
              >
                {busy ? (
                  <Loader2Icon
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                ) : null}
                Rebuild Hung Library
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={dumpCookOpen}
        onOpenChange={(next) => {
          setDumpCookOpen(next)
          if (next) setDumpConfirm(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cook dump inbox into Hung Library?</AlertDialogTitle>
            <AlertDialogDescription>
              Extracts `_hq/vault/library/dump/inbox/`, copies each draft into
              the vault, then rebuilds Hung Library on Drive. Empty tray is a
              no-op error. This is not a CSS write.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2">
            <Checkbox
              id="dump-confirm"
              checked={dumpConfirm}
              onCheckedChange={(v) => setDumpConfirm(v === true)}
            />
            <Label htmlFor="dump-confirm" className="font-normal">
              I confirm writing to the vault and Drive
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!dumpConfirm}
              onClick={() => {
                if (!dumpConfirm) return
                void run("Cooking dump inbox…", async () => {
                  const data = await api.cook({
                    dump: true,
                    promote: true,
                    build: true,
                    confirm: true,
                  })
                  onLibraryRefresh()
                  return data
                })
              }}
            >
              Cook dump
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={buildOpen}
        onOpenChange={(next) => {
          setBuildOpen(next)
          if (next) setBuildConfirm(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rebuild Hung Library EPUB?</AlertDialogTitle>
            <AlertDialogDescription>
              Writes to Drive `library/generated/`. May take a while.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2">
            <Checkbox
              id="build-confirm"
              checked={buildConfirm}
              onCheckedChange={(v) => setBuildConfirm(v === true)}
            />
            <Label htmlFor="build-confirm" className="font-normal">
              I confirm writing to Drive
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!buildConfirm}
              onClick={() => {
                if (!buildConfirm) return
                void run("Building operator EPUB…", async () => {
                  const data = await api.buildEpub()
                  onLibraryRefresh()
                  return data
                })
              }}
            >
              Build
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={importOpen}
        onOpenChange={(next) => {
          setImportOpen(next)
          if (next) setImportConfirm(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Copy EPUB onto the shelf?</AlertDialogTitle>
            <AlertDialogDescription>
              Copies the file into Drive library/{importShelf}/. Does not
              delete the original.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2">
            <Checkbox
              id="import-confirm"
              checked={importConfirm}
              onCheckedChange={(v) => setImportConfirm(v === true)}
            />
            <Label htmlFor="import-confirm" className="font-normal">
              I confirm writing to Drive
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!importConfirm}
              onClick={() => {
                if (!importConfirm) return
                void run("Importing EPUB…", async () => {
                  const data = await api.importEpub(
                    importPath.trim(),
                    importShelf,
                  )
                  onLibraryRefresh()
                  return data
                })
              }}
            >
              Import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
