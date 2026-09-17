var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
function activate(context) {
  const api = context.agentgrid;
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
  context.subscriptions.push(httpRequestCmd, httpRequestTool, activityTool);
  console.log("[api-playground] extension activated");
}
function deactivate() {
  console.log("[api-playground] extension deactivated");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
