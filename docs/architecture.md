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
4. Supported pages receive a content-script message that updates only the favicon.
5. The extension action badge is updated per tab as a fallback and active-tab cue.

## Title Safety

The extension never writes to `document.title` and never prefixes the page title. This preserves tab titles for users, search pages, pinned tabs, and web apps.
