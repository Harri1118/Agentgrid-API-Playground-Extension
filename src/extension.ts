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

type ToolDescriptor = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

type AgentGridApi = {
  commands: {
    registerCommand(id: string, handler: (...args: unknown[]) => unknown): Disposable
  }
  net?: {
    fetch(options: FetchOptions): Promise<FetchResult>
  }
  settings: {
    get(key: string): unknown
    update(key: string, value: unknown): void
  }
  toolHandlers?: {
    registerToolHandler(
      tool: ToolDescriptor,
      handler: (input: Record<string, unknown>) => unknown,
    ): Disposable
  }
  panes?: {
    broadcast(paneType: string, event: unknown): void
  }
  activity?: {
    push(entry: { type: string; summary: string; detail?: unknown }): void
    list(since?: number): unknown[]
  }
}

type ExtensionContext = {
  subscriptions: Disposable[]
  extensionId: string
  globalState: Memento
  workspaceState: Memento
  agentgrid: AgentGridApi
}

type SavedRequest = {
  id: string
  name: string
  method: string
  url: string
  headers: Array<{ key: string; value: string }>
  bodyType: string
  body: string
  createdAt: number
}

type HistoryEntry = {
  method: string
  url: string
  status: number | string
  time: number
  ts: number
}

const COLLECTIONS_KEY = 'api-playground:collections'
const HISTORY_KEY = 'api-playground:history'
const MAX_HISTORY = 100

