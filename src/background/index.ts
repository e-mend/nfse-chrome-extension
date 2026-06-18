/**
 * MV3 service worker stub.
 *
 * The only behavior here today is: opening the extension's action icon opens
 * `src/certificado/index.html` in a regular tab. The original extension uses
 * `chrome.sidePanel.open(...)` to surface popup.html in the side panel, but
 * the certificado flow has always lived in a dedicated tab (see how
 * `popup.js:284-290` calls `chrome.tabs.create({ url: 'certificado.html' })`).
 *
 * Logic that needs to run in the background (keep-alive, session ping, NSU
 * sync resume, etc.) will be ported into this file later by the rewrite.
 */

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.tabs.create({
    url: chrome.runtime.getURL('src/certificado/index.html'),
    windowId: tab?.windowId,
  });
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Baixar NFSe] background service worker installed');
});
