class Noop {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
for (const name of ["ResizeObserver", "IntersectionObserver"] as const) {
  if (!(name in globalThis)) (globalThis as Record<string, unknown>)[name] = Noop;
}
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
}
Element.prototype.scrollTo ??= () => {};
Element.prototype.scrollIntoView ??= () => {};
