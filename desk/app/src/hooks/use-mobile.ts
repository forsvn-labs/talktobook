import * as React from "react"

const MOBILE_BREAKPOINT = 768
/** Side-by-side shelf + device. Below this, the shelf is a drawer. */
const DESK_SPLIT_BREAKPOINT = 1024

function useMatchMinWidth(px: number) {
  const [matches, setMatches] = React.useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= px : true,
  )

  React.useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${px}px)`)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [px])

  return matches
}

export function useIsMobile() {
  return !useMatchMinWidth(MOBILE_BREAKPOINT)
}

export function useDeskSplit() {
  return useMatchMinWidth(DESK_SPLIT_BREAKPOINT)
}
