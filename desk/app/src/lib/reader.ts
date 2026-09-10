import { DEVICES, type DeviceId } from "@/lib/devices"
import { bodySideMarginPct } from "@/lib/epub-style"

export { DEVICES, type DeviceId }

export function extractBody(xhtml: string): string {
  const m = xhtml.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  return m ? m[1] : xhtml
}

export function spineHrefFile(href: string): string {
  return (href || "").split("#")[0]
}

export function spineHrefFrag(href: string): string {
  const i = (href || "").indexOf("#")
  return i >= 0 ? href.slice(i + 1) : ""
}

export function wrapSpineChapter(
  bodyHtml: string,
  fontPct: string,
  dark: boolean,
  extraCss = "",
): string {
  const theme = dark
    ? "html,body{background:#151515!important;color:#cfcfcf!important;}" +
      "p,h1,h2,h3,li,figcaption,blockquote{color:#cfcfcf!important;}"
    : ""
  const extra = extraCss
    ? `<style>${extraCss.replace(/<\/style/gi, "<\\/style")}</style>`
    : ""
  const side = extraCss ? bodySideMarginPct(extraCss) : null
  const flowPad =
    side != null ? `padding:18px ${side}%;` : "padding:18px 20px;"
  return (
    "<!DOCTYPE html><html><head><meta charset=\"utf-8\">" +
    "<style>" +
    `html{margin:0!important;padding:0!important;height:100%;width:100%;overflow:hidden;font-size:${fontPct}%;}` +
    "body{margin:0!important;padding:0!important;height:100%;width:100%;overflow:visible;" +
    "box-sizing:border-box;column-fill:auto;column-gap:0;column-width:var(--col-w, 100%);" +
    "line-height:1.6;height:100%;width:var(--col-w, 100%);}" +
    `.t2e-flow{${flowPad}-webkit-box-decoration-break:clone;box-decoration-break:clone;}` +
    "img,svg{max-width:100%!important;height:auto!important;}" +
    theme +
    "</style>" +
    extra +
    "</head><body><div class=\"t2e-flow\">" +
    bodyHtml +
    "</div></body></html>"
  )
}

export const ZIP_THEME_LIGHT = {
  body: { "line-height": "1.6 !important", "text-align": "left" },
  p: { "line-height": "1.6 !important" },
  "img, svg": { "max-width": "100% !important", "height": "auto !important" },
  figure: { "break-inside": "avoid", "page-break-inside": "avoid" },
  a: { color: "inherit", "text-decoration": "none" },
}

export function zipThemeDark() {
  const dark = JSON.parse(JSON.stringify(ZIP_THEME_LIGHT)) as Record<
    string,
    Record<string, string>
  >
  dark.body.color = "#cfcfcf !important"
  dark.body.background = "#151515 !important"
  for (const t of ["p", "h1", "h2", "h3", "li", "figcaption", "blockquote"]) {
    dark[t] = { ...(dark[t] || {}), color: "#cfcfcf !important" }
  }
  return dark
}
