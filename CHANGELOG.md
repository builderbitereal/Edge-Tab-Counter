# Changelog

## 1.0.4 - 2026-05-09

- Added tab title numbering so supported tabs show the count immediately after the favicon area, like `5 | Page Title`.
- Kept the independent numbered extension icon and always-on badge as the fallback for browser-protected pages.
- Continued avoiding favicon edits completely.

## 1.0.3 - 2026-05-09

- Removed all favicon injection and page content-script behavior.
- Removed `<all_urls>` host permission and the `scripting` permission.
- Made tab numbering independent of page URLs by using only the browser extension icon and always-on badge.

## 1.0.2 - 2026-05-09

- Added a generated per-tab extension action icon so every tab has a visible tab-order number even when Edge blocks page favicon injection.
- Increased the favicon tab number size substantially so the number is much easier to read.
- Kept existing tab-order math unchanged: the first tab is `1`, the fifth tab is `5`, and all intermediate tabs are still counted.

## 1.0.1 - 2026-05-09

- Preserved original site favicons by generating a small tab-number badge over the favicon.
- Added active script injection for already-open tabs so numbers appear without manual reload on supported pages.
- Reduced page overhead by observing favicon/head changes instead of the full page DOM.

## 1.0.0 - 2026-05-09

- Initial release of Edge Tab Counter.
- Added instant tab numbering through favicon numbers and toolbar badge.
- Added popup tab list, options page, privacy documentation, and release packaging script.
