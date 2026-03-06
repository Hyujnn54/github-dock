export {}

declare global {
  interface Window {
    githubDock?: {
      getAppVersion: () => Promise<string>
      getGhCliStatus: () => Promise<{
        available: boolean
        authenticated: boolean
        login: string | null
        message: string
      }>
      getGhCliToken: () => Promise<string>
      openExternal: (url: string) => Promise<void>
    }
  }
}