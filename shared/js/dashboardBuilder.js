// Dashboard Builder — "Dashboard samenstellen"
//
// Lets a user compose a custom comparison dashboard on top of the sankey
// dataset of the active diagram:
//   * pick any number of scenarios
//   * add graph panels, each bound to one parameter (node × drager × richting)
//   * render each panel either as a line graph (all available years) or as a
//     horizontal bar graph (focus year only, one bar per scenario)
//
// The configuration is persisted in localStorage and can be exported/imported
// as a JSON file. All data on the dashboard can be exported to .xlsx and every
// graph can be copied to the clipboard as a PNG image.
//
// Depends on globals provided by the viewer: viewerConfig, d3, XLSX,
// sankeyDataLibraries / window.activeDiagramId, currentUnit, globalCO2flowScale.

;(function () {
  'use strict'

  /* ------------------------------------------------------------------ *
   * Constants
   * ------------------------------------------------------------------ */

  const STORAGE_PREFIX = 'flux.dashboardBuilder.v1.'
  const CONFIG_FORMAT = 'flux-dashboard-config'
  const CONFIG_VERSION = 1
  const PJ_PER_TWH = 3.6
  const MAX_PICKER_ROWS = 600
  const MAX_TITLE_LENGTH = 200
  const MIN_PANEL_HEIGHT = 170
  const MAX_PANEL_HEIGHT = 2000
  const SNAP_DISTANCE = 14 // px within which a drag latches onto a neighbour
  const ANY = '*' // open end of a flow: "everything into/out of this node"
  const ALL_CARRIERS = '<ALLCARRIERS>'

  function flowKey (source, target, carrier) {
    return source + '||' + target + '||' + carrier
  }

  const FONT = '"RO Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

  const INK = {
    text: '#2B2B2B',
    muted: '#8A857D',
    grid: '#E7E3DC',
    axis: '#C6C0B6',
    surface: '#FFFFFF'
  }

  const DIRECTION_LABEL = { in: 'in', uit: 'uit' }

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */

  let state = defaultState()
  let panelSeq = 0
  let indexCache = { diagramId: null, data: null }

  let stateRestored = false
  let uniformDomains = null // shared axis bounds while 'Uniforme schaling' is on
  let scenarioSectionOpen = null // null = decide from the state on first render
  let overlay = null // main popup root
  let picker = null // parameter picker root
  let resizeTimer = null

  function defaultState () {
    return {
      diagramId: null,
      scenarios: [],
      focusYear: null,
      uniformScale: false,
      title: '',
      sourceTemplate: null,
      panels: []
    }
  }

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */

  function el (tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined && text !== null) node.textContent = text
    return node
  }

  // `viewerConfig` is declared with `let` in drawSelectionButtons.js, which puts
  // it in the global lexical scope rather than on `window`.
  function cfg () {
    if (window.viewerConfig) return window.viewerConfig
    try {
      return viewerConfig || {}
    } catch (e) {
      return {}
    }
  }

  function viewerName () {
    return cfg().viewer?.name || 'default'
  }

  function pickerModeKey () {
    return STORAGE_PREFIX + 'mode.' + viewerName()
  }

  function loadPickerMode () {
    try {
      return localStorage.getItem(pickerModeKey()) === 'all' ? 'all' : 'curated'
    } catch (e) {
      return 'curated'
    }
  }

  function savePickerMode (mode) {
    try { localStorage.setItem(pickerModeKey(), mode) } catch (e) {}
  }

  function capitalise (text) {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text
  }

  function storageKey () {
    return STORAGE_PREFIX + viewerName()
  }

  function getLibraries () {
    if (window.sankeyDataLibraries) return window.sankeyDataLibraries
    try {
      // `sankeyDataLibraries` is declared with `let` at the top level of the
      // viewer's loadData.js, which puts it in the global lexical scope.
      return sankeyDataLibraries
    } catch (e) {
      return null
    }
  }

  function activeUnit () {
    return (typeof currentUnit !== 'undefined' && currentUnit === 'TWh') ? 'TWh' : 'PJ'
  }

  // A panel is a bar chart unless it explicitly says otherwise.
  function chartTypeOf (panel) {
    return panel && panel.chartType === 'line' ? 'line' : 'bar'
  }

  // Bar charts colour by drager unless a panel explicitly says otherwise.
  function colorModeOf (panel) {
    return panel && panel.colorBy === 'scenario' ? 'scenario' : 'carrier'
  }

  function isCO2 (param) {
    return param && param.carrier === 'co2flow'
  }

  // Converts a raw (PJ) value to the unit currently displayed.
  function convert (value, param) {
    if (!isFinite(value)) return value
    if (isCO2(param)) {
      const scale = (typeof globalCO2flowScale !== 'undefined' && globalCO2flowScale) ? globalCO2flowScale : 1
      return value * scale
    }
    return activeUnit() === 'TWh' ? value / PJ_PER_TWH : value
  }

  function unitLabel (param) {
    return isCO2(param) ? 'kton CO₂' : activeUnit()
  }

  // Values that would print as 0,000: noise in a breakdown, so tooltips skip them.
  function displaysAsZero (value) {
    return Math.abs(value) < 0.0005
  }

  function formatNumber (value) {
    if (!isFinite(value)) return '–'
    const abs = Math.abs(value)
    const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3
    return value.toLocaleString('nl-NL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  }

  // Axis ticks share one number format, derived from the step size, so a zero
  // tick does not end up with more decimals than the rest of the scale.
  function formatTick (value, step) {
    const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3
    return value.toLocaleString('nl-NL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  }

  const TITLE_FONT_SIZE = 14
  const TITLE_LINE_HEIGHT = 18
  const MAX_TITLE_LINES = 8 // a safety net; real titles stay far below this
  const MAX_FOOTNOTE_LENGTH = 1000
  const MAX_FOOTNOTE_LINES = 12
  const FOOTNOTE_LINE_HEIGHT = 15
  const FOOTNOTE_FONT_SIZE = 11

  // Word-wraps text to maxWidth. A word wider than a whole line is broken by
  // characters rather than clipped.
  function wrapText (ctx, text, maxWidth, maxLines) {
    const fits = t => ctx.measureText(t).width <= maxWidth
    const lines = []
    let line = ''
    String(text || '').split(/\s+/).filter(Boolean).forEach(word => {
      const candidate = line ? line + ' ' + word : word
      if (fits(candidate)) {
        line = candidate
        return
      }
      if (line) lines.push(line)
      line = word
      while (!fits(line) && line.length > 1) {
        let cut = line.length - 1
        while (cut > 1 && !fits(line.slice(0, cut))) cut--
        lines.push(line.slice(0, cut))
        line = line.slice(cut)
      }
    })
    if (line) lines.push(line)
    if (!lines.length) return ['']
    if (maxLines && lines.length > maxLines) {
      const kept = lines.slice(0, maxLines)
      kept[maxLines - 1] = truncate(ctx, kept[maxLines - 1] + ' ' + lines.slice(maxLines).join(' '), maxWidth)
      return kept
    }
    return lines
  }

  function truncate (ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text
    let out = text
    while (out.length > 1 && ctx.measureText(out + '…').width > maxWidth) out = out.slice(0, -1)
    return out + '…'
  }

  function paramLabel (param) {
    if (!param) return 'Onbekende parameter'
    if (param.direction) return param.nodeTitle + ' · ' + param.carrier + ' · ' + DIRECTION_LABEL[param.direction]
    return param.sourceTitle + ' → ' + param.targetTitle + ' · ' + param.carrier
  }

  function seriesHeading (entry) {
    if (entry.spec.title) return entry.spec.title
    if (!entry.param) return 'Parameter niet gevonden'
    return entry.param.direction
      ? entry.param.nodeTitle
      : entry.param.sourceTitle + ' → ' + entry.param.targetTitle
  }

  // Stacking the same parameter across carriers shares one heading; series from
  // different catalogue rows are joined instead.
  function panelHeading (panel, entries) {
    if (panel && panel.title) return panel.title
    if (!entries || !entries.length) return 'Parameter niet gevonden'
    const titles = uniqueInOrder(entries.map(seriesHeading))
    return titles.join(' + ')
  }

  function panelSubtitle (panel, entries) {
    if (!entries || !entries.length) return '—'
    const withData = entries.filter(e => e.param)
    if (!withData.length) return '—'

    const parts = []
    if (entries.length > 1) {
      const carriers = uniqueInOrder(withData.map(e => e.param.carrier))
      if (aggregatesByCarrier(panel)) {
        parts.push(entries.length + ' reeksen, opgeteld per drager')
      } else if (chartTypeOf(panel) === 'bar') {
        parts.push(carriers.length > 1 ? entries.length + ' reeksen' : carriers[0])
      } else {
        if (carriers.length === 1) parts.push(carriers[0])
        parts.push('som van ' + entries.length + ' reeksen')
      }
    } else {
      const entry = withData[0]
      parts.push(entry.param.carrier)
      if (!entry.spec.title && entry.param.direction) parts.push(DIRECTION_LABEL[entry.param.direction])
    }
    parts.push(unitLabel(withData[0].param))
    if (chartTypeOf(panel) === 'bar') parts.push(String(state.focusYear || '—'))
    return parts.join(' · ')
  }

  // Series are keyed by their carrier colour; identical carriers on one panel
  // are separated by stepping lightness so the stack stays readable.
  function buildSeriesColors (entries) {
    // Grouped by resolved colour rather than carrier name: several carriers in
    // the legend share a hex (#333), and they must not stack as one block.
    const byCarrier = {}
    entries.forEach(e => {
      const key = (e.param && e.param.carrierColor) || 'onbekend'
      ;(byCarrier[key] = byCarrier[key] || []).push(e)
    })

    const colors = new Map()
    Object.keys(byCarrier).forEach(key => {
      const group = byCarrier[key]
      const base = d3.hsl(d3.color((group[0].param && group[0].param.carrierColor) || '#8A857D'))
      if (group.length === 1) {
        colors.set(group[0], base.formatHex())
        return
      }
      const high = Math.min(0.78, base.l + 0.22)
      const low = Math.max(0.24, base.l - 0.22)
      group.forEach((entry, i) => {
        const t = i / (group.length - 1)
        colors.set(entry, d3.hsl(base.h, base.s, high - t * (high - low)).formatHex())
      })
    })
    return entries.map(e => colors.get(e) || '#8A857D')
  }

  /* ------------------------------------------------------------------ *
   * Dataset index — turns sankey links into selectable parameters
   * ------------------------------------------------------------------ */

  function buildIndex () {
    const diagramId = window.activeDiagramId || null
    if (indexCache.data && indexCache.diagramId === diagramId) return indexCache.data

    const libs = getLibraries()
    const raw = libs && diagramId ? libs[diagramId] : null
    if (!raw || !raw.links) return null

    const scope = raw.links.system ? 'system' : Object.keys(raw.links)[0]
    if (!scope) return null

    const links = raw.links[scope] || []
    const nodeRows = (raw.nodes && raw.nodes[scope]) || []
    const legendRows = (raw.legend && raw.legend[scope]) || []

    // A leading '.' marks a node whose label is suppressed in the diagram; the
    // title itself is still the readable name, so keep it minus the marker.
    const nodeTitles = {}
    nodeRows.forEach(n => {
      if (!n || !n.id) return
      const title = String(n['title.' + scope] || n['title.system'] || n.id).replace(/^\.+/, '').trim()
      nodeTitles[n.id] = title || n.id
    })

    const carrierColors = {}
    legendRows.forEach(l => {
      if (l && l.id) carrierColors[l.id] = l.color
    })

    // Value columns are named "{year}_{scenarioId}".
    const knownScenarios = new Set((cfg().scenarios || []).map(s => s.id))
    const columns = []
    const seenColumns = new Set()
    links.forEach(row => {
      Object.keys(row).forEach(col => {
        if (seenColumns.has(col)) return
        seenColumns.add(col)
        const match = /^(\d{4})_(.+)$/.exec(col)
        if (!match) return
        if (knownScenarios.size && !knownScenarios.has(match[2])) return
        columns.push({ col: col, year: Number(match[1]), scenario: match[2] })
      })
    })

    // Links carry a per-scope inclusion flag; honour it so totals match the diagram.
    const filterCol = 'filter_' + scope
    const hasFilterCol = links.some(row => Object.prototype.hasOwnProperty.call(row, filterCol))

    const params = new Map()
    const pairs = new Map()
    const pairCarriers = new Map()

    // Every parameter is a flow (source → target → carrier) where ANY marks an
    // open end. A node total is one open end; a curated entry names both.
    function bucket (nodeId, carrier, direction) {
      const source = direction === 'in' ? ANY : nodeId
      const target = direction === 'in' ? nodeId : ANY
      const key = flowKey(source, target, carrier)
      let param = params.get(key)
      if (!param) {
        param = {
          key: key,
          node: nodeId,
          nodeTitle: nodeTitles[nodeId] || nodeId,
          source: source,
          target: target,
          carrier: carrier,
          carrierColor: carrierColors[carrier] || '#9A948B',
          direction: direction,
          values: {} // scenarioId -> { year: value }
        }
        params.set(key, param)
      }
      return param
    }

    function pairBucket (source, target, carrier) {
      const key = flowKey(source, target, carrier)
      let param = pairs.get(key)
      if (!param) {
        param = {
          key: key,
          source: source,
          target: target,
          sourceTitle: nodeTitles[source] || source,
          targetTitle: nodeTitles[target] || target,
          carrier: carrier,
          carrierColor: carrierColors[carrier] || '#9A948B',
          values: {}
        }
        pairs.set(key, param)
        const pk = source + '||' + target
        const set = pairCarriers.get(pk) || new Set()
        set.add(carrier)
        pairCarriers.set(pk, set)
      }
      return param
    }

    links.forEach(row => {
      if (hasFilterCol && row[filterCol] !== 'x') return
      const carrier = row.carrier
      if (!carrier) return

      const buckets = []
      if (row.target) buckets.push(bucket(row.target, carrier, 'in'))
      if (row.source) buckets.push(bucket(row.source, carrier, 'uit'))
      if (row.source && row.target) buckets.push(pairBucket(row.source, row.target, carrier))
      if (!buckets.length) return

      columns.forEach(ci => {
        const rawValue = row[ci.col]
        if (rawValue === undefined || rawValue === null || rawValue === '') return
        const value = typeof rawValue === 'number' ? rawValue : parseFloat(rawValue)
        if (!isFinite(value)) return
        buckets.forEach(param => {
          const byScenario = param.values[ci.scenario] || (param.values[ci.scenario] = {})
          byScenario[ci.year] = (byScenario[ci.year] || 0) + value
        })
      })
    })

    // Scenario → available years, derived straight from the data columns.
    const scenarioYears = {}
    columns.forEach(ci => {
      const set = scenarioYears[ci.scenario] || (scenarioYears[ci.scenario] = new Set())
      set.add(ci.year)
    })
    Object.keys(scenarioYears).forEach(id => {
      scenarioYears[id] = Array.from(scenarioYears[id]).sort((a, b) => a - b)
    })

    const paramList = Array.from(params.values())

    // Drop parameters that are empty everywhere — they only add noise.
    const usable = paramList.filter(p => Object.keys(p.values).length > 0)

    const byNode = new Map()
    usable.forEach(p => {
      const list = byNode.get(p.node) || []
      list.push(p)
      byNode.set(p.node, list)
    })
    byNode.forEach(list => {
      list.sort((a, b) => a.carrier.localeCompare(b.carrier) || a.direction.localeCompare(b.direction))
    })

    const nodes = Array.from(byNode.keys())
      .map(id => ({ id: id, title: nodeTitles[id] || id }))
      .sort((a, b) => a.title.localeCompare(b.title, 'nl'))

    const carrierSet = new Map()
    usable.forEach(p => { if (!carrierSet.has(p.carrier)) carrierSet.set(p.carrier, p.carrierColor) })
    const carriers = Array.from(carrierSet.entries())
      .map(([id, color]) => ({ id: id, color: color }))
      .sort((a, b) => a.id.localeCompare(b.id))

    const allYears = Array.from(new Set(columns.map(c => c.year))).sort((a, b) => a - b)

    const usablePairs = Array.from(pairs.values()).filter(p => Object.keys(p.values).length > 0)

    // One lookup for both shapes, keyed by the flow a panel stores.
    const byFlow = new Map()
    usable.concat(usablePairs).forEach(p => byFlow.set(p.key, p))

    const data = {
      diagramId: diagramId,
      scope: scope,
      nodeTitles: nodeTitles,
      byFlow: byFlow,
      pairCarriers: pairCarriers,
      byNode: byNode,
      nodes: nodes,
      carriers: carriers,
      scenarioYears: scenarioYears,
      allYears: allYears
    }

    indexCache = { diagramId: diagramId, data: data }
    return data
  }

  /* ------------------------------------------------------------------ *
   * Scenario metadata
   * ------------------------------------------------------------------ */

  // Scenarios that are configured, visible, and present in the loaded diagram.
  function availableScenarios (index) {
    let list = (cfg().scenarios || []).slice()
    if (window.ScenarioSettings && typeof window.ScenarioSettings.isScenarioVisible === 'function') {
      list = list.filter(s => window.ScenarioSettings.isScenarioVisible(s.id))
    }
    if (index) list = list.filter(s => index.scenarioYears[s.id] && index.scenarioYears[s.id].length)
    return list
  }

  function scenarioTitle (id) {
    const scenario = (cfg().scenarios || []).find(s => s.id === id)
    return scenario ? scenario.title : id
  }

  // Reuses the line-graph colour scheme: one hue per lineGraphCategory, with
  // perceptually even lightness steps for the scenarios inside that category.
  function buildScenarioColors () {
    const categoryColors = (cfg().lineGraphFlow || {}).categoryColors || {}
    const categories = {}
    ;(cfg().scenarios || []).forEach(s => {
      const cat = s.lineGraphCategory || 'overig'
      if (!categories[cat]) categories[cat] = { base: categoryColors[cat] || '#8A857D', scenarios: [] }
      categories[cat].scenarios.push(s.id)
    })

    const colors = {}
    Object.values(categories).forEach(cat => {
      const base = d3.hsl(d3.color(cat.base))
      const n = cat.scenarios.length
      const lightHigh = Math.min(0.72, base.l + 0.24)
      const lightLow = Math.max(0.22, base.l - 0.24)
      cat.scenarios.forEach((id, i) => {
        const t = n <= 1 ? 0 : i / (n - 1)
        colors[id] = d3.hsl(base.h, base.s, lightHigh - t * (lightHigh - lightLow)).formatHex()
      })
    })
    return colors
  }

  function scenarioBadgeColor (id) {
    const scenario = (cfg().scenarios || []).find(s => s.id === id)
    const colors = cfg().colors || {}
    return (scenario && colors[scenario.colorGroup]) || '#FFFFFF'
  }

  /* ------------------------------------------------------------------ *
   * Persistence
   * ------------------------------------------------------------------ */

  // Pure: turns a state object into the configuration format used by every
  // file, template and fingerprint.
  function serialiseConfig (st) {
    return {
      format: CONFIG_FORMAT,
      version: CONFIG_VERSION,
      viewer: viewerName(),
      savedAt: new Date().toISOString(),
      diagramId: st.diagramId,
      scenarios: st.scenarios.slice(),
      focusYear: st.focusYear,
      uniformScale: !!st.uniformScale,
      title: st.title || '',
      sourceTemplate: st.sourceTemplate || undefined,
      panels: st.panels.map(p => ({
        series: panelSeries(p).map(sp => ({
          source: sp.source,
          target: sp.target,
          carrier: sp.carrier,
          title: sp.title || undefined
        })),
        chartType: p.chartType,
        width: p.width,
        colorBy: p.colorBy,
        height: p.height,
        title: p.title || undefined,
        footnote: p.footnote || undefined,
        aggregate: p.aggregate || undefined,
        carrierOrder: p.carrierOrder && p.carrierOrder.length ? p.carrierOrder.slice() : undefined
      }))
    }
  }

  function serialiseState () {
    return serialiseConfig(state)
  }

  // Pure: validates a configuration and returns the state it describes.
  function parseConfig (config) {
    if (!config || typeof config !== 'object') throw new Error('Ongeldige configuratie')
    if (config.format && config.format !== CONFIG_FORMAT) throw new Error('Dit bestand is geen FLUX-dashboardconfiguratie')

    const next = defaultState()
    next.diagramId = config.diagramId || window.activeDiagramId || null
    next.scenarios = Array.isArray(config.scenarios) ? config.scenarios.filter(s => typeof s === 'string') : []
    next.focusYear = config.focusYear ? Number(config.focusYear) : null
    next.uniformScale = !!config.uniformScale
    next.title = typeof config.title === 'string' ? config.title.slice(0, MAX_TITLE_LENGTH) : ''
    next.sourceTemplate = typeof config.sourceTemplate === 'string' ? config.sourceTemplate : null
    next.panels = (Array.isArray(config.panels) ? config.panels : [])
      .map(migratePanel)
      .filter(p => p !== null)
      .map(p => ({
        id: 'panel-' + (++panelSeq),
        series: p.series,
        chartType: chartTypeOf(p),
        width: p.width === 'full' ? 'full' : 'half',
        colorBy: colorModeOf(p),
        height: Number(p.height) > 0 ? clampPanelHeight(Number(p.height)) : null,
        // Legacy single-parameter panels kept the series title at this level.
        title: Array.isArray(p.series) ? cleanText(p.title, MAX_TITLE_LENGTH) : null,
        footnote: cleanText(p.footnote, MAX_FOOTNOTE_LENGTH),
        aggregate: p.aggregate === 'carrier' ? 'carrier' : null,
        carrierOrder: Array.isArray(p.carrierOrder) ? p.carrierOrder.filter(c => typeof c === 'string') : null
      }))

    return next
  }

  function cleanText (value, maxLength) {
    if (typeof value !== 'string') return null
    const text = value.trim().slice(0, maxLength)
    return text || null
  }

  // Assigns only once every field parsed, so a corrupt file cannot leave the
  // dashboard half-replaced.
  function applyConfig (config) {
    state = parseConfig(config)
  }

  let cachePersisted = true // false when the browser refused to store the dashboard

  function saveState () {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(serialiseState()))
      cachePersisted = true
    } catch (e) {
      // Storage may be unavailable (private mode); the dashboard still works.
      cachePersisted = false
    }
    syncUnsaved()
  }

  // Two statuses. The browser copy is automatic: saveState writes it on every
  // change. The file status means the dashboard as it is now was last written
  // to a file or bundle, or was just loaded from one; a fingerprint of that
  // moment is kept across reloads and compared with the current dashboard.
  // Sjablonen are not files — they live in the browser too.
  function savedKey () {
    return STORAGE_PREFIX + 'savedfile.' + viewerName()
  }

  function hashString (text) {
    let hash = 5381
    for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0
    return String(hash >>> 0)
  }

  function stateFingerprint () {
    return hashString(comparableConfig(serialiseState()))
  }

  const MAX_FILE_FINGERPRINTS = 500

  // Fingerprint of a configuration as it would be once loaded, so a template
  // file on disk and the same template on screen compare equal.
  function configFingerprint (config) {
    try {
      return hashString(comparableConfig(serialiseConfig(parseConfig(config))))
    } catch (e) {
      return null
    }
  }

  function readFileFingerprints () {
    try {
      const raw = localStorage.getItem(savedKey())
      if (!raw) return []
      const parsed = JSON.parse(raw)
      // The first version stored a single fingerprint rather than a list.
      return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)]
    } catch (e) {
      return []
    }
  }

  function addFileFingerprints (prints) {
    const fresh = prints.filter(Boolean)
    if (!fresh.length) return
    const list = readFileFingerprints().filter(f => fresh.indexOf(f) === -1).concat(fresh)
      .slice(-MAX_FILE_FINGERPRINTS)
    try { localStorage.setItem(savedKey(), JSON.stringify(list)) } catch (e) {}
    syncUnsaved()
    renderTemplateBar()
  }

  // Every dashboard that went into — or came out of — a file counts as saved to
  // file, whichever of them is on screen later. A bundle holds many.
  function markSavedToFile () {
    addFileFingerprints([stateFingerprint()])
  }

  function rememberFileConfigs (configs) {
    addFileFingerprints((configs || []).map(configFingerprint))
  }

  function isSavedToFile () {
    return readFileFingerprints().indexOf(stateFingerprint()) !== -1
  }

  function setStatus (node, ok, okText, badText, okTip, badTip) {
    node.textContent = ok ? okText : badText
    node.title = ok ? okTip : badTip
    node.classList.toggle('dbb-status-ok', ok)
    node.classList.toggle('dbb-status-warn', !ok)
  }

  function syncUnsaved () {
    const wrap = overlay && overlay.querySelector('#dbb-save-status')
    if (!wrap) return
    // An empty dashboard has nothing worth reporting on.
    wrap.hidden = !state.panels.length
    if (wrap.hidden) return
    setStatus(wrap.querySelector('[data-status="cache"]'), cachePersisted,
      'In browser bewaard', 'Niet in browser bewaard',
      'Dit dashboard wordt automatisch in deze browser bewaard en staat er na herladen nog. ' +
        'Wordt de opslag van de browser gewist, dan is het weg.',
      'Deze browser kan het dashboard niet bewaren (bijvoorbeeld in een privévenster of bij volle opslag). ' +
        'Sla het op als bestand.')
    setStatus(wrap.querySelector('[data-status="file"]'), isSavedToFile(),
      'Als bestand opgeslagen', 'Niet als bestand opgeslagen',
      'Dit dashboard is ongewijzigd sinds het als bestand of bundel werd opgeslagen of geladen.',
      'Dit dashboard staat (in deze vorm) nog niet in een bestand of bundel. Gebruik Opslaan om het als bestand te bewaren.')
  }

  function loadState () {
    try {
      const stored = localStorage.getItem(storageKey())
      if (!stored) return false
      applyConfig(JSON.parse(stored))
      return true
    } catch (e) {
      return false
    }
  }

  // The storage key is namespaced per viewer, and `viewerConfig` only exists
  // once the viewer has loaded its config — so the restore has to wait until
  // the dashboard is first opened rather than run at script load.
  function restoreState () {
    if (stateRestored) return
    stateRestored = true
    loadState()
  }

  // Makes sure the state is usable for the currently loaded diagram.
  function reconcileState (index) {
    const scenarios = availableScenarios(index)
    const ids = new Set(scenarios.map(s => s.id))

    state.diagramId = index ? index.diagramId : state.diagramId
    state.scenarios = state.scenarios.filter(id => ids.has(id))

    if (!state.scenarios.length) {
      const active = window.globalActiveScenario && window.globalActiveScenario.id
      if (active && ids.has(active)) state.scenarios = [active]
      else if (scenarios.length) state.scenarios = [scenarios[0].id]
    }

    const years = selectableYears(index)
    if (!years.length) {
      state.focusYear = null
    } else if (state.focusYear === null || years.indexOf(state.focusYear) === -1) {
      const active = Number(window.globalActiveYear && window.globalActiveYear.id)
      state.focusYear = years.indexOf(active) !== -1 ? active : years[years.length - 1]
    }
  }

  // Years covered by every selected scenario is too strict; use the union so a
  // scenario with a shorter horizon simply has no bar/point for missing years.
  function selectableYears (index) {
    if (!index) return []
    if (!state.scenarios.length) return index.allYears.slice()
    const years = new Set()
    state.scenarios.forEach(id => (index.scenarioYears[id] || []).forEach(y => years.add(y)))
    return Array.from(years).sort((a, b) => a - b)
  }

  // Dashboards saved before parameters became flows stored {node, carrier,
  // direction}; an open end on the other side means the same thing.
  function migrateSeries (sp) {
    if (!sp || !sp.carrier) return null
    const title = sp.title || null
    if (sp.source && sp.target) {
      return { source: String(sp.source), target: String(sp.target), carrier: String(sp.carrier), title: title }
    }
    if (!sp.node) return null
    const inbound = sp.direction !== 'uit'
    return {
      source: inbound ? ANY : String(sp.node),
      target: inbound ? String(sp.node) : ANY,
      carrier: String(sp.carrier),
      title: title
    }
  }

  // Panels used to hold a single parameter; they now hold a list of series.
  function migratePanel (p) {
    if (!p) return null
    const raw = Array.isArray(p.series) && p.series.length ? p.series : [p]
    const series = raw.map(migrateSeries).filter(sp => sp !== null)
    if (!series.length) return null
    return Object.assign({}, p, { series: series })
  }

  function panelSeries (panel) {
    return (panel && panel.series) || []
  }

  function resolveParam (index, spec) {
    if (!index || !spec) return null
    return index.byFlow.get(flowKey(spec.source, spec.target, spec.carrier)) || null
  }

  // Resolves every series of a panel against the active diagram.
  function resolveSeries (index, panel) {
    return panelSeries(panel).map(spec => ({ spec: spec, param: resolveParam(index, spec) }))
  }

  // "Per drager": series sharing a carrier are summed into one layer, so a
  // stack of dozens of flows reads as a handful of carriers. Raw values are
  // summed; conversion only depends on the carrier, so it stays exact.
  function aggregatesByCarrier (panel) {
    return panel.aggregate === 'carrier' && chartTypeOf(panel) === 'bar'
  }

  // `order` lists carriers as the user arranged them; carriers not in it
  // follow in the order they first appear.
  function aggregateByCarrier (entries, order) {
    const groups = new Map()
    entries.forEach(entry => {
      if (!entry.param) return
      const carrier = entry.param.carrier
      let group = groups.get(carrier)
      if (!group) {
        group = {
          spec: { source: ANY, target: ANY, carrier: carrier, title: carrier },
          param: { carrier: carrier, carrierColor: entry.param.carrierColor, values: {} },
          parts: []
        }
        groups.set(carrier, group)
      }
      group.parts.push(entry)
      Object.keys(entry.param.values).forEach(id => {
        const from = entry.param.values[id] || {}
        const to = group.param.values[id] || (group.param.values[id] = {})
        Object.keys(from).forEach(year => { to[year] = (to[year] || 0) + from[year] })
      })
    })
    const layers = Array.from(groups.values())
    if (!order || !order.length) return layers
    const rank = carrier => {
      const i = order.indexOf(carrier)
      return i === -1 ? order.length : i
    }
    // Array sort is stable, so unranked carriers keep their appearance order.
    return layers.sort((a, b) => rank(a.param.carrier) - rank(b.param.carrier))
  }

  // The layers a chart actually draws: the series, or their per-carrier sums.
  function chartEntries (panel, entries) {
    const live = (entries || []).filter(e => e.param)
    return aggregatesByCarrier(panel) ? aggregateByCarrier(live, panel.carrierOrder) : live
  }

  function seriesLabel (entry) {
    return entry.spec.title || paramLabel(entry.param)
  }

  // Stacking one curated row across carriers gives every series the same title,
  // which would make the legend a column of identical text. Label each series
  // by whatever actually tells them apart.
  function seriesLabels (entries) {
    const headings = entries.map(seriesHeading)
    const counts = {}
    headings.forEach(h => { counts[h] = (counts[h] || 0) + 1 })
    return entries.map((entry, i) => {
      if (counts[headings[i]] === 1) return headings[i]
      if (!entry.param) return headings[i]
      // All titles identical: the carrier alone is the distinguishing part.
      return new Set(headings).size === 1 ? entry.param.carrier : headings[i] + ' · ' + entry.param.carrier
    })
  }

  /* ------------------------------------------------------------------ *
   * Curated catalogue (dashboard_builder_preselection.csv)
   * ------------------------------------------------------------------ */

  const CURATED_COLUMNS = {
    kind: 'Productie of verbruik',
    main: 'Hoofdcategorie',
    sub: 'Subcategorie',
    asset: 'Asset',
    title: 'Titel',
    source: 'source_node',
    target: 'target_node'
  }

  // Categories that must not be summed into one graph: the two consumption
  // levels double-count each other, and consumption against production is
  // apples to oranges.
  const CONSUMPTION_CATEGORIES = ['intermediair verbruik', 'finaal verbruik']
  const PRODUCTION_CATEGORIES = [
    'productie uit conversie',
    'productie uit winning',
    'productie uit import',
    'productie uit onbekend'
  ]

  // Why "alles toevoegen" is refused for this selection, or null when it is fine.
  function addAllBlockReason (entries) {
    if (!entries.length) return null

    const kinds = uniqueInOrder(entries.map(e => String(e.kind || '').toLowerCase()))
    if (kinds.length > 1) {
      return 'Alles toevoegen kan alleen met productie óf verbruik — selecteer er één'
    }

    const mains = new Set(entries.map(e => String(e.main || '').toLowerCase()))
    const consumption = CONSUMPTION_CATEGORIES.filter(c => mains.has(c))
    const production = PRODUCTION_CATEGORIES.filter(c => mains.has(c))

    if (consumption.length > 1) {
      return 'Alles toevoegen kan niet met ' + consumption.join(' én ') + ' tegelijk — selecteer één hoofdcategorie'
    }
    if (consumption.length && production.length) {
      return 'Alles toevoegen kan niet met verbruik en productie tegelijk — selecteer één hoofdcategorie'
    }
    return null
  }

  let curatedRows = null // null = not loaded yet, [] = unavailable
  let curatedPromise = null

  function curatedFileName () {
    return cfg().dashboardBuilder?.preselectionFile || 'dashboard_builder_preselection.csv'
  }

  async function fetchCuratedRows () {
    const file = curatedFileName()
    const base = file.replace(/\.[^.]+$/, '')

    // In production the private files live inside the encrypted zip.
    const zipCsv = window.viewerZipCSV && window.viewerZipCSV[base]
    if (zipCsv) return d3.csvParse(zipCsv)

    const response = await fetch('private/' + file)
    if (!response.ok) throw new Error('Kan ' + file + ' niet laden (' + response.status + ')')
    return d3.csvParse(await response.text())
  }

  function ensureCuratedRows () {
    if (curatedPromise) return curatedPromise
    curatedPromise = fetchCuratedRows()
      .then(rows => {
        curatedRows = (rows || []).filter(r => r && r[CURATED_COLUMNS.title])
        return curatedRows
      })
      .catch(error => {
        console.warn('Dashboard builder: curated selection unavailable —', error.message)
        curatedRows = []
        return curatedRows
      })
    return curatedPromise
  }

  /* ------------------------------------------------------------------ *
   * Templates (private/dashboard_sjablonen/*.json)
   * ------------------------------------------------------------------ */

  let templates = null // null = not loaded yet, [] = none available
  let folderTemplates = [] // as found in the folder/zip, before browser-kept copies are merged in
  const BUNDLE_CURRENT = 'huidig-dashboard.json' // the shown dashboard inside a bundle
  let templatesPromise = null

  function templateDir () {
    return cfg().dashboardBuilder?.templateDir || 'dashboard_sjablonen'
  }

  // A template is an exported dashboard configuration; anything else in the
  // folder is ignored.
  function toTemplate (file, config) {
    if (!config || typeof config !== 'object') return null
    if (config.format && config.format !== CONFIG_FORMAT) return null
    if (!Array.isArray(config.panels)) return null
    const label = (typeof config.title === 'string' && config.title.trim()) ||
      String(file).replace(/\.json$/i, '')
    return { file: file, label: label, config: config }
  }

  async function fetchTemplates () {
    // In production the private folder only exists inside the encrypted zip.
    if (Array.isArray(window.viewerZipDashboardTemplates)) {
      return window.viewerZipDashboardTemplates.map(t => toTemplate(t.file, t.config))
    }

    // In development the static server's directory listing names the files.
    const base = 'private/' + templateDir() + '/'
    const listing = await fetch(base)
    if (!listing.ok) throw new Error('Map ' + base + ' niet gevonden (' + listing.status + ')')
    const doc = new DOMParser().parseFromString(await listing.text(), 'text/html')
    const files = uniqueInOrder(Array.from(doc.querySelectorAll('a[href]'))
      .map(a => decodeURIComponent((a.getAttribute('href') || '').split(/[?#]/)[0].split('/').filter(Boolean).pop() || ''))
      .filter(name => /\.json$/i.test(name)))

    return Promise.all(files.map(async file => {
      try {
        const response = await fetch(base + encodeURIComponent(file))
        return response.ok ? toTemplate(file, await response.json()) : null
      } catch (e) {
        return null
      }
    }))
  }

  // Templates saved where the page cannot write to the folder (other browsers,
  // the deployed site) are kept in this browser and shown alongside the folder.
  function localTemplatesKey () {
    return STORAGE_PREFIX + 'templates.' + viewerName()
  }

  function readLocalTemplates () {
    try {
      const list = JSON.parse(localStorage.getItem(localTemplatesKey()) || '[]')
      return Array.isArray(list) ? list.filter(t => t && t.file && t.config) : []
    } catch (e) {
      return []
    }
  }

  function writeLocalTemplates (list) {
    try {
      localStorage.setItem(localTemplatesKey(), JSON.stringify(list))
      return true
    } catch (e) {
      return false
    }
  }

  // Folder sjablonen cannot be deleted from the page, so "removing" one hides
  // it in this browser instead.
  function hiddenTemplatesKey () {
    return STORAGE_PREFIX + 'hiddentemplates.' + viewerName()
  }

  function readHiddenTemplates () {
    try {
      const list = JSON.parse(localStorage.getItem(hiddenTemplatesKey()) || '[]')
      return Array.isArray(list) ? list.map(String) : []
    } catch (e) {
      return []
    }
  }

  function writeHiddenTemplates (list) {
    try { localStorage.setItem(hiddenTemplatesKey(), JSON.stringify(list)) } catch (e) {}
  }

  function sortTemplates (list) {
    return list.sort((a, b) => a.label.localeCompare(b.label, 'nl'))
  }

  function comparableConfig (config) {
    const copy = Object.assign({}, config)
    delete copy.savedAt
    delete copy.sourceTemplate
    return JSON.stringify(copy)
  }

  // A local copy overrides the folder version of the same file — until the
  // folder holds an identical file, at which point the local copy is dropped.
  function mergeLocalTemplates (fromSource) {
    const byFile = new Map(fromSource.map(t => [t.file, t]))
    const keep = []
    readLocalTemplates().forEach(local => {
      const onDisk = byFile.get(local.file)
      if (onDisk && comparableConfig(onDisk.config) === comparableConfig(local.config)) return
      const template = toTemplate(local.file, local.config)
      if (!template) return
      template.local = true
      byFile.set(local.file, template)
      keep.push(local)
    })
    writeLocalTemplates(keep)
    // A hidden folder sjabloon stays hidden unless this browser has its own copy.
    const hidden = new Set(readHiddenTemplates())
    return sortTemplates(Array.from(byFile.values()).filter(t => t.local || !hidden.has(t.file)))
  }

  function refreshTemplates () {
    templates = mergeLocalTemplates(folderTemplates)
    renderTemplateBar()
  }

  // Removing always comes with an undo instead of a confirmation.
  function removeTemplate (template) {
    const locals = readLocalTemplates()
    const ownCopy = locals.find(t => t.file === template.file)
    const inFolder = folderTemplates.some(t => t.file === template.file)
    const name = '“' + template.label + '”'
    let message
    let undo

    if (ownCopy) {
      writeLocalTemplates(locals.filter(t => t.file !== template.file))
      message = inFolder
        ? 'Jouw versie van ' + name + ' verwijderd; de versie uit de map is terug'
        : 'Sjabloon ' + name + ' verwijderd'
      undo = function () {
        writeLocalTemplates(readLocalTemplates().filter(t => t.file !== template.file).concat(ownCopy))
        refreshTemplates()
      }
    } else {
      writeHiddenTemplates(readHiddenTemplates().filter(f => f !== template.file).concat(template.file))
      message = 'Sjabloon ' + name + ' verborgen in deze browser — het staat nog in de map'
      undo = function () {
        writeHiddenTemplates(readHiddenTemplates().filter(f => f !== template.file))
        refreshTemplates()
      }
    }
    refreshTemplates()
    toast(message, { action: 'Ongedaan maken', onAction: undo })
  }

  function ensureTemplates () {
    if (templatesPromise) return templatesPromise
    templatesPromise = fetchTemplates()
      .then(list => {
        folderTemplates = (list || []).filter(Boolean)
        templates = mergeLocalTemplates(folderTemplates)
      })
      .catch(error => {
        console.warn('Dashboard builder: templates unavailable —', error.message)
        templates = mergeLocalTemplates([])
      })
      .then(() => renderTemplateBar())
    return templatesPromise
  }

  // Expands each catalogue row into the concrete flows it stands for. A row with
  // <ALLCARRIERS> on one side becomes one entry per carrier actually present in
  // the data for that node; a row naming both nodes becomes one entry per
  // carrier carried by that link.
  function buildCuratedEntries (index) {
    if (!index || !curatedRows || !curatedRows.length) return []

    const entries = []
    const groupOrder = []
    const seenGroup = {}

    curatedRows.forEach((row, rowIndex) => {
      const source = String(row[CURATED_COLUMNS.source] || '').trim()
      const target = String(row[CURATED_COLUMNS.target] || '').trim()
      const title = String(row[CURATED_COLUMNS.title] || '').trim()
      if (!title || !source || !target) return

      const kind = String(row[CURATED_COLUMNS.kind] || '').trim()
      const main = String(row[CURATED_COLUMNS.main] || '').trim()
      const sub = String(row[CURATED_COLUMNS.sub] || '').trim()
      const asset = String(row[CURATED_COLUMNS.asset] || '').trim()

      const groupKey = kind + '||' + main + '||' + sub
      if (!seenGroup[groupKey]) {
        seenGroup[groupKey] = true
        groupOrder.push({ key: groupKey, kind: kind, main: main, sub: sub })
      }

      // Which carriers does this row actually stand for?
      let carriers = []
      if (source === ALL_CARRIERS) {
        carriers = (index.byNode.get(target) || []).filter(p => p.direction === 'in').map(p => p.carrier)
      } else if (target === ALL_CARRIERS) {
        carriers = (index.byNode.get(source) || []).filter(p => p.direction === 'uit').map(p => p.carrier)
      } else {
        carriers = Array.from(index.pairCarriers.get(source + '||' + target) || [])
      }
      carriers = Array.from(new Set(carriers)).sort()

      carriers.forEach(carrier => {
        const flowSource = source === ALL_CARRIERS ? ANY : source
        const flowTarget = target === ALL_CARRIERS ? ANY : target
        const param = index.byFlow.get(flowKey(flowSource, flowTarget, carrier))
        if (!param) return
        entries.push({
          id: rowIndex + '::' + carrier,
          key: param.key,
          groupKey: groupKey,
          kind: kind,
          main: main,
          sub: sub,
          asset: asset,
          title: title,
          carrier: carrier,
          carrierColor: param.carrierColor,
          multiCarrier: carriers.length > 1,
          source: flowSource,
          target: flowTarget,
          param: param
        })
      })
    })

    const used = new Set(entries.map(e => e.groupKey))
    return {
      entries: entries,
      groups: groupOrder.filter(g => used.has(g.key)),
      kinds: uniqueInOrder(entries.map(e => e.kind)),
      mains: uniqueInOrder(entries.map(e => e.main)),
      subs: uniqueInOrder(entries.map(e => e.sub))
    }
  }

  function uniqueInOrder (values) {
    const seen = new Set()
    const out = []
    values.forEach(v => {
      if (!v || seen.has(v)) return
      seen.add(v)
      out.push(v)
    })
    return out
  }

  /* ------------------------------------------------------------------ *
   * Styles
   * ------------------------------------------------------------------ */

  function injectStyles () {
    if (document.getElementById('dbb-styles')) return
    const style = el('style')
    style.id = 'dbb-styles'
    style.textContent = `
/* The viewer ships Milligram, which restyles every <button> and <input>
   (uppercase, fixed height, bottom margin). Neutralise that for our own
   controls; the component rules below have equal specificity and win by order. */
.dbb-btn,.dbb-tool,.dbb-close,.dbb-add,.dbb-link,.dbb-launch,.dbb-carrier-chip,.dbb-group-add,.dbb-choice,.dbb-template-remove,
.dbb-search,.dbb-check,.dbb-toggle button,.dbb-title,.dbb-sub{
  text-transform:none;letter-spacing:normal;height:auto;min-height:0;line-height:1.2;margin:0;
  box-shadow:none;text-decoration:none;box-sizing:border-box;font-weight:400}
.dbb-overlay,.dbb-overlay *,.dbb-picker,.dbb-picker *{box-sizing:border-box}
/* Several of our classes set display:flex, which outranks the UA rule for the
   hidden attribute — filter chips would stay visible once hidden. */
.dbb-overlay [hidden],.dbb-picker [hidden]{display:none!important}
.dbb-picker .dbb-row{user-select:none;-webkit-user-select:none}
.dbb-selection-clear{flex:none;margin-right:8px}

.dbb-launch{position:absolute;right:40px;bottom:10px;z-index:20;display:inline-flex;align-items:center;gap:7px;
  font-family:${FONT};font-size:12px;font-weight:400;line-height:1.2;color:#fff;background:#2B2B2B;border:0;
  border-radius:3px;padding:6px 12px;cursor:pointer;transition:background .18s ease}
.dbb-launch:hover{background:#4A4A4A}
.dbb-launch .dbb-launch-glyph{display:inline-grid;grid-template-columns:repeat(2,4px);gap:2px}
.dbb-launch .dbb-launch-glyph i{display:block;width:4px;height:4px;background:#F8D377}
.dbb-launch .dbb-launch-glyph i:nth-child(2){background:#7555F6}
.dbb-launch .dbb-launch-glyph i:nth-child(3){background:#3F88AE}
.dbb-launch .dbb-launch-glyph i:nth-child(4){background:#62D3A4}

.dbb-overlay{position:fixed;inset:0;z-index:4000;display:flex;align-items:center;justify-content:center;
  background:rgba(30,28,25,.42);font-family:${FONT};color:${INK.text}}
.dbb-modal{position:relative;display:flex;flex-direction:column;width:96vw;max-width:1780px;height:94vh;
  background:#FBFAF8;border-radius:6px;box-shadow:0 18px 50px rgba(0,0,0,.28);overflow:hidden}

.dbb-head{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;
  padding:22px 28px 18px;background:#fff;border-bottom:1px solid #EAE6E0}
.dbb-title{font-size:20px;font-weight:600;margin:0;letter-spacing:-.2px}
.dbb-sub{font-size:12px;color:${INK.muted};margin:5px 0 0}
.dbb-head-right{display:flex;align-items:center;gap:14px}

.dbb-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:12px 28px;
  background:#F3F0EB;border-bottom:1px solid #EAE6E0}
.dbb-toolbar-sep{width:1px;height:20px;background:#DCD7CF;margin:0 6px}
.dbb-toolbar > .dbb-label:first-child{min-width:62px}
.dbb-template-bar{background:#F8F6F2;padding-top:10px;padding-bottom:10px}
.dbb-template-chip{position:relative;display:inline-flex}
.dbb-overlay .dbb-template-remove{position:absolute;top:-7px;right:-7px;z-index:1;width:17px;height:17px;padding:0;margin:0;
  display:flex;align-items:center;justify-content:center;font-size:9px;line-height:1;border-radius:50%;
  background:#fff;color:#6F6A62;border:1px solid #DCD7CF;cursor:pointer;opacity:0;transition:opacity .15s ease}
.dbb-template-chip:hover .dbb-template-remove,.dbb-overlay .dbb-template-remove:focus-visible{opacity:1}
.dbb-template-reveal{align-self:center;margin-left:6px}
.dbb-save-status{display:inline-flex;align-items:center;gap:14px;margin-right:6px}
.dbb-status{display:inline-flex;align-items:center;gap:6px;font-size:11px;white-space:nowrap;cursor:default}
.dbb-status::before{content:'';flex:none;width:6px;height:6px;border-radius:50%}
.dbb-status.dbb-status-ok{color:${INK.muted}}
.dbb-status.dbb-status-ok::before{background:#8FB39A}
.dbb-status.dbb-status-warn{color:#9A6B2F}
.dbb-status.dbb-status-warn::before{background:#C98A4B}
/* Browser-kept sjablonen: amber = in no saved file or bundle yet, green = saved
   in one. Same colours as the save status next to Opslaan. */
.dbb-template-local::after,.dbb-template-saved::after{content:'';display:inline-block;width:6px;height:6px;
  border-radius:50%;background:#C98A4B;margin-left:7px;vertical-align:1px}
.dbb-template-saved::after{background:#8FB39A}
.dbb-save-body{padding:18px 22px 10px;display:flex;flex-direction:column;gap:16px;overflow-y:auto}
.dbb-field-label{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#6F6A62;margin-bottom:7px}
.dbb-field-label-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.dbb-field-label-row .dbb-link{font-size:11px;font-weight:400;letter-spacing:0;text-transform:none}
.dbb-field-hint{font-size:11px;color:${INK.muted};margin-top:6px}
.dbb-picker textarea.dbb-footnote-input{display:block;min-height:74px;resize:vertical;line-height:1.45;margin:0}
.dbb-note{font-size:11px;line-height:1.5;color:${INK.muted}}
.dbb-outcome{padding:10px 12px;background:#F3F0EB;border-radius:3px;color:#6F6A62}
.dbb-save-section{display:flex;flex-direction:column;gap:14px}
.dbb-choices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.dbb-choices.dbb-choices-2{grid-template-columns:repeat(2,minmax(0,1fr))}
@media (max-width:640px){.dbb-choices,.dbb-choices.dbb-choices-2{grid-template-columns:minmax(0,1fr)}}
.dbb-choice{display:flex;flex-direction:column;align-items:flex-start;gap:4px;text-align:left;cursor:pointer;
  padding:11px 12px;border:1px solid #DCD7CF;border-radius:4px;background:#fff;font-family:${FONT};
  transition:border-color .15s ease,background .15s ease}
.dbb-choice-title{font-size:13px;font-weight:600;line-height:1.35;color:${INK.text};white-space:normal}
.dbb-choice-desc{font-size:11px;line-height:1.4;color:${INK.muted};white-space:normal}
.dbb-choice{--dbb-bg:#fff;--dbb-fg:${INK.text};--dbb-bd:#DCD7CF}
.dbb-choice:hover{--dbb-bd:#B4ADA2}
.dbb-choice.dbb-on{--dbb-bg:#fff;--dbb-bd:#2B2B2B;border-color:#2B2B2B;box-shadow:inset 0 0 0 1px #2B2B2B}
.dbb-spacer{flex:1}

.dbb-body{flex:1;overflow-y:auto;padding:0 28px 40px}
.dbb-section{padding:22px 0 0}
.dbb-overlay .dbb-dash-title{display:block;width:100%;margin:0;height:auto;padding:4px 0 6px;
  font-family:${FONT};font-size:24px;font-weight:600;letter-spacing:-.3px;line-height:1.25;color:${INK.text};
  background:transparent;border:0;border-bottom:1px dashed transparent;border-radius:0;box-shadow:none;
  transition:border-color .15s ease}
.dbb-overlay .dbb-dash-title::placeholder{color:#B4ADA2;font-weight:400}
.dbb-overlay .dbb-dash-title:hover{border-bottom-color:#DCD7CF}
.dbb-overlay .dbb-dash-title:focus{border-bottom-color:#8A857D;outline:none}
.dbb-section-head{display:flex;align-items:baseline;gap:10px;margin-bottom:12px}
.dbb-section-head.dbb-tight{margin-bottom:8px}
.dbb-section-title{font-size:11px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:#6F6A62}
.dbb-section-note{font-size:11px;color:${INK.muted}}

/* Group label sits left of its chips so each scenario group costs one row
   instead of two; long group names are clipped and kept in the tooltip. */
.dbb-scenario-grid{display:grid;grid-template-columns:190px minmax(0,1fr);
  column-gap:14px;row-gap:4px;align-items:start}
.dbb-scenario-group-label{font-size:11px;color:${INK.muted};line-height:22px;
  overflow:hidden;white-space:nowrap}
.dbb-chiprow{display:flex;flex-wrap:wrap;gap:4px}
.dbb-scenario-grid .dbb-chiprow{gap:3px}
.dbb-scenario-chip{font-size:11px;padding:3px 8px;line-height:16px}

.dbb-btn{font-family:${FONT};font-size:12px;font-weight:400;line-height:1.2;color:${INK.text};background:#fff;
  border:1px solid #DCD7CF;border-radius:3px;padding:5px 10px;cursor:pointer;transition:all .15s ease;white-space:nowrap}
.dbb-btn:hover{border-color:#B4ADA2}
.dbb-btn.dbb-on{background:#2B2B2B;border-color:#2B2B2B;color:#fff}
.dbb-btn.dbb-primary{background:#2B2B2B;border-color:#2B2B2B;color:#fff}
.dbb-btn.dbb-primary:hover{background:#4A4A4A;border-color:#4A4A4A}
.dbb-btn:disabled{opacity:.4;cursor:not-allowed}
.dbb-btn.dbb-tint{border-color:transparent}
.dbb-btn.dbb-tint.dbb-on{background:#2B2B2B!important;color:#fff}

.dbb-year{min-width:44px;text-align:center}

.dbb-toggle{display:inline-flex;align-items:center;background:#fff;border:1px solid #DCD7CF;border-radius:3px;overflow:hidden}
.dbb-toggle button{font-family:${FONT};font-size:12px;border:0;background:transparent;color:${INK.text};
  padding:5px 12px;cursor:pointer;transition:all .15s ease}
.dbb-toggle button.dbb-on{background:#2B2B2B;color:#fff}

.dbb-label{font-size:11px;color:${INK.muted};margin-right:2px}

.dbb-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start}
@media (max-width:900px){.dbb-grid{grid-template-columns:minmax(0,1fr)}}
.dbb-card{position:relative;background:#fff;border:1px solid #EAE6E0;border-radius:5px;height:320px;overflow:hidden}
.dbb-card.dbb-full,.dbb-add.dbb-full{grid-column:1/-1}
.dbb-card.dbb-full{height:390px}
.dbb-card canvas{display:block;width:100%;height:100%}
.dbb-seg-outline{position:absolute;z-index:1;pointer-events:none;border-radius:1px;
  box-shadow:0 0 0 1.5px rgba(43,43,43,.85)}
.dbb-overlay .dbb-tool-grip{cursor:grab}
.dbb-legend-ghost{position:fixed;z-index:4500;pointer-events:none;display:flex;align-items:center;gap:6px;
  padding:4px 9px;background:#fff;border:1px solid #DCD7CF;border-radius:3px;box-shadow:0 6px 16px rgba(0,0,0,.14);
  font-family:${FONT};font-size:11px;color:${INK.text};white-space:nowrap}
.dbb-legend-ghost i{display:block;width:9px;height:9px}
.dbb-legend-marker{position:absolute;z-index:2;width:2px;border-radius:1px;background:#2B2B2B;pointer-events:none}
.dbb-picker .dbb-move{margin-left:8px;text-decoration:none;font-size:13px;line-height:1}
.dbb-picker .dbb-move:disabled{opacity:.25;cursor:default}
.dbb-card.dbb-dragging{z-index:20;pointer-events:none;transition:none;
  box-shadow:0 18px 40px rgba(0,0,0,.18),0 2px 6px rgba(0,0,0,.08)}
.dbb-card.dbb-drop-target{outline:2px solid rgba(43,43,43,.6);outline-offset:3px}
body.dbb-card-drag-active,body.dbb-card-drag-active *{cursor:grabbing!important;user-select:none;-webkit-user-select:none}
.dbb-resize{position:absolute;left:0;right:0;bottom:0;height:11px;cursor:ns-resize;touch-action:none;
  display:flex;align-items:center;justify-content:center}
.dbb-resize::after{content:'';width:34px;height:2px;border-radius:1px;background:#DCD7CF;
  opacity:0;transition:opacity .15s ease,background .15s ease}
.dbb-card:hover .dbb-resize::after{opacity:1}
.dbb-resize:hover::after,.dbb-card.dbb-resizing .dbb-resize::after{opacity:1;background:#8A857D}
.dbb-card.dbb-snapped .dbb-resize::after{background:#2B2B2B;width:72px}
body.dbb-resizing-active{cursor:ns-resize;user-select:none;-webkit-user-select:none}

.dbb-card-tools{position:absolute;top:8px;right:8px;display:flex;gap:3px;opacity:0;transition:opacity .15s ease}
.dbb-card:hover .dbb-card-tools{opacity:1}
.dbb-tool{width:24px;height:24px;display:flex;align-items:center;justify-content:center;border:1px solid #E4E0D9;
  background:rgba(255,255,255,.94);border-radius:3px;cursor:pointer;color:#6F6A62;padding:0;transition:all .15s ease}
.dbb-tool:hover{border-color:#B4ADA2;color:${INK.text}}
.dbb-tool svg{width:13px;height:13px;display:block}

.dbb-add{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;height:320px;
  background:transparent;border:1px dashed #D2CCC2;border-radius:5px;cursor:pointer;color:#8A857D;
  font-family:${FONT};font-size:12px;transition:all .15s ease}
.dbb-add:hover{border-color:#8A857D;color:${INK.text};background:#fff}
.dbb-add span.dbb-plus{font-size:26px;font-weight:300;line-height:1}
.dbb-add.dbb-new-row{height:74px;flex-direction:row;gap:10px}
.dbb-add.dbb-new-row span.dbb-plus{font-size:20px}

.dbb-empty{padding:44px 0;text-align:center;color:${INK.muted};font-size:13px}

.dbb-close{width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:1px solid #E4E0D9;
  background:#fff;border-radius:3px;cursor:pointer;color:#6F6A62;font-size:16px;line-height:1;padding:0;transition:all .15s ease}
.dbb-close:hover{border-color:#B4ADA2;color:${INK.text}}

.dbb-chart-tooltip{position:fixed;z-index:4300;pointer-events:none;display:none;background:#2B2B2B;color:#fff;
  font-family:${FONT};font-size:11px;line-height:1.5;padding:6px 9px;border-radius:3px;box-shadow:0 4px 12px rgba(0,0,0,.2);
  width:max-content;max-width:calc(100vw - 16px);box-sizing:border-box}

.dbb-toast{position:fixed;left:50%;bottom:36px;transform:translateX(-50%);z-index:4400;background:#2B2B2B;color:#fff;
  font-family:${FONT};font-size:12px;padding:9px 16px;border-radius:3px;box-shadow:0 6px 20px rgba(0,0,0,.25);
  opacity:0;transition:opacity .2s ease;pointer-events:none}
.dbb-toast.dbb-show{opacity:1}
.dbb-toast.dbb-toast-interactive.dbb-show{pointer-events:auto}
.dbb-toast .dbb-toast-action,.dbb-toast .dbb-toast-action:hover,.dbb-toast .dbb-toast-action:focus{
  margin:0 0 0 16px;padding:0;height:auto;line-height:1.2;border:0;background:transparent;color:#F8D377;
  font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:normal;text-transform:none;
  text-decoration:underline;text-underline-offset:3px;cursor:pointer;box-shadow:none}

/* ---- parameter picker ---- */
.dbb-picker{position:fixed;inset:0;z-index:4200;display:flex;align-items:center;justify-content:center;
  background:rgba(30,28,25,.34);font-family:${FONT};color:${INK.text}}
.dbb-picker-modal{display:flex;flex-direction:column;width:min(1080px,92vw);height:min(760px,88vh);
  background:#FBFAF8;border-radius:6px;box-shadow:0 18px 50px rgba(0,0,0,.3);overflow:hidden}
.dbb-picker-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 22px 14px;
  background:#fff;border-bottom:1px solid #EAE6E0}
.dbb-picker-main{flex:1;display:flex;min-height:0}
.dbb-picker-side{width:262px;flex:none;border-right:1px solid #EAE6E0;background:#F3F0EB;
  display:flex;flex-direction:column;min-height:0;overflow-y:auto;overscroll-behavior:contain}
.dbb-picker-list{flex:1;overflow-y:auto;min-height:0}
.dbb-picker-foot{display:flex;align-items:center;gap:10px;padding:14px 22px;background:#fff;
  border-top:1px solid #EAE6E0;flex-wrap:nowrap}
/* The controls keep their size; only the selection label gives way, because a
   long parameter name would otherwise squeeze the toggles until they clip. */
.dbb-picker-foot .dbb-toggle,.dbb-picker-foot .dbb-label,.dbb-picker-foot .dbb-btn{flex:none}
.dbb-selection{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}

.dbb-search{width:100%;box-sizing:border-box;font-family:${FONT};font-size:13px;color:${INK.text};
  background:#fff;border:1px solid #DCD7CF;border-radius:3px;padding:8px 10px;outline:none}
.dbb-search:focus{border-color:#8A857D}

.dbb-filter-block{padding:14px 16px;border-bottom:1px solid #EAE6E0}
.dbb-filter-block:last-child{border-bottom:0}
.dbb-filter-block.dbb-filter-grow{border-bottom:0;flex:1;min-height:220px;display:flex;flex-direction:column}
.dbb-filter-reset{flex:none;padding:12px 16px;border-top:1px solid #EAE6E0}
.dbb-filter-reset .dbb-btn{width:100%}
.dbb-filter-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.dbb-filter-title{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#6F6A62}
.dbb-link{font-size:11px;color:#6F6A62;background:none;border:0;padding:0;cursor:pointer;text-decoration:underline;font-family:${FONT}}
.dbb-link:hover{color:${INK.text}}
.dbb-caret{font-size:12px;text-decoration:none;width:14px;text-align:left}
.dbb-nodelist{flex:1;overflow-y:auto;min-height:80px;background:#fff;border:1px solid #E4E0D9;border-radius:3px}
.dbb-check{display:flex;align-items:center;gap:7px;padding:5px 9px;font-size:12px;cursor:pointer;border-bottom:1px solid #F4F1EC}
.dbb-check:last-child{border-bottom:0}
.dbb-check:hover{background:#F7F5F1}
.dbb-check input{margin:0;accent-color:#2B2B2B}
.dbb-check span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dbb-check-id{margin-left:auto;padding-left:8px;font-size:10px;color:${INK.muted};
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;flex:none;max-width:46%}

.dbb-carrier-chip{display:inline-flex;align-items:center;gap:5px;font-family:${FONT};font-size:11px;color:${INK.text};
  background:#fff;border:1px solid #DCD7CF;border-radius:3px;padding:3px 8px;cursor:pointer;transition:all .15s ease}
.dbb-carrier-chip:hover{border-color:#B4ADA2}
.dbb-carrier-chip.dbb-on{background:#2B2B2B;border-color:#2B2B2B;color:#fff}
.dbb-dot{width:8px;height:8px;border-radius:1px;flex:none}

.dbb-group-head{position:sticky;top:0;z-index:1;background:#F3F0EB;border-bottom:1px solid #E4E0D9;
  padding:5px 22px;display:flex;align-items:baseline;gap:8px}
.dbb-group-add{align-self:center;width:22px;height:22px;flex:none;display:flex;align-items:center;justify-content:center;
  font-size:15px;line-height:1;color:#6F6A62;background:#fff;border:1px solid #DCD7CF;border-radius:3px;
  cursor:pointer;padding:0;transition:all .15s ease}
.dbb-group-add:hover{background:#2B2B2B;border-color:#2B2B2B;color:#fff}
.dbb-group-title{font-size:12px;font-weight:600}
.dbb-group-id{font-size:10px;color:${INK.muted};font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.dbb-row{display:flex;align-items:center;gap:10px;padding:7px 22px;cursor:pointer;border-bottom:1px solid #F4F1EC}
.dbb-row:hover{background:#F7F5F1}
.dbb-row.dbb-sel{background:#2B2B2B;color:#fff}
.dbb-row.dbb-sel .dbb-row-meta{color:#C9C3BA}
.dbb-row-name{flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dbb-row-meta{font-size:11px;color:${INK.muted};white-space:nowrap}
.dbb-badge{font-size:10px;letter-spacing:.05em;text-transform:uppercase;border:1px solid currentColor;
  border-radius:2px;padding:0 4px;opacity:.7}
/* Carrier ids are already lowercase identifiers — shouting them adds nothing. */
.dbb-badge-carrier{text-transform:none;letter-spacing:0}
/* Each chip keeps its own width but they share a right edge, so the titles
   after them still line up. */
.dbb-badge-slot{flex:none;min-width:118px;display:flex;justify-content:flex-end}
.dbb-hint{padding:22px;text-align:center;color:${INK.muted};font-size:12px}

/* ---- hover / focus ----
   Milligram paints every <button> with a grey fill on :hover AND :focus, at a
   higher specificity than a single class. The focus outlives the pointer, so a
   control stayed grey after being clicked. Each control publishes its own
   colours as custom properties and one scoped rule re-applies them; the
   properties still follow the normal cascade, so state classes keep working. */
.dbb-btn{--dbb-bg:#fff;--dbb-fg:${INK.text};--dbb-bd:#DCD7CF}
.dbb-btn:hover{--dbb-bd:#B4ADA2}
.dbb-btn.dbb-on{--dbb-bg:#2B2B2B;--dbb-fg:#fff;--dbb-bd:#2B2B2B}
.dbb-btn.dbb-primary{--dbb-bg:#2B2B2B;--dbb-fg:#fff;--dbb-bd:#2B2B2B}
.dbb-btn.dbb-primary:hover{--dbb-bg:#4A4A4A;--dbb-bd:#4A4A4A}
.dbb-btn.dbb-tint{--dbb-bd:transparent}
.dbb-toggle button{--dbb-bg:transparent;--dbb-fg:${INK.text};--dbb-bd:transparent}
.dbb-toggle button.dbb-on{--dbb-bg:#2B2B2B;--dbb-fg:#fff}
.dbb-carrier-chip{--dbb-bg:#fff;--dbb-fg:${INK.text};--dbb-bd:#DCD7CF}
.dbb-carrier-chip:hover{--dbb-bd:#B4ADA2}
.dbb-carrier-chip.dbb-on{--dbb-bg:#2B2B2B;--dbb-fg:#fff;--dbb-bd:#2B2B2B}
.dbb-tool{--dbb-bg:rgba(255,255,255,.94);--dbb-fg:#6F6A62;--dbb-bd:#E4E0D9}
.dbb-tool:hover{--dbb-fg:${INK.text};--dbb-bd:#B4ADA2}
.dbb-close{--dbb-bg:#fff;--dbb-fg:#6F6A62;--dbb-bd:#E4E0D9}
.dbb-close:hover{--dbb-fg:${INK.text};--dbb-bd:#B4ADA2}
.dbb-add{--dbb-bg:transparent;--dbb-fg:#8A857D;--dbb-bd:#D2CCC2}
.dbb-add:hover{--dbb-bg:#fff;--dbb-fg:${INK.text};--dbb-bd:#8A857D}
.dbb-group-add{--dbb-bg:#fff;--dbb-fg:#6F6A62;--dbb-bd:#DCD7CF}
.dbb-group-add:hover{--dbb-bg:#2B2B2B;--dbb-fg:#fff;--dbb-bd:#2B2B2B}
.dbb-template-remove{--dbb-bg:#fff;--dbb-fg:#6F6A62;--dbb-bd:#DCD7CF}
.dbb-template-remove:hover{--dbb-bg:#2B2B2B;--dbb-fg:#fff;--dbb-bd:#2B2B2B}
.dbb-link{--dbb-bg:transparent;--dbb-fg:#6F6A62;--dbb-bd:transparent}
.dbb-link:hover{--dbb-fg:${INK.text}}
.dbb-launch{--dbb-bg:#2B2B2B;--dbb-fg:#fff;--dbb-bd:transparent}
.dbb-launch:hover{--dbb-bg:#4A4A4A}

.dbb-overlay button:hover,.dbb-overlay button:focus,
.dbb-picker button:hover,.dbb-picker button:focus,
button.dbb-launch:hover,button.dbb-launch:focus{
  background-color:var(--dbb-bg,#fff);color:var(--dbb-fg,${INK.text});border-color:var(--dbb-bd,#DCD7CF)}

/* Milligram's input[type=...] selectors likewise outrank a single class. */
.dbb-overlay .dbb-search,.dbb-picker .dbb-search{background:#fff;border:1px solid #DCD7CF;
  border-radius:3px;padding:8px 10px;height:auto;color:${INK.text}}
.dbb-overlay .dbb-search:focus,.dbb-picker .dbb-search:focus{border-color:#8A857D;outline:none}
`
    document.head.appendChild(style)
  }

  /* ------------------------------------------------------------------ *
   * Toast + tooltip singletons
   * ------------------------------------------------------------------ */

  let toastEl = null
  let toastTimer = null

  // options.action / options.onAction add a button to the toast (used for
  // "restore the previous dashboard"); such a toast stays up a little longer.
  function toast (message, options) {
    if (!toastEl) {
      toastEl = el('div', 'dbb-toast')
      document.body.appendChild(toastEl)
    }
    toastEl.innerHTML = ''
    toastEl.appendChild(el('span', '', message))
    const hasAction = !!(options && options.action && options.onAction)
    if (hasAction) {
      const button = el('button', 'dbb-toast-action', options.action)
      button.type = 'button'
      button.addEventListener('click', function () {
        toastEl.classList.remove('dbb-show')
        options.onAction()
      })
      toastEl.appendChild(button)
    }
    toastEl.classList.toggle('dbb-toast-interactive', hasAction)
    toastEl.classList.add('dbb-show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toastEl.classList.remove('dbb-show'), hasAction ? 7000 : 2200)
  }

  /* ------------------------------------------------------------------ *
   * Previous dashboard — every replacement can be undone
   * ------------------------------------------------------------------ */

  function previousKey () {
    return STORAGE_PREFIX + 'previous.' + viewerName()
  }

  function readPrevious () {
    try {
      const config = JSON.parse(localStorage.getItem(previousKey()) || 'null')
      return isDashboardConfig(config) ? config : null
    } catch (e) {
      return null
    }
  }

  // Called just before the dashboard is replaced or cleared. An empty
  // dashboard is not worth restoring, so it leaves the stored one alone.
  function rememberPrevious () {
    if (!state.panels.length) return
    try { localStorage.setItem(previousKey(), JSON.stringify(serialiseState())) } catch (e) {}
    syncRestoreButton()
  }

  // Swaps the shown and the previous dashboard, so restoring twice gets back
  // to where you were. Deliberately not marked as saved: it may be unsaved work.
  function restorePrevious () {
    const previous = readPrevious()
    if (!previous) return
    const current = state.panels.length ? serialiseState() : null
    applyConfig(previous)
    saveState()
    syncUniformToggle()
    renderBody()
    try {
      if (current) localStorage.setItem(previousKey(), JSON.stringify(current))
      else localStorage.removeItem(previousKey())
    } catch (e) {}
    syncRestoreButton()
    toast('Vorig dashboard hersteld' + (previous.title ? ': “' + previous.title + '”' : ''),
      current ? { action: 'Ongedaan maken', onAction: restorePrevious } : null)
  }

  function restoreOffer () {
    return { action: 'Herstel laatst getoond dashboard', onAction: restorePrevious }
  }

  function syncRestoreButton () {
    const button = overlay && overlay.querySelector('#dbb-restore')
    if (!button) return
    const previous = readPrevious()
    button.hidden = !previous
    if (previous) {
      button.title = 'Zet ' + (previous.title ? '“' + previous.title + '”' : 'het vorige dashboard') +
        ' terug — het dashboard van vóór het laatste laden of wissen'
    }
  }

  let tooltipEl = null

  function showTooltip (html, x, y) {
    if (!tooltipEl) {
      tooltipEl = el('div', 'dbb-chart-tooltip')
      document.body.appendChild(tooltipEl)
    }
    tooltipEl.innerHTML = html
    tooltipEl.style.display = 'block'
    // As wide as its longest row, so names never wrap; it only wraps when the
    // window itself is narrower. Kept on screen: flipped to the left of the
    // pointer near the right edge, lifted near the bottom.
    const margin = 8
    const box = tooltipEl.getBoundingClientRect()
    let left = x + 14
    if (left + box.width > window.innerWidth - margin) left = x - 14 - box.width
    left = Math.max(margin, Math.min(left, window.innerWidth - margin - box.width))
    let top = y + 14
    if (top + box.height > window.innerHeight - margin) top = window.innerHeight - margin - box.height
    top = Math.max(margin, top)
    tooltipEl.style.left = left + 'px'
    tooltipEl.style.top = top + 'px'
  }

  function hideTooltip () {
    if (tooltipEl) tooltipEl.style.display = 'none'
  }

  /* ------------------------------------------------------------------ *
   * Chart painting (canvas)
   * ------------------------------------------------------------------ */

  // Paints one panel into `ctx` at logical size w × h.
  // Returns hit-test regions so the DOM layer can drive a tooltip.
  function paintPanel (ctx, w, h, panel, entries, scenarioColors) {
    ctx.save()
    ctx.fillStyle = INK.surface
    ctx.fillRect(0, 0, w, h)

    const padX = 18
    const hits = []

    // ---- header ----
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = INK.text
    ctx.font = '600 ' + TITLE_FONT_SIZE + 'px ' + FONT
    const headerWidth = titleWidth(w) // leaves room for the hover tools
    const titleLines = wrapText(ctx, panelHeading(panel, entries), headerWidth, MAX_TITLE_LINES)
    titleLines.forEach((line, i) => ctx.fillText(line, padX, 27 + i * TITLE_LINE_HEIGHT))
    // Every extra title line pushes the rest of the panel down.
    const headerExtra = (titleLines.length - 1) * TITLE_LINE_HEIGHT

    ctx.font = '400 11px ' + FONT
    ctx.fillStyle = INK.muted
    ctx.fillText(truncate(ctx, panelSubtitle(panel, entries), headerWidth), padX, 45 + headerExtra)

    ctx.strokeStyle = '#EEEAE4'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(padX, 57.5 + headerExtra)
    ctx.lineTo(w - padX, 57.5 + headerExtra)
    ctx.stroke()
    // The title area doubles as the handle for swapping cards.
    hits.push({ x: 0, y: 0, w: w, h: 60 + headerExtra, header: true })

    // ---- footnote: below the chart, which keeps the space above it ----
    const note = footnoteLayout(ctx, panel, w)
    if (note.height) {
      ctx.font = '400 ' + FOOTNOTE_FONT_SIZE + 'px ' + FONT
      ctx.fillStyle = INK.muted
      note.lines.forEach((line, i) => ctx.fillText(line, padX, h - note.height + 13 + i * FOOTNOTE_LINE_HEIGHT))
      hits.push({ x: 0, y: h - note.height, w: w, h: note.height, footnote: true })
      h -= note.height
    }

    const live = entries.filter(e => e.param)
    if (!live.length) {
      drawPlaceholder(ctx, w, h, 'Deze parameter bestaat niet in het actieve diagram')
      ctx.restore()
      return hits
    }

    const scenarios = state.scenarios.filter(id => live.some(e => e.param.values[id]))
    if (!scenarios.length) {
      drawPlaceholder(ctx, w, h, 'Geen data voor de geselecteerde scenario’s')
      ctx.restore()
      return hits
    }

    if (chartTypeOf(panel) === 'bar') paintBars(ctx, w, h, panel, chartEntries(panel, live), scenarios, scenarioColors, hits, headerExtra)
    else paintLines(ctx, w, h, panel, live, scenarios, scenarioColors, hits, headerExtra)

    ctx.restore()
    return hits
  }

  // Line breaks typed in the footnote are kept; each paragraph word-wraps.
  function footnoteLayout (ctx, panel, w) {
    if (!panel.footnote) return { lines: [], height: 0 }
    ctx.save()
    ctx.font = '400 ' + FOOTNOTE_FONT_SIZE + 'px ' + FONT
    let lines = []
    panel.footnote.split(/\r?\n/).forEach(paragraph => {
      lines = lines.concat(wrapText(ctx, paragraph, Math.max(80, w - 36)))
    })
    ctx.restore()
    if (lines.length > MAX_FOOTNOTE_LINES) {
      lines = lines.slice(0, MAX_FOOTNOTE_LINES)
      lines[MAX_FOOTNOTE_LINES - 1] += ' …'
    }
    return { lines: lines, height: lines.length * FOOTNOTE_LINE_HEIGHT + 12 }
  }

  function drawPlaceholder (ctx, w, h, message) {
    ctx.font = '400 12px ' + FONT
    ctx.fillStyle = INK.muted
    ctx.textAlign = 'center'
    ctx.fillText(message, w / 2, h / 2 + 8)
    ctx.textAlign = 'left'
  }

  // Rounds a domain up to a pleasant tick step.
  function niceScale (min, max, targetTicks) {
    if (min === max) { max = min + 1 }
    const span = max - min
    const rough = span / Math.max(1, targetTicks)
    const mag = Math.pow(10, Math.floor(Math.log10(rough)))
    const norm = rough / mag
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag
    const niceMin = Math.floor(min / step) * step
    const niceMax = Math.ceil(max / step) * step
    const ticks = []
    for (let v = niceMin; v <= niceMax + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v)
    return { min: niceMin, max: niceMax, ticks: ticks, step: step }
  }

  // Wraps a list of labels into legend rows. Items keep their position so the
  // caller can map them back to a scenario or a series.
  // Ticks inside a domain that is fixed by the caller — the shared-scale
  // counterpart of niceScale, which is free to round the bounds outward.
  function ticksWithin (min, max, targetTicks) {
    if (min === max) max = min + 1
    const rough = (max - min) / Math.max(1, targetTicks)
    const mag = Math.pow(10, Math.floor(Math.log10(rough)))
    const norm = rough / mag
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag
    const ticks = []
    for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) {
      ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v)
    }
    return { min: min, max: max, ticks: ticks, step: step }
  }

  // Value range of a stacked bar panel at the focus year.
  function barExtent (entries, scenarios) {
    let min = 0
    let max = 0
    scenarios.forEach(id => {
      let positive = 0
      let negative = 0
      entries.forEach(entry => {
        const byYear = entry.param.values[id]
        const raw = byYear && byYear[state.focusYear]
        if (raw === undefined) return
        const value = convert(raw, entry.param)
        if (value < 0) negative += value
        else positive += value
      })
      if (negative < min) min = negative
      if (positive > max) max = positive
    })
    return { min: min, max: max }
  }

  // Value range of a line panel across every year it plots.
  // A line chart draws one line per scenario: with several series that line is
  // their sum, in the current unit. A year counts once any series has it.
  function lineTotals (entries, scenarios) {
    const years = uniqueYears(entries, scenarios)
    const totals = {}
    scenarios.forEach(id => {
      const byYear = {}
      entries.forEach(entry => {
        const values = entry.param.values[id]
        if (!values) return
        Object.keys(values).forEach(year => {
          byYear[year] = (byYear[year] || 0) + convert(values[year], entry.param)
        })
      })
      if (Object.keys(byYear).length) totals[id] = byYear
    })
    return { years: years, totals: totals }
  }

  function lineExtent (entries, scenarios) {
    let min = 0
    let max = 0
    const totals = lineTotals(entries, scenarios).totals
    Object.keys(totals).forEach(id => Object.keys(totals[id]).forEach(year => {
      const value = totals[id][year]
      if (value < min) min = value
      if (value > max) max = value
    }))
    return { min: min, max: max }
  }

  // Bar and line charts get their own shared domain, and so does each unit —
  // a kton CO₂ panel must not share an axis with one in PJ.
  function uniformGroupKey (panel, entries) {
    return chartTypeOf(panel) + '|' + unitLabel(entries[0].param)
  }

  function computeUniformDomains (index) {
    if (!state.uniformScale) return null

    const groups = {}
    state.panels.forEach(panel => {
      const entries = resolveSeries(index, panel).filter(e => e.param)
      if (!entries.length) return
      const scenarios = state.scenarios.filter(id => entries.some(e => e.param.values[id]))
      if (!scenarios.length) return

      const bar = chartTypeOf(panel) === 'bar'
      const extent = bar ? barExtent(chartEntries(panel, entries), scenarios) : lineExtent(entries, scenarios)
      const key = uniformGroupKey(panel, entries)
      const group = groups[key] || (groups[key] = { min: 0, max: 0, bar: bar })
      if (extent.min < group.min) group.min = extent.min
      if (extent.max > group.max) group.max = extent.max
    })

    // Round each shared domain outward once, so every panel in the group lands
    // on the same bounds and the same gridline values.
    Object.keys(groups).forEach(key => {
      const group = groups[key]
      if (group.min === 0 && group.max === 0) group.max = 1
      const nice = niceScale(group.min, group.max, group.bar ? 4 : 5)
      groups[key] = { min: nice.min, max: nice.max }
    })
    return groups
  }

  function uniformDomainFor (panel, entries) {
    if (!uniformDomains || !entries.length) return null
    return uniformDomains[uniformGroupKey(panel, entries)] || null
  }

  function legendLayout (ctx, labels, availableWidth) {
    ctx.font = '400 10px ' + FONT
    const rows = []
    let row = []
    let rowWidth = 0
    labels.forEach((label, index) => {
      const text = truncate(ctx, label, 190)
      const width = 10 + 5 + ctx.measureText(text).width + 14
      if (row.length && rowWidth + width > availableWidth) {
        rows.push(row)
        row = []
        rowWidth = 0
      }
      row.push({ index: index, text: text, width: width })
      rowWidth += width
    })
    if (row.length) rows.push(row)
    return rows
  }

  // `colors` is either an array indexed by item position or a lookup function.
  // Returns where every item landed, so the legend can be dragged to reorder.
  function paintLegend (ctx, rows, x, y, colors) {
    const colorFor = typeof colors === 'function' ? colors : (item => colors[item.index])
    const rects = []
    ctx.font = '400 10px ' + FONT
    rows.forEach((row, ri) => {
      let cx = x
      const cy = y + ri * 15
      row.forEach(item => {
        const color = colorFor(item) || '#8A857D'
        ctx.fillStyle = color
        ctx.fillRect(cx, cy - 7, 9, 9)
        ctx.fillStyle = INK.muted
        ctx.fillText(item.text, cx + 14, cy)
        rects.push({ index: item.index, row: ri, x: cx - 3, y: cy - 10, w: item.width - 8, h: 14, text: item.text, color: color })
        cx += item.width
      })
    })
    return rects
  }

  // Legend items of a multi-series graph become drag handles for their series.
  // Summed per carrier, an item stands for a carrier rather than a series.
  function pushLegendHits (hits, rects, entries, byCarrier) {
    rects.forEach(r => {
      const entry = entries[r.index]
      if (!entry) return
      hits.push(Object.assign({ legend: true, key: byCarrier ? entry.param.carrier : entry.spec }, r))
    })
  }

  // The list a legend drag reorders, in legend order.
  function legendKeys (panel) {
    if (!aggregatesByCarrier(panel)) return panel.series
    return chartEntries(panel, panel._entries || []).map(layer => layer.param.carrier)
  }

  // One line per scenario, coloured by scenario. Several series are summed
  // into that line; the tooltip and the copied data carry the same totals.
  function paintLines (ctx, w, h, panel, entries, scenarios, scenarioColors, hits, headerExtra) {
    const padX = 18
    const data = lineTotals(entries, scenarios)
    const years = data.years
    const totals = data.totals
    if (!years.length) return drawPlaceholder(ctx, w, h, 'Geen data beschikbaar')
    const plotted = scenarios.filter(id => totals[id])

    const domain = uniformDomainFor(panel, entries)
    const extent = lineExtent(entries, scenarios)
    if (extent.min === 0 && extent.max === 0) extent.max = 1

    // Reserve space for the legend before fixing the plot area.
    const legendRows = legendLayout(ctx, plotted.map(scenarioTitle), w - padX * 2)
    let legendHeight = legendRows.length * 15 + 6

    const top = 76 + (headerExtra || 0)
    let bottom = h - 28 - legendHeight

    // Dragged very short, the legend would leave nothing to plot in. The panel
    // title still names the parameter and scenario colours are shared across
    // the dashboard, so the legend is what gives way.
    let showLegend = true
    if (bottom - top < 46) {
      showLegend = false
      legendHeight = 0
      bottom = h - 28
    }
    if (bottom <= top + 16) return drawPlaceholder(ctx, w, h, 'Te weinig ruimte')

    // Fewer gridlines on a short plot, so tick labels never stack.
    const tickTarget = Math.max(2, Math.min(5, Math.floor((bottom - top) / 34)))
    const scale = domain
      ? ticksWithin(domain.min, domain.max, tickTarget)
      : niceScale(extent.min, extent.max, tickTarget)

    ctx.font = '400 10px ' + FONT
    let axisWidth = 0
    scale.ticks.forEach(t => { axisWidth = Math.max(axisWidth, ctx.measureText(formatTick(t, scale.step)).width) })

    const left = padX + axisWidth + 8
    const right = w - padX - 6

    const xFor = years.length === 1
      ? function () { return (left + right) / 2 }
      : function (year) { return left + (right - left) * (years.indexOf(year) / (years.length - 1)) }
    const yFor = function (value) {
      return bottom - (value - scale.min) / (scale.max - scale.min) * (bottom - top)
    }

    // ---- gridlines + y axis labels ----
    ctx.font = '400 10px ' + FONT
    ctx.textAlign = 'right'
    scale.ticks.forEach(t => {
      const y = Math.round(yFor(t)) + 0.5
      ctx.strokeStyle = t === 0 ? INK.axis : INK.grid
      ctx.beginPath()
      ctx.moveTo(left, y)
      ctx.lineTo(right, y)
      ctx.stroke()
      ctx.fillStyle = INK.muted
      ctx.fillText(formatTick(t, scale.step), left - 8, y + 3.5)
    })
    ctx.textAlign = 'left'

    // ---- x axis labels (thinned when crowded) ----
    ctx.fillStyle = INK.muted
    ctx.textAlign = 'center'
    const slotWidth = years.length > 1 ? (right - left) / (years.length - 1) : right - left
    const everyNth = Math.max(1, Math.ceil(30 / Math.max(1, slotWidth)))
    years.forEach((year, i) => {
      if (i % everyNth !== 0 && i !== years.length - 1) return
      ctx.fillText(String(year), xFor(year), bottom + 15)
    })
    ctx.textAlign = 'left'

    // ---- one line per scenario ----
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    plotted.forEach(id => {
      const byYear = totals[id]
      const color = scenarioColors[id] || '#8A857D'
      const points = years
        .filter(year => byYear[year] !== undefined)
        .map(year => ({ x: xFor(year), y: yFor(byYear[year]) }))
      if (!points.length) return

      ctx.strokeStyle = color
      ctx.lineWidth = 1.8
      ctx.beginPath()
      points.forEach((p, i) => { i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y) })
      ctx.stroke()

      ctx.fillStyle = color
      points.forEach(p => {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2)
        ctx.fill()
      })
    })

    // ---- hit regions: one column per year ----
    const half = (years.length > 1 ? slotWidth : right - left) / 2
    const heading = entries.length > 1 ? ' · som van ' + entries.length + ' reeksen' : ''
    years.forEach(year => {
      const cx = xFor(year)
      const lines = []
      plotted.forEach(id => {
        const value = totals[id][year]
        if (value === undefined) return
        lines.push('<div><span style="display:inline-block;width:8px;height:8px;background:' +
          (scenarioColors[id] || '#8A857D') + ';margin-right:6px"></span>' + scenarioTitle(id) +
          ': <b>' + formatNumber(value) + '</b></div>')
      })
      if (!lines.length) return
      hits.push({
        x: cx - half, y: top, w: half * 2, h: bottom - top,
        html: '<div style="font-weight:600;margin-bottom:3px">' + year + ' · ' + unitLabel(entries[0].param) + heading + '</div>' + lines.join('')
      })
    })

    if (showLegend) {
      paintLegend(ctx, legendRows, padX, h - legendHeight + 4, item => scenarioColors[plotted[item.index]])
    }
  }

  // Vertical budget of a bar chart: header, one block per bar, axis labels.
  const BAR_TOP = 74
  const BAR_BOTTOM_PAD = 30
  const BAR_BLOCK = 25 // 18px bar + 7px gap

  function barChartHeight (rowCount) {
    return BAR_TOP + rowCount * BAR_BLOCK + BAR_BOTTOM_PAD
  }

  function paintBars (ctx, w, h, panel, entries, scenarios, scenarioColors, hits, headerExtra) {
    const padX = 18
    const year = state.focusYear
    const stacked = entries.length > 1
    const seriesColors = buildSeriesColors(entries)

    // One row per scenario; with several series the row is a stack. Positive
    // and negative segments grow away from zero in opposite directions.
    const rows = []
    scenarios.forEach(id => {
      const segments = []
      entries.forEach((entry, i) => {
        const raw = entry.param.values[id] && entry.param.values[id][year]
        if (raw === undefined) return
        segments.push({ index: i, entry: entry, value: convert(raw, entry.param) })
      })
      if (!segments.length) return
      rows.push({
        id: id,
        segments: segments,
        total: segments.reduce((sum, seg) => sum + seg.value, 0)
      })
    })

    if (!rows.length) return drawPlaceholder(ctx, w, h, 'Geen data voor focusjaar ' + (year || '—'))

    const domain = uniformDomainFor(panel, entries)
    let scale
    if (domain) {
      scale = ticksWithin(domain.min, domain.max, 4)
    } else {
      const extent = barExtent(entries, scenarios)
      if (extent.min === 0 && extent.max === 0) extent.max = 1
      scale = niceScale(extent.min, extent.max, 4)
    }

    // The legend names the series, so it is only needed once there are several.
    const labels = seriesLabels(entries)
    const legendRows = stacked ? legendLayout(ctx, labels, w - padX * 2) : []
    const legendHeight = legendRows.length ? legendRows.length * 15 + 8 : 0

    const top = BAR_TOP + (headerExtra || 0)
    const bottom = h - BAR_BOTTOM_PAD - legendHeight
    const available = bottom - top

    // The card is sized to fit every bar, but a manual resize can still make it
    // too short — shrink the gap and the bars rather than run past the axis.
    if (available < 10) return drawPlaceholder(ctx, w, h, 'Te weinig ruimte')

    const slot = available / rows.length
    const gap = slot >= 12 ? 7 : slot >= 7 ? 3 : 1.5
    const barHeight = Math.max(1, Math.min(26, slot - gap))
    const blockHeight = barHeight + gap
    const usedHeight = rows.length * blockHeight - gap
    const startY = top + Math.max(0, (available - usedHeight) / 2)
    const labelFont = '400 ' + (barHeight < 13 ? 9 : 11) + 'px ' + FONT
    // Dragged very short, the rows no longer fit readable text — drop the
    // labels rather than overlap them, and give the bars the full width.
    const showLabels = blockHeight >= 10

    ctx.font = labelFont
    const labelWidth = showLabels ? Math.min(190, Math.max(90, w * 0.3)) : 0

    let valueWidth = 0
    if (showLabels) {
      rows.forEach(r => { valueWidth = Math.max(valueWidth, ctx.measureText(formatNumber(r.total)).width) })
    }

    const left = padX + labelWidth + (showLabels ? 10 : 0)
    const right = w - padX - valueWidth - 10
    if (right <= left + 20) return drawPlaceholder(ctx, w, h, 'Te weinig ruimte')

    const xFor = function (value) {
      return left + (value - scale.min) / (scale.max - scale.min) * (right - left)
    }
    const zeroX = xFor(0 >= scale.min && 0 <= scale.max ? 0 : scale.min)

    // ---- vertical gridlines ----
    ctx.font = '400 10px ' + FONT
    ctx.textAlign = 'center'
    scale.ticks.forEach(t => {
      const x = Math.round(xFor(t)) + 0.5
      ctx.strokeStyle = t === 0 ? INK.axis : INK.grid
      ctx.beginPath()
      ctx.moveTo(x, top - 6)
      ctx.lineTo(x, bottom)
      ctx.stroke()
      ctx.fillStyle = INK.muted
      ctx.fillText(formatTick(t, scale.step), x, bottom + 15)
    })
    ctx.textAlign = 'left'

    // ---- bars ----
    rows.forEach((row, i) => {
      const y = startY + i * blockHeight
      let positiveEdge = 0
      let negativeEdge = 0
      let barEnd = zeroX
      let barStart = zeroX

      row.segments.forEach(seg => {
        const from = seg.value < 0 ? negativeEdge : positiveEdge
        const to = from + seg.value
        if (seg.value < 0) negativeEdge = to
        else positiveEdge = to

        const x0 = Math.min(xFor(from), xFor(to))
        const segWidth = Math.max(seg.value === 0 ? 0 : 1, Math.abs(xFor(to) - xFor(from)))

        // A single series still honours the panel's scenario/drager choice.
        ctx.fillStyle = stacked
          ? seriesColors[seg.index]
          : (colorModeOf(panel) === 'carrier'
            ? (seg.entry.param.carrierColor || '#8A857D')
            : (scenarioColors[row.id] || '#8A857D'))
        ctx.fillRect(x0, y, segWidth, barHeight)
        seg.x0 = x0
        seg.width = segWidth

        barEnd = Math.max(barEnd, x0 + segWidth)
        barStart = Math.min(barStart, x0)
      })

      if (showLabels) {
        const textY = y + barHeight / 2 + (barHeight < 13 ? 3 : 4)
        ctx.font = labelFont
        ctx.fillStyle = INK.text
        ctx.textAlign = 'right'
        ctx.fillText(truncate(ctx, scenarioTitle(row.id), labelWidth), padX + labelWidth, textY)

        ctx.fillStyle = INK.muted
        if (row.total < 0) {
          ctx.fillText(formatNumber(row.total), barStart - 7, textY)
        } else {
          ctx.textAlign = 'left'
          ctx.fillText(formatNumber(row.total), barEnd + 7, textY)
        }
        ctx.textAlign = 'left'
      }

      const unit = unitLabel(row.segments[0].entry.param)
      const head = '<div style="font-weight:600;margin-bottom:3px">' + scenarioTitle(row.id) + ' · ' + year + '</div>'

      // `active` is the segment under the pointer: its line is picked out and
      // the others step back. With no active segment all lines read evenly.
      const tooltipFor = function (active) {
        let html = head
        if (!stacked) return html + '<div><b>' + formatNumber(row.total) + '</b> ' + unit + '</div>'
        row.segments
          .filter(seg => seg.index === active || !displaysAsZero(seg.value))
          .forEach(seg => {
            const style = active === null ? ''
              : seg.index === active
                ? 'background:rgba(255,255,255,.16);border-radius:2px;margin:1px -5px;padding:1px 5px;font-weight:600'
                : 'opacity:.55'
            html += '<div style="' + style + '"><span style="display:inline-block;width:8px;height:8px;background:' +
              seriesColors[seg.index] + ';margin-right:6px"></span>' +
              labels[seg.index] + ': <b>' + formatNumber(seg.value) + '</b></div>'
          })
        return html + '<div style="margin-top:3px">Totaal: <b>' + formatNumber(row.total) + '</b> ' + unit + '</div>'
      }

      // Segments first: the hover test takes the first region that contains
      // the pointer, and the row region below is the fallback for the rest.
      if (stacked) {
        row.segments.forEach(seg => {
          if (seg.width > 0) hits.push({ x: seg.x0, y: y, w: seg.width, h: barHeight, html: tooltipFor(seg.index), segment: true })
        })
      }
      hits.push({ x: padX, y: y - gap / 2, w: w - padX * 2, h: blockHeight, html: tooltipFor(null) })
    })

    if (legendRows.length) {
      const legendRects = paintLegend(ctx, legendRows, padX, h - legendHeight + 6, seriesColors)
      pushLegendHits(hits, legendRects, entries, aggregatesByCarrier(panel))
    }
  }

  /* ------------------------------------------------------------------ *
   * Panel rendering + interaction
   * ------------------------------------------------------------------ */

  const ICON = {
    copy: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="5.5" y="5.5" width="8" height="8" rx="1"/><path d="M10.5 3.5h-7a1 1 0 0 0-1 1v7"/></svg>',
    swap: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2.5 5.5h9l-2.5-2.5M13.5 10.5h-9l2.5 2.5"/></svg>',
    color: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 2.2c2.9 3.2 4.4 5.3 4.4 7a4.4 4.4 0 0 1-8.8 0c0-1.7 1.5-3.8 4.4-7z"/></svg>',
    wide: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2.5" y="4.5" width="11" height="7" rx="1"/><path d="M8 4.5v7"/></svg>',
    edit: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M11 2.5l2.5 2.5-8 8H3v-2.5z"/></svg>',
    table: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2.5" y="3.5" width="11" height="9" rx="1"/><path d="M2.5 6.5h11M2.5 9.5h11M6.5 6.5v6"/></svg>',
    grip: '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="6" cy="4" r="1.15"/><circle cx="10" cy="4" r="1.15"/><circle cx="6" cy="8" r="1.15"/><circle cx="10" cy="8" r="1.15"/><circle cx="6" cy="12" r="1.15"/><circle cx="10" cy="12" r="1.15"/></svg>',
    text: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2.5 3.5h8M6.5 3.5v7M9.5 10.5h4M9.5 13h4"/></svg>',
    sum: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 3.5H4.5L8.5 8l-4 4.5H12"/></svg>',
    plus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 3v10M3 8h10"/></svg>',
    remove: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 4l8 8M12 4l-8 8"/></svg>'
  }

  function toolButton (icon, title, handler) {
    const button = el('button', 'dbb-tool')
    button.type = 'button'
    button.innerHTML = icon
    button.title = title
    button.addEventListener('click', function (event) {
      event.stopPropagation()
      handler()
    })
    return button
  }

  function renderPanelCard (panel, index, scenarioColors) {
    const card = el('div', 'dbb-card' + (panel.width === 'full' ? ' dbb-full' : ''))
    const canvas = el('canvas')
    card.appendChild(canvas)

    const tools = el('div', 'dbb-card-tools')
    if (state.panels.length > 1) {
      const grip = el('button', 'dbb-tool dbb-tool-grip')
      grip.type = 'button'
      grip.innerHTML = ICON.grip
      grip.title = 'Sleep naar een andere grafiek om ze te verwisselen'
      grip.setAttribute('aria-label', grip.title)
      grip.addEventListener('pointerdown', function (event) {
        event.stopPropagation()
        startCardDrag(panel, event)
      })
      grip.addEventListener('click', function (event) {
        event.stopPropagation()
        if (Date.now() > suppressGripClickUntil) toast('Sleep deze knop, of de titel, naar een andere grafiek om ze te verwisselen')
      })
      tools.appendChild(grip)
    }
    tools.appendChild(toolButton(ICON.copy, 'Kopieer grafiek als afbeelding', () => copyPanelImage(panel, scenarioColors)))
    tools.appendChild(toolButton(ICON.table, 'Kopieer gegevens naar klembord', () => copyPanelData(panel)))
    tools.appendChild(toolButton(ICON.swap, 'Wissel tussen lijn- en staafgrafiek', () => {
      panel.chartType = chartTypeOf(panel) === 'bar' ? 'line' : 'bar'
      saveState()
      renderBody()
    }))
    // With several series the colours identify the series, so the
    // scenario/drager choice only applies while there is one.
    if (chartTypeOf(panel) === 'bar' && panelSeries(panel).length === 1) {
      tools.appendChild(toolButton(ICON.color,
        colorModeOf(panel) === 'carrier' ? 'Kleur per scenario' : 'Kleur per drager', () => {
          panel.colorBy = colorModeOf(panel) === 'carrier' ? 'scenario' : 'carrier'
          saveState()
          renderBody()
        }))
    }
    if (chartTypeOf(panel) === 'bar' && panelSeries(panel).length > 1) {
      tools.appendChild(toolButton(ICON.sum,
        panel.aggregate === 'carrier' ? 'Toon alle reeksen afzonderlijk' : 'Tel reeksen op per drager', () => {
          panel.aggregate = panel.aggregate === 'carrier' ? null : 'carrier'
          saveState()
          renderBody()
        }))
    }
    tools.appendChild(toolButton(ICON.plus, 'Data toevoegen aan deze grafiek',
      () => openPicker(panel, { addSeries: true })))
    tools.appendChild(toolButton(ICON.wide,
      panel.width === 'full' ? 'Naar halve breedte' : 'Naar volle breedte', () => {
        panel.width = panel.width === 'full' ? 'half' : 'full'
        saveState()
        renderBody()
      }))
    tools.appendChild(toolButton(ICON.text, 'Titel en voetnoot bewerken (of dubbelklik op de titel)',
      () => openPanelTextDialog(panel, 'title')))
    tools.appendChild(toolButton(ICON.edit,
      panelSeries(panel).length > 1 ? 'Reeksen beheren' : 'Andere parameter kiezen',
      () => {
        if (panelSeries(panel).length > 1) openSeriesManager(panel)
        else openPicker(panel, { seriesIndex: 0 })
      }))
    tools.appendChild(toolButton(ICON.remove, 'Verwijder grafiek', () => {
      state.panels = state.panels.filter(p => p.id !== panel.id)
      saveState()
      renderBody()
    }))
    card.appendChild(tools)

    panel._canvas = canvas
    panel._card = card
    panel._entries = resolveSeries(index, panel)
    // The canvas is painted on the next frame; until then the previous layout's
    // hover regions no longer match what is on screen, so start without any.
    panel._hits = []

    // A ring around the hovered bar segment, drawn on a layer above the canvas
    // so hovering never repaints the chart and copied images stay clean.
    const outline = el('div', 'dbb-seg-outline')
    outline.hidden = true
    card.appendChild(outline)
    panel._outline = outline

    canvas.addEventListener('mousemove', function (event) {
      const rect = canvas.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const hit = (panel._hits || []).find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
      if (hit && hit.html) showTooltip(hit.html, event.clientX, event.clientY)
      else hideTooltip()
      canvas.style.cursor = hit && (hit.legend || (hit.header && state.panels.length > 1)) ? 'grab' : ''
      if (hit && hit.segment) {
        outline.style.left = hit.x + 'px'
        outline.style.top = hit.y + 'px'
        outline.style.width = hit.w + 'px'
        outline.style.height = hit.h + 'px'
        outline.hidden = false
      } else {
        outline.hidden = true
      }
    })
    canvas.addEventListener('mouseleave', function () {
      hideTooltip()
      outline.hidden = true
    })
    canvas.addEventListener('pointerdown', function (event) {
      const rect = canvas.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const inside = r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
      const legendItem = (panel._hits || []).find(r => r.legend && inside(r))
      if (legendItem) return startLegendDrag(panel, legendItem, event)
      if (state.panels.length < 2) return
      if ((panel._hits || []).some(r => r.header && inside(r))) startCardDrag(panel, event)
    })

    canvas.addEventListener('dblclick', function (event) {
      const rect = canvas.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const hit = (panel._hits || []).find(r => (r.header || r.footnote) &&
        x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
      if (hit) openPanelTextDialog(panel, hit.footnote ? 'footnote' : 'title')
    })

    card.appendChild(makeResizeHandle(panel, scenarioColors))

    return card
  }

  // Title and footnote of one graph. An empty title falls back to the
  // automatic one, built from the series.
  function openPanelTextDialog (panel, focus) {
    hideTooltip()
    const automatic = panelHeading(Object.assign({}, panel, { title: null }), panel._entries || [])

    const overlayEl = el('div', 'dbb-picker')
    overlayEl.addEventListener('mousedown', function (event) {
      if (event.target === overlayEl) close()
    })
    // Escape closes this dialog only, not the dashboard underneath.
    overlayEl.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      close()
    })

    const modal = el('div', 'dbb-picker-modal')
    modal.style.cssText = 'width:min(620px,92vw);height:auto;max-height:88vh'
    overlayEl.appendChild(modal)

    const head = el('div', 'dbb-picker-head')
    const headLeft = el('div')
    headLeft.appendChild(el('h2', 'dbb-title', 'Titel en voetnoot'))
    headLeft.appendChild(el('div', 'dbb-sub', 'Tekst boven en onder deze grafiek'))
    head.appendChild(headLeft)
    const closeButton = el('button', 'dbb-close', '✕')
    closeButton.type = 'button'
    closeButton.addEventListener('click', close)
    head.appendChild(closeButton)
    modal.appendChild(head)

    const body = el('div', 'dbb-save-body')
    modal.appendChild(body)

    const titleField = el('div')
    const titleLabel = el('div', 'dbb-field-label dbb-field-label-row', 'Titel')
    const resetTitle = el('button', 'dbb-link', 'automatische titel')
    resetTitle.type = 'button'
    resetTitle.title = 'Terug naar: ' + automatic
    resetTitle.addEventListener('click', function () {
      titleInput.value = ''
      titleInput.focus()
      syncReset()
    })
    titleLabel.appendChild(resetTitle)
    titleField.appendChild(titleLabel)
    const titleInput = el('input', 'dbb-search')
    titleInput.type = 'text'
    titleInput.maxLength = MAX_TITLE_LENGTH
    titleInput.placeholder = automatic
    titleInput.value = panel.title || ''
    titleInput.addEventListener('input', syncReset)
    titleInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') save()
    })
    titleField.appendChild(titleInput)
    titleField.appendChild(el('div', 'dbb-field-hint', 'Leeg laten voor de automatische titel.'))
    body.appendChild(titleField)

    const noteField = el('div')
    noteField.appendChild(el('div', 'dbb-field-label', 'Voetnoot'))
    const noteInput = el('textarea', 'dbb-search dbb-footnote-input')
    noteInput.maxLength = MAX_FOOTNOTE_LENGTH
    noteInput.rows = 3
    noteInput.placeholder = 'Bijvoorbeeld een bron of een toelichting…'
    noteInput.value = panel.footnote || ''
    noteInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) save()
    })
    noteField.appendChild(noteInput)
    noteField.appendChild(el('div', 'dbb-field-hint', 'Staat onder de grafiek en gaat mee in afbeeldingen en exports.'))
    body.appendChild(noteField)

    const foot = el('div', 'dbb-picker-foot')
    foot.appendChild(el('div', 'dbb-spacer'))
    foot.appendChild(makeButton('Annuleren', close))
    foot.appendChild(makeButton('Opslaan', save, 'dbb-primary'))
    modal.appendChild(foot)

    document.body.appendChild(overlayEl)
    syncReset()
    const target = focus === 'footnote' ? noteInput : titleInput
    target.focus()
    target.setSelectionRange(target.value.length, target.value.length)

    function syncReset () {
      resetTitle.hidden = !titleInput.value.trim()
    }

    function close () {
      overlayEl.remove()
    }

    function save () {
      const title = cleanText(titleInput.value, MAX_TITLE_LENGTH)
      const footnote = cleanText(noteInput.value, MAX_FOOTNOTE_LENGTH)
      close()
      if (title === (panel.title || null) && footnote === (panel.footnote || null)) return
      panel.title = title
      panel.footnote = footnote
      saveState()
      renderBody()
    }
  }

  // Drag the bottom edge to set an explicit height; double-click to go back to
  // the automatic one.
  function makeResizeHandle (panel, scenarioColors) {
    const handle = el('div', 'dbb-resize')
    handle.title = 'Sleep om de hoogte aan te passen — dubbelklik voor automatisch'

    let startY = 0
    let startHeight = 0
    let pending = null
    let frame = 0

    function apply () {
      frame = 0
      if (pending === null) return
      panel.height = pending
      pending = null
      rowOf(panel).forEach(p => drawPanel(p, scenarioColors))
    }

    function onMove (event) {
      const dragged = clampPanelHeight(startHeight + (event.clientY - startY))
      const snapped = snapToNeighbour(panel, dragged)
      pending = snapped === null ? dragged : snapped
      if (panel._card) panel._card.classList.toggle('dbb-snapped', snapped !== null)
      if (!frame) frame = requestAnimationFrame(apply)
    }

    function onUp () {
      if (frame) { cancelAnimationFrame(frame); frame = 0 }
      apply()
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      document.body.classList.remove('dbb-resizing-active')
      if (panel._card) panel._card.classList.remove('dbb-resizing', 'dbb-snapped')
      saveState()
    }

    handle.addEventListener('pointerdown', function (event) {
      event.preventDefault()
      event.stopPropagation()
      hideTooltip()
      startY = event.clientY
      startHeight = panel._card.getBoundingClientRect().height
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
      document.addEventListener('pointercancel', onUp)
      document.body.classList.add('dbb-resizing-active')
      panel._card.classList.add('dbb-resizing')
    })

    handle.addEventListener('dblclick', function (event) {
      event.preventDefault()
      event.stopPropagation()
      panel.height = null
      saveState()
      rowOf(panel).forEach(p => drawPanel(p, scenarioColors))
      toast('Hoogte terug op automatisch')
    })

    return handle
  }

  // Mirrors the two-column flow in buildPanelSection: where each panel lands in
  // the grid, so a drag knows which graphs actually sit next to it.
  function panelCells () {
    const cells = {}
    let row = 0
    let column = 0
    state.panels.forEach(panel => {
      if (panel.width === 'full') {
        if (column === 1) { row++; column = 0 }
        cells[panel.id] = { row: row, from: 0, to: 2 }
        row++
      } else {
        cells[panel.id] = { row: row, from: column, to: column + 1 }
        if (column === 0) column = 1
        else { column = 0; row++ }
      }
    })
    return cells
  }

  // Heights of the graphs beside this one, or directly above or below it —
  // a diagonal neighbour shares no edge, so it is not a snap target.
  function adjacentHeights (panel) {
    const cells = panelCells()
    const cell = cells[panel.id]
    if (!cell) return []
    return state.panels
      .filter(other => {
        if (other.id === panel.id) return false
        const otherCell = cells[other.id]
        const rowGap = Math.abs(otherCell.row - cell.row)
        if (rowGap > 1) return false
        if (rowGap === 0) return true
        return cell.from < otherCell.to && otherCell.from < cell.to
      })
      // A graph in the same row follows this one; snap to what it needs itself.
      .map(other => cells[other.id].row === cell.row && !other.height
        ? autoPanelHeight(other)
        : panelPixelHeight(other))
  }

  // Latch onto a neighbour's height when the drag comes close, so rows line up
  // exactly instead of landing a few pixels off.
  function snapToNeighbour (panel, height) {
    let best = null
    let bestDistance = SNAP_DISTANCE
    adjacentHeights(panel).forEach(candidate => {
      const distance = Math.abs(candidate - height)
      if (distance <= bestDistance) {
        bestDistance = distance
        best = candidate
      }
    })
    return best
  }

  function clampPanelHeight (value) {
    return Math.max(MIN_PANEL_HEIGHT, Math.min(MAX_PANEL_HEIGHT, Math.round(value)))
  }

  // A bar chart needs one row per scenario, so the card grows instead of
  // clipping the bars that do not fit a fixed height. A height the user dragged
  // out by hand always wins; double-clicking the handle returns to automatic.
  // Legend height is whatever the real layout needs — a stack of a dozen series
  // wraps to several rows and would otherwise squeeze the plot away.
  function legendRowCount (labels, availableWidth) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
    return legendLayout(measureCtx, labels, availableWidth).length
  }

  function titleWidth (cardWidth) {
    return Math.max(80, cardWidth - 36 - 96)
  }

  // Extra height taken by a title that wraps past its first line.
  function titleExtraHeight (panel, cardWidth) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
    measureCtx.font = '600 ' + TITLE_FONT_SIZE + 'px ' + FONT
    const lines = wrapText(measureCtx, panelHeading(panel, panel._entries || []), titleWidth(cardWidth), MAX_TITLE_LINES)
    return (lines.length - 1) * TITLE_LINE_HEIGHT
  }

  // Graphs sharing a row always share a height, whatever the focus year does
  // to their bar count or legend. A height set by hand leads: the automatic
  // graphs in its row follow it. Otherwise the row takes the tallest
  // automatic height, so nothing is squeezed.
  function panelPixelHeight (panel) {
    if (panel.height) return clampPanelHeight(panel.height)
    const row = rowOf(panel)
    const manual = row.filter(p => p.height).map(p => clampPanelHeight(p.height))
    if (manual.length) return Math.max.apply(null, manual)
    return Math.max.apply(null, row.map(autoPanelHeight))
  }

  function rowOf (panel) {
    const cells = panelCells()
    const cell = cells[panel.id]
    if (!cell) return [panel]
    return state.panels.filter(p => cells[p.id] && cells[p.id].row === cell.row)
  }

  // The height a graph needs on its own.
  function autoPanelHeight (panel) {
    const cardWidth = panel._card
      ? panel._card.getBoundingClientRect().width
      : (panel.width === 'full' ? 880 : 430)
    // A wrapped title adds lines above the chart; the card grows by the same
    // amount so the chart itself keeps its size.
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
    const extra = titleExtraHeight(panel, cardWidth) + footnoteLayout(measureCtx, panel, cardWidth).height
    const base = (panel.width === 'full' ? 390 : 320) + extra
    const entries = (panel._entries || []).filter(e => e.param)
    if (!entries.length) return clampPanelHeight(base)

    const layers = chartEntries(panel, entries)
    const legend = layers.length > 1
      ? legendRowCount(seriesLabels(layers), Math.max(120, cardWidth - 36)) * 15 + 14
      : 0

    if (chartTypeOf(panel) !== 'bar') {
      // One legend item per scenario; the base height already holds one row.
      const plotted = state.scenarios.filter(id => entries.some(e => e.param.values[id]))
      const rows = legendRowCount(plotted.map(scenarioTitle), Math.max(120, cardWidth - 36))
      return clampPanelHeight(Math.max(base, base + (rows - 1) * 15))
    }

    const rows = state.scenarios.filter(id => entries.some(e => {
      const byYear = e.param.values[id]
      return byYear && byYear[state.focusYear] !== undefined
    })).length
    if (!rows) return base
    return clampPanelHeight(Math.max(base, barChartHeight(rows) + legend + extra))
  }

  /* ---------------- swapping cards by dragging ---------------- */

  let cardDrag = null
  let suppressGripClickUntil = 0
  const DRAG_THRESHOLD = 5 // px before a press becomes a drag, so clicks stay clicks

  function startCardDrag (panel, event) {
    if (event.button !== undefined && event.button !== 0) return
    const body = overlay && overlay.querySelector('#dbb-body')
    if (!panel._card || !body || cardDrag) return
    event.preventDefault()
    cardDrag = {
      panel: panel,
      card: panel._card,
      body: body,
      startX: event.clientX,
      startY: event.clientY,
      startScroll: body.scrollTop,
      x: event.clientX,
      y: event.clientY,
      active: false,
      target: null,
      frame: 0
    }
    document.addEventListener('pointermove', onCardDragMove)
    document.addEventListener('pointerup', onCardDragEnd)
    document.addEventListener('pointercancel', cancelCardDrag)
    document.addEventListener('keydown', onCardDragKey, true)
  }

  function onCardDragMove (event) {
    const drag = cardDrag
    if (!drag) return
    drag.x = event.clientX
    drag.y = event.clientY
    if (!drag.active) {
      if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < DRAG_THRESHOLD) return
      drag.active = true
      hideTooltip()
      if (drag.panel._outline) drag.panel._outline.hidden = true
      drag.card.classList.add('dbb-dragging')
      document.body.classList.add('dbb-card-drag-active')
      drag.frame = requestAnimationFrame(cardDragTick)
    }
    positionDraggedCard()
    updateDropTarget()
  }

  // The card follows the pointer; scrolling the dashboard mid-drag is added in
  // so it stays under the pointer.
  function positionDraggedCard () {
    const drag = cardDrag
    const dx = drag.x - drag.startX
    const dy = drag.y - drag.startY + (drag.body.scrollTop - drag.startScroll)
    drag.card.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'
  }

  // The dragged card ignores the pointer, so whatever lies beneath it is found.
  function updateDropTarget () {
    const drag = cardDrag
    const under = document.elementFromPoint(drag.x, drag.y)
    const card = under && under.closest ? under.closest('.dbb-card') : null
    const target = card && card !== drag.card ? card : null
    if (target === drag.target) return
    if (drag.target) drag.target.classList.remove('dbb-drop-target')
    drag.target = target
    if (target) target.classList.add('dbb-drop-target')
  }

  // Held near the top or bottom edge, the dashboard scrolls towards cards that
  // are out of view.
  function cardDragTick () {
    const drag = cardDrag
    if (!drag || !drag.active) return
    const rect = drag.body.getBoundingClientRect()
    const edge = 60
    let speed = 0
    if (drag.y < rect.top + edge) speed = -Math.ceil((rect.top + edge - drag.y) / 4)
    else if (drag.y > rect.bottom - edge) speed = Math.ceil((drag.y - (rect.bottom - edge)) / 4)
    if (speed) {
      drag.body.scrollTop += speed
      positionDraggedCard()
      updateDropTarget()
    }
    drag.frame = requestAnimationFrame(cardDragTick)
  }

  function finishCardDrag () {
    const drag = cardDrag
    if (!drag) return null
    cardDrag = null
    cancelAnimationFrame(drag.frame)
    document.removeEventListener('pointermove', onCardDragMove)
    document.removeEventListener('pointerup', onCardDragEnd)
    document.removeEventListener('pointercancel', cancelCardDrag)
    document.removeEventListener('keydown', onCardDragKey, true)
    document.body.classList.remove('dbb-card-drag-active')
    drag.card.classList.remove('dbb-dragging')
    drag.card.style.transform = ''
    if (drag.target) drag.target.classList.remove('dbb-drop-target')
    if (drag.active) suppressGripClickUntil = Date.now() + 300
    return drag
  }

  function cancelCardDrag () {
    finishCardDrag()
  }

  function onCardDragKey (event) {
    if (event.key !== 'Escape') return
    // Escape ends the drag only; it must not also close the dashboard.
    event.stopPropagation()
    cancelCardDrag()
  }

  function onCardDragEnd () {
    const drag = finishCardDrag()
    if (!drag || !drag.active || !drag.target) return
    const from = state.panels.indexOf(drag.panel)
    const to = state.panels.findIndex(p => p._card === drag.target)
    if (from < 0 || to < 0) return
    swapPanels(from, to, true)
  }

  // Each card keeps its own width and settings; only their places change.
  function swapPanels (a, b, offerUndo) {
    const list = state.panels
    const held = list[a]
    list[a] = list[b]
    list[b] = held
    saveState()
    renderBody()
    if (offerUndo) toast('Grafieken verwisseld', { action: 'Ongedaan maken', onAction: function () { swapPanels(a, b, false) } })
  }

  /* ---------------- reordering series by dragging the legend ---------------- */

  let legendDrag = null

  function startLegendDrag (panel, item, event) {
    if (event.button !== undefined && event.button !== 0) return
    if (legendDrag || cardDrag) return
    event.preventDefault()
    event.stopPropagation()
    legendDrag = { panel: panel, item: item, startX: event.clientX, startY: event.clientY, active: false, drop: null, ghost: null, marker: null }
    document.addEventListener('pointermove', onLegendDragMove)
    document.addEventListener('pointerup', onLegendDragEnd)
    document.addEventListener('pointercancel', finishLegendDrag)
    document.addEventListener('keydown', onLegendDragKey, true)
  }

  function onLegendDragMove (event) {
    const drag = legendDrag
    if (!drag) return
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD) return
      drag.active = true
      hideTooltip()
      if (drag.panel._outline) drag.panel._outline.hidden = true
      document.body.classList.add('dbb-card-drag-active')
      drag.ghost = el('div', 'dbb-legend-ghost')
      const swatch = el('i')
      swatch.style.background = drag.item.color
      drag.ghost.appendChild(swatch)
      drag.ghost.appendChild(el('span', '', drag.item.text))
      document.body.appendChild(drag.ghost)
      drag.marker = el('div', 'dbb-legend-marker')
      drag.panel._card.appendChild(drag.marker)
    }
    drag.ghost.style.left = (event.clientX + 12) + 'px'
    drag.ghost.style.top = (event.clientY + 10) + 'px'
    drag.drop = legendDropAt(drag.panel, event.clientX, event.clientY)
    drag.marker.hidden = !drag.drop
    if (drag.drop) {
      drag.marker.style.left = drag.drop.x + 'px'
      drag.marker.style.top = drag.drop.y + 'px'
      drag.marker.style.height = drag.drop.h + 'px'
    }
  }

  // Where a dropped item would go: in the legend row nearest the pointer,
  // before the first item whose centre lies right of it. Outside the graph
  // there is no drop, so releasing there cancels.
  function legendDropAt (panel, clientX, clientY) {
    const r = panel._canvas.getBoundingClientRect()
    if (clientX < r.left - 16 || clientX > r.right + 16 || clientY < r.top - 16 || clientY > r.bottom + 16) return null
    const x = clientX - r.left
    const y = clientY - r.top
    const items = (panel._hits || []).filter(h => h.legend)
    if (!items.length) return null
    const rows = {}
    items.forEach(it => { (rows[it.row] = rows[it.row] || []).push(it) })
    let row = null
    let best = Infinity
    Object.keys(rows).forEach(key => {
      const distance = Math.abs(y - (rows[key][0].y + rows[key][0].h / 2))
      if (distance < best) { best = distance; row = rows[key] }
    })
    const keys = legendKeys(panel)
    const before = row.find(it => x < it.x + it.w / 2)
    if (before) return { pos: keys.indexOf(before.key), x: before.x - 3, y: before.y, h: before.h }
    const last = row[row.length - 1]
    return { pos: keys.indexOf(last.key) + 1, x: last.x + last.w + 1, y: last.y, h: last.h }
  }

  function finishLegendDrag () {
    const drag = legendDrag
    if (!drag) return null
    legendDrag = null
    document.removeEventListener('pointermove', onLegendDragMove)
    document.removeEventListener('pointerup', onLegendDragEnd)
    document.removeEventListener('pointercancel', finishLegendDrag)
    document.removeEventListener('keydown', onLegendDragKey, true)
    document.body.classList.remove('dbb-card-drag-active')
    if (drag.ghost) drag.ghost.remove()
    if (drag.marker) drag.marker.remove()
    return drag
  }

  function onLegendDragKey (event) {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    finishLegendDrag()
  }

  function onLegendDragEnd () {
    const drag = finishLegendDrag()
    if (!drag || !drag.active || !drag.drop) return
    const keys = legendKeys(drag.panel)
    const from = keys.indexOf(drag.item.key)
    let to = drag.drop.pos
    if (from < 0 || to < 0) return
    if (to > from) to -= 1
    if (to === from) return
    if (aggregatesByCarrier(drag.panel)) moveCarrier(drag.panel, keys, from, to)
    else moveSeries(drag.panel, from, to, true)
  }

  // Stack and legend order of the carrier sums; the series keep their order.
  function moveCarrier (panel, carriers, from, to) {
    const previous = panel.carrierOrder ? panel.carrierOrder.slice() : null
    const order = carriers.slice()
    order.splice(to, 0, order.splice(from, 1)[0])
    panel.carrierOrder = order
    saveState()
    renderBody()
    toast('Volgorde aangepast', { action: 'Ongedaan maken', onAction: function () {
      panel.carrierOrder = previous
      saveState()
      renderBody()
    } })
  }

  // Series order is stack order and legend order at once.
  function moveSeries (panel, from, to, offerUndo) {
    const previous = panel.series.slice()
    const moved = panel.series.splice(from, 1)[0]
    panel.series.splice(to, 0, moved)
    saveState()
    renderBody()
    if (offerUndo) {
      toast('Volgorde aangepast', { action: 'Ongedaan maken', onAction: function () {
        panel.series = previous
        saveState()
        renderBody()
      } })
    }
  }

  function drawPanel (panel, scenarioColors) {
    const canvas = panel._canvas
    if (!canvas || !panel._card) return
    if (panel._outline) panel._outline.hidden = true
    panel._card.style.height = panelPixelHeight(panel) + 'px'
    // The "+" slot beside a half-width graph matches its height, also while
    // the graph is being resized.
    if (panel._addTile) panel._addTile.style.height = panel._card.style.height
    const rect = panel._card.getBoundingClientRect()
    // Must track the card exactly: a floor here would paint outside the box and
    // silently clip whatever sits at the bottom of the chart.
    const w = Math.max(1, Math.round(rect.width))
    const h = Math.max(1, Math.round(rect.height))
    const dpr = window.devicePixelRatio || 1

    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'

    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    panel._hits = paintPanel(ctx, w, h, panel, panel._entries || [], scenarioColors)
  }

  function copyPanelImage (panel, scenarioColors) {
    panel._card.style.height = panelPixelHeight(panel) + 'px'
    const rect = panel._card.getBoundingClientRect()
    // Must track the card exactly: a floor here would paint outside the box and
    // silently clip whatever sits at the bottom of the chart.
    const w = Math.max(1, Math.round(rect.width))
    const h = Math.max(1, Math.round(rect.height))
    const scale = 2

    const offscreen = document.createElement('canvas')
    offscreen.width = w * scale
    offscreen.height = h * scale
    const ctx = offscreen.getContext('2d')
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    paintPanel(ctx, w, h, panel, panel._entries || [], scenarioColors)

    const filename = 'flux-' + panelHeading(panel, panel._entries || []).replace(/[^\w-]+/g, '-').slice(0, 60).toLowerCase() + '.png'

    offscreen.toBlob(function (blob) {
      if (!blob) return toast('Kopiëren mislukt')
      if (navigator.clipboard && window.ClipboardItem) {
        navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          .then(() => toast('Grafiek gekopieerd naar klembord'))
          .catch(() => downloadBlob(blob, filename, 'Klembord niet beschikbaar — afbeelding gedownload'))
      } else {
        downloadBlob(blob, filename, 'Klembord niet beschikbaar — afbeelding gedownload')
      }
    }, 'image/png')
  }

  // The graph's data as a tab-separated table, in the current unit — the same
  // rows and columns the graph shows. Decimal comma and no thousands separator,
  // so Dutch-locale spreadsheets read the cells as numbers.
  function panelDataText (panel) {
    const entries = chartEntries(panel, panel._entries || [])
    if (!entries.length) return null
    const scenarios = state.scenarios.filter(id => entries.some(e => e.param.values[id]))
    const labels = seriesLabels(entries)
    const cell = value => String(value === undefined || value === null ? '' : value).replace(/[\t\r\n]+/g, ' ')
    const num = (raw, param) => raw === undefined ? '' : String(round(convert(raw, param))).replace('.', ',')
    const lines = [cell(panelHeading(panel, panel._entries || [])), 'Eenheid\t' + unitLabel(entries[0].param)]

    if (chartTypeOf(panel) === 'bar') {
      const year = state.focusYear
      lines.push('Jaar\t' + year, '')
      const stacked = entries.length > 1
      lines.push(['Scenario'].concat(stacked ? labels.concat('Totaal') : labels).map(cell).join('\t'))
      scenarios.forEach(id => {
        const raws = entries.map(e => (e.param.values[id] || {})[year])
        if (raws.every(r => r === undefined)) return
        const row = [scenarioTitle(id)].concat(raws.map((r, i) => num(r, entries[i].param)))
        if (stacked) {
          const total = raws.reduce((sum, r, i) => r === undefined ? sum : sum + convert(r, entries[i].param), 0)
          row.push(String(round(total)).replace('.', ','))
        }
        lines.push(row.map(cell).join('\t'))
      })
    } else {
      const data = lineTotals(entries, scenarios)
      if (entries.length > 1) lines.push('Som van\t' + labels.map(cell).join('; '))
      lines.push('', ['Scenario'].concat(data.years).map(cell).join('\t'))
      scenarios.forEach(id => {
        const byYear = data.totals[id]
        if (!byYear) return
        const row = [scenarioTitle(id)].concat(data.years.map(y =>
          byYear[y] === undefined ? '' : String(round(byYear[y])).replace('.', ',')))
        lines.push(row.map(cell).join('\t'))
      })
    }
    if (panel.footnote) lines.push('', cell(panel.footnote))
    return lines.join('\n')
  }

  function copyText (text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text)
    // Older browsers and plain-http pages: the classic hidden-textarea route.
    return new Promise(function (resolve, reject) {
      const area = el('textarea')
      area.value = text
      area.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0'
      document.body.appendChild(area)
      area.select()
      try {
        if (document.execCommand('copy')) resolve()
        else reject(new Error('kopiëren geweigerd'))
      } catch (error) {
        reject(error)
      } finally {
        area.remove()
      }
    })
  }

  function copyPanelData (panel) {
    const text = panelDataText(panel)
    if (!text) return toast('Geen gegevens om te kopiëren')
    copyText(text)
      .then(() => toast('Gegevens gekopieerd naar klembord'))
      .catch(() => toast('Kopiëren naar klembord is niet gelukt'))
  }

  function downloadBlob (blob, filename, message) {
    const url = URL.createObjectURL(blob)
    const link = el('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    if (message) toast(message)
  }

  /* ------------------------------------------------------------------ *
   * Main popup
   * ------------------------------------------------------------------ */

  function openDashboard () {
    injectStyles()
    if (overlay) return

    restoreState()
    ensureCuratedRows()
    ensureTemplates()

    const index = buildIndex()
    if (!index) {
      toast('De dataset is nog niet geladen')
      return
    }
    reconcileState(index)

    overlay = el('div', 'dbb-overlay')
    overlay.addEventListener('mousedown', function (event) {
      if (event.target === overlay) closeDashboard()
    })

    const modal = el('div', 'dbb-modal')
    overlay.appendChild(modal)

    modal.appendChild(buildHeader())
    modal.appendChild(buildToolbar())
    modal.appendChild(buildTemplateBar())

    const body = el('div', 'dbb-body')
    body.id = 'dbb-body'
    modal.appendChild(body)

    document.body.appendChild(overlay)
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onResize)
    window.addEventListener('unitChanged', onUnitChanged)

    renderBody()
    // Titles wrap by measured text width; redraw once the web font is in so the
    // line breaks (and card heights) use RO Sans rather than the fallback font.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(redrawPanels)
  }

  function closeDashboard () {
    if (picker) closePicker()
    if (!overlay) return
    overlay.remove()
    overlay = null
    hideTooltip()
    document.body.style.overflow = 'auto'
    document.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('resize', onResize)
    window.removeEventListener('unitChanged', onUnitChanged)
  }

  function onKeyDown (event) {
    if (event.key !== 'Escape') return
    if (picker) closePicker()
    else closeDashboard()
  }

  function onResize () {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(redrawPanels, 120)
  }

  function onUnitChanged () {
    const unitToggle = overlay && overlay.querySelector('[data-dbb-unit]')
    if (unitToggle) syncUnitToggle(unitToggle)
    redrawPanels()
  }

  function redrawPanels () {
    if (!overlay) return
    uniformDomains = computeUniformDomains(buildIndex())
    const colors = buildScenarioColors()
    state.panels.forEach(panel => drawPanel(panel, colors))
  }

  function buildHeader () {
    const head = el('div', 'dbb-head')

    const left = el('div')
    left.appendChild(el('h2', 'dbb-title', 'Dashboard samenstellen'))
    const diagram = (window.diagramConfigs || []).find(d => d.id === window.activeDiagramId)
    left.appendChild(el('div', 'dbb-sub',
      'Stel een eigen vergelijking samen op basis van ' + (diagram ? '“' + diagram.title + '”' : 'het actieve diagram') + '.'))
    head.appendChild(left)

    const right = el('div', 'dbb-head-right')

    const unitToggle = el('div', 'dbb-toggle')
    unitToggle.setAttribute('data-dbb-unit', '')
    ;['PJ', 'TWh'].forEach(unit => {
      const button = el('button', '', unit)
      button.type = 'button'
      button.dataset.unit = unit
      button.addEventListener('click', function () {
        if (activeUnit() === unit) return
        if (typeof currentUnit !== 'undefined') currentUnit = unit
        if (typeof window.persistCurrentUnit === 'function') window.persistCurrentUnit()
        else { syncUnitToggle(unitToggle); redrawPanels() }
      })
      unitToggle.appendChild(button)
    })
    syncUnitToggle(unitToggle)
    right.appendChild(unitToggle)

    // Shared axis bounds per chart type and unit, so panels can be compared
    // against one another instead of each filling its own axis.
    const uniformButton = el('button', 'dbb-btn', 'Schaal uniform')
    uniformButton.type = 'button'
    uniformButton.setAttribute('data-dbb-uniform-toggle', '')
    uniformButton.title = 'Geef alle staafgrafieken onderling dezelfde schaal, en alle lijngrafieken onderling dezelfde schaal'
    uniformButton.classList.toggle('dbb-on', !!state.uniformScale)
    uniformButton.addEventListener('click', function () {
      state.uniformScale = !state.uniformScale
      uniformButton.classList.toggle('dbb-on', state.uniformScale)
      saveState()
      redrawPanels()
    })
    right.appendChild(uniformButton)

    const close = el('button', 'dbb-close', '✕')
    close.type = 'button'
    close.title = 'Sluiten'
    close.addEventListener('click', closeDashboard)
    right.appendChild(close)

    head.appendChild(right)
    return head
  }

  function syncUnitToggle (toggle) {
    const unit = activeUnit()
    Array.from(toggle.querySelectorAll('button')).forEach(b => {
      b.classList.toggle('dbb-on', b.dataset.unit === unit)
    })
  }

  function buildToolbar () {
    const bar = el('div', 'dbb-toolbar')

    bar.appendChild(el('span', 'dbb-label', 'Focusjaar'))
    const yearWrap = el('div', 'dbb-chiprow')
    yearWrap.id = 'dbb-year-row'
    bar.appendChild(yearWrap)

    bar.appendChild(el('div', 'dbb-spacer'))

    bar.appendChild(makeButton('Exporteer data (XLSX)', exportDashboardData))
    bar.appendChild(el('div', 'dbb-toolbar-sep'))
    const status = el('span', 'dbb-save-status')
    status.id = 'dbb-save-status'
    status.hidden = true
    const cacheStatus = el('span', 'dbb-status')
    cacheStatus.dataset.status = 'cache'
    const fileStatus = el('span', 'dbb-status')
    fileStatus.dataset.status = 'file'
    status.appendChild(cacheStatus)
    status.appendChild(fileStatus)
    bar.appendChild(status)

    const save = makeButton('Opslaan', openSaveDialog, 'dbb-primary')
    save.title = 'Dit dashboard opslaan als sjabloon, naar een bestand, of volledig met alle sjablonen'
    bar.appendChild(save)
    const load = makeButton('Laden', openLoadDialog)
    load.title = 'Een dashboard of een bundel van dashboards inladen uit een bestand'
    bar.appendChild(load)

    const restore = makeButton('Herstel laatst getoond dashboard', restorePrevious)
    restore.id = 'dbb-restore'
    restore.hidden = true
    bar.appendChild(restore)
    bar.appendChild(el('div', 'dbb-toolbar-sep'))
    bar.appendChild(makeButton('Wis dashboard', function () {
      if (!state.panels.length) return
      rememberPrevious()
      state.panels = []
      saveState()
      renderBody()
      toast('Dashboard gewist', restoreOffer())
    }))

    return bar
  }

  // One button per template, under the toolbar. Hidden until templates exist,
  // so viewers without a template folder look exactly as before.
  function buildTemplateBar () {
    const bar = el('div', 'dbb-toolbar dbb-template-bar')
    bar.id = 'dbb-template-bar'
    renderTemplateBar(bar)
    return bar
  }

  function renderTemplateBar (target) {
    const bar = target || (overlay && overlay.querySelector('#dbb-template-bar'))
    if (!bar) return
    bar.innerHTML = ''
    bar.hidden = false
    bar.appendChild(el('span', 'dbb-label', 'Sjablonen'))

    const row = el('div', 'dbb-chiprow')
    if (templates === null) {
      row.appendChild(el('span', 'dbb-section-note', 'Laden…'))
    } else if (!templates.length) {
      row.appendChild(el('span', 'dbb-section-note', 'Nog geen sjablonen — maak er een via Opslaan'))
    } else {
      // Browser-kept sjablonen carry a dot in the colours of the save status:
      // amber while their current contents are in no file or bundle, green once
      // they are (saving a bundle puts them all on disk). Folder ones get none.
      const onDisk = new Set(readFileFingerprints())
      templates.forEach(template => {
        const button = makeButton(template.label, function () { loadTemplate(template) })
        let note = ''
        if (template.local) {
          const saved = onDisk.has(configFingerprint(template.config))
          button.classList.add(saved ? 'dbb-template-saved' : 'dbb-template-local')
          note = saved
            ? ' — in deze browser, en opgeslagen in een bestand of bundel'
            : ' — alleen in deze browser, nog niet in een bestand of bundel opgeslagen'
        }
        button.title = 'Laad sjabloon “' + template.label + '” (' + template.file + ')' + note

        const chip = el('span', 'dbb-template-chip')
        chip.appendChild(button)
        const remove = el('button', 'dbb-template-remove', '✕')
        remove.type = 'button'
        const inFolder = folderTemplates.some(t => t.file === template.file)
        remove.title = template.local
          ? (inFolder ? 'Jouw versie verwijderen (de versie uit de map komt terug)' : 'Sjabloon verwijderen')
          : 'Sjabloon verbergen in deze browser (het blijft in de map staan)'
        remove.setAttribute('aria-label', remove.title)
        remove.addEventListener('click', function (event) {
          event.stopPropagation()
          removeTemplate(template)
        })
        chip.appendChild(remove)
        row.appendChild(chip)
      })
    }

    const hidden = new Set(readHiddenTemplates())
    const hiddenCount = folderTemplates.filter(t => hidden.has(t.file) && !(templates || []).some(x => x.file === t.file)).length
    if (hiddenCount) {
      const reveal = el('button', 'dbb-link dbb-template-reveal', hiddenCount + ' verborgen — tonen')
      reveal.type = 'button'
      reveal.title = 'Toon de sjablonen uit de map die je in deze browser hebt verborgen'
      reveal.addEventListener('click', function () {
        writeHiddenTemplates([])
        refreshTemplates()
      })
      row.appendChild(reveal)
    }
    bar.appendChild(row)
  }

  function loadTemplate (template) {
    try {
      // A template replaces the whole dashboard; keep what was there so it can
      // be brought back.
      const hadDashboard = state.panels.length > 0
      rememberPrevious()
      applyLoadedConfig(JSON.parse(JSON.stringify(template.config)))
      state.sourceTemplate = template.file
      saveState()
      toast('Sjabloon “' + template.label + '” geladen', hadDashboard ? restoreOffer() : null)
    } catch (error) {
      toast('Kon sjabloon niet laden: ' + error.message)
    }
  }

  /* ---------------- saving templates ---------------- */

  function uniqueTemplateFile (title) {
    const base = 'flux-dashboard-' + (slugify(title) || 'sjabloon')
    const taken = new Set((templates || []).concat(folderTemplates).map(t => t.file.toLowerCase()))
    let name = base + '.json'
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = base + '-' + n + '.json'
    return name
  }

  // Sjablonen live in this browser's persistent storage; saving a bundle is
  // the way to take them anywhere else.
  function saveAsTemplate (file, title) {
    const config = serialiseState()
    config.title = title
    config.savedAt = new Date().toISOString()
    delete config.sourceTemplate

    const stored = writeLocalTemplates(readLocalTemplates().filter(t => t.file !== file).concat({ file: file, config: config }))
    if (!stored) throw new Error('de opslag van deze browser is vol of niet beschikbaar')
    templates = mergeLocalTemplates(folderTemplates)

    state.title = title
    state.sourceTemplate = file
    saveState()
    renderTemplateBar()
    renderBody()
  }

  async function saveAllTemplates () {
    if (typeof JSZip === 'undefined') return toast('ZIP-bibliotheek niet beschikbaar')
    await ensureTemplates()
    const zip = new JSZip()
    const folder = zip.folder(templateDir())
    ;(templates || []).forEach(t => folder.file(t.file, JSON.stringify(t.config, null, 2)))
    const current = serialiseState()
    delete current.sourceTemplate
    zip.file(BUNDLE_CURRENT, JSON.stringify(current, null, 2))

    const blob = await zip.generateAsync({ type: 'blob' })
    const stamp = new Date().toISOString().slice(0, 10)
    const count = (templates || []).length
    downloadBlob(blob, 'flux-dashboard-sjablonen-' + viewerName() + '-' + stamp + '.zip',
      'ZIP met ' + count + ' ' + (count === 1 ? 'sjabloon' : 'sjablonen') + ' en het huidige dashboard gedownload')

    // Every sjabloon in the bundle is now on disk, as is the shown dashboard.
    rememberFileConfigs((templates || []).map(t => t.config))
    markSavedToFile()
  }

  let lastSaveChoice = null // the option picked last time, for this session

  function openSaveDialog () {
    ensureTemplates().then(buildSaveDialog)
  }

  // One dialog for every way of saving: the title is shared, the choice below
  // it decides what "Opslaan" does.
  function buildSaveDialog () {
    const existing = templates || []
    const source = existing.find(t => t.file === state.sourceTemplate) || null
    const draft = {
      title: state.title || (source ? source.label : ''),
      choice: lastSaveChoice || 'template',
      mode: source ? 'overwrite' : 'new',
      target: source ? source.file : (existing[0] ? existing[0].file : null)
    }
    let busy = false

    const CHOICES = [
      ['template', 'Sla huidig getoond dashboard op als sjabloon', 'Bewaard in deze browser, in de balk Sjablonen'],
      ['file', 'Sla huidig getoond dashboard op als bestand', 'Dit dashboard als configuratiebestand (.json)'],
      ['bundle', 'Sla bundel van dashboards op als bestand', 'Dit dashboard plus alle sjablonen (.zip)']
    ]

    const overlayEl = el('div', 'dbb-picker')
    overlayEl.addEventListener('mousedown', function (event) {
      if (event.target === overlayEl) close()
    })
    const modal = el('div', 'dbb-picker-modal')
    modal.style.cssText = 'width:min(700px,92vw);height:auto;max-height:88vh'
    overlayEl.appendChild(modal)

    const head = el('div', 'dbb-picker-head')
    const headLeft = el('div')
    headLeft.appendChild(el('h2', 'dbb-title', 'Opslaan'))
    headLeft.appendChild(el('div', 'dbb-sub', 'Kies hoe je dit dashboard wilt bewaren'))
    head.appendChild(headLeft)
    const closeButton = el('button', 'dbb-close', '✕')
    closeButton.type = 'button'
    closeButton.addEventListener('click', close)
    head.appendChild(closeButton)
    modal.appendChild(head)

    const body = el('div', 'dbb-save-body')
    modal.appendChild(body)

    // ---- title, shared by all three ----
    const titleField = el('div')
    titleField.appendChild(el('div', 'dbb-field-label', 'Titel'))
    const titleInput = el('input', 'dbb-search')
    titleInput.type = 'text'
    titleInput.maxLength = MAX_TITLE_LENGTH
    titleInput.placeholder = 'Titel van dit dashboard…'
    titleInput.value = draft.title
    titleInput.addEventListener('input', function () {
      draft.title = titleInput.value
      sync()
    })
    titleInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') save()
    })
    titleField.appendChild(titleInput)
    body.appendChild(titleField)

    // ---- what to save ----
    const choiceField = el('div')
    choiceField.appendChild(el('div', 'dbb-field-label', 'Wat wil je doen?'))
    const choiceRow = el('div', 'dbb-choices')
    CHOICES.forEach(([value, label, description]) => {
      const card = el('button', 'dbb-choice')
      card.type = 'button'
      card.dataset.choice = value
      card.appendChild(el('span', 'dbb-choice-title', label))
      card.appendChild(el('span', 'dbb-choice-desc', description))
      card.addEventListener('click', function () {
        draft.choice = value
        sync()
      })
      choiceRow.appendChild(card)
    })
    choiceField.appendChild(choiceRow)
    body.appendChild(choiceField)

    // ---- sjabloon: new or overwrite ----
    const templateSection = el('div', 'dbb-save-section')

    const modeField = el('div')
    modeField.appendChild(el('div', 'dbb-field-label', 'Sjabloon'))
    const modeToggle = el('div', 'dbb-toggle')
    ;[['new', 'Nieuw sjabloon'], ['overwrite', 'Bestaand sjabloon overschrijven']].forEach(([value, label]) => {
      const button = el('button', '', label)
      button.type = 'button'
      button.dataset.mode = value
      if (value === 'overwrite' && !existing.length) {
        button.disabled = true
        button.style.opacity = '.4'
        button.title = 'Er zijn nog geen sjablonen om te overschrijven'
      }
      button.addEventListener('click', function () {
        draft.mode = value
        sync()
      })
      modeToggle.appendChild(button)
    })
    modeField.appendChild(modeToggle)
    templateSection.appendChild(modeField)

    const targetField = el('div')
    targetField.appendChild(el('div', 'dbb-field-label', 'Welk sjabloon'))
    const targetRow = el('div', 'dbb-chiprow')
    existing.forEach(template => {
      const chip = el('button', 'dbb-btn', template.label)
      chip.type = 'button'
      chip.dataset.file = template.file
      chip.title = template.file
      chip.addEventListener('click', function () {
        draft.target = template.file
        // An empty title takes over the name of the sjabloon being replaced.
        if (!draft.title.trim()) {
          draft.title = template.label
          titleInput.value = draft.title
        }
        sync()
      })
      targetRow.appendChild(chip)
    })
    targetField.appendChild(targetRow)
    templateSection.appendChild(targetField)
    templateSection.appendChild(el('div', 'dbb-note',
      'Het sjabloon wordt in deze browser bewaard en blijft na herladen beschikbaar. ' +
      'Om sjablonen te delen of elders te bewaren: sla de bundel van dashboards op als bestand.'))
    body.appendChild(templateSection)

    // What the chosen option will produce, spelled out.
    const outcome = el('div', 'dbb-note dbb-outcome')
    body.appendChild(outcome)

    const foot = el('div', 'dbb-picker-foot')
    foot.appendChild(el('div', 'dbb-spacer'))
    foot.appendChild(makeButton('Annuleren', close))
    const saveButton = makeButton('Opslaan', save, 'dbb-primary')
    foot.appendChild(saveButton)
    modal.appendChild(foot)

    // Escape closes this dialog only, not the dashboard underneath it.
    function onKey (event) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      close()
    }
    document.addEventListener('keydown', onKey, true)

    document.body.appendChild(overlayEl)
    sync()
    setTimeout(function () {
      titleInput.focus()
      titleInput.select()
    }, 40)

    function templateFile () {
      return draft.mode === 'overwrite' ? draft.target : uniqueTemplateFile(draft.title)
    }

    function sync () {
      Array.from(choiceRow.children).forEach(c => c.classList.toggle('dbb-on', c.dataset.choice === draft.choice))
      templateSection.hidden = draft.choice !== 'template'
      Array.from(modeToggle.children).forEach(b => b.classList.toggle('dbb-on', b.dataset.mode === draft.mode))
      targetField.hidden = draft.mode !== 'overwrite'
      Array.from(targetRow.children).forEach(b => b.classList.toggle('dbb-on', b.dataset.file === draft.target))

      const title = draft.title.trim()
      const stamp = new Date().toISOString().slice(0, 10)
      const slug = slugify(title) || viewerName()
      let ready = !!title

      if (draft.choice === 'template') {
        if (draft.mode === 'overwrite') {
          const target = existing.find(t => t.file === draft.target)
          outcome.textContent = target
            ? 'Overschrijft “' + target.label + '” (' + target.file + ')'
            : 'Kies welk sjabloon je wilt overschrijven'
          ready = ready && !!target
        } else {
          const clash = title && existing.some(t => t.label.toLowerCase() === title.toLowerCase())
          outcome.textContent = 'Nieuw sjabloon: ' + templateFile() +
            (clash ? ' — er bestaat al een sjabloon met deze titel' : '')
        }
        saveButton.textContent = 'Opslaan'
      } else if (draft.choice === 'file') {
        outcome.textContent = 'Downloadt flux-dashboard-' + slug + '-' + stamp + '.json. ' +
          'Later terug te zetten met Laden.'
        saveButton.textContent = 'Downloaden'
      } else {
        const count = existing.length
        outcome.textContent = 'Downloadt één ZIP met dit dashboard (huidig-dashboard.json) en ' +
          count + ' ' + (count === 1 ? 'sjabloon' : 'sjablonen') + ' in de map ' + templateDir() + '/.'
        saveButton.textContent = 'Downloaden'
      }
      saveButton.disabled = busy || !ready
    }

    // The title typed here becomes the dashboard's title, whichever option runs.
    function applyTitle (title) {
      state.title = title
      saveState()
      renderBody()
    }

    async function save () {
      const title = draft.title.trim()
      if (busy || !title) return
      busy = true
      sync()
      try {
        if (draft.choice === 'template') {
          const file = templateFile()
          if (!file) throw new Error('geen sjabloon gekozen')
          saveAsTemplate(file, title)
          toast('Sjabloon “' + title + '” opgeslagen in deze browser')
        } else if (draft.choice === 'file') {
          applyTitle(title)
          exportConfiguration()
          markSavedToFile()
        } else {
          applyTitle(title)
          await saveAllTemplates()
        }
        lastSaveChoice = draft.choice
        close()
      } catch (error) {
        busy = false
        sync()
        toast(error && error.name === 'AbortError'
          ? 'Opslaan geannuleerd'
          : 'Kon niet opslaan: ' + (error && error.message))
      }
    }

    function close () {
      document.removeEventListener('keydown', onKey, true)
      overlayEl.remove()
    }
  }

  /* ---------------- loading ---------------- */

  let lastLoadChoice = null // the option picked last time, for this session

  // Opens the browser's file picker and calls back only when a file was chosen.
  function chooseFile (accept, onFile) {
    const input = el('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    input.addEventListener('change', function () {
      const file = input.files && input.files[0]
      input.remove()
      if (file) onFile(file)
    })
    document.body.appendChild(input)
    input.click()
  }

  function readAsText (file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader()
      reader.onload = function () { resolve(String(reader.result)) }
      reader.onerror = function () { reject(new Error('bestand kon niet worden gelezen')) }
      reader.readAsText(file)
    })
  }

  function isZip (file) {
    return /\.zip$/i.test(file.name) || /zip/i.test(file.type || '')
  }

  function isDashboardConfig (config) {
    return !!config && typeof config === 'object' &&
      (!config.format || config.format === CONFIG_FORMAT) && Array.isArray(config.panels)
  }

  // Each loader returns true once something was loaded; the dashboard it
  // replaces is kept so it can be restored. A file of the other kind is routed
  // to its own loader instead of being refused.
  async function loadDashboardFile (file) {
    if (isZip(file)) return loadBundleFile(file)
    let config
    try {
      config = JSON.parse(await readAsText(file))
    } catch (e) {
      throw new Error('dit is geen geldig JSON-bestand')
    }
    if (!isDashboardConfig(config)) throw new Error('dit is geen FLUX-dashboard')
    const name = config.title || file.name
    const hadDashboard = state.panels.length > 0
    rememberPrevious()
    applyLoadedConfig(config)
    markSavedToFile()
    toast('Dashboard “' + name + '” geladen', hadDashboard ? restoreOffer() : null)
    return true
  }

  // A bundle (from "Sla bundel van dashboards op als bestand") holds the shown
  // dashboard plus the sjablonen. The dashboard replaces the current one; the
  // sjablonen join the balk Sjablonen, kept in this browser.
  async function loadBundleFile (file) {
    if (!isZip(file)) return loadDashboardFile(file)
    if (typeof JSZip === 'undefined') throw new Error('ZIP-bibliotheek niet beschikbaar')

    let zip
    try {
      zip = await JSZip.loadAsync(file)
    } catch (e) {
      throw new Error('dit is geen geldig ZIP-bestand')
    }
    const inTemplateDir = new RegExp('(^|/)' + templateDir() + '/', 'i')
    let current = null
    const bundled = []
    for (const name of Object.keys(zip.files)) {
      const entry = zip.files[name]
      if (entry.dir || !/\.json$/i.test(name)) continue
      let config
      try {
        config = JSON.parse(await entry.async('text'))
      } catch (e) {
        continue
      }
      const base = name.split('/').pop()
      if (inTemplateDir.test(name)) {
        if (toTemplate(base, config)) bundled.push({ file: base, config: config })
      } else if (base === BUNDLE_CURRENT && isDashboardConfig(config)) {
        current = config
      }
    }
    if (!current && !bundled.length) throw new Error('geen dashboards gevonden in deze bundel')
    const hadDashboard = state.panels.length > 0
    if (current) rememberPrevious()

    await ensureTemplates()
    rememberFileConfigs(bundled.map(t => t.config))
    const names = new Set(bundled.map(t => t.file))
    writeLocalTemplates(readLocalTemplates().filter(t => !names.has(t.file)).concat(bundled))
    templates = mergeLocalTemplates(folderTemplates)
    renderTemplateBar()
    if (current) {
      applyLoadedConfig(current)
      markSavedToFile()
    }

    const parts = []
    if (current) parts.push('het dashboard')
    if (bundled.length) parts.push(bundled.length + ' ' + (bundled.length === 1 ? 'sjabloon' : 'sjablonen'))
    toast('Bundel geladen: ' + parts.join(' en '), current && hadDashboard ? restoreOffer() : null)
    return true
  }

  function openLoadDialog () {
    const CHOICES = [
      ['dashboard', 'Laad een dashboard uit een bestand', 'Een configuratiebestand (.json); vervangt het huidige dashboard'],
      ['bundle', 'Laad een bundel van dashboards uit een bestand', 'Een bundel (.zip) met een dashboard en sjablonen']
    ]
    let choice = lastLoadChoice || 'dashboard'
    let busy = false

    const overlayEl = el('div', 'dbb-picker')
    overlayEl.addEventListener('mousedown', function (event) {
      if (event.target === overlayEl) close()
    })
    const modal = el('div', 'dbb-picker-modal')
    modal.style.cssText = 'width:min(620px,92vw);height:auto;max-height:88vh'
    overlayEl.appendChild(modal)

    const head = el('div', 'dbb-picker-head')
    const headLeft = el('div')
    headLeft.appendChild(el('h2', 'dbb-title', 'Laden'))
    headLeft.appendChild(el('div', 'dbb-sub', 'Kies wat je wilt inladen'))
    head.appendChild(headLeft)
    const closeButton = el('button', 'dbb-close', '✕')
    closeButton.type = 'button'
    closeButton.addEventListener('click', close)
    head.appendChild(closeButton)
    modal.appendChild(head)

    const body = el('div', 'dbb-save-body')
    modal.appendChild(body)

    const choiceField = el('div')
    choiceField.appendChild(el('div', 'dbb-field-label', 'Wat wil je doen?'))
    const choiceRow = el('div', 'dbb-choices dbb-choices-2')
    CHOICES.forEach(([value, label, description]) => {
      const card = el('button', 'dbb-choice')
      card.type = 'button'
      card.dataset.choice = value
      card.appendChild(el('span', 'dbb-choice-title', label))
      card.appendChild(el('span', 'dbb-choice-desc', description))
      card.addEventListener('click', function () {
        choice = value
        sync()
      })
      choiceRow.appendChild(card)
    })
    choiceField.appendChild(choiceRow)
    body.appendChild(choiceField)

    const outcome = el('div', 'dbb-note dbb-outcome')
    body.appendChild(outcome)

    const foot = el('div', 'dbb-picker-foot')
    foot.appendChild(el('div', 'dbb-spacer'))
    foot.appendChild(makeButton('Annuleren', close))
    const pickButton = makeButton('Bestand kiezen…', pickFile, 'dbb-primary')
    foot.appendChild(pickButton)
    modal.appendChild(foot)

    // Escape closes this dialog only, not the dashboard underneath it.
    function onKey (event) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      close()
    }
    document.addEventListener('keydown', onKey, true)

    document.body.appendChild(overlayEl)
    sync()

    function sync () {
      Array.from(choiceRow.children).forEach(c => c.classList.toggle('dbb-on', c.dataset.choice === choice))
      outcome.textContent = choice === 'dashboard'
        ? 'Kies een .json-bestand, zoals gemaakt met “Sla huidig getoond dashboard op als bestand”. ' +
          'Het vervangt het dashboard dat nu getoond wordt.'
        : 'Kies een .zip-bestand, zoals gemaakt met “Sla bundel van dashboards op als bestand”. ' +
          'Het dashboard daarin vervangt het huidige; de sjablonen komen in de balk Sjablonen en ' +
          'worden in deze browser bewaard.'
      pickButton.disabled = busy
    }

    function pickFile () {
      if (busy) return
      chooseFile(choice === 'bundle' ? '.zip,application/zip' : '.json,application/json', async function (file) {
        busy = true
        sync()
        try {
          const loaded = choice === 'bundle' ? await loadBundleFile(file) : await loadDashboardFile(file)
          if (loaded) {
            lastLoadChoice = choice
            close()
            return
          }
        } catch (error) {
          toast('Kon niet laden: ' + error.message)
        }
        busy = false
        sync()
      })
    }

    function close () {
      document.removeEventListener('keydown', onKey, true)
      overlayEl.remove()
    }
  }

  // Shared by Laden and the templates.
  function applyLoadedConfig (config) {
    applyConfig(config)
    saveState()
    syncUniformToggle()
    renderBody()
  }

  // The header is built once, so a loaded configuration has to update it.
  function syncUniformToggle () {
    const button = overlay && overlay.querySelector('[data-dbb-uniform-toggle]')
    if (button) button.classList.toggle('dbb-on', !!state.uniformScale)
  }

  function makeButton (label, handler, className) {
    const button = el('button', 'dbb-btn' + (className ? ' ' + className : ''), label)
    button.type = 'button'
    button.addEventListener('click', handler)
    return button
  }

  function renderBody () {
    if (!overlay) return
    const body = overlay.querySelector('#dbb-body')
    if (!body) return

    const index = buildIndex()
    reconcileState(index)
    const scenarioColors = buildScenarioColors()

    // Emptying the scroll area snaps it to the top for a moment; every rebuild
    // (reordering, swapping, toggling) should leave the reader where they were.
    const scroll = body.scrollTop
    body.innerHTML = ''
    body.appendChild(buildTitleSection())
    body.appendChild(buildScenarioSection(index))
    body.appendChild(buildPanelSection(index, scenarioColors))

    renderYearRow(index)

    syncUnsaved()
    syncRestoreButton()

    body.scrollTop = scroll

    // Canvas sizing needs the cards to be laid out first. Cards can grow when
    // drawn, so the scroll position is restored once more afterwards.
    requestAnimationFrame(() => {
      redrawPanels()
      body.scrollTop = scroll
    })
  }

  function renderYearRow (index) {
    const row = overlay && overlay.querySelector('#dbb-year-row')
    if (!row) return
    row.innerHTML = ''
    selectableYears(index).forEach(year => {
      const button = el('button', 'dbb-btn dbb-year' + (year === state.focusYear ? ' dbb-on' : ''), String(year))
      button.type = 'button'
      button.addEventListener('click', function () {
        state.focusYear = year
        saveState()
        renderYearRow(index)
        redrawPanels()
      })
      row.appendChild(button)
    })
  }

  // Editable heading for the dashboard itself; stored with the configuration.
  let titleSaveTimer = null

  function buildTitleSection () {
    const section = el('div', 'dbb-section dbb-title-section')
    const input = el('input', 'dbb-dash-title')
    input.type = 'text'
    input.maxLength = MAX_TITLE_LENGTH
    input.placeholder = 'Titel van dit dashboard…'
    input.value = state.title || ''
    input.setAttribute('aria-label', 'Titel van het dashboard')
    input.addEventListener('input', function () {
      state.title = input.value
      clearTimeout(titleSaveTimer)
      titleSaveTimer = setTimeout(saveState, 300)
    })
    input.addEventListener('change', function () {
      state.title = input.value.trim()
      input.value = state.title
      clearTimeout(titleSaveTimer)
      saveState()
    })
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') input.blur()
    })
    section.appendChild(input)
    return section
  }

  function buildScenarioSection (index) {
    const section = el('div', 'dbb-section')
    const scenarios = availableScenarios(index)

    // Long scenario lists would push the graphs off screen, so the picker
    // collapses to a summary once a selection has been made.
    if (scenarioSectionOpen === null) scenarioSectionOpen = state.panels.length === 0

    const head = el('div', 'dbb-section-head dbb-tight')

    const toggle = el('button', 'dbb-link dbb-caret')
    toggle.type = 'button'
    toggle.textContent = scenarioSectionOpen ? '▾' : '▸'
    toggle.title = scenarioSectionOpen ? 'Inklappen' : 'Uitklappen'
    head.appendChild(toggle)

    head.appendChild(el('div', 'dbb-section-title', 'Scenario’s'))
    head.appendChild(el('div', 'dbb-section-note',
      state.scenarios.length + ' van ' + scenarios.length + ' geselecteerd'))
    head.appendChild(el('div', 'dbb-spacer'))

    toggle.addEventListener('click', function () {
      scenarioSectionOpen = !scenarioSectionOpen
      renderBody()
    })

    const selectAll = el('button', 'dbb-link', 'alles selecteren')
    selectAll.type = 'button'
    selectAll.addEventListener('click', function () {
      state.scenarios = availableScenarios(index).map(s => s.id)
      saveState()
      renderBody()
    })
    head.appendChild(selectAll)

    const clearAll = el('button', 'dbb-link', 'wissen')
    clearAll.type = 'button'
    clearAll.style.marginLeft = '12px'
    clearAll.addEventListener('click', function () {
      state.scenarios = []
      saveState()
      renderBody()
    })
    head.appendChild(clearAll)

    section.appendChild(head)

    if (!scenarios.length) {
      section.appendChild(el('div', 'dbb-empty', 'Geen scenario’s beschikbaar in dit diagram.'))
      return section
    }

    if (!scenarioSectionOpen) {
      const summary = el('div', 'dbb-chiprow')
      if (!state.scenarios.length) {
        summary.appendChild(el('div', 'dbb-section-note', 'Nog geen scenario’s geselecteerd — klap uit om te kiezen.'))
      }
      state.scenarios.forEach(id => summary.appendChild(scenarioChip(id)))
      section.appendChild(summary)
      return section
    }

    // Group by scenarioGroup, preserving config order.
    const groups = []
    const groupIndex = {}
    scenarios.forEach(scenario => {
      const name = scenario.scenarioGroup || 'Overig'
      if (groupIndex[name] === undefined) {
        groupIndex[name] = groups.length
        groups.push({ name: name, items: [] })
      }
      groups[groupIndex[name]].items.push(scenario)
    })

    const grid = el('div', 'dbb-scenario-grid')
    groups.forEach(group => {
      const label = el('div', 'dbb-scenario-group-label', shortenGroupLabel(group.name))
      label.title = group.name
      grid.appendChild(label)

      const row = el('div', 'dbb-chiprow')
      group.items.forEach(scenario => row.appendChild(scenarioChip(scenario.id, scenario.title)))
      grid.appendChild(row)
    })
    section.appendChild(grid)

    return section
  }

  const GROUP_LABEL_WIDTH = 186
  const GROUP_LABEL_TAIL = 15
  let measureCtx = null

  function measureText (text, font) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
    measureCtx.font = font
    return measureCtx.measureText(text).width
  }

  // Scenario group names differ only in their tail ("… (PEH)" vs "… (NPE)"), so
  // drop the middle rather than the end when one does not fit the label column.
  function shortenGroupLabel (name) {
    const font = '400 11px ' + FONT
    if (measureText(name, font) <= GROUP_LABEL_WIDTH) return name

    const tail = name.slice(-GROUP_LABEL_TAIL)
    let head = name.length - GROUP_LABEL_TAIL
    while (head > 1 && measureText(name.slice(0, head) + '…' + tail, font) > GROUP_LABEL_WIDTH) head--
    return name.slice(0, head).replace(/[\s,|]+$/, '') + '…' + tail.replace(/^[\s,|]+/, '')
  }

  function scenarioChip (id, title) {
    const on = state.scenarios.indexOf(id) !== -1
    const button = el('button', 'dbb-btn dbb-tint dbb-scenario-chip' + (on ? ' dbb-on' : ''), title || scenarioTitle(id))
    button.type = 'button'
    if (!on) button.style.backgroundColor = scenarioBadgeColor(id)
    button.addEventListener('click', function () {
      const at = state.scenarios.indexOf(id)
      if (at === -1) state.scenarios.push(id)
      else state.scenarios.splice(at, 1)
      saveState()
      renderBody()
    })
    return button
  }

  function buildPanelSection (index, scenarioColors) {
    const section = el('div', 'dbb-section')

    const head = el('div', 'dbb-section-head')
    head.appendChild(el('div', 'dbb-section-title', 'Grafieken'))
    head.appendChild(el('div', 'dbb-section-note',
      state.panels.length ? state.panels.length + ' parameter' + (state.panels.length === 1 ? '' : 's') : 'Nog geen parameters toegevoegd'))
    section.appendChild(head)

    const grid = el('div', 'dbb-grid')

    // Two-column flow: a full-width panel always claims a whole row, so a
    // half-width panel that would be left dangling next to it gets an inline
    // "+" slot instead — that is how a second half-width graph is added.
    let column = 0
    let rowStart = null // the half-width graph that opened the current row
    state.panels.forEach(panel => { panel._addTile = null })
    const halfSlot = (insertAt) => {
      const tile = makeAddTile('half', insertAt, rowStart)
      if (rowStart) rowStart._addTile = tile
      grid.appendChild(tile)
    }
    state.panels.forEach((panel, position) => {
      if (panel.width === 'full') {
        if (column === 1) {
          halfSlot(position)
          column = 0
        }
        grid.appendChild(renderPanelCard(panel, index, scenarioColors))
      } else {
        grid.appendChild(renderPanelCard(panel, index, scenarioColors))
        if (column === 0) rowStart = panel
        column = column === 0 ? 1 : 0
      }
    })

    if (column === 1) halfSlot(state.panels.length)
    grid.appendChild(makeAddTile('row', state.panels.length))

    section.appendChild(grid)
    return section
  }

  // kind: 'half' → fills the empty half-slot next to an existing graph
  //       'row'  → starts a new row; the width is chosen in the picker
  function makeAddTile (kind, insertAt, neighbor) {
    const isRow = kind === 'row'
    const add = el('button', 'dbb-add' + (isRow ? ' dbb-full dbb-new-row' : ''))
    add.type = 'button'
    add.appendChild(el('span', 'dbb-plus', '+'))
    add.appendChild(el('span', '', isRow ? 'Grafiek toevoegen' : 'Grafiek ernaast toevoegen'))
    add.title = isRow ? 'Voeg een grafiek toe op een nieuwe rij' : 'Voeg een tweede halve grafiek naast deze toe'
    add.addEventListener('click', function () {
      openPicker(null, { width: 'half', lockWidth: !isRow, insertAt: insertAt })
    })
    return add
  }

  /* ------------------------------------------------------------------ *
   * Parameter picker
   * ------------------------------------------------------------------ */

  function openPicker (existingPanel, options) {
    const index = buildIndex()
    if (!index) return

    const opts = options || {}
    // Which series is being replaced, if any. Adding leaves it null.
    const editingSpec = (!opts.addSeries && existingPanel && typeof opts.seriesIndex === 'number')
      ? panelSeries(existingPanel)[opts.seriesIndex] || null
      : null

    const catalogue = buildCuratedEntries(index)
    const hasCatalogue = !!(catalogue && catalogue.entries.length)

    const pickerState = {
      mode: hasCatalogue ? loadPickerMode() : 'all',
      search: '',
      direction: 'all',
      carriers: new Set(),
      nodes: new Set(),
      nodeSearch: '',
      kinds: new Set(),
      mains: new Set(),
      subs: new Set(),
      // Ordered, so the series follow the order in which rows were picked.
      selected: editingSpec ? [editingSelection()] : [],
      anchorKey: null, // last clicked row, the start of a shift-click range
      chartType: chartTypeOf(existingPanel),
      width: existingPanel ? existingPanel.width : (opts.width || 'half'),
      colorBy: colorModeOf(existingPanel)
    }

    picker = el('div', 'dbb-picker')
    picker.addEventListener('mousedown', function (event) {
      if (event.target === picker) closePicker()
    })

    const modal = el('div', 'dbb-picker-modal')
    picker.appendChild(modal)

    // ---- head ----
    const head = el('div', 'dbb-picker-head')
    const headLeft = el('div')
    headLeft.appendChild(el('h2', 'dbb-title',
      opts.addSeries ? 'Data toevoegen' : (editingSpec ? 'Parameter wijzigen' : 'Parameter kiezen')))
    const headSub = el('div', 'dbb-sub')
    headLeft.appendChild(headSub)
    head.appendChild(headLeft)

    const headRight = el('div', 'dbb-head-right')

    const modeToggle = el('div', 'dbb-toggle')
    ;[['curated', 'Redactie'], ['all', 'Alle parameters']].forEach(([value, label]) => {
      const button = el('button', '', label)
      button.type = 'button'
      button.dataset.mode = value
      button.classList.toggle('dbb-on', pickerState.mode === value)
      button.addEventListener('click', function () {
        if (pickerState.mode === value) return
        pickerState.mode = value
        savePickerMode(value)
        Array.from(modeToggle.children).forEach(c => c.classList.toggle('dbb-on', c.dataset.mode === value))
        buildMode()
      })
      modeToggle.appendChild(button)
    })
    // Without a curated catalogue there is nothing to switch between.
    if (hasCatalogue) headRight.appendChild(modeToggle)

    const closeButton = el('button', 'dbb-close', '✕')
    closeButton.type = 'button'
    closeButton.addEventListener('click', closePicker)
    headRight.appendChild(closeButton)
    head.appendChild(headRight)
    modal.appendChild(head)

    // ---- main ----
    const main = el('div', 'dbb-picker-main')
    modal.appendChild(main)

    const side = el('div', 'dbb-picker-side')
    main.appendChild(side)

    const content = el('div')
    content.style.cssText = 'flex:1;display:flex;flex-direction:column;min-width:0;min-height:0'
    main.appendChild(content)

    // search
    const searchWrap = el('div')
    searchWrap.style.cssText = 'display:flex;align-items:center;gap:10px;padding:14px 22px;' +
      'border-bottom:1px solid #EAE6E0;background:#fff'
    const search = el('input', 'dbb-search')
    search.type = 'search'
    search.placeholder = 'Zoek op node, drager of node-id…'
    searchWrap.appendChild(search)

    // Filled in per mode; holds the "add everything listed" shortcut.
    const searchActions = el('div')
    searchActions.style.cssText = 'flex:none;display:flex;gap:6px'
    searchWrap.appendChild(searchActions)
    content.appendChild(searchWrap)

    const list = el('div', 'dbb-picker-list')
    content.appendChild(list)

    const thisPicker = picker
    let renderList = function () {} // replaced by buildMode()

    // Options that the other filters have made unreachable are hidden, so the
    // sidebar only ever offers combinations that return something. A selected
    // option always stays visible — otherwise it could not be undone.
    let facetRefreshers = []

    // ---- mode-specific sidebar + list (built by buildMode below) ----

    // ---- foot ----
    const foot = el('div', 'dbb-picker-foot')
    foot.appendChild(el('span', 'dbb-label', 'Weergave'))
    const typeToggle = el('div', 'dbb-toggle')
    ;[['line', 'Lijngrafiek · alle jaren'], ['bar', 'Staafgrafiek · focusjaar']].forEach(([value, label]) => {
      const button = el('button', '', label)
      button.type = 'button'
      button.dataset.type = value
      button.classList.toggle('dbb-on', pickerState.chartType === value)
      button.addEventListener('click', function () {
        pickerState.chartType = value
        Array.from(typeToggle.children).forEach(c => c.classList.toggle('dbb-on', c.dataset.type === value))
        syncColorToggle()
      })
      typeToggle.appendChild(button)
    })
    foot.appendChild(typeToggle)

    // A line chart draws one colour per scenario by definition, so colouring by
    // drager only applies to bar charts.
    const colorLabel = el('span', 'dbb-label', 'Kleur')
    colorLabel.style.marginLeft = '10px'
    foot.appendChild(colorLabel)

    const colorToggle = el('div', 'dbb-toggle')
    ;[['scenario', 'Scenario'], ['carrier', 'Drager']].forEach(([value, label]) => {
      const button = el('button', '', label)
      button.type = 'button'
      button.dataset.color = value
      button.addEventListener('click', function () {
        pickerState.colorBy = value
        Array.from(colorToggle.children).forEach(c => c.classList.toggle('dbb-on', c.dataset.color === value))
      })
      colorToggle.appendChild(button)
    })
    foot.appendChild(colorToggle)

    function syncColorToggle () {
      const enabled = pickerState.chartType === 'bar'
      colorToggle.style.opacity = enabled ? '1' : '.4'
      colorLabel.style.opacity = enabled ? '1' : '.4'
      Array.from(colorToggle.children).forEach(c => {
        c.disabled = !enabled
        c.style.cursor = enabled ? 'pointer' : 'not-allowed'
        c.classList.toggle('dbb-on', enabled && c.dataset.color === pickerState.colorBy)
      })
    }
    syncColorToggle()

    const widthLabel = el('span', 'dbb-label', 'Breedte')
    widthLabel.style.marginLeft = '10px'
    foot.appendChild(widthLabel)

    const widthToggle = el('div', 'dbb-toggle')
    ;[['half', 'Half'], ['full', 'Vol']].forEach(([value, label]) => {
      const button = el('button', '', label)
      button.type = 'button'
      button.dataset.width = value
      button.classList.toggle('dbb-on', pickerState.width === value)
      // A graph added into an existing half-slot must stay half-width to fit it.
      button.disabled = (!!opts.lockWidth || !!opts.addSeries) && value !== pickerState.width
      if (button.disabled) button.style.opacity = '.35'
      button.addEventListener('click', function () {
        pickerState.width = value
        Array.from(widthToggle.children).forEach(c => c.classList.toggle('dbb-on', c.dataset.width === value))
      })
      widthToggle.appendChild(button)
    })
    foot.appendChild(widthToggle)

    foot.appendChild(el('div', 'dbb-spacer'))

    const selectionLabel = el('span', 'dbb-section-note dbb-selection', 'Nog niets geselecteerd')
    const clearSelection = el('button', 'dbb-link dbb-selection-clear', 'wissen')
    clearSelection.type = 'button'
    clearSelection.hidden = true
    clearSelection.title = 'Selectie wissen'
    clearSelection.addEventListener('click', function () {
      pickerState.selected = []
      pickerState.anchorKey = null
      syncSelection()
    })
    selectionLabel.style.marginRight = '6px'
    foot.appendChild(selectionLabel)

    foot.appendChild(clearSelection)
    foot.appendChild(makeButton('Annuleren', closePicker))
    const okButton = makeButton('OK', confirmSelection, 'dbb-primary')
    okButton.disabled = !pickerState.selected.length
    foot.appendChild(okButton)
    modal.appendChild(foot)

    document.body.appendChild(picker)
    search.addEventListener('input', function () {
      pickerState.search = search.value.trim().toLowerCase()
      renderList()
    })
    setTimeout(() => search.focus(), 40)

    buildMode()

    // The catalogue may still have been in flight when the picker opened.
    if (!hasCatalogue && curatedRows === null) {
      ensureCuratedRows().then(function () {
        if (picker === thisPicker && curatedRows && curatedRows.length) {
          closePicker()
          openPicker(existingPanel, opts)
        }
      })
    }

    /* ---------------- shared helpers ---------------- */

    function headerRow (title, actionLabel, actionHandler) {
      const row = el('div', 'dbb-filter-head')
      row.appendChild(el('div', 'dbb-filter-title', title))
      if (actionLabel) {
        const action = el('button', 'dbb-link', actionLabel)
        action.type = 'button'
        action.addEventListener('click', actionHandler)
        row.appendChild(action)
      }
      return row
    }

    // A block of multi-select chips backed by a Set in pickerState.
    function registerFacet (block, chips, selection, availableFor) {
      facetRefreshers.push(function () {
        const available = availableFor()
        let shown = 0
        chips.forEach((chip, value) => {
          const keep = available.has(value) || selection.has(value)
          chip.hidden = !keep
          if (keep) shown++
        })
        block.hidden = shown === 0
      })
    }

    function refreshFacets () {
      facetRefreshers.forEach(fn => fn())
    }

    function chipFilter (title, values, selection, availableFor) {
      const block = el('div', 'dbb-filter-block')
      const row = el('div', 'dbb-chiprow')
      block.appendChild(headerRow(title, 'wissen', function () {
        selection.clear()
        Array.from(row.children).forEach(c => c.classList.remove('dbb-on'))
        renderList()
      }))
      const chips = new Map()
      values.forEach(value => {
        const chip = el('button', 'dbb-btn' + (selection.has(value) ? ' dbb-on' : ''), value)
        chip.type = 'button'
        chip.addEventListener('click', function () {
          if (selection.has(value)) selection.delete(value)
          else selection.add(value)
          chip.classList.toggle('dbb-on', selection.has(value))
          renderList()
        })
        row.appendChild(chip)
        chips.set(value, chip)
      })
      block.appendChild(row)
      if (availableFor) registerFacet(block, chips, selection, availableFor)
      return block
    }

    function carrierFilter (carriers, availableFor) {
      const block = el('div', 'dbb-filter-block')
      const row = el('div', 'dbb-chiprow')
      block.appendChild(headerRow('Dragers', 'wissen', function () {
        pickerState.carriers.clear()
        Array.from(row.children).forEach(c => c.classList.remove('dbb-on'))
        renderList()
      }))
      const chips = new Map()
      carriers.forEach(carrier => {
        const chip = el('button', 'dbb-carrier-chip' + (pickerState.carriers.has(carrier.id) ? ' dbb-on' : ''))
        chip.type = 'button'
        const dot = el('span', 'dbb-dot')
        dot.style.backgroundColor = carrier.color
        chip.appendChild(dot)
        chip.appendChild(el('span', '', carrier.id))
        chip.addEventListener('click', function () {
          if (pickerState.carriers.has(carrier.id)) pickerState.carriers.delete(carrier.id)
          else pickerState.carriers.add(carrier.id)
          chip.classList.toggle('dbb-on', pickerState.carriers.has(carrier.id))
          renderList()
        })
        row.appendChild(chip)
        chips.set(carrier.id, chip)
      })
      block.appendChild(row)
      if (availableFor) registerFacet(block, chips, pickerState.carriers, availableFor)
      return block
    }

    // Sits at the bottom of the sidebar and only appears once something is
    // actually narrowing the list.
    function filterReset (isActive, clear) {
      const wrap = el('div', 'dbb-filter-reset')
      wrap.appendChild(makeButton('Alle filters wissen', function () {
        clear()
        // Rebuild rather than patch: every chip, the node list and the search
        // box all have to reflect the cleared state.
        buildMode()
      }))
      facetRefreshers.push(function () { wrap.hidden = !isActive() })
      return wrap
    }

    function editingSelection () {
      const key = flowKey(editingSpec.source, editingSpec.target, editingSpec.carrier)
      const param = index.byFlow.get(key)
      return { key: key, title: editingSpec.title || null, label: editingSpec.title || (param ? paramLabel(param) : key) }
    }

    function isSelected (key) {
      return pickerState.selected.some(item => item.key === key)
    }

    function addSelection (row) {
      if (isSelected(row.dataset.key)) return
      pickerState.selected.push({ key: row.dataset.key, title: row.dataset.title || null, label: row.dataset.label })
    }

    // Click toggles a row; shift-click adds every visible row between the last
    // clicked one and this one.
    function toggleRow (row, event) {
      const key = row.dataset.key
      if (event && event.shiftKey && pickerState.anchorKey) {
        const rows = Array.from(list.querySelectorAll('.dbb-row'))
        const from = rows.findIndex(r => r.dataset.key === pickerState.anchorKey)
        const to = rows.indexOf(row)
        if (from !== -1 && to !== -1) {
          rows.slice(Math.min(from, to), Math.max(from, to) + 1).forEach(addSelection)
          pickerState.anchorKey = key
          syncSelection()
          return
        }
      }
      if (isSelected(key)) pickerState.selected = pickerState.selected.filter(item => item.key !== key)
      else addSelection(row)
      pickerState.anchorKey = key
      syncSelection()
    }

    function syncSelection () {
      const count = pickerState.selected.length
      const text = count === 0
        ? 'Nog niets geselecteerd — klik om één of meer te kiezen'
        : count === 1 ? pickerState.selected[0].label : count + ' parameters geselecteerd'
      selectionLabel.textContent = text
      selectionLabel.title = count > 1 ? pickerState.selected.map(item => item.label).join('\n') : text
      clearSelection.hidden = count === 0
      okButton.disabled = count === 0
      Array.from(list.querySelectorAll('.dbb-row')).forEach(r => r.classList.toggle('dbb-sel', isSelected(r.dataset.key)))
    }

    function scenarioCountLabel (param) {
      const n = Object.keys(param.values).length
      return n + ' scenario' + (n === 1 ? '' : '\u2019s')
    }

    function listFooter (shown, truncated) {
      if (!shown) {
        list.appendChild(el('div', 'dbb-hint', 'Geen parameters gevonden. Pas je zoekopdracht of filters aan.'))
      } else if (truncated) {
        list.appendChild(el('div', 'dbb-hint', 'Meer dan ' + MAX_PICKER_ROWS + ' resultaten \u2014 verfijn je zoekopdracht om de rest te zien.'))
      }
    }

    /* ---------------- mode switching ---------------- */

    function buildMode () {
      side.innerHTML = ''
      list.innerHTML = ''
      searchActions.innerHTML = ''
      facetRefreshers = []
      if (pickerState.mode === 'curated') buildCuratedMode()
      else buildAllMode()
      renderList()
      syncSelection()
    }

    /* ---------------- mode: alle parameters ---------------- */

    function buildAllMode () {
      headSub.textContent = 'E\u00e9n parameter per grafiek \u2014 gegroepeerd per node, per drager en richting'
      search.placeholder = 'Zoek op node, drager of node-id\u2026'

      // Every parameter of every node, as the pool each facet is counted against.
      const allParams = []
      index.byNode.forEach(list => list.forEach(p => allParams.push(p)))
      const reachable = (field, except) => () => new Set(
        allParams.filter(p => matches(p, except)).map(p => p[field]))

      // direction
      const dirBlock = el('div', 'dbb-filter-block')
      dirBlock.appendChild(headerRow('Richting'))
      const dirRow = el('div', 'dbb-chiprow')
      const dirChips = new Map()
      ;[['all', 'alle'], ['in', 'in'], ['uit', 'uit']].forEach(([value, label]) => {
        const button = el('button', 'dbb-btn' + (pickerState.direction === value ? ' dbb-on' : ''), label)
        button.type = 'button'
        button.dataset.dir = value
        button.addEventListener('click', function () {
          pickerState.direction = value
          Array.from(dirRow.children).forEach(c => c.classList.toggle('dbb-on', c.dataset.dir === value))
          renderList()
        })
        dirRow.appendChild(button)
        dirChips.set(value, button)
      })
      dirBlock.appendChild(dirRow)
      side.appendChild(dirBlock)
      // 'alle' is always meaningful; the two directions only when they exist.
      facetRefreshers.push(function () {
        const available = reachable('direction', 'direction')()
        dirChips.forEach((chip, value) => {
          chip.hidden = value !== 'all' && !available.has(value) && pickerState.direction !== value
        })
      })

      side.appendChild(carrierFilter(index.carriers, reachable('carrier', 'carrier')))

      // nodes
      const nodeBlock = el('div', 'dbb-filter-block')
      nodeBlock.appendChild(headerRow('Nodes', 'wissen', function () {
        pickerState.nodes.clear()
        renderNodeList()
        renderList()
      }))
      const nodeSearch = el('input', 'dbb-search')
      nodeSearch.type = 'search'
      nodeSearch.placeholder = 'Filter nodes\u2026'
      nodeSearch.style.marginBottom = '8px'
      nodeSearch.addEventListener('input', function () {
        pickerState.nodeSearch = nodeSearch.value.trim().toLowerCase()
        renderNodeList()
      })
      nodeBlock.appendChild(nodeSearch)
      const nodeList = el('div', 'dbb-nodelist')
      nodeBlock.appendChild(nodeList)
      nodeBlock.classList.add('dbb-filter-grow')
      side.appendChild(nodeBlock)

      side.appendChild(filterReset(
        () => !!(pickerState.direction !== 'all' || pickerState.carriers.size ||
          pickerState.nodes.size || pickerState.nodeSearch || pickerState.search),
        () => {
          pickerState.direction = 'all'
          pickerState.carriers.clear()
          pickerState.nodes.clear()
          pickerState.nodeSearch = ''
          pickerState.search = ''
          search.value = ''
        }))

      // Rows are built once per search and then only shown or hidden, so ticking
      // a node does not rebuild the list and throw away its scroll position.
      let nodeRows = new Map()
      const nodeEmpty = el('div', 'dbb-hint', 'Geen nodes gevonden')
      nodeBlock.appendChild(nodeEmpty)

      renderNodeList()
      facetRefreshers.push(refreshNodeVisibility)

      function renderNodeList () {
        nodeList.innerHTML = ''
        nodeRows = new Map()
        const query = pickerState.nodeSearch
        const nodes = index.nodes.filter(n =>
          !query || n.title.toLowerCase().indexOf(query) !== -1 || n.id.toLowerCase().indexOf(query) !== -1)

        nodes.forEach(node => {
          const label = el('label', 'dbb-check')
          const box = el('input')
          box.type = 'checkbox'
          box.checked = pickerState.nodes.has(node.id)
          box.addEventListener('change', function () {
            if (box.checked) pickerState.nodes.add(node.id)
            else pickerState.nodes.delete(node.id)
            renderList()
          })
          label.appendChild(box)
          label.appendChild(el('span', '', node.title))
          // Several nodes share a title (in/out variants), so show the id too.
          label.appendChild(el('span', 'dbb-check-id', node.id))
          label.title = node.title + ' (' + node.id + ')'
          nodeList.appendChild(label)
          nodeRows.set(node.id, label)
        })

        refreshNodeVisibility()
      }

      // Nodes the direction and drager filters have emptied out are hidden,
      // except any that are currently ticked.
      function refreshNodeVisibility () {
        const withParams = new Set(allParams.filter(p => matches(p, 'node')).map(p => p.node))
        let shown = 0
        nodeRows.forEach((row, id) => {
          const keep = withParams.has(id) || pickerState.nodes.has(id)
          row.hidden = !keep
          if (keep) shown++
        })
        nodeEmpty.hidden = shown > 0
      }

      function matches (param, except) {
        if (except !== 'direction' && pickerState.direction !== 'all' && param.direction !== pickerState.direction) return false
        if (except !== 'carrier' && pickerState.carriers.size && !pickerState.carriers.has(param.carrier)) return false
        if (except !== 'node' && pickerState.nodes.size && !pickerState.nodes.has(param.node)) return false
        const query = pickerState.search
        if (!query) return true
        return param.nodeTitle.toLowerCase().indexOf(query) !== -1 ||
          param.node.toLowerCase().indexOf(query) !== -1 ||
          param.carrier.toLowerCase().indexOf(query) !== -1
      }

      renderList = function () {
        list.innerHTML = ''
        let shown = 0
        let truncated = false

        for (let i = 0; i < index.nodes.length; i++) {
          if (truncated) break
          const node = index.nodes[i]
          const params = (index.byNode.get(node.id) || []).filter(p => matches(p))
          if (!params.length) continue

          const groupHead = el('div', 'dbb-group-head')
          groupHead.appendChild(el('div', 'dbb-group-title', node.title))
          groupHead.appendChild(el('div', 'dbb-group-id', node.id))
          list.appendChild(groupHead)

          for (let j = 0; j < params.length; j++) {
            if (shown >= MAX_PICKER_ROWS) { truncated = true; break }
            list.appendChild(renderAllRow(params[j]))
            shown++
          }
        }

        listFooter(shown, truncated)
        refreshFacets()
      }
    }

    function renderAllRow (param) {
      const key = param.key
      const row = el('div', 'dbb-row' + (isSelected(key) ? ' dbb-sel' : ''))
      row.dataset.key = key
      row.dataset.label = paramLabel(param)

      const dot = el('span', 'dbb-dot')
      dot.style.backgroundColor = param.carrierColor
      row.appendChild(dot)

      row.appendChild(el('div', 'dbb-row-name', param.carrier))
      row.appendChild(el('div', 'dbb-badge', DIRECTION_LABEL[param.direction]))
      row.appendChild(el('div', 'dbb-row-meta', scenarioCountLabel(param)))

      row.addEventListener('click', function (event) { toggleRow(row, event) })
      // Double-click means "add now": whatever else is selected comes along.
      row.addEventListener('dblclick', function () {
        addSelection(row)
        confirmSelection()
      })
      return row
    }

    /* ---------------- mode: cureer ---------------- */

    function buildCuratedMode () {
      headSub.textContent = 'Een selectie van de belangrijkste parameters, geordend per categorie'
      search.placeholder = 'Zoek op titel, asset of categorie\u2026'

      // Each facet is offered the entries that pass every OTHER filter.
      const reachable = field => () => new Set(
        catalogue.entries.filter(e => matches(e, field)).map(e => e[field]))

      side.appendChild(chipFilter('Productie of verbruik', catalogue.kinds, pickerState.kinds, reachable('kind')))
      side.appendChild(carrierFilter(curatedCarriers(), reachable('carrier')))
      side.appendChild(chipFilter('Hoofdcategorie', catalogue.mains, pickerState.mains, reachable('main')))

      side.appendChild(chipFilter('Subcategorie', catalogue.subs, pickerState.subs, reachable('sub')))

      const spacer = el('div')
      spacer.style.flex = '1'
      side.appendChild(spacer)

      side.appendChild(filterReset(
        () => !!(pickerState.kinds.size || pickerState.mains.size || pickerState.subs.size ||
          pickerState.carriers.size || pickerState.search),
        () => {
          pickerState.kinds.clear()
          pickerState.mains.clear()
          pickerState.subs.clear()
          pickerState.carriers.clear()
          pickerState.search = ''
          search.value = ''
        }))

      function matches (entry, except) {
        if (except !== 'kind' && pickerState.kinds.size && !pickerState.kinds.has(entry.kind)) return false
        if (except !== 'main' && pickerState.mains.size && !pickerState.mains.has(entry.main)) return false
        if (except !== 'sub' && pickerState.subs.size && !pickerState.subs.has(entry.sub)) return false
        if (except !== 'carrier' && pickerState.carriers.size && !pickerState.carriers.has(entry.carrier)) return false
        const query = pickerState.search
        if (!query) return true
        return entry.title.toLowerCase().indexOf(query) !== -1 ||
          entry.asset.toLowerCase().indexOf(query) !== -1 ||
          entry.sub.toLowerCase().indexOf(query) !== -1 ||
          entry.main.toLowerCase().indexOf(query) !== -1 ||
          entry.carrier.toLowerCase().indexOf(query) !== -1
      }

      renderList = function () {
        list.innerHTML = ''
        let shown = 0
        let truncated = false

        const visible = catalogue.entries.filter(e => matches(e))

        for (let i = 0; i < catalogue.groups.length; i++) {
          if (truncated) break
          const group = catalogue.groups[i]
          const rows = visible.filter(e => e.groupKey === group.key)
          if (!rows.length) continue

          const groupHead = el('div', 'dbb-group-head')
          groupHead.appendChild(el('div', 'dbb-group-title', capitalise(group.sub || group.main)))
          groupHead.appendChild(el('div', 'dbb-group-id', [group.kind, group.main].filter(Boolean).join(' \u00b7 ')))
          groupHead.appendChild(el('div', 'dbb-spacer'))

          const addAll = el('button', 'dbb-group-add', '+')
          addAll.type = 'button'
          addAll.title = 'Hele categorie toevoegen (' + rows.length + ' reeks' + (rows.length === 1 ? '' : 'en') + ')'
          addAll.addEventListener('click', function (event) {
            event.stopPropagation()
            confirmGroup(rows)
          })
          groupHead.appendChild(addAll)

          list.appendChild(groupHead)

          for (let j = 0; j < rows.length; j++) {
            if (shown >= MAX_PICKER_ROWS) { truncated = true; break }
            list.appendChild(renderCuratedRow(rows[j]))
            shown++
          }
        }

        listFooter(shown, truncated)
        syncAddAll(visible)
        refreshFacets()
      }

      // Always offered, but summing incompatible categories says nothing — so
      // for those the click explains itself instead of acting.
      function syncAddAll (visible) {
        searchActions.innerHTML = ''
        if (!visible.length) return

        const reason = addAllBlockReason(visible)
        const button = makeButton('+ Alles toevoegen (' + visible.length + ')', function () {
          if (reason) return toast(reason)
          confirmGroup(visible)
        })
        button.title = reason || 'Voeg alle ' + visible.length + ' getoonde parameters toe als één grafiek'
        if (reason) button.style.opacity = '.55'
        searchActions.appendChild(button)
      }
    }

    // Only the carriers the curated catalogue actually covers.
    function curatedCarriers () {
      const used = new Set(catalogue.entries.map(e => e.carrier))
      return index.carriers.filter(c => used.has(c.id))
    }

    function renderCuratedRow (entry) {
      const row = el('div', 'dbb-row' + (isSelected(entry.key) ? ' dbb-sel' : ''))
      row.dataset.key = entry.key
      row.dataset.title = entry.title

      const dot = el('span', 'dbb-dot')
      dot.style.backgroundColor = entry.carrierColor
      row.appendChild(dot)

      // A row that stands for several carriers needs the carrier spelled out.
      if (entry.multiCarrier) {
        const slot = el('div', 'dbb-badge-slot')
        slot.appendChild(el('div', 'dbb-badge dbb-badge-carrier', entry.carrier))
        row.appendChild(slot)
      }
      row.appendChild(el('div', 'dbb-row-name', entry.title))

      // The panel subtitle already spells out the carrier, so the stored title
      // stays clean; the footer label keeps it for clarity while choosing.
      row.dataset.label = entry.title + (entry.multiCarrier ? ' \u00b7 ' + entry.carrier : '')
      row.addEventListener('click', function (event) { toggleRow(row, event) })
      // Double-click means "add now": whatever else is selected comes along.
      row.addEventListener('dblclick', function () {
        addSelection(row)
        confirmSelection()
      })
      return row
    }

    // Adds every (filtered) entry of a category as series on one graph, which
    // for a bar chart means a stack.
    function confirmGroup (groupEntries) {
      const specs = groupEntries.map(entry => ({
        source: entry.source,
        target: entry.target,
        carrier: entry.carrier,
        title: entry.title
      }))
      if (!specs.length) return

      if (existingPanel) {
        const seen = new Set(panelSeries(existingPanel).map(sp => flowKey(sp.source, sp.target, sp.carrier)))
        let added = 0
        specs.forEach(spec => {
          const key = flowKey(spec.source, spec.target, spec.carrier)
          if (seen.has(key)) return
          seen.add(key)
          existingPanel.series.push(spec)
          added++
        })
        if (!added) return toast('Deze parameters staan al in de grafiek')
        existingPanel.chartType = pickerState.chartType
      } else {
        const panel = {
          id: 'panel-' + (++panelSeq),
          series: specs,
          chartType: pickerState.chartType,
          width: pickerState.width,
          colorBy: pickerState.colorBy
        }
        const at = typeof opts.insertAt === 'number' ? opts.insertAt : state.panels.length
        state.panels.splice(Math.max(0, Math.min(at, state.panels.length)), 0, panel)
      }

      saveState()
      closePicker()
      renderBody()
    }

    function confirmSelection () {
      const specs = pickerState.selected
        .map(item => {
          const param = index.byFlow.get(item.key)
          return param ? { source: param.source, target: param.target, carrier: param.carrier, title: item.title || null } : null
        })
        .filter(Boolean)
      if (!specs.length) return

      if (existingPanel && !opts.addSeries) {
        // Changing a series: the selection takes its place, skipping anything
        // the graph already shows elsewhere.
        const at = typeof opts.seriesIndex === 'number' ? opts.seriesIndex : 0
        const others = new Set(panelSeries(existingPanel).filter((_, i) => i !== at)
          .map(sp => flowKey(sp.source, sp.target, sp.carrier)))
        const fresh = specs.filter(sp => !others.has(flowKey(sp.source, sp.target, sp.carrier)))
        if (!fresh.length) return toast('Deze parameters staan al in de grafiek')
        existingPanel.series.splice(at, 1, ...fresh)
        existingPanel.chartType = pickerState.chartType
        existingPanel.width = pickerState.width
        existingPanel.colorBy = pickerState.colorBy
        saveState()
        closePicker()
        renderBody()
        return
      }

      // A new graph, or more data for one: the same path as adding a category.
      confirmGroup(specs)
    }
  }

  // Compact list for panels holding several series: replace or drop each one,
  // or add another.
  function openSeriesManager (panel) {
    const index = buildIndex()
    const overlayEl = el('div', 'dbb-picker')
    overlayEl.addEventListener('mousedown', function (event) {
      if (event.target === overlayEl) close()
    })

    const modal = el('div', 'dbb-picker-modal')
    modal.style.cssText = 'width:min(640px,92vw);height:auto;max-height:80vh'
    overlayEl.appendChild(modal)

    const head = el('div', 'dbb-picker-head')
    const headLeft = el('div')
    headLeft.appendChild(el('h2', 'dbb-title', 'Reeksen beheren'))
    headLeft.appendChild(el('div', 'dbb-sub', 'De reeksen die in deze grafiek gestapeld worden'))
    head.appendChild(headLeft)
    const closeButton = el('button', 'dbb-close', '✕')
    closeButton.type = 'button'
    closeButton.addEventListener('click', close)
    head.appendChild(closeButton)
    modal.appendChild(head)

    const list = el('div', 'dbb-picker-list')
    modal.appendChild(list)

    const foot = el('div', 'dbb-picker-foot')
    foot.appendChild(makeButton('Reeks toevoegen', function () {
      close()
      openPicker(panel, { addSeries: true })
    }))
    foot.appendChild(el('div', 'dbb-spacer'))
    foot.appendChild(makeButton('Klaar', close, 'dbb-primary'))
    modal.appendChild(foot)

    document.body.appendChild(overlayEl)
    render()

    function close () {
      overlayEl.remove()
    }

    function render () {
      list.innerHTML = ''
      const entries = resolveSeries(index, panel)
      const colors = buildSeriesColors(entries)

      entries.forEach((entry, i) => {
        const row = el('div', 'dbb-row')
        const dot = el('span', 'dbb-dot')
        dot.style.backgroundColor = colors[i]
        row.appendChild(dot)
        row.appendChild(el('div', 'dbb-row-name', seriesHeading(entry)))
        row.appendChild(el('div', 'dbb-row-meta', entry.param ? entry.param.carrier : 'niet beschikbaar'))

        // Moving a series up or down changes the stack and the legend alike.
        ;[['↑', i - 1, 'Omhoog (eerder in de stapel en de legenda)'], ['↓', i + 1, 'Omlaag (later in de stapel en de legenda)']]
          .forEach(([glyph, to, tip]) => {
            const move = el('button', 'dbb-link dbb-move', glyph)
            move.type = 'button'
            move.title = tip
            move.setAttribute('aria-label', tip)
            move.disabled = to < 0 || to >= entries.length
            move.addEventListener('click', function (event) {
              event.stopPropagation()
              moveSeries(panel, i, to, false)
              render()
            })
            row.appendChild(move)
          })

        const edit = el('button', 'dbb-link', 'wijzig')
        edit.type = 'button'
        edit.addEventListener('click', function (event) {
          event.stopPropagation()
          close()
          openPicker(panel, { seriesIndex: i })
        })
        row.appendChild(edit)

        const remove = el('button', 'dbb-link', 'verwijder')
        remove.type = 'button'
        remove.style.marginLeft = '10px'
        // The last series is the graph itself; removing it would leave nothing.
        remove.disabled = entries.length <= 1
        if (remove.disabled) remove.style.opacity = '.35'
        remove.addEventListener('click', function (event) {
          event.stopPropagation()
          panel.series.splice(i, 1)
          saveState()
          renderBody()
          render()
        })
        row.appendChild(remove)

        list.appendChild(row)
      })
    }
  }

  function closePicker () {
    if (!picker) return
    picker.remove()
    picker = null
  }

  /* ------------------------------------------------------------------ *
   * Configuration export / import
   * ------------------------------------------------------------------ */

  // A titled dashboard names its exports after the title, so saved files are
  // recognisable; untitled ones fall back to the viewer name.
  function slugify (text) {
    return String(text || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  }

  function fileSlug () {
    return slugify(state.title) || viewerName()
  }

  function exportConfiguration () {
    const json = JSON.stringify(serialiseState(), null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const stamp = new Date().toISOString().slice(0, 10)
    downloadBlob(blob, 'flux-dashboard-' + fileSlug() + '-' + stamp + '.json', 'Configuratie geëxporteerd')
  }

  /* ------------------------------------------------------------------ *
   * Data export (XLSX)
   * ------------------------------------------------------------------ */

  function exportDashboardData () {
    if (typeof XLSX === 'undefined') return toast('XLSX-bibliotheek niet beschikbaar')
    if (!state.panels.length) return toast('Voeg eerst een grafiek toe')

    const index = buildIndex()
    const workbook = XLSX.utils.book_new()
    const usedNames = {}

    // ---- overview ----
    const overview = [
      [state.title ? state.title : 'FLUX | Dashboard'],
      ['Viewer', viewerName()],
      ['Diagram', (window.diagramConfigs || []).find(d => d.id === window.activeDiagramId)?.title || (window.activeDiagramId || '')],
      ['Eenheid', activeUnit() + ' (CO₂-stromen in kton CO₂)'],
      ['Focusjaar', state.focusYear || ''],
      ['Geëxporteerd', new Date().toLocaleString('nl-NL')],
      [],
      ['#', 'Grafiek', 'Reeksen', 'Dragers', 'Weergave', 'Breedte', 'Kleur', 'Voetnoot']
    ]
    state.panels.forEach((panel, i) => {
      const entries = resolveSeries(index, panel).filter(e => e.param)
      overview.push([
        i + 1,
        panelHeading(panel, entries),
        entries.length,
        uniqueInOrder(entries.map(e => e.param.carrier)).join(', '),
        chartTypeOf(panel) === 'bar'
          ? 'staafgrafiek (focusjaar)' + (entries.length > 1 ? ', gestapeld' : '')
          : 'lijngrafiek (alle jaren)',
        panel.width === 'full' ? 'volle breedte' : 'halve breedte',
        entries.length > 1
          ? (aggregatesByCarrier(panel) ? 'per drager (opgeteld)' : 'per reeks')
          : (chartTypeOf(panel) === 'bar' && colorModeOf(panel) === 'scenario' ? 'per scenario' : 'per drager'),
        panel.footnote || ''
      ])
    })
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(overview), 'Overzicht')

    // ---- one wide sheet per panel + one long sheet with everything ----
    const longRows = [['Grafiek', 'Reeks', 'Bron-node', 'Doel-node', 'Drager', 'Scenario', 'Scenario-id', 'Jaar', 'Waarde', 'Eenheid']]

    state.panels.forEach((panel, i) => {
      const entries = resolveSeries(index, panel).filter(e => e.param)
      const label = panelHeading(panel, entries)
      const unit = entries.length ? unitLabel(entries[0].param) : activeUnit()

      const scenarios = state.scenarios.filter(id => entries.some(e => e.param.values[id]))
      const years = chartTypeOf(panel) === 'bar' && state.focusYear
        ? [state.focusYear]
        : uniqueYears(entries, scenarios)

      const sheet = [
        [label],
        ['Weergave', chartTypeOf(panel) === 'bar' ? 'staafgrafiek (focusjaar)' : 'lijngrafiek (alle jaren)'],
        ['Eenheid', unit]
      ]
      if (panel.footnote) sheet.push(['Voetnoot', panel.footnote])
      sheet.push([])

      // One block per series, so a stacked graph exports every layer.
      entries.forEach(entry => {
        const spec = entry.spec
        const param = entry.param
        const name = seriesHeading(entry)
        sheet.push([name])
        sheet.push(['Bron-node', spec.source === ANY ? 'alle' : (index?.nodeTitles?.[spec.source] || spec.source), spec.source])
        sheet.push(['Doel-node', spec.target === ANY ? 'alle' : (index?.nodeTitles?.[spec.target] || spec.target), spec.target])
        sheet.push(['Drager', param.carrier])
        sheet.push(['Scenario'].concat(years))

        scenarios.forEach(id => {
          const byYear = param.values[id] || {}
          const row = [scenarioTitle(id)]
          years.forEach(year => {
            const raw = byYear[year]
            row.push(raw === undefined ? '' : round(convert(raw, param)))
            if (raw !== undefined) {
              longRows.push([
                i + 1, name,
                spec.source === ANY ? 'alle' : spec.source,
                spec.target === ANY ? 'alle' : spec.target,
                param.carrier, scenarioTitle(id), id, year, round(convert(raw, param)), unit
              ])
            }
          })
          sheet.push(row)
        })
        sheet.push([])
      })

      // A stack is read as a total, so give the totals their own block.
      if (entries.length > 1 && scenarios.length) {
        sheet.push(['Totaal (alle reeksen)'])
        sheet.push(['Scenario'].concat(years))
        scenarios.forEach(id => {
          const row = [scenarioTitle(id)]
          years.forEach(year => {
            let total = 0
            let seen = false
            entries.forEach(entry => {
              const raw = (entry.param.values[id] || {})[year]
              if (raw === undefined) return
              seen = true
              total += convert(raw, entry.param)
            })
            row.push(seen ? round(total) : '')
          })
          sheet.push(row)
        })
      }

      // What the graph shows when it sums per carrier.
      if (aggregatesByCarrier(panel) && scenarios.length) {
        const layers = aggregateByCarrier(entries, panel.carrierOrder)
        sheet.push([], ['Per drager (opgeteld)'])
        sheet.push(['Scenario', 'Jaar'].concat(layers.map(layer => layer.param.carrier)))
        scenarios.forEach(id => years.forEach(year => {
          const cells = layers.map(layer => {
            const raw = (layer.param.values[id] || {})[year]
            return raw === undefined ? '' : round(convert(raw, layer.param))
          })
          if (cells.some(c => c !== '')) sheet.push([scenarioTitle(id), year].concat(cells))
        }))
      }

      if (!scenarios.length) sheet.push(['Geen data voor de geselecteerde scenario\u2019s'])

      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheet), sheetName(label, i + 1, usedNames))
    })

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(longRows), 'Alle data')

    const stamp = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(workbook, 'flux-dashboard-data-' + fileSlug() + '-' + stamp + '.xlsx')
    toast('Data geëxporteerd')
  }

  function uniqueYears (entries, scenarios) {
    const years = new Set()
    entries.forEach(entry => scenarios.forEach(id =>
      Object.keys(entry.param.values[id] || {}).forEach(y => years.add(Number(y)))))
    return Array.from(years).sort((a, b) => a - b)
  }

  function round (value) {
    return Math.round(value * 1000) / 1000
  }

  // Sheet names are capped at 31 characters and may not contain : \ / ? * [ ]
  function sheetName (label, ordinal, used) {
    let base = String(ordinal) + '. ' + label.replace(/[:\\/?*[\]]/g, ' ')
    base = base.slice(0, 31).trim()
    let name = base
    let suffix = 2
    while (used[name]) {
      const tail = ' (' + suffix + ')'
      name = base.slice(0, 31 - tail.length) + tail
      suffix++
    }
    used[name] = true
    return name
  }

  /* ------------------------------------------------------------------ *
   * Launch button
   * ------------------------------------------------------------------ */

  function mountLaunchButton () {
    const menu = document.getElementById('menuContainer')
    if (!menu || document.getElementById('dashboardBuilderButton')) return false

    injectStyles()
    if (getComputedStyle(menu).position === 'static') menu.style.position = 'relative'

    const button = el('button', 'dbb-launch')
    button.id = 'dashboardBuilderButton'
    button.type = 'button'

    const glyph = el('span', 'dbb-launch-glyph')
    glyph.innerHTML = '<i></i><i></i><i></i><i></i>'
    button.appendChild(glyph)
    button.appendChild(el('span', '', 'Dashboard samenstellen'))
    button.addEventListener('click', openDashboard)

    menu.appendChild(button)
    return true
  }

  function init () {
    if (mountLaunchButton()) return
    // The menu is built asynchronously once the viewer config is loaded.
    const timer = setInterval(function () {
      if (mountLaunchButton()) clearInterval(timer)
    }, 300)
    setTimeout(() => clearInterval(timer), 30000)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()

  /* ------------------------------------------------------------------ *
   * Public API
   * ------------------------------------------------------------------ */

  window.DashboardBuilder = {
    open: openDashboard,
    close: closeDashboard,
    getConfig: serialiseState,
    setConfig: function (config) {
      applyConfig(config)
      stateRestored = true
      saveState()
      if (overlay) renderBody()
    },
    // Called by the viewer when another sankey diagram is loaded.
    invalidate: function () {
      indexCache = { diagramId: null, data: null }
      if (overlay) renderBody()
    }
  }
})()
