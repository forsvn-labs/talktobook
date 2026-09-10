import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import {
  extractBody,
  spineHrefFile,
  spineHrefFrag,
  wrapSpineChapter,
  ZIP_THEME_LIGHT,
  zipThemeDark,
} from "@/lib/reader"
import type {
  BookMeta,
  EpubBook,
  EpubRendition,
  SpineManifest,
  TocNode,
} from "@/lib/types"

type SpineState = {
  path: string
  bookKey?: string
  manifest: SpineManifest
  spineIndex: number
  page: number
  pages: number
  ready: boolean
  unreadOnly: boolean
  fragment: string
  jumpLast: boolean
  html?: string
  extraCss?: string
}

let epubCssCache: string | null = null

async function loadEpubCss(force = false): Promise<string> {
  if (!force && epubCssCache != null) return epubCssCache
  try {
    epubCssCache = await api.epubStyle()
  } catch {
    epubCssCache = ""
  }
  return epubCssCache
}

export function useReader(opts: {
  fontPct: string
  dark: boolean
  viewerRef: React.RefObject<HTMLDivElement | null>
  spineRef: React.RefObject<HTMLIFrameElement | null>
}) {
  const { fontPct, dark, viewerRef, spineRef } = opts
  const [mode, setMode] = useState<"zip" | "spine" | "draft" | null>(null)
  const [pageInfo, setPageInfo] = useState("")
  const [canTurn, setCanTurn] = useState(false)
  const [manifest, setManifest] = useState<SpineManifest | null>(null)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [current, setCurrent] = useState<BookMeta | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const bookRef = useRef<EpubBook | null>(null)
  const renditionRef = useRef<EpubRendition | null>(null)
  const spineRefState = useRef<SpineState | null>(null)

  const destroy = useCallback(() => {
    setCanTurn(false)
    try {
      renditionRef.current?.destroy()
    } catch {
      /* ignore */
    }
    try {
      bookRef.current?.destroy()
    } catch {
      /* ignore */
    }
    renditionRef.current = null
    bookRef.current = null
    spineRefState.current = null
    const host = spineRef.current
    if (host) {
      host.style.display = "none"
      host.removeAttribute("srcdoc")
      host.src = "about:blank"
    }
    if (viewerRef.current) viewerRef.current.style.display = "block"
    setMode(null)
    setManifest(null)
    setPageInfo("")
  }, [spineRef, viewerRef])

  const updateSpinePageInfo = useCallback(() => {
    const s = spineRefState.current
    if (!s) return
    const entry = (s.manifest.spine || [])[s.spineIndex] || { href: "" }
    setPageInfo(
      `ch ${s.spineIndex + 1}/${(s.manifest.spine || []).length} · p ${s.page + 1}/${s.pages}` +
        (entry.href ? ` · ${entry.href.split("/").pop()}` : ""),
    )
  }, [])

  const applySpinePage = useCallback(() => {
    const s = spineRefState.current
    const host = spineRef.current
    const doc = host?.contentDocument
    if (!s || !doc?.body || !host) return
    const w = Math.max(1, Math.floor(host.clientWidth))
    doc.body.style.transform = `translateX(${-s.page * w}px)`
    updateSpinePageInfo()
  }, [spineRef, updateSpinePageInfo])

  const layoutSpinePages = useCallback(() => {
    const s = spineRefState.current
    const host = spineRef.current
    const doc = host?.contentDocument
    if (!s || !doc?.body || !host) return
    const w = Math.max(1, Math.floor(host.clientWidth))
    const h = Math.max(1, Math.floor(host.clientHeight))
    doc.documentElement.style.setProperty("--col-w", `${w}px`)
    doc.body.style.columnWidth = `${w}px`
    doc.body.style.columnGap = "0px"
    doc.body.style.columnFill = "auto"
    doc.body.style.height = `${h}px`
    doc.body.style.width = `${w}px`
    const sw = doc.body.scrollWidth
    s.pages = Math.max(1, Math.round(sw / w) || Math.ceil(sw / w))
    s.page = Math.min(s.page, s.pages - 1)
    applySpinePage()
  }, [applySpinePage, spineRef])

  const loadSpineChapter = useCallback(async () => {
    const s = spineRefState.current
    const host = spineRef.current
    if (!s || !host) return
    setCanTurn(false)
    s.ready = false
    const entry = (s.manifest.spine || [])[s.spineIndex]
    if (!entry) {
      setError("Empty spine.")
      return
    }
    setStatus(s.html ? "Laying out draft…" : `Chapter ${entry.href}…`)
    let html: string
    if (s.html) {
      html = s.html
    } else {
      try {
        html = extractBody(await api.chapter(s.path, entry.href))
      } catch (e) {
        setError(e instanceof Error ? e.message : "Chapter fetch failed.")
        return
      }
    }
    const wrapped = wrapSpineChapter(html, fontPct, dark, s.extraCss)
    await new Promise<void>((resolve) => {
      host.onload = () => {
        try {
          layoutSpinePages()
          if (s.jumpLast) {
            s.jumpLast = false
            s.page = Math.max(0, s.pages - 1)
            applySpinePage()
          } else if (s.fragment) {
            const doc = host.contentDocument
            const el =
              doc?.getElementById(s.fragment) ||
              doc?.querySelector(`[id="${CSS.escape(s.fragment)}"]`)
            if (el && "offsetLeft" in el) {
              const colW = host.clientWidth || 500
              s.page = Math.max(
                0,
                Math.floor((el as HTMLElement).offsetLeft / colW),
              )
              applySpinePage()
            }
          }
          s.ready = true
          setCanTurn(true)
          updateSpinePageInfo()
          setStatus(null)
        } catch (err) {
          setError(err instanceof Error ? err.message : "Spine layout failed.")
        }
        resolve()
      }
      host.srcdoc = wrapped
    })
  }, [
    applySpinePage,
    dark,
    fontPct,
    layoutSpinePages,
    spineRef,
    updateSpinePageInfo,
  ])

  const findSpineIndex = useCallback((file: string) => {
    const s = spineRefState.current
    if (!s) return -1
    const spine = s.manifest.spine || []
    let idx = spine.findIndex(
      (x) =>
        x.href === file || x.href.endsWith(`/${file}`) || file.endsWith(x.href),
    )
    if (idx < 0) {
      const base = file.replace(/^EPUB\//, "")
      idx = spine.findIndex((x) => x.href === base || x.href.endsWith(base))
    }
    return idx
  }, [])

  const jumpSpineHref = useCallback(
    async (href: string) => {
      const s = spineRefState.current
      if (!s) return
      const file = spineHrefFile(href)
      const frag = spineHrefFrag(href)
      const idx = findSpineIndex(file)
      if (idx < 0) {
        setError(`Contents link not in spine: ${href}`)
        return
      }
      s.spineIndex = idx
      s.fragment = frag
      await loadSpineChapter()
    },
    [findSpineIndex, loadSpineChapter],
  )

  const openSpineBook = useCallback(
    async (meta: BookMeta) => {
      setMode("spine")
      if (viewerRef.current) viewerRef.current.style.display = "none"
      const host = spineRef.current
      if (host) host.style.display = "block"
      setStatus("Loading spine…")
      try {
        const man = await api.spine(meta.path)
        const state: SpineState = {
          path: meta.path,
          bookKey: man.bookKey || meta.bookKey,
          manifest: man,
          spineIndex: 0,
          page: 0,
          pages: 1,
          ready: false,
          unreadOnly: false,
          fragment: "",
          jumpLast: false,
        }
        spineRefState.current = state
        setManifest(man)
        setUnreadOnly(false)
        const cont = man.read?.continue || null
        if (cont?.href) {
          await jumpSpineHref(cont.href)
        } else {
          const first = (man.spine || []).find(
            (x) =>
              (x.href || "").includes("text/ch") ||
              (x.media || "").includes("html"),
          )
          state.spineIndex = Math.max(0, (man.spine || []).indexOf(first!))
          await loadSpineChapter()
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Spine open failed."
        setError(msg)
        toast.error(msg)
      }
    },
    [jumpSpineHref, loadSpineChapter, spineRef, viewerRef],
  )

  const openDraft = useCallback(
    async (meta: BookMeta) => {
      setMode("draft")
      if (viewerRef.current) viewerRef.current.style.display = "none"
      const host = spineRef.current
      if (host) host.style.display = "block"
      setStatus("Opening draft…")
      try {
        const [data, css] = await Promise.all([
          api.draft(meta.path),
          loadEpubCss(),
        ])
        if (!data.ok || !data.html) {
          throw new Error(data.error || "Draft could not be previewed.")
        }
        const title = data.title || meta.title
        setCurrent({ ...meta, title })
        const state: SpineState = {
          path: meta.path,
          manifest: {
            spine: [{ href: "draft", media: "text/html" }],
            toc: [{ label: title, href: "draft" }],
          },
          spineIndex: 0,
          page: 0,
          pages: 1,
          ready: false,
          unreadOnly: false,
          fragment: "",
          jumpLast: false,
          html: data.html,
          extraCss: css,
        }
        spineRefState.current = state
        setManifest(state.manifest)
        await loadSpineChapter()
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Draft open failed."
        setError(msg)
        toast.error(msg)
      }
    },
    [loadSpineChapter, spineRef, viewerRef],
  )

  const registerZipThemes = useCallback(() => {
    const rendition = renditionRef.current
    if (!rendition) return
    rendition.themes.register("light", ZIP_THEME_LIGHT)
    rendition.themes.register("dark", zipThemeDark())
    rendition.themes.fontSize(`${fontPct}%`)
    rendition.themes.select(dark ? "dark" : "light")
  }, [dark, fontPct])

  const openZipBook = useCallback(
    async (source: string | File, meta?: BookMeta | null) => {
      setMode("zip")
      if (viewerRef.current) viewerRef.current.style.display = "block"
      const host = spineRef.current
      if (host) host.style.display = "none"
      setStatus("Loading book…")
      if (!window.ePub) {
        setError("epub.js failed to load. Check /vendor/epub.min.js.")
        return
      }
      try {
        const url =
          typeof source === "string"
            ? `/api/book?path=${encodeURIComponent(source)}`
            : source
        const book = window.ePub(url)
        bookRef.current = book
        await book.ready
        const el = viewerRef.current
        if (!el) return
        el.innerHTML = ""
        const rendition = book.renderTo(el, {
          width: "100%",
          height: "100%",
          flow: "paginated",
          spread: "none",
          minSpreadWidth: 40000,
        })
        renditionRef.current = rendition
        await rendition.display()
        registerZipThemes()
        setCanTurn(true)
        setStatus(null)
        setCurrent(meta || null)
        rendition.on("relocated", (loc) => {
          setPageInfo(
            `loc ${loc.start.displayed.page}/${loc.start.displayed.total}`,
          )
        })
        try {
          const nav = await book.loaded.navigation
          const toc: TocNode[] = (nav.toc || []).map((ch) => ({
            label: ch.label.trim(),
            href: ch.href,
            children: (ch.subitems || []).map((sub) => ({
              label: sub.label.trim(),
              href: sub.href,
            })),
          }))
          setManifest({ spine: [], toc })
        } catch {
          setManifest({ spine: [] })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Open failed."
        setError(msg)
        toast.error(msg)
      }
    },
    [registerZipThemes, spineRef, viewerRef],
  )

  const openBook = useCallback(
    async (meta: BookMeta) => {
      setError(null)
      setCurrent(meta)
      destroy()
      if (meta.mode === "draft") await openDraft(meta)
      else if (meta.mode === "spine") await openSpineBook(meta)
      else await openZipBook(meta.path, meta)
    },
    [destroy, openDraft, openSpineBook, openZipBook],
  )

  const next = useCallback(async () => {
    if (!canTurn) return
    if (mode === "spine" || mode === "draft") {
      const s = spineRefState.current
      if (!s?.ready) return
      if (s.page < s.pages - 1) {
        s.page += 1
        applySpinePage()
        return
      }
      if (s.spineIndex < (s.manifest.spine || []).length - 1) {
        s.spineIndex += 1
        s.page = 0
        s.fragment = ""
        await loadSpineChapter()
      }
    } else {
      await renditionRef.current?.next()
    }
  }, [applySpinePage, canTurn, loadSpineChapter, mode])

  const prev = useCallback(async () => {
    if (!canTurn) return
    if (mode === "spine" || mode === "draft") {
      const s = spineRefState.current
      if (!s?.ready) return
      if (s.page > 0) {
        s.page -= 1
        applySpinePage()
        return
      }
      if (s.spineIndex > 0) {
        s.spineIndex -= 1
        s.page = 0
        s.fragment = ""
        s.jumpLast = true
        await loadSpineChapter()
      }
    } else {
      await renditionRef.current?.prev()
    }
  }, [applySpinePage, canTurn, loadSpineChapter, mode])

  const jumpTo = useCallback(
    async (href: string) => {
      if (mode === "spine") await jumpSpineHref(href)
      else if (mode === "zip") await renditionRef.current?.display(href)
    },
    [jumpSpineHref, mode],
  )

  const toggleUnreadOnly = useCallback(() => {
    const s = spineRefState.current
    if (!s) return
    s.unreadOnly = !s.unreadOnly
    setUnreadOnly(s.unreadOnly)
  }, [])

  const continueReading = useCallback(async () => {
    const href = manifest?.read?.continue?.href
    if (href) await jumpSpineHref(href)
  }, [jumpSpineHref, manifest])

  const toggleRead = useCallback(
    async (articleId: string, read: boolean, href: string) => {
      const s = spineRefState.current
      if (!s || !articleId) return
      try {
        const data = await api.readStatePost({
          bookKey: s.bookKey,
          articleId,
          read,
          continue: true,
          href: href || "",
        })
        s.manifest.read = {
          ...(s.manifest.read || {}),
          ...(data.book || {}),
        }
        const articles = s.manifest.read.articles || {}
        const reads = new Set(
          Object.entries(articles)
            .filter(([, v]) => v?.read)
            .map(([id]) => id),
        )
        const parts = []
        for (const n of s.manifest.toc || []) {
          const arts = (n.children || []).filter(
            (c) =>
              c.kind === "article" ||
              (c.articleId || "").startsWith("chap-") ||
              (c.articleId || "").startsWith("bits-bytes"),
          )
          if (!arts.length) continue
          parts.push({
            label: n.label,
            read: arts.filter((a) => reads.has(a.articleId || "")).length,
            total: arts.length,
          })
        }
        s.manifest.progress = parts
        setManifest({ ...s.manifest })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save read state.")
      }
    },
    [],
  )

  const rememberContinue = useCallback(
    async (articleId: string, href: string) => {
      const s = spineRefState.current
      if (!s || !articleId) return
      const articles = s.manifest.read?.articles || {}
      try {
        await api.readStatePost({
          bookKey: s.bookKey,
          articleId,
          read: !!articles[articleId]?.read,
          continue: true,
          href,
        })
      } catch {
        /* ignore */
      }
    },
    [],
  )

  const reloadCss = useCallback(async () => {
    const css = await loadEpubCss(true)
    const s = spineRefState.current
    if (!s?.html) return
    s.extraCss = css
    await loadSpineChapter()
  }, [loadSpineChapter])

  // Re-apply themes when font/dark change
  useEffect(() => {
    if (mode === "zip") registerZipThemes()
    if (
      (mode === "spine" || mode === "draft") &&
      spineRefState.current?.ready
    ) {
      void loadSpineChapter()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only theme knobs
  }, [fontPct, dark])

  return {
    mode,
    pageInfo,
    canTurn,
    manifest,
    unreadOnly,
    current,
    status,
    error,
    setError,
    openBook,
    openZipFile: (f: File) => openZipBook(f, null),
    next,
    prev,
    jumpTo,
    toggleUnreadOnly,
    continueReading,
    toggleRead,
    rememberContinue,
    destroy,
    relayout: layoutSpinePages,
    reloadCss,
  }
}
