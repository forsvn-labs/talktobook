import { useEffect, useState } from "react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import type { BookMeta, Shelf } from "@/lib/types"

export function BookCommand({
  shelves,
  onSelect,
}: {
  shelves: Shelf[]
  onSelect: (book: BookMeta) => void
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
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Jump to book…" />
      <CommandList>
        <CommandEmpty>No matching title.</CommandEmpty>
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
