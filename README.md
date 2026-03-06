# GitHub Dock

GitHub Dock is a small desktop GitHub companion app built with Electron, React, and TypeScript. It is designed as a tray-first utility for checking repository state quickly without keeping multiple GitHub tabs open.

## Current MVP

- Repository browser with search and selection
- Repository overview with health-style stats
- Open pull requests per selected repository
- Open issues per selected repository
- Branch list per selected repository
- Default-branch status checks and check-run summary
- Branch protection and required-check indicators
- GitHub notifications feed when the token has notification access
- Tray icon that toggles the app window

## Stack

- Electron
- React
- TypeScript
- Vite

## Running Locally

```bash
npm install
npm run dev
```

The app expects a GitHub personal access token entered in the UI. For the notifications view, use a token with notification access in addition to repository access.

## Build

```bash
npm run build
```

## Notes

- The current version focuses on repository state, branches, pull requests, issues, notifications, and branch health indicators
- Authentication is currently handled through a token entered in the UI and stored in local browser storage inside the app session
- Packaging and auto-update workflows are not implemented yet