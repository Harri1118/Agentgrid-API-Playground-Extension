(function () {
  var METHOD_COLORS = {
    GET: '#22c55e', POST: '#3b82f6', PUT: '#f59e0b',
    PATCH: '#f59e0b', DELETE: '#ef4444', HEAD: '#8b5cf6', OPTIONS: '#8b5cf6'
  }

  var methodEl = document.getElementById('method')
  var urlEl = document.getElementById('url')
  var sendBtn = document.getElementById('send')
  var bodyContent = document.getElementById('body-content')
  var resEmpty = document.getElementById('response-empty')
  var resContent = document.getElementById('response-content')
  var resStatus = document.getElementById('res-status')
  var resMeta = document.getElementById('res-meta')
  var resBodyPre = document.getElementById('res-body-pre')
  var resHeadersPre = document.getElementById('res-headers-pre')
  var collectionsListEl = document.getElementById('collections-list')
  var historyListEl = document.getElementById('history-list')
  var modalContainer = document.getElementById('modal-container')

  var params = [{ key: '', value: '' }]
  var headers = [{ key: 'Content-Type', value: 'application/json' }]
  var history = []
  var collections = []
  var bodyType = 'none'

  /* ── Sidebar tabs ── */

  var sidebarTabs = document.querySelectorAll('.sidebar-tab')
  var sidebarPanels = document.querySelectorAll('.sidebar-panel')

  sidebarTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var panelName = tab.dataset.panel

      sidebarTabs.forEach(function (t) { t.classList.toggle('active', t === tab) })
      sidebarPanels.forEach(function (p) { p.classList.toggle('active', p.dataset.panel === panelName) })
    })
  })

  /* ── Tabs ── */

  function setupTabs(container) {
    var tabs = container.querySelectorAll('.tab')

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var panelName = tab.dataset.panel
        var panelsContainer = container.nextElementSibling

        container.querySelectorAll('.tab').forEach(function (t) {
          t.classList.toggle('active', t === tab)
        })

        if (panelsContainer) {
          panelsContainer.querySelectorAll('.tab-panel').forEach(function (p) {
            p.classList.toggle('active', p.dataset.panel === panelName)
          })
        }
      })
    })
  }

  setupTabs(document.getElementById('request-tabs'))
  setupTabs(document.getElementById('response-tabs'))

  /* ── Bridge ── */

  var pending = {}
  var callId = 0

  function bridge(method, args) {
    var id = 'c' + (++callId)

    window.parent.postMessage({
      type: 'agentgrid-extension-call',
      id: id,
      method: method,
      args: args || []
    }, '*')

    return new Promise(function (resolve) { pending[id] = resolve })
  }

  window.addEventListener('message', function (e) {
    var d = e.data

    if (d && d.type === 'agentgrid-extension-response' && d.id && pending[d.id]) {
      pending[d.id](d.result)
      delete pending[d.id]
    }

    if (d && d.type === 'ext-pane:broadcast' && d.event && d.event.type === 'response') {
      showResponse(d.event)
      persistHistory(d.event.method || '?', d.event.url || '?', d.event.status)
    }
  })

  /* ── KV Editor ── */

  function clearChildren(el) {
    while (el.firstChild) { el.removeChild(el.firstChild) }
  }

  function renderKvEditor(containerId, items) {
    var container = document.getElementById(containerId)

    clearChildren(container)

    items.forEach(function (item, i) {
      var row = document.createElement('div')

      row.className = 'kv-row'

      var keyInput = document.createElement('input')

      keyInput.type = 'text'
      keyInput.placeholder = 'Key'
      keyInput.value = item.key
      keyInput.addEventListener('input', function () { items[i].key = this.value })

      var valInput = document.createElement('input')

      valInput.type = 'text'
      valInput.placeholder = 'Value'
      valInput.value = item.value
      valInput.addEventListener('input', function () { items[i].value = this.value })

      var removeBtn = document.createElement('button')

      removeBtn.className = 'kv-remove'
      removeBtn.textContent = '\u2715'
      removeBtn.addEventListener('click', function () {
        items.splice(i, 1)

        if (items.length === 0) { items.push({ key: '', value: '' }) }

        renderKvEditor(containerId, items)
      })

      row.appendChild(keyInput)
      row.appendChild(valInput)
      row.appendChild(removeBtn)
      container.appendChild(row)
    })

    var addBtn = document.createElement('button')

    addBtn.className = 'kv-add'
    addBtn.textContent = '+ Add'
    addBtn.addEventListener('click', function () {
      items.push({ key: '', value: '' })
      renderKvEditor(containerId, items)
    })

    container.appendChild(addBtn)
  }

  renderKvEditor('params-editor', params)
  renderKvEditor('headers-editor', headers)

  /* ── Body type ── */

  document.querySelectorAll('input[name="body-type"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      bodyType = this.value
      bodyContent.disabled = bodyType === 'none'

      var placeholders = { json: '{\n  "key": "value"\n}', form: 'key=value&other=data', text: 'Plain text body...' }

      bodyContent.placeholder = placeholders[bodyType] || 'Request body...'
    })
  })

  methodEl.addEventListener('change', function () {
    methodEl.style.color = METHOD_COLORS[methodEl.value] || '#e0e0e0'
  })

  methodEl.style.color = METHOD_COLORS[methodEl.value] || '#e0e0e0'

  /* ── Request building ── */

  function buildUrl() {
    var base = urlEl.value.trim()

    if (!base) { return '' }

    var activeParams = params.filter(function (p) { return p.key.trim() })

    if (activeParams.length === 0) { return base }

    var sep = base.indexOf('?') === -1 ? '?' : '&'
    var qs = activeParams.map(function (p) {
      return encodeURIComponent(p.key) + '=' + encodeURIComponent(p.value)
    }).join('&')

    return base + sep + qs
  }

  function buildHeaders() {
    var h = {}

    headers.forEach(function (item) {
      if (item.key.trim()) { h[item.key.trim()] = item.value }
    })

    return h
  }

  /* ── Response ── */

  function statusClass(code) {
    if (code >= 200 && code < 300) { return 'status-2xx' }
    if (code >= 300 && code < 400) { return 'status-3xx' }
    if (code >= 400 && code < 500) { return 'status-4xx' }

    return 'status-5xx'
  }

  function formatBody(text, contentType) {
    if (contentType && contentType.indexOf('json') !== -1) {
      try { return JSON.stringify(JSON.parse(text), null, 2) } catch (_) { return text }
    }

    return text
  }

  function formatSize(bytes) {
    if (bytes < 1024) { return bytes + ' B' }
    if (bytes < 1024 * 1024) { return (bytes / 1024).toFixed(1) + ' KB' }

    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  function showResponse(data) {
    resEmpty.style.display = 'none'
    resContent.style.display = 'flex'
    resContent.style.flexDirection = 'column'
    resContent.style.flex = '1'
    resContent.style.overflow = 'hidden'

    resStatus.textContent = data.status + ' ' + data.statusText
    resStatus.className = 'status-badge ' + statusClass(data.status)

    var parts = []

    if (data.time) { parts.push(data.time + 'ms') }
    if (data.size) { parts.push(formatSize(data.size)) }

    resMeta.textContent = parts.join(' \u00b7 ')

    var ct = (data.headers && data.headers['content-type']) || ''

    resBodyPre.textContent = formatBody(data.body, ct)

    var headerLines = ''

    if (data.headers) {
      Object.keys(data.headers).forEach(function (k) {
        headerLines += k + ': ' + data.headers[k] + '\n'
      })
    }

    resHeadersPre.textContent = headerLines || '(no headers)'
  }

  function showError(err) {
    resEmpty.style.display = 'none'
    resContent.style.display = 'flex'
    resContent.style.flexDirection = 'column'
    resContent.style.flex = '1'

    resStatus.textContent = 'Error'
    resStatus.className = 'status-badge status-5xx'
    resMeta.textContent = ''
    resBodyPre.textContent = err
    resHeadersPre.textContent = ''
  }

  /* ── History (persistent) ── */

  function persistHistory(method, url, status, time) {
    history.unshift({ method: method, url: url, status: status, time: time || 0 })

    if (history.length > 100) { history.pop() }

    renderHistory()

    try {
      bridge('executeCommand', ['api-playground.pushHistory', {
        method: method, url: url, status: status, time: time || 0
      }]).catch(function () {})
    } catch (_) {}
  }

  function renderHistory() {
    clearChildren(historyListEl)

    if (history.length === 0) {
      var empty = document.createElement('div')

      empty.className = 'sidebar-empty'
      empty.textContent = 'No requests yet.\nSend a request to start building history.'
      historyListEl.appendChild(empty)

      return
    }

    history.forEach(function (entry) {
      var btn = document.createElement('button')

      btn.className = 'sidebar-item'

      var methodSpan = document.createElement('span')

      methodSpan.className = 'sidebar-item-method'
      methodSpan.textContent = entry.method
      methodSpan.style.color = METHOD_COLORS[entry.method] || '#888'

      var urlSpan = document.createElement('span')

      urlSpan.className = 'sidebar-item-label'

      try {
        var parsed = new URL(entry.url)

        urlSpan.textContent = parsed.pathname + parsed.search
      } catch (_) {
        urlSpan.textContent = entry.url
      }

      urlSpan.title = entry.url

      var statusSpan = document.createElement('span')

      statusSpan.className = 'sidebar-item-status'
      statusSpan.textContent = entry.status || ''

      var statusColor = '#22c55e'

      if (entry.status === 'ERR') { statusColor = '#ef4444' }
      else if (entry.status >= 400) { statusColor = '#ef4444' }
      else if (entry.status >= 300) { statusColor = '#f59e0b' }

      statusSpan.style.color = statusColor

      btn.appendChild(methodSpan)
      btn.appendChild(urlSpan)
      btn.appendChild(statusSpan)

      btn.addEventListener('click', function () {
        loadRequest(entry.method, entry.url)
      })

      historyListEl.appendChild(btn)
    })
  }

  function loadPersistedHistory() {
    bridge('executeCommand', ['api-playground.getHistory']).then(function (result) {
      if (Array.isArray(result)) {
        history = result
        renderHistory()
      }
    })
  }

  document.getElementById('clear-history-btn').addEventListener('click', function () {
    history = []
    renderHistory()
  })

  /* ── Collections (persistent) ── */

  function renderCollections() {
    clearChildren(collectionsListEl)

    if (collections.length === 0) {
      var empty = document.createElement('div')

      empty.className = 'sidebar-empty'
      empty.textContent = 'No saved requests yet.\nClick "+ Save" to save the current request.'
      collectionsListEl.appendChild(empty)

      return
    }

    collections.forEach(function (entry) {
      var btn = document.createElement('button')

      btn.className = 'sidebar-item'

      var methodSpan = document.createElement('span')

      methodSpan.className = 'sidebar-item-method'
      methodSpan.textContent = entry.method
      methodSpan.style.color = METHOD_COLORS[entry.method] || '#888'

      var nameSpan = document.createElement('span')

      nameSpan.className = 'sidebar-item-label'
      nameSpan.textContent = entry.name
      nameSpan.title = entry.url

      var actionsSpan = document.createElement('span')

      actionsSpan.className = 'sidebar-item-actions'

      var deleteBtn = document.createElement('button')

      deleteBtn.className = 'sidebar-item-action'
      deleteBtn.textContent = '\u2715'
      deleteBtn.title = 'Delete'
      deleteBtn.addEventListener('click', function (ev) {
        ev.stopPropagation()
        deleteCollection(entry.id)
      })

      actionsSpan.appendChild(deleteBtn)

      btn.appendChild(methodSpan)
      btn.appendChild(nameSpan)
      btn.appendChild(actionsSpan)

      btn.addEventListener('click', function () {
        loadSavedRequest(entry)
      })

      collectionsListEl.appendChild(btn)
    })
  }

  function loadSavedRequest(entry) {
    methodEl.value = entry.method || 'GET'
    methodEl.style.color = METHOD_COLORS[methodEl.value] || '#e0e0e0'
    urlEl.value = entry.url || ''

    if (entry.headers && entry.headers.length) {
      headers = entry.headers.map(function (h) { return { key: h.key, value: h.value } })
    } else {
      headers = [{ key: 'Content-Type', value: 'application/json' }]
    }

    renderKvEditor('headers-editor', headers)

    params = [{ key: '', value: '' }]
    renderKvEditor('params-editor', params)

    bodyType = entry.bodyType || 'none'
    bodyContent.value = entry.body || ''
    bodyContent.disabled = bodyType === 'none'

    document.querySelectorAll('input[name="body-type"]').forEach(function (radio) {
      radio.checked = radio.value === bodyType
    })
  }

  function loadRequest(method, url) {
    methodEl.value = method
    methodEl.style.color = METHOD_COLORS[method] || '#e0e0e0'
    urlEl.value = url
  }

  function showSaveModal() {
    var currentUrl = urlEl.value.trim()

    if (!currentUrl) {
      urlEl.focus()

      return
    }

    var overlay = document.createElement('div')

    overlay.className = 'modal-overlay'

    var modal = document.createElement('div')

    modal.className = 'modal'

    var title = document.createElement('div')

    title.className = 'modal-title'
    title.textContent = 'Save Request'

    var nameInput = document.createElement('input')

    nameInput.className = 'modal-input'
    nameInput.type = 'text'
    nameInput.placeholder = 'Request name...'

    try {
      var parsed = new URL(currentUrl.indexOf('://') === -1 ? 'https://' + currentUrl : currentUrl)

      nameInput.value = methodEl.value + ' ' + parsed.pathname
    } catch (_) {
      nameInput.value = methodEl.value + ' ' + currentUrl.slice(0, 40)
    }

    var buttons = document.createElement('div')

    buttons.className = 'modal-buttons'

    var cancelBtn = document.createElement('button')

    cancelBtn.className = 'modal-btn'
    cancelBtn.textContent = 'Cancel'

    var saveBtn = document.createElement('button')

    saveBtn.className = 'modal-btn modal-btn-primary'
    saveBtn.textContent = 'Save'

    buttons.appendChild(cancelBtn)
    buttons.appendChild(saveBtn)
    modal.appendChild(title)
    modal.appendChild(nameInput)
    modal.appendChild(buttons)
    overlay.appendChild(modal)
    modalContainer.appendChild(overlay)

    nameInput.focus()
    nameInput.select()

    function close() {
      modalContainer.removeChild(overlay)
    }

    cancelBtn.addEventListener('click', close)

    overlay.addEventListener('click', function (ev) {
      if (ev.target === overlay) { close() }
    })

    function doSave() {
      var name = nameInput.value.trim()

      if (!name) { return }

      var entry = {
        id: 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        name: name,
        method: methodEl.value,
        url: currentUrl,
        headers: headers.filter(function (h) { return h.key.trim() }),
        bodyType: bodyType,
        body: bodyContent.value,
        createdAt: Date.now()
      }

      bridge('executeCommand', ['api-playground.saveCollection', entry]).then(function (result) {
        if (result && result.collections) {
          collections = result.collections
        } else {
          collections.unshift(entry)
        }

        renderCollections()
      })

      close()
    }

    saveBtn.addEventListener('click', doSave)

    nameInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { doSave() }
      if (ev.key === 'Escape') { close() }
    })
  }

  function deleteCollection(id) {
    bridge('executeCommand', ['api-playground.deleteCollection', id]).then(function (result) {
      if (result && result.collections) {
        collections = result.collections
      } else {
        collections = collections.filter(function (c) { return c.id !== id })
      }

      renderCollections()
    })
  }

  function loadPersistedCollections() {
    bridge('executeCommand', ['api-playground.getCollections']).then(function (result) {
      if (Array.isArray(result)) {
        collections = result
        renderCollections()
      }
    })
  }

  document.getElementById('save-current-btn').addEventListener('click', showSaveModal)

  /* ── Send request ── */

  function sendRequest() {
    var method = methodEl.value
    var url = buildUrl()

    if (!url) { urlEl.focus(); return }

    if (!/^https?:\/\//i.test(url)) { url = 'https://' + url }

    sendBtn.disabled = true
    sendBtn.textContent = 'Sending...'

    var startTime = Date.now()
    var reqHeaders = buildHeaders()
    var reqBody = bodyType === 'none' ? undefined : bodyContent.value

    var fetchOpts = { method: method, headers: reqHeaders }
    if (reqBody && method !== 'GET' && method !== 'HEAD') {
      fetchOpts.body = reqBody
    }

    fetch(url, fetchOpts).then(function (resp) {
      var status = resp.status
      var statusText = resp.statusText
      var respHeaders = {}
      resp.headers.forEach(function (v, k) { respHeaders[k] = v })

      return resp.text().then(function (bodyText) {
        var elapsed = Date.now() - startTime

        sendBtn.disabled = false
        sendBtn.textContent = 'Send'

        var result = {
          status: status,
          statusText: statusText,
          headers: respHeaders,
          body: bodyText,
          size: bodyText.length,
          time: elapsed,
        }
        showResponse(result)
        persistHistory(method, url, status, elapsed)
      })
    }).catch(function (err) {
      sendBtn.disabled = false
      sendBtn.textContent = 'Send'
      showError(err.message || 'Request failed')
      persistHistory(method, url, 'ERR')
    })
  }

  sendBtn.addEventListener('click', sendRequest)

  urlEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { sendRequest() }
  })

  /* ── Splitter ── */

  var splitter = document.getElementById('splitter')
  var isDragging = false

  splitter.addEventListener('mousedown', function (e) {
    isDragging = true
    e.preventDefault()
  })

  document.addEventListener('mousemove', function (e) {
    if (!isDragging) { return }

    var container = document.querySelector('.content')
    var rect = container.getBoundingClientRect()
    var y = e.clientY - rect.top
    var pct = Math.max(20, Math.min(80, (y / rect.height) * 100))
    var panels = document.getElementById('request-panels')

    panels.style.flex = 'none'
    panels.style.height = pct + '%'
    document.getElementById('response-section').style.flex = '1'
  })

  document.addEventListener('mouseup', function () { isDragging = false })

  /* ── Init: load persisted data ── */

  loadPersistedCollections()
  loadPersistedHistory()
  renderCollections()
  renderHistory()
})()
