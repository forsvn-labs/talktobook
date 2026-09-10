export type DeviceId = "clara" | "libra" | "kindle"

export const DEVICES: Record<
  DeviceId,
  {
    label: string
    short: string
    empty: string
    w: number
    h: number
    einkDefault: boolean
    colourNote: boolean
  }
> = {
  clara: {
    short: "Clara BW",
    label: "Kobo Clara BW · 1072×1448 · 300ppi",
    empty: "Pick a title on the shelf, or paste a URL or YouTube link to preview on Clara BW.",
    w: 536,
    h: 724,
    einkDefault: true,
    colourNote: false,
  },
  libra: {
    short: "Libra Colour",
    label: "Kobo Libra Colour · 1264×1680",
    empty: "Pick a title on the shelf, or paste a URL or YouTube link to preview on Libra Colour.",
    w: 632,
    h: 840,
    einkDefault: false,
    colourNote: true,
  },
  kindle: {
    short: "Paperwhite",
    label: "Kindle Paperwhite · 1264×1680 · approximation",
    empty: "Pick a title on the shelf. This frame is a Paperwhite-sized approximation, not a Kindle previewer. Sync still copies to Kobo.",
    w: 632,
    h: 840,
    einkDefault: true,
    colourNote: false,
  },
}
