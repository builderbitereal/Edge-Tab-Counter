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
|   |   `-- tab-number-title.js
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
4. Supported pages receive a content-script message that prefixes the document title with the tab number.
5. The service worker generates a numbered extension action icon for each tab.
6. The extension action badge is updated per tab as an always-on active-tab cue.

## Title Safety

The extension prefixes `document.title` with the tab number on supported pages. It never edits the page favicon.

## Independence

The extension does not use favicon injection. Title numbering uses a content script on pages where Edge allows document-title edits. Protected browser pages still show the number through the extension icon and always-on badge.
