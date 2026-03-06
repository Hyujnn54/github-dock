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
- GitHub CLI authentication path for desktop-friendly sign-in

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

If GitHub CLI is installed and logged in on the machine, the app can also connect through `gh auth token` without requiring a manually pasted token.

## Build

```bash
npm run build
```

## Package for Windows

```bash
npm run package:win
```

The packaged portable executable is written to `release/`.

## Notes

- The current version focuses on repository state, branches, pull requests, issues, notifications, and branch health indicators
- Authentication supports manual token entry and GitHub CLI-based login
- Auto-update workflows are not implemented yet