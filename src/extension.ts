type Disposable = { dispose(): void }

type Memento = {
  get<T>(key: string, defaultValue?: T): T | undefined
  update(key: string, value: unknown): void
  keys(): readonly string[]
}

type FetchOptions = {
  method?: string
  url: string
  headers?: Record<string, string>
  body?: string
}

type FetchResult = {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  size: number
}

type AgentGridApi = {
  commands: {
    registerCommand(id: string, handler: (...args: unknown[]) => unknown): Disposable
  }
  net: {
    fetch(options: FetchOptions): Promise<FetchResult>
  }
  settings: {
    get(key: string): unknown
    update(key: string, value: unknown): void
  }
}

type ExtensionContext = {
  subscriptions: Disposable[]
  extensionPath: string
  extensionId: string
  globalState: Memento
  workspaceState: Memento
  storagePath: string
  agentgrid: AgentGridApi
}

export function activate(context: ExtensionContext): void {
  const api = context.agentgrid

  const httpRequestCmd = api.commands.registerCommand(
    'api-playground.httpRequest',
    async (...args: unknown[]) => {
      const opts = args[0] as FetchOptions | undefined

      if (!opts?.url) {
        return { error: 'Missing URL' }
      }

      try {
        const result = await api.net.fetch({
          method: opts.method ?? 'GET',
          url: opts.url,
          headers: opts.headers,
          body: opts.body,
        })

        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)

        return { error: msg }
      }
    },
  )

  context.subscriptions.push(httpRequestCmd)

  console.log('[api-playground] extension activated')
}

export function deactivate(): void {
  console.log('[api-playground] extension deactivated')
}
