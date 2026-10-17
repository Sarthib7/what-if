/**
 * Runs first on every page: applies the visitor's language (German by default,
 * ?lang=… or the remembered choice otherwise), builds the DE · EN · ES · PL
 * switcher, shows the "Request an invite" links when a contact was templated in,
 * and answers language requests from the page bundles.
 */
import { applyLang, listenForRequests, onReady, preferredLang, renderSwitchers } from "./lib/page.ts";

onReady(() => {
  listenForRequests();
  renderSwitchers((lang) => applyLang(lang, { persist: true }));
  applyLang(preferredLang(), { persist: false });
});
