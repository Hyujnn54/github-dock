export {}

declare global {
  interface Window {
    githubDock?: {
      getAppVersion: () => Promise<string>
    }
  }
}