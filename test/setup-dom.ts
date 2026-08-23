import { GlobalRegistrator } from "@happy-dom/global-registrator"

GlobalRegistrator.register()

// base-ui and other UI libs occasionally touch these during render; happy-dom
// does not implement them, so provide minimal stubs.
type Mutable = Record<string, unknown>

if (!("ResizeObserver" in globalThis)) {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as Mutable).ResizeObserver = ResizeObserver
}

if (typeof (globalThis as Mutable).matchMedia !== "function") {
  ;(globalThis as Mutable).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false
    },
  })
}
