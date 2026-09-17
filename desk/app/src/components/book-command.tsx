import { useEffect, useState } from "react"
import {
  DownloadIcon,
  InboxIcon,
  PaletteIcon,
  PanelLeftIcon,
} from "lucide-react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import type { BookMeta, Shelf } from "@/lib/types"

export function BookCommand({
  shelves,
  onSelect,
  onIngest,
  onStyle,
  onSync,
  onToggleShelf,
}: {
  shelves: Shelf[]
  onSelect: (book: BookMeta) => void
  onIngest?: () => void
  onStyle?: () => void
  onSync?: () => void
  onToggleShelf?: () => void
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Desk commands"
      description="Jump to a book or open ingest, style, or copy-only sync."
    >
      <CommandInput placeholder="Jump to book or action…" />
      <CommandList>
        <CommandEmpty>No matching title.</CommandEmpty>
        <CommandGroup heading="Desk">
          <CommandItem
            value="ingest files transcript"
            onSelect={() => {
              onIngest?.()
              setOpen(false)
            }}
          >
            <InboxIcon />
            Ingest
          </CommandItem>
          <CommandItem
            value="style css"
            onSelect={() => {
              onStyle?.()
              setOpen(false)
            }}
          >
            <PaletteIcon />
            Style sheet
          </CommandItem>
          <CommandItem
            value="sync kobo copy-only"
            onSelect={() => {
              onSync?.()
              setOpen(false)
            }}
          >
            <DownloadIcon />
            Copy-only Kobo sync
          </CommandItem>
          <CommandItem
            value="shelf toggle"
            onSelect={() => {
              onToggleShelf?.()
              setOpen(false)
            }}
          >
            <PanelLeftIcon />
            Toggle shelf
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        {shelves.map((shelf) => (
          <CommandGroup key={shelf.name} heading={shelf.name}>
            {shelf.books.map((b) => (
              <CommandItem
                key={b.path}
                value={`${b.title} ${b.author || ""} ${b.path}`}
                onSelect={() => {
                  onSelect(b)
                  setOpen(false)
                }}
              >
                <span className="truncate">{b.title}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {b.mode}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
