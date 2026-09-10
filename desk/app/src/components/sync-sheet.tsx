import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { api } from "@/lib/api"
import { cn, fmtSize } from "@/lib/utils"
import type { DeviceStatus, Shelf, SyncPlanItem } from "@/lib/types"

export function SyncSheet({
  open,
  onOpenChange,
  shelves,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  shelves: Shelf[]
}) {
  const allPaths = useMemo(
    () =>
      shelves.flatMap((s) =>
        s.books.filter((b) => b.mode !== "draft").map((b) => b.path),
      ),
    [shelves],
  )
  const [checked, setChecked] = useState(() => new Set(allPaths))
  const [device, setDevice] = useState<DeviceStatus | null>(null)
  const [plan, setPlan] = useState<SyncPlanItem[] | null>(null)
  const [log, setLog] = useState("")
  const [busy, setBusy] = useState(false)
  const [ejectHint, setEjectHint] = useState(false)
  const [openTick, setOpenTick] = useState(open)

  if (open !== openTick) {
    setOpenTick(open)
    if (open) {
      setChecked(new Set(allPaths))
      setPlan(null)
      setLog("")
      setEjectHint(false)
    }
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const next = await api.device()
        if (!cancelled) setDevice(next)
      } catch (e) {
        if (!cancelled) {
          setDevice({
            mounted: false,
            error: e instanceof Error ? e.message : "Device check failed.",
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  const canConfirm =
    !!device?.mounted &&
    !!plan?.some((i) => i.status === "new") &&
    !plan?.some((i) => i.status === "rejected") &&
    !busy

  const dryRun = async () => {
    setBusy(true)
    try {
      const data = await api.syncDryRun([...checked])
      setDevice(data.device)
      setPlan(data.plan || [])
      if (!data.device?.mounted) {
        toast.message("Kobo not mounted — plan only.")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Dry-run failed.")
    }
    setBusy(false)
  }

  const confirmSync = async () => {
    setBusy(true)
    setLog("")
    setEjectHint(false)
    try {
      const data = await api.syncRun([...checked])
      if (!data.job) throw new Error(data.error || "Sync refused.")
      let seen = 0
      const poll = async () => {
        const j = await api.job(data.job)
        const lines = j.log || []
        if (lines.length > seen) {
          setLog((prev) => prev + lines.slice(seen).join("\n") + "\n")
          seen = lines.length
        }
        if (j.status === "done" || j.status === "error") {
          setBusy(false)
          if (j.status === "done") {
            setEjectHint(true)
            toast.success("Sync finished. Safe to eject.")
          } else {
            toast.error(j.result?.error || "Sync failed.")
          }
          setDevice(await api.device())
          return
        }
        window.setTimeout(() => void poll(), 1000)
      }
      void poll()
    } catch (e) {
      setBusy(false)
      toast.error(e instanceof Error ? e.message : "Sync start failed.")
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg"
      >
        <SheetHeader>
          <SheetTitle>Sync</SheetTitle>
          <SheetDescription>
            Copy-only to {"<mount>"}/books/. Dry-run, then confirm. No deletes.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 py-4">
          {device && !device.mounted ? (
            <Alert variant="destructive">
              <AlertTitle>Kobo not mounted</AlertTitle>
              <AlertDescription>
                {device.error ||
                  "Plug in the reader and remount, then dry-run again. You can still preview the plan."}
              </AlertDescription>
            </Alert>
          ) : device?.mounted ? (
            <Alert>
              <AlertTitle>Mounted</AlertTitle>
              <AlertDescription>
                {device.mount}
                {device.free_bytes != null
                  ? ` · free ${fmtSize(device.free_bytes)}`
                  : ""}
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <AlertTitle>Checking device…</AlertTitle>
              <AlertDescription>Looking for a USB Kobo mount.</AlertDescription>
            </Alert>
          )}

          <ScrollArea className="h-48 rounded-md border border-border">
            <div className="flex flex-col gap-3 p-3">
              {shelves
                .map((shelf) => ({
                  ...shelf,
                  books: shelf.books.filter((b) => b.mode !== "draft"),
                }))
                .filter((shelf) => shelf.books.length > 0)
                .map((shelf) => (
                <div key={shelf.name} className="flex flex-col gap-1">
                  <div className="text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                    {shelf.name}
                  </div>
                  {shelf.books.map((b) => (
                    <label
                      key={b.path}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={checked.has(b.path)}
                        onCheckedChange={(v) => {
                          setChecked((prev) => {
                            const next = new Set(prev)
                            if (v) next.add(b.path)
                            else next.delete(b.path)
                            return next
                          })
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate">{b.title}</span>
                      <span
                        className="shrink-0 text-xs text-muted-foreground tabular-nums"
                        title="File size"
                      >
                        {fmtSize(b.size)}
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={dryRun}>
              Dry-run
            </Button>
            <Button type="button" disabled={!canConfirm} onClick={confirmSync}>
              Confirm & sync
            </Button>
          </div>

          {plan && (
            <div className="flex flex-col gap-1.5 rounded-md border border-border p-3">
              {!plan.length ? (
                <p className="text-sm text-muted-foreground">Nothing selected.</p>
              ) : (
                plan.map((i, idx) => (
                  <div key={idx} className="flex items-baseline gap-2 text-sm">
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-normal",
                        i.status === "new" && "border-primary/50 text-primary",
                        i.status === "rejected" && "border-destructive text-destructive",
                      )}
                    >
                      {i.status}
                    </Badge>
                    <span className="min-w-0 truncate text-muted-foreground">
                      {(i.dest_name || i.source || "") + " · " + fmtSize(i.size)}
                    </span>
                  </div>
                ))
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                present = on device; differs → whole sync aborts. Copy-only.
              </p>
            </div>
          )}

          {log && (
            <pre className="max-h-40 overflow-auto rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap">
              {log}
            </pre>
          )}

          {ejectHint && (
            <Alert>
              <AlertTitle>Safe to eject</AlertTitle>
              <AlertDescription>
                Sync finished. Eject the Kobo from Finder when ready.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
