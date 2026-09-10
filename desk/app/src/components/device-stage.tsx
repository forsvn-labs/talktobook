import { useEffect, useRef, useState } from "react"
import { ChevronLeftIcon, ChevronRightIcon, ListIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { DEVICES, type DeviceId } from "@/lib/devices"
import type { BookMeta } from "@/lib/types"

function useFitScale(nativeW: number, nativeH: number) {
  const slotRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const slot = slotRef.current
    if (!slot) return
    const measure = () => {
      const cw = slot.clientWidth
      const ch = slot.clientHeight
      if (cw < 32 || ch < 32) return
      const next = Math.min(cw / nativeW, ch / nativeH, 1)
      setScale(Number.isFinite(next) && next > 0 ? next : 1)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(slot)
    return () => ro.disconnect()
  }, [nativeW, nativeH])

  return { slotRef, scale }
}

export function DeviceStage({
  device,
  onDevice,
  eink,
  onEink,
  dark,
  onDark,
  fontPct,
  onFont,
  canTurn,
  pageInfo,
  status,
  error,
  current,
  hasBook,
  onPrev,
  onNext,
  onContents,
  onCook,
  onMakeBook,
  onDiscard,
  viewerRef,
  spineRef,
}: {
  device: DeviceId
  onDevice: (d: DeviceId) => void
  eink: boolean
  onEink: (v: boolean) => void
  dark: boolean
  onDark: (v: boolean) => void
  fontPct: string
  onFont: (v: string) => void
  canTurn: boolean
  pageInfo: string
  status: string | null
  error: string | null
  current: BookMeta | null
  hasBook: boolean
  onPrev: () => void
  onNext: () => void
  onContents: () => void
  onCook?: () => void
  onMakeBook?: () => void
  onDiscard?: () => void
  viewerRef: React.RefObject<HTMLDivElement | null>
  spineRef: React.RefObject<HTMLIFrameElement | null>
}) {
  const d = DEVICES[device]
  const isDraft = current?.mode === "draft"
  const { slotRef, scale } = useFitScale(d.w, d.h)

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2">
        <ToggleGroup
          type="single"
          value={device}
          onValueChange={(v) => v && onDevice(v as DeviceId)}
          variant="outline"
          size="sm"
          className="shrink-0"
        >
          <ToggleGroupItem value="clara">Clara</ToggleGroupItem>
          <ToggleGroupItem value="libra">Libra</ToggleGroupItem>
          <ToggleGroupItem value="kindle">Kindle</ToggleGroupItem>
        </ToggleGroup>

        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Switch id="eink" checked={eink} onCheckedChange={onEink} />
            <Label htmlFor="eink" className="text-xs whitespace-nowrap">
              e-ink
            </Label>
          </div>
          <div className="flex items-center gap-1.5">
            <Switch id="dark" checked={dark} onCheckedChange={onDark} />
            <Label htmlFor="dark" className="text-xs whitespace-nowrap">
              dark
            </Label>
          </div>
          <Select value={fontPct} onValueChange={onFont}>
            <SelectTrigger className="h-8 w-16 shrink-0" size="sm">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="85">A−</SelectItem>
              <SelectItem value="100">A</SelectItem>
              <SelectItem value="115">A+</SelectItem>
              <SelectItem value="130">A++</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex basis-full items-center justify-end gap-1 min-[520px]:ml-auto min-[520px]:basis-auto">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={onContents}
            disabled={!hasBook || isDraft}
          >
            <ListIcon data-icon="inline-start" />
            <span className="hidden sm:inline">Contents</span>
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={!canTurn}
            onClick={onPrev}
            aria-label="Previous page"
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={!canTurn}
            onClick={onNext}
            aria-label="Next page"
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>

      {isDraft && (
        <div className="flex shrink-0 flex-col gap-2 border-b border-border px-3 py-2 sm:flex-row sm:items-center">
          <span className="min-w-0 text-xs text-muted-foreground">
            Read it here first. Cook writes the vault. Make EPUB is a
            standalone book.
          </span>
          <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
            <Button type="button" size="sm" variant="secondary" onClick={onCook}>
              Cook
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onMakeBook}>
              Make EPUB
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={onDiscard}
            >
              Discard
            </Button>
          </div>
        </div>
      )}

      <div className="flex min-h-0 shrink-0 items-baseline gap-2 border-b border-border px-3 py-1.5">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {d.short}
          {current ? ` · ${current.title}` : ""}
          {pageInfo ? ` · ${pageInfo}` : ""}
        </p>
        {status && (
          <p className="max-w-[40%] truncate text-xs text-muted-foreground">
            {status}
          </p>
        )}
      </div>

      <div
        ref={slotRef}
        className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_center,var(--desk-glow),transparent_55%),linear-gradient(180deg,oklch(0.14_0.01_260),oklch(0.12_0.01_260))] p-3"
      >
        <div
          className="relative shrink-0 overflow-hidden"
          style={{ width: d.w * scale, height: d.h * scale }}
        >
          <div
            className={cn(
              "device-frame absolute top-0 left-0",
              device === "kindle" && "kindle",
              eink && "eink",
              dark && "dark-page",
            )}
            style={{
              width: d.w,
              height: d.h,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            {!hasBook && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#f4f1ea] p-8 text-center">
                <Empty className="border-0 bg-transparent">
                  <EmptyHeader>
                    <EmptyTitle className="text-neutral-800">
                      Empty device
                    </EmptyTitle>
                    <EmptyDescription className="text-neutral-600">
                      {d.empty}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </div>
            )}
            <div id="viewer" ref={viewerRef} />
            <iframe
              id="spine-host"
              ref={spineRef}
              title="Spine chapter"
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="shrink-0 border-t border-border p-3">
          <Alert variant="destructive">
            <AlertTitle>Preview error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  )
}