export function activate(context: ExtensionContext): void {
  const api = context.agentgrid
  const state = context.workspaceState

  const httpRequestCmd = api.commands.registerCommand(
    'api-playground.httpRequest',
    async (...args: unknown[]) => {
      const opts = args[0] as FetchOptions | undefined

      if (!opts?.url) {
        return { error: 'Missing URL' }
      }

      if (!api.net) {
        return { error: 'Network access not available' }
      }

      const method = opts.method ?? 'GET'

      api.activity?.push({
        type: 'request-sent',
        summary: `${method} ${opts.url}`,
        detail: { method, url: opts.url, headers: opts.headers },
      })

      try {
        const result = await api.net.fetch({
          method,
          url: opts.url,
          headers: opts.headers,
          body: opts.body,
        })

        api.activity?.push({
          type: 'response-received',
          summary: `${result.status} ${result.statusText} from ${opts.url}`,
          detail: { status: result.status, statusText: result.statusText, size: result.size },
        })

        api.panes?.broadcast('ext-api-playground', {
          type: 'response',
          method,
          url: opts.url,
          status: result.status,
          statusText: result.statusText,
          headers: result.headers,
          body: result.body,
          size: result.size,
        })

        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)

        api.activity?.push({
          type: 'request-error',
          summary: `Error: ${method} ${opts.url} — ${msg}`,
        })

        return { error: msg }
      }
    },
  )

  const getCollectionsCmd = api.commands.registerCommand(
    'api-playground.getCollections',
    () => {
      return state.get<SavedRequest[]>(COLLECTIONS_KEY, []) ?? []
    },
  )

  const saveCollectionCmd = api.commands.registerCommand(
    'api-playground.saveCollection',
    (...args: unknown[]) => {
      const entry = args[0] as SavedRequest | undefined

      if (!entry?.name || !entry?.url) {
        return { error: 'Missing name or url' }
      }

      const collections = state.get<SavedRequest[]>(COLLECTIONS_KEY, []) ?? []
      const existingIndex = collections.findIndex((c) => c.id === entry.id)

      if (existingIndex >= 0) {
        collections[existingIndex] = entry
      } else {
        entry.id = entry.id || `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        entry.createdAt = entry.createdAt || Date.now()
        collections.unshift(entry)
      }

      state.update(COLLECTIONS_KEY, collections)

      return { ok: true, collections }
    },
  )

  const deleteCollectionCmd = api.commands.registerCommand(
    'api-playground.deleteCollection',
    (...args: unknown[]) => {
      const id = args[0] as string | undefined

      if (!id) { return { error: 'Missing id' } }

      const collections = (state.get<SavedRequest[]>(COLLECTIONS_KEY, []) ?? []).filter((c) => c.id !== id)

      state.update(COLLECTIONS_KEY, collections)

      return { ok: true, collections }
    },
  )

  const getHistoryCmd = api.commands.registerCommand(
    'api-playground.getHistory',
    () => {
      return state.get<HistoryEntry[]>(HISTORY_KEY, []) ?? []
    },
  )

  const pushHistoryCmd = api.commands.registerCommand(
    'api-playground.pushHistory',
    (...args: unknown[]) => {
      const entry = args[0] as HistoryEntry | undefined

      if (!entry) { return { error: 'Missing entry' } }

      const history = state.get<HistoryEntry[]>(HISTORY_KEY, []) ?? []

      entry.ts = Date.now()
      history.unshift(entry)

      if (history.length > MAX_HISTORY) { history.length = MAX_HISTORY }

      state.update(HISTORY_KEY, history)

      return { ok: true }
    },
  )

  context.subscriptions.push(
    httpRequestCmd, getCollectionsCmd, saveCollectionCmd,
    deleteCollectionCmd, getHistoryCmd, pushHistoryCmd,
  )

  if (api.toolHandlers) {
    const executeHttpRequest = async (input: Record<string, unknown>) => {
      const opts: FetchOptions = {
        method: (input.method as string) ?? 'GET',
        url: input.url as string,
        headers: input.headers as Record<string, string> | undefined,
        body: input.body as string | undefined,
      }

      if (!opts.url) {
        return { error: 'Missing URL' }
      }

      if (!api.net) {
        return { error: 'Network access not available' }
      }

      api.activity?.push({
        type: 'request-sent',
        summary: `[agent] ${opts.method} ${opts.url}`,
        detail: { method: opts.method, url: opts.url, headers: opts.headers },
      })

      try {
        const result = await api.net.fetch(opts)

        api.activity?.push({
          type: 'response-received',
          summary: `[agent] ${result.status} ${result.statusText} from ${opts.url}`,
          detail: { status: result.status, statusText: result.statusText, size: result.size },
        })

        api.panes?.broadcast('ext-api-playground', {
          type: 'response',
          method: opts.method,
          url: opts.url,
          status: result.status,
          statusText: result.statusText,
          headers: result.headers,
          body: result.body,
          size: result.size,
          source: 'agent',
        })

        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)

        api.activity?.push({
          type: 'request-error',
          summary: `[agent] Error: ${opts.method} ${opts.url} — ${msg}`,
        })

        return { error: msg }
      }
    }

    const httpRequestTool = api.toolHandlers.registerToolHandler(
      {
        name: 'httpRequest',
        description: 'Send an HTTP request via the API Playground extension. Returns the response status, headers, and body.',
        inputSchema: {
          type: 'object',
          properties: {
            method: { type: 'string', description: 'HTTP method (GET, POST, PUT, DELETE, PATCH, etc.)', default: 'GET' },
            url: { type: 'string', description: 'The request URL' },
            headers: { type: 'object', description: 'Request headers as key-value pairs', additionalProperties: { type: 'string' } },
            body: { type: 'string', description: 'Request body (for POST/PUT/PATCH)' },
          },
          required: ['url'],
        },
      },
      executeHttpRequest as (input: Record<string, unknown>) => unknown,
    )

    const activityTool = api.toolHandlers.registerToolHandler(
      {
        name: 'getActivity',
        description: 'Retrieve the recent API Playground activity log — shows requests sent and responses received by the user or agents.',
        inputSchema: {
          type: 'object',
          properties: {
            since: { type: 'number', description: 'Unix timestamp (ms) — only return entries after this time. Omit for all.' },
          },
        },
      },
      (input: Record<string, unknown>) => {
        const since = typeof input.since === 'number' ? input.since : 0

        return api.activity?.list(since) ?? []
      },
    )

    context.subscriptions.push(httpRequestTool, activityTool)
  }

  console.log('[api-playground] extension activated')
}

export function deactivate(): void {
  console.log('[api-playground] extension deactivated')
}
