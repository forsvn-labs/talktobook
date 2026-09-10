import { useState } from "react"
import { toast } from "sonner"
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { api, formatIngestResult } from "@/lib/api"
import {
  applyBodyKnobs,
  parseBodyKnobs,
  roundKnob,
  takeStyleSeed,
  type BodyKnobs,
} from "@/lib/epub-style"

export function StyleSheet({
  open,
  seed,
  onOpenChange,
  onSaved,
  onLibraryRefresh,
}: {
  open: boolean
  seed: string
  onOpenChange: (o: boolean) => void
  onSaved: (css: string) => void
  onLibraryRefresh?: () => void
}) {
  const [css, setCss] = useState(seed)
  const [saved, setSaved] = useState(seed)
  const [busy, setBusy] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [rebuildOpen, setRebuildOpen] = useState(false)

  const nextSeed = takeStyleSeed(seed, css, saved)
  if (nextSeed) {
    setCss(nextSeed.css)
    setSaved(nextSeed.saved)
  }
  const view = nextSeed ?? { css, saved }

  const knobs = parseBodyKnobs(view.css)
  const dirty = view.css !== view.saved

  const setKnob = (patch: Partial<BodyKnobs>) => {
    if (!knobs) return
    const next: BodyKnobs = {
      marginPct: Math.min(
        12,
        Math.max(2, roundKnob(patch.marginPct ?? knobs.marginPct, 1)),
      ),
      lineHeight: Math.min(
        2,
        Math.max(1.3, roundKnob(patch.lineHeight ?? knobs.lineHeight, 2)),
      ),
      fontEm: Math.min(
        1.25,
        Math.max(0.85, roundKnob(patch.fontEm ?? knobs.fontEm, 2)),
      ),
    }
    setCss((prev) => applyBodyKnobs(prev, next))
  }

  const editCss = (next: string) => {
    setCss(next)
  }

  const save = async () => {
    setBusy(true)
    try {
      const data = await api.saveEpubStyle(view.css)
      const msg = formatIngestResult(data)
      if (data.ok === false) {
        toast.error(msg)
        return
      }
      setSaved(view.css)
      toast.success("Library CSS saved. Drafts on the device pick it up now.")
      onSaved(view.css)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save CSS.")
    }
    setBusy(false)
  }

  const rebuild = async () => {
    setBusy(true)
    try {
      const data = await api.buildEpub()
      const msg = formatIngestResult(data)
      if (data.ok === false) {
        toast.error(msg)
        return
      }
      toast.success(msg || "Hung Library rebuild started.")
      onLibraryRefresh?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rebuild failed.")
    }
    setBusy(false)
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-2xl"
        >
          <SheetHeader>
            <SheetTitle>Library CSS</SheetTitle>
            <SheetDescription>
              Writes skills/learn-library-epub/scripts/epub-style.css. Drafts
              update immediately. Drive EPUBs stay on the old sheet until you
              rebuild Hung Library.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-5 px-4 py-4">
            {knobs ? (
              <FieldGroup className="gap-4">
                <div className="grid grid-cols-3 gap-3">
                  <Field>
                    <FieldLabel htmlFor="css-margin">Side %</FieldLabel>
                    <Input
                      id="css-margin"
                      type="number"
                      min={2}
                      max={12}
                      step={0.5}
                      value={knobs.marginPct}
                      disabled={busy}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        if (Number.isFinite(n)) setKnob({ marginPct: n })
                      }}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="css-lh">Line height</FieldLabel>
                    <Input
                      id="css-lh"
                      type="number"
                      min={1.3}
                      max={2}
                      step={0.05}
                      value={knobs.lineHeight}
                      disabled={busy}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        if (Number.isFinite(n)) setKnob({ lineHeight: n })
                      }}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="css-em">Body em</FieldLabel>
                    <Input
                      id="css-em"
                      type="number"
                      min={0.85}
                      max={1.25}
                      step={0.05}
                      value={knobs.fontEm}
                      disabled={busy}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        if (Number.isFinite(n)) setKnob({ fontEm: n })
                      }}
                    />
                  </Field>
                </div>
                <FieldDescription>
                  These three rewrite the body rule. Everything else stays in
                  the sheet below.
                </FieldDescription>
              </FieldGroup>
            ) : (
              seed && (
                <FieldDescription>
                  Could not find a body rule to drive the knobs. Edit the sheet
                  directly.
                </FieldDescription>
              )
            )}

            <Field>
              <FieldLabel htmlFor="css-raw">epub-style.css</FieldLabel>
              <Textarea
                id="css-raw"
                value={view.css}
                onChange={(e) => editCss(e.target.value)}
                disabled={busy}
                spellCheck={false}
                className="min-h-[22rem] font-mono text-xs leading-5"
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={busy || !dirty}
                onClick={() => setSaveOpen(true)}
              >
                Save CSS
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setRebuildOpen(true)}
              >
                Rebuild Hung Library
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={saveOpen} onOpenChange={setSaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Write the library CSS?</AlertDialogTitle>
            <AlertDialogDescription>
              Overwrites the one sheet used by Kobo books and TalkToBook. This
              is not a fork. Open drafts refresh; already-built EPUBs do not.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void save()
              }}
            >
              Write CSS
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={rebuildOpen} onOpenChange={setRebuildOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rebuild Hung Library?</AlertDialogTitle>
            <AlertDialogDescription>
              Runs the operator EPUB builder and writes Drive
              library/generated/. Save CSS first if you still have unsaved
              edits.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void rebuild()
              }}
            >
              Rebuild
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
