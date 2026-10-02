"use client"

import { useSyncExternalStore } from "react"

// Hydration-safe "am I in the browser?" check.
//
// The React Compiler rejects `useState(false)` + `useEffect(() => setState(true))`
// because it cascades a render after mount. `useSyncExternalStore` reports
// `false` on the server and during the hydration pass, then `true` on the client,
// without a state update inside an effect.
//
// The subscribe callback is a no-op: the value never changes within a session,
// it only differs between the server and the browser.
const subscribe = () => () => {}
const getSnapshot = () => true
const getServerSnapshot = () => false

export function useIsClient(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}