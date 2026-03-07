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
      getBrowserAuthStatus: () => Promise<{
        configured: boolean
        message: string
      }>
      startGitHubDeviceFlow: () => Promise<{
        deviceCode: string
        userCode: string
        verificationUri: string
        verificationUriComplete: string | null
        expiresIn: number
        interval: number
      }>
      pollGitHubDeviceFlow: (deviceCode: string) => Promise<
        | { status: 'pending' | 'slow_down' }
        | { status: 'expired' | 'denied' | 'error'; message: string }
        | { status: 'approved'; accessToken: string; scope: string; tokenType: string }
      >
      minimizeWindow: () => Promise<void>
      hideWindow: () => Promise<void>
      openExternal: (url: string) => Promise<void>
    }
  }
}