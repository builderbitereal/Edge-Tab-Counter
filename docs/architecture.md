# Extension Architecture

Edge Tab Counter is a Manifest V3 Microsoft Edge extension.

## Project Structure

```text
.
|-- manifest.json
|-- assets/
|   `-- icons/
|-- src/
|   |-- background/
|   |   `-- service-worker.js
|   |-- content/
|   |   `-- tab-number-favicon.js
|   |-- options/
|   `-- popup/
|-- docs/
|-- scripts/
`-- .github/
```

## Runtime Flow

1. The background service worker listens for tab lifecycle events.
2. When a window changes, the service worker sorts its tabs by `index`.
3. Each tab receives its one-based number.
4. The service worker generates a numbered extension action icon for each tab, including protected pages where content scripts cannot run.
5. Supported pages receive a content-script message that updates only the favicon.
6. The content script keeps the original site favicon links and asks the background worker for a merged icon with a large number badge.
7. The extension action badge is updated per tab as an additional active-tab cue.

## Title Safety

The extension never writes to `document.title` and never prefixes the page title. This preserves tab titles for users, search pages, pinned tabs, and web apps.

## Existing Tabs

The background worker uses the `scripting` permission to inject the content script into already-open supported tabs after install or reload. This lets the tab number appear without manually reloading each page.
