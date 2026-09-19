// src/extension.ts
var COLLECTIONS_KEY = "api-playground:collections";
var HISTORY_KEY = "api-playground:history";
var MAX_HISTORY = 100;
function activate(context) {
  const api = context.agentgrid;
  const state = context.workspaceState;
  const httpRequestCmd = api.commands.registerCommand(
    "api-playground.httpRequest",
    async (...args) => {
      const opts = args[0];
      if (!opts?.url) {
        return { error: "Missing URL" };
      }
      const method = opts.method ?? "GET";
      api.activity.push({
        type: "request-sent",
        summary: `${method} ${opts.url}`,
        detail: { method, url: opts.url, headers: opts.headers }
      });
      try {
        const result = await api.net.fetch({
          method,
          url: opts.url,
          headers: opts.headers,
          body: opts.body
        });
        api.activity.push({
          type: "response-received",
          summary: `${result.status} ${result.statusText} from ${opts.url}`,
          detail: { status: result.status, statusText: result.statusText, size: result.size }
        });
        api.panes.broadcast("ext-api-playground", {
          type: "response",
          method,
          url: opts.url,
          status: result.status,
          statusText: result.statusText,
          headers: result.headers,
          body: result.body,
          size: result.size
        });
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        api.activity.push({
          type: "request-error",
          summary: `Error: ${method} ${opts.url} \u2014 ${msg}`
        });
        return { error: msg };
      }
    }
  );
  const getCollectionsCmd = api.commands.registerCommand(
    "api-playground.getCollections",
    () => {
      return state.get(COLLECTIONS_KEY, []) ?? [];
    }
  );
  const saveCollectionCmd = api.commands.registerCommand(
    "api-playground.saveCollection",
    (...args) => {
      const entry = args[0];
      if (!entry?.name || !entry?.url) {
        return { error: "Missing name or url" };
      }
      const collections = state.get(COLLECTIONS_KEY, []) ?? [];
      const existingIndex = collections.findIndex((c) => c.id === entry.id);
      if (existingIndex >= 0) {
        collections[existingIndex] = entry;
      } else {
        entry.id = entry.id || `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        entry.createdAt = entry.createdAt || Date.now();
        collections.unshift(entry);
      }
      state.update(COLLECTIONS_KEY, collections);
      return { ok: true, collections };
    }
  );
  const deleteCollectionCmd = api.commands.registerCommand(
    "api-playground.deleteCollection",
    (...args) => {
      const id = args[0];
      if (!id) {
        return { error: "Missing id" };
      }
      const collections = (state.get(COLLECTIONS_KEY, []) ?? []).filter((c) => c.id !== id);
      state.update(COLLECTIONS_KEY, collections);
      return { ok: true, collections };
    }
  );
  const getHistoryCmd = api.commands.registerCommand(
    "api-playground.getHistory",
    () => {
      return state.get(HISTORY_KEY, []) ?? [];
    }
  );
  const pushHistoryCmd = api.commands.registerCommand(
    "api-playground.pushHistory",
    (...args) => {
      const entry = args[0];
      if (!entry) {
        return { error: "Missing entry" };
      }
      const history = state.get(HISTORY_KEY, []) ?? [];
      entry.ts = Date.now();
      history.unshift(entry);
      if (history.length > MAX_HISTORY) {
        history.length = MAX_HISTORY;
      }
      state.update(HISTORY_KEY, history);
      return { ok: true };
    }
  );
  const executeHttpRequest = async (input) => {
    const opts = {
      method: input.method ?? "GET",
      url: input.url,
      headers: input.headers,
      body: input.body
    };
    if (!opts.url) {
      return { error: "Missing URL" };
    }
    api.activity.push({
      type: "request-sent",
      summary: `[agent] ${opts.method} ${opts.url}`,
      detail: { method: opts.method, url: opts.url, headers: opts.headers }
    });
    try {
      const result = await api.net.fetch(opts);
      api.activity.push({
        type: "response-received",
        summary: `[agent] ${result.status} ${result.statusText} from ${opts.url}`,
        detail: { status: result.status, statusText: result.statusText, size: result.size }
      });
      api.panes.broadcast("ext-api-playground", {
        type: "response",
        method: opts.method,
        url: opts.url,
        status: result.status,
        statusText: result.statusText,
        headers: result.headers,
        body: result.body,
        size: result.size,
        source: "agent"
      });
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      api.activity.push({
        type: "request-error",
        summary: `[agent] Error: ${opts.method} ${opts.url} \u2014 ${msg}`
      });
      return { error: msg };
    }
  };
  const httpRequestTool = api.toolHandlers.registerToolHandler(
    {
      name: "httpRequest",
      description: "Send an HTTP request via the API Playground extension. Returns the response status, headers, and body.",
      inputSchema: {
        type: "object",
        properties: {
          method: { type: "string", description: "HTTP method (GET, POST, PUT, DELETE, PATCH, etc.)", default: "GET" },
          url: { type: "string", description: "The request URL" },
          headers: { type: "object", description: "Request headers as key-value pairs", additionalProperties: { type: "string" } },
          body: { type: "string", description: "Request body (for POST/PUT/PATCH)" }
        },
        required: ["url"]
      }
    },
    executeHttpRequest
  );
  const activityTool = api.toolHandlers.registerToolHandler(
    {
      name: "getActivity",
      description: "Retrieve the recent API Playground activity log \u2014 shows requests sent and responses received by the user or agents.",
      inputSchema: {
        type: "object",
        properties: {
          since: { type: "number", description: "Unix timestamp (ms) \u2014 only return entries after this time. Omit for all." }
        }
      }
    },
    (input) => {
      const since = typeof input.since === "number" ? input.since : 0;
      return api.activity.list(since);
    }
  );
  context.subscriptions.push(
    httpRequestCmd,
    getCollectionsCmd,
    saveCollectionCmd,
    deleteCollectionCmd,
    getHistoryCmd,
    pushHistoryCmd,
    httpRequestTool,
    activityTool
  );
  console.log("[api-playground] extension activated");
}
function deactivate() {
  console.log("[api-playground] extension deactivated");
}
export {
  activate,
  deactivate
};
