import "@testing-library/jest-dom/vitest";

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// A navegação interna guarda abas e seções no endereço (src/lib/navigation/url-state.ts).
// Cada teste começa sem parâmetros herdados do anterior.
import {afterEach as resetUrlAfterEach} from "vitest";
resetUrlAfterEach(() => {
  if (window.location.search) window.history.replaceState(window.history.state, "", window.location.pathname);
});
