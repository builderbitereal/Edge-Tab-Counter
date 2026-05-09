# Edge Tab Counter

Edge Tab Counter is a lightweight Microsoft Edge extension that instantly numbers tabs in the browser title and extension icon. It is built by [BuilderBite](https://builderbite.com/) for people who keep many tabs open and want a fast visual tab order.

## Features

- Real-time tab count detection when tabs open, close, move, reload, or switch windows.
- Shows tab order as plain numbers: first tab is `1`, second tab is `2`, and so on.
- Prefixes supported tab titles with the tab number, for example `5 | Page Title`.
- Shows a large readable number on the extension icon for the current tab.
- Does not edit favicons.
- Uses a generated numbered extension icon and always-on toolbar badge.
- Includes a popup with a numbered current-window tab list.
- Privacy-friendly: no analytics, no remote tracking, no data upload.

## Microsoft Edge Extension Keywords

Microsoft Edge tab counter, tab number extension, Edge tabs manager, browser tab counter, tab numbering, productivity extension, BuilderBite extension, count open tabs in Edge, tab order counter.

## Install Locally

1. Download or clone this repository.
2. Open Microsoft Edge and go to `edge://extensions/`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select this project folder.

## Package for Release

Run the release package script from PowerShell:

```powershell
.\scripts\package-extension.ps1
```

The zip file will be created in `dist/` and can be uploaded to a GitHub Release or prepared for extension-store submission.

## Browser Limitations

Microsoft Edge does not allow extensions to draw custom labels directly inside every native browser tab without using either the page title or favicon. Edge Tab Counter puts the number at the start of supported page titles so it appears immediately after the favicon in the tab strip. Browser-protected pages such as `edge://settings` cannot receive title edits, so the numbered extension icon and badge remain the fallback there.

## Privacy

Edge Tab Counter runs locally in your browser. The extension reads tab order, URL, and title only to number the current window and render the popup list. It does not collect, sell, transmit, or store browsing data on BuilderBite servers.

See [Privacy Policy](docs/privacy.md) for details.

## GitHub Topics

Recommended repository topics:

`edge-extension`, `microsoft-edge`, `tab-counter`, `tab-manager`, `browser-extension`, `productivity`, `manifest-v3`, `builderbite`

## Company

Created by BuilderBite.

- Website: <https://builderbite.com/>
- Extension name: Edge Tab Counter

## License

MIT License. See [LICENSE](LICENSE).
