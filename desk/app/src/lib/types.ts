export type BookMeta = {
  path: string
  title: string
  author?: string
  size?: number
  mode: "spine" | "zip" | "draft"
  bookKey?: string
  qa?: {
    images_ok?: boolean
    pipe_ok?: boolean
    slug_ok?: boolean
  }
}

export type Shelf = {
  name: string
  books: BookMeta[]
}

export type LibraryResponse = { shelves: Shelf[] }

export type DeviceStatus = {
  mounted: boolean
  mount?: string | null
  free_bytes?: number
  error?: string
}

export type SyncPlanItem = {
  status: string
  source?: string
  dest?: string
  dest_name?: string
  size?: number
  note?: string
  title?: string
}

export type JobSnapshot = {
  status: string
  log?: string[]
  result?: {
    error?: string
    per_book?: Array<{
      status: string
      title?: string
      dest_name?: string
      note?: string
    }>
  }
}

export type InboxItem = {
  path: string
  name: string
  title?: string
  size?: number
}

export type TocNode = {
  label: string
  href: string
  kind?: string
  articleId?: string
  children?: TocNode[]
}

export type SpineManifest = {
  bookKey?: string
  spine: Array<{ href: string; media?: string }>
  toc?: TocNode[]
  progress?: Array<{ label: string; read: number; total: number }>
  read?: {
    articles?: Record<string, { read?: boolean }>
    continue?: { href?: string; articleId?: string } | null
  }
}

export type ApiErrorBody = {
  ok?: boolean
  error?: string
  path?: string
  title?: string
  domain?: string
  partial?: "vault-kept"
  errors?: Array<{ src?: string; error?: string }>
}

declare global {
  interface Window {
    ePub: (url: string | File | ArrayBuffer) => EpubBook
  }
}

export type EpubBook = {
  ready: Promise<void>
  destroy: () => void
  loaded: { navigation: Promise<{ toc: EpubNavItem[] }> }
  renderTo: (
    el: string | HTMLElement,
    opts: Record<string, unknown>,
  ) => EpubRendition
}

export type EpubNavItem = {
  label: string
  href: string
  subitems?: EpubNavItem[]
}

export type EpubRendition = {
  display: (target?: string) => Promise<void>
  next: () => Promise<void>
  prev: () => Promise<void>
  destroy: () => void
  manager?: unknown
  on: (event: string, cb: (loc: {
    start: { displayed: { page: number; total: number } }
  }) => void) => void
  themes: {
    register: (name: string, rules: Record<string, unknown>) => void
    fontSize: (size: string) => void
    select: (name: string) => void
  }
}
