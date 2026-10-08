// Generic Line Graph Flow Click Module
// Loads configuration from viewer-config.json
//
// The popup that opens when a flow in the sankey diagram is clicked: one line
// per scenario, over the years. It shows the scenarios that are included in
// the viewer's settings menu (cog wheel) and have data for the clicked flow;
// the legend below the graph switches individual scenarios on and off.

let globalVisibleScenarios
var globalPopupData = null
var globalPopupConfig = null
let flowPopupKeyHandler = null

// How the popup compares the scenarios; kept while the page is open, so it
// survives a unit switch and carries over to the next flow
const flowPopupView = {
  view: 'trend',      // 'trend' (Verloop) | 'year' (Per jaar)
  display: 'lines',   // 'lines' | 'range' (band per study)
  scale: 'absolute',  // 'absolute' | 'index'
  sort: 'value',      // 'value' (high to low) | 'group' (per study)
  year: null,         // year of the comparison; null follows the viewer
  referenceId: null,  // reference scenario; null follows the viewer
  showAllYears: true  // false hides the years up to 2024
}

const FLOW_POPUP_INK = {
  text: '#2B2B2B',
  muted: '#8A857D',
  grid: '#E7E3DC',
  axis: '#C6C0B6',
  line: '#DCD7CF',
  wash: '#F3F0EB',
  surface: '#FFFFFF',
  panel: '#F5F3EF' // the viewers' standard background
}

function closePopup() {
  d3.select('#nodeInfoPopup').remove()
  const container = d3.select('#popupContainer')
  container.on('click', null)
  container
    .style('background-color', 'rgba(0,0,0,0)')
    .style('pointer-events', 'none')
  document.body.style.overflow = 'auto'
  if (flowPopupKeyHandler) {
    document.removeEventListener('keydown', flowPopupKeyHandler)
    flowPopupKeyHandler = null
  }
  globalPopupData = null
  globalPopupConfig = null
}

function injectFlowPopupStyles() {
  if (document.getElementById('flp-styles')) return
  const INK = FLOW_POPUP_INK
  const style = document.createElement('style')
  style.id = 'flp-styles'
  // Everything is scoped to the popup's id, which also outranks the viewer's
  // base stylesheet (Milligram) for buttons. Sizes are in px: the viewers set
  // the root font size to 62.5%.
  style.textContent = `
#flowAnalysisPopup{position:relative;display:flex;flex-direction:column;box-sizing:border-box;
  max-height:calc(100vh - 48px);background:${INK.panel};border-radius:12px;overflow:hidden;
  color:${INK.text};font-size:13px;line-height:1.4;text-align:left;pointer-events:auto}
#flowAnalysisPopup *{box-sizing:border-box}
#flowAnalysisPopup button{margin:0;height:auto;min-height:0;padding:7px 12px;font:inherit;font-size:12px;
  font-weight:400;line-height:1.2;letter-spacing:normal;text-transform:none;text-decoration:none;white-space:nowrap;
  color:${INK.text};background:${INK.surface};border:1px solid ${INK.line};border-radius:3px;box-shadow:none;
  cursor:pointer;transition:background .15s ease,color .15s ease,border-color .15s ease}
#flowAnalysisPopup button:hover,#flowAnalysisPopup button:focus{color:${INK.text};background:${INK.wash};
  border-color:${INK.line};outline:none}
#flowAnalysisPopup button:focus-visible{outline:2px solid ${INK.muted};outline-offset:2px}

#flowAnalysisPopup .flp-head{display:flex;align-items:flex-start;justify-content:space-between;gap:32px;
  padding:28px 36px 0}
#flowAnalysisPopup .flp-heading{min-width:0}
#flowAnalysisPopup .flp-eyebrow{font-size:11px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;
  color:${INK.muted}}
#flowAnalysisPopup .flp-title{margin:6px 0 0;font-size:20px;font-weight:600;line-height:1.25;letter-spacing:-.2px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#flowAnalysisPopup .flp-title .flp-arrow{margin:0 8px;font-weight:300;color:${INK.muted}}
#flowAnalysisPopup .flp-meta{margin-top:6px;font-size:12px;color:${INK.muted};overflow-wrap:anywhere}
#flowAnalysisPopup .flp-meta b{font-weight:400;color:${INK.text}}
#flowAnalysisPopup .flp-meta .flp-sep{margin:0 8px;color:${INK.axis}}
#flowAnalysisPopup .flp-actions{display:flex;align-items:center;gap:8px;flex:none}

#flowAnalysisPopup .flp-segmented{display:inline-flex;margin-right:8px;border:1px solid ${INK.line};
  border-radius:3px;overflow:hidden}
#flowAnalysisPopup .flp-segmented button{border:0;border-radius:0;color:${INK.muted}}
#flowAnalysisPopup .flp-segmented button.is-active,#flowAnalysisPopup .flp-segmented button.is-active:hover,
#flowAnalysisPopup .flp-segmented button.is-active:focus{color:#fff;background:${INK.text}}
#flowAnalysisPopup button.flp-close{display:inline-flex;align-items:center;justify-content:center;width:30px;
  height:30px;margin-left:8px;padding:0;border-color:transparent;background:none;color:${INK.muted}}
#flowAnalysisPopup button.flp-close:hover,#flowAnalysisPopup button.flp-close:focus{border-color:transparent;
  background:#EAE6E0;color:${INK.text}}

/* The graph sits in a white card on the popup's background */
#flowAnalysisPopup .flp-card{flex:none;margin:22px 36px 0;padding:14px 24px 12px 12px;background:${INK.surface};
  border-radius:8px}
#flowAnalysisPopup .flp-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;margin:0 0 16px 8px}
#flowAnalysisPopup .flp-toolbar .flp-segmented{margin-right:0}
#flowAnalysisPopup .flp-toolbar button{padding:6px 10px}
#flowAnalysisPopup .flp-years{display:flex;flex-wrap:wrap;gap:2px}
#flowAnalysisPopup button.flp-year{padding:6px 7px;border-color:transparent;background:none;color:${INK.muted};
  font-variant-numeric:tabular-nums}
#flowAnalysisPopup button.flp-year:hover,#flowAnalysisPopup button.flp-year:focus{border-color:transparent;
  background:${INK.wash};color:${INK.text}}
#flowAnalysisPopup button.flp-year.is-active,#flowAnalysisPopup button.flp-year.is-active:hover,
#flowAnalysisPopup button.flp-year.is-active:focus{color:#fff;background:${INK.text}}
#flowAnalysisPopup .flp-chart{position:relative}
#flowAnalysisPopup .flp-chart.is-bars{overflow-y:auto}
#flowAnalysisPopup .flp-note{display:flex;justify-content:space-between;gap:24px;min-height:18px;margin:10px 0 0 8px;
  font-size:12px;color:${INK.muted}}
#flowAnalysisPopup .flp-note span{white-space:nowrap}
#flowAnalysisPopup .flp-note span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis}
#flowAnalysisPopup .flp-note span:last-child{flex:none;text-align:right}

/* Comparison per year: a ranked row per scenario */
#flowAnalysisPopup .flp-bars{display:none;padding-left:8px;font-size:12px}
#flowAnalysisPopup .flp-row,#flowAnalysisPopup .flp-row-head,#flowAnalysisPopup .flp-row-group{display:grid;
  grid-template-columns:minmax(0,270px) minmax(0,1fr) 76px 128px;column-gap:14px;align-items:center}
#flowAnalysisPopup .flp-row-head{position:sticky;top:0;z-index:1;background:${INK.surface};font-size:11px;
  color:${INK.muted}}
#flowAnalysisPopup .flp-row{border-radius:2px;cursor:pointer;transition:opacity .12s ease}
#flowAnalysisPopup .flp-row:hover{background:${INK.wash}}
#flowAnalysisPopup .flp-row.is-dim{opacity:.35}
#flowAnalysisPopup .flp-row-label{padding-left:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#flowAnalysisPopup .flp-row.is-reference .flp-row-label{font-weight:600}
#flowAnalysisPopup .flp-row-group .flp-row-label{font-size:11px;font-weight:500;color:${INK.muted}}
#flowAnalysisPopup .flp-row-track{position:relative;align-self:stretch}
#flowAnalysisPopup .flp-bar{position:absolute;top:50%;height:8px;min-width:1px;margin-top:-4px;border-radius:0 2px 2px 0}
#flowAnalysisPopup .flp-refline{position:absolute;top:0;bottom:0;width:1px;background:${INK.text};opacity:.45}
#flowAnalysisPopup .flp-row-value{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
#flowAnalysisPopup .flp-row-diff{padding-right:6px;text-align:right;color:${INK.muted};
  font-variant-numeric:tabular-nums;white-space:nowrap}
#flowAnalysisPopup .flp-chart svg{display:block;overflow:visible}
#flowAnalysisPopup .flp-chart text{font-size:12px;fill:${INK.muted};font-variant-numeric:tabular-nums}
#flowAnalysisPopup .flp-series{transition:opacity .12s ease}
#flowAnalysisPopup .flp-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  font-size:13px;color:${INK.muted};pointer-events:none}
#flowAnalysisPopup .flp-tooltip{position:absolute;z-index:2;display:none;min-width:150px;max-width:340px;
  padding:9px 12px;background:${INK.text};border-radius:3px;color:#fff;pointer-events:none}
#flowAnalysisPopup .flp-tooltip-value{font-size:15px;font-weight:600;line-height:1.2;white-space:nowrap}
#flowAnalysisPopup .flp-tooltip-value span{margin-left:4px;font-size:12px;font-weight:400;color:#CFCAC2}
#flowAnalysisPopup .flp-tooltip-name{display:flex;align-items:center;gap:7px;margin-top:5px;font-size:12px;
  color:#CFCAC2}
#flowAnalysisPopup .flp-tooltip-name i{flex:none;width:12px;height:2px;border-radius:1px}

#flowAnalysisPopup .flp-legend-panel{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;margin-top:6px}
#flowAnalysisPopup .flp-legend-head{display:flex;align-items:center;gap:6px;flex:none;padding:18px 36px 0}
#flowAnalysisPopup .flp-legend-title{font-size:11px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;
  color:${INK.muted}}
#flowAnalysisPopup .flp-legend-count{margin:0 10px 0 2px;font-size:12px;color:${INK.axis};
  font-variant-numeric:tabular-nums}
#flowAnalysisPopup .flp-spacer{flex:1}
#flowAnalysisPopup button.flp-link{padding:5px 8px;border-color:transparent;background:none;color:${INK.muted}}
#flowAnalysisPopup button.flp-link:hover,#flowAnalysisPopup button.flp-link:focus{border-color:transparent;
  background:#EAE6E0;color:${INK.text}}

#flowAnalysisPopup .flp-legend{flex:1 1 auto;min-height:0;overflow-y:auto;margin-top:10px;padding:0 36px 28px;
  column-count:3;column-gap:32px}
#flowAnalysisPopup .flp-group{break-inside:avoid;padding-bottom:14px}
#flowAnalysisPopup button.flp-group-title{display:block;width:100%;padding:3px 0;border:0;border-radius:2px;
  background:none;text-align:left;font-size:11px;font-weight:500;color:${INK.muted};overflow:hidden;
  text-overflow:ellipsis}
#flowAnalysisPopup button.flp-group-title:hover,#flowAnalysisPopup button.flp-group-title:focus{background:none;
  color:${INK.text}}
#flowAnalysisPopup button.flp-item{display:flex;align-items:center;gap:9px;width:100%;padding:3px 0;border:0;
  border-radius:2px;background:none;text-align:left;transition:opacity .12s ease}
#flowAnalysisPopup button.flp-item:hover,#flowAnalysisPopup button.flp-item:focus{background:none}
#flowAnalysisPopup .flp-key{flex:none;overflow:visible}
#flowAnalysisPopup .flp-item-label{min-width:0;overflow:hidden;text-overflow:ellipsis;color:${INK.text}}
#flowAnalysisPopup .flp-item.is-current .flp-item-label{font-weight:600}
#flowAnalysisPopup .flp-item.is-off .flp-key{color:${INK.axis} !important}
#flowAnalysisPopup .flp-item.is-off .flp-item-label{color:${INK.axis}}
#flowAnalysisPopup .flp-item.is-dim{opacity:.35}
`
  document.head.appendChild(style)
}

function drawBarGraph(data, config) {
  globalPopupData = data
  globalPopupConfig = config

  const INK = FLOW_POPUP_INK

  // Get config from viewerConfig (loaded by drawSelectionButtons.js)
  const lineGraphConfig = viewerConfig?.lineGraphFlow || {}
  const popupWidth = lineGraphConfig.popupWidth || 1100
  // Derive varianten, variantTitles, and categoryInfo from the central scenarios array
  const allScenarios = viewerConfig?.scenarios || []
  const varianten = allScenarios.map(s => s.id)
  const variantTitles = Object.fromEntries(allScenarios.map(s => [s.id, s.title]))
  const categoryColors = lineGraphConfig.categoryColors || {}
  const categoryInfo = {}
  allScenarios.forEach(s => {
    const cat = s.lineGraphCategory
    if (cat) {
      if (!categoryInfo[cat]) categoryInfo[cat] = { baseColor: categoryColors[cat] || '#999', scenarios: [] }
      categoryInfo[cat].scenarios.push(s.id)
    }
  })

  // Scenarios switched off in the settings menu (cog wheel) stay out of the
  // graph, the legend and the export.
  const settings = window.ScenarioSettings
  const isIncluded = id => !settings || typeof settings.isScenarioVisible !== 'function' || settings.isScenarioVisible(id)

  /* ----------  DATA WRANGLING  ---------- */
  const pjToTWh = 3.6
  const isCO2 = data.legend === 'co2flow'
  const unit = (typeof currentUnit !== 'undefined' && currentUnit === 'TWh') ? 'TWh' : 'PJ'
  const unitLabel = isCO2 ? 'kton CO2' : unit

  const getValue = (value) => {
    if (isCO2) {
      return value * globalCO2flowScale
    }
    if (unit === 'TWh') {
      return value / pjToTWh
    }
    return value
  }

  // Support both new format "2030_SCENARIONAME" and old format "scenario0_x2030x_SCENARIONAME"
  const isNewFormat = Object.keys(data).some(k => /^\d{4}_/.test(k))

  function parseKey(key) {
    if (isNewFormat) {
      const match = key.match(/^(\d{4})_(.+)$/)
      return match ? { year: match[1], scenarioId: match[2] } : null
    }
    if (!key.includes('scenario')) return null
    const match = key.match(/x(\d{4})x/)
    return match ? { year: match[1], scenarioId: key.split('_').slice(2).join('_') } : null
  }

  // The years the viewer knows, minus those switched off in the settings menu
  const isYearIncluded = id => !settings || typeof settings.isYearVisible !== 'function' || settings.isYearVisible(id)
  const configYears = (typeof viewerConfig !== 'undefined' && viewerConfig && viewerConfig.years)
    ? new Set(viewerConfig.years.filter(y => isYearIncluded(y.id)).map(y => parseInt(y.id)))
    : null

  // Points per scenario, for the years the viewer knows
  const seriesById = {}
  Object.keys(data).forEach(key => {
    const parsed = parseKey(key)
    if (!parsed) return
    const year = parseInt(parsed.year)
    if (configYears && !configYears.has(year)) return
    const raw = data[key]
    if (raw === undefined || raw === null) return
    const value = Number(getValue(raw))
    if (!isFinite(value)) return
    if (!seriesById[parsed.scenarioId]) seriesById[parsed.scenarioId] = []
    seriesById[parsed.scenarioId].push({ year, value })
  })
  Object.values(seriesById).forEach(points => points.sort((a, b) => a.year - b.year))

  const hasZeroValuesOnly = id => typeof scenariosWithZeroValues !== 'undefined' && scenariosWithZeroValues.has(id)

  // The scenarios this popup offers: included in the settings, and with data for this flow
  const shownScenarios = allScenarios.filter(s =>
    isIncluded(s.id) && !hasZeroValuesOnly(s.id) && seriesById[s.id] && seriesById[s.id].length > 0)

  const allYears = [...new Set(shownScenarios.flatMap(s => seriesById[s.id].map(p => p.year)))].sort((a, b) => a - b)

  // Rows for the xlsx export and the clipboard: every year in the data, for
  // the scenarios included in the settings
  function collectExportRows() {
    const parsedKeys = Object.keys(data)
      .map(key => ({ key, parsed: parseKey(key) }))
      .filter(entry => entry.parsed && isIncluded(entry.parsed.scenarioId))
    const exportYears = [...new Set(parsedKeys.map(entry => entry.parsed.year))].sort()
    const rows = []
    exportYears.forEach(year => {
      parsedKeys.forEach(entry => {
        if (entry.parsed.year !== year) return
        rows.push({ year: year, value: getValue(data[entry.key]), scenario: entry.parsed.scenarioId })
      })
    })
    return rows
  }

  function exportPayload() {
    return {
      nodeTitle: `${sourceTitle}_to_${targetTitle}`,
      sourceNode: sourceTitle,
      targetNode: targetTitle,
      flowType: data.legend,
      scenario: 'all_scenarios',
      data: collectExportRows(),
      unit: unit,
      extraSheets: differenceSheets()
    }
  }

  // Extra sheet for the xlsx export: every scenario's difference to the
  // reference scenario, per year
  function differenceSheets() {
    const refId = referenceId()
    const reference = refId ? seriesById[refId] : null
    if (!reference) return []
    const included = allScenarios.filter(s => isIncluded(s.id) && seriesById[s.id])
    const years = [...new Set(included.flatMap(s => seriesById[s.id].map(p => p.year)))].sort((a, b) => a - b)
    const referenceByYear = new Map(reference.map(p => [p.year, p.value]))
    const rows = [
      ['Verschil t.o.v. referentie'],
      ['Referentie', variantTitles[refId] || refId],
      ['Eenheid', unitLabel],
      [],
      ['Scenario', ...years]
    ]
    included.forEach(s => {
      const byYear = new Map(seriesById[s.id].map(p => [p.year, p.value]))
      rows.push([
        variantTitles[s.id] || s.id,
        ...years.map(year => byYear.has(year) && referenceByYear.has(year) ? byYear.get(year) - referenceByYear.get(year) : '')
      ])
    })
    return [{ name: 'Verschil t.o.v. referentie', rows }]
  }

  // Build scenario colors from config using HSL interpolation for perceptually
  // even lightness steps. Bright end is capped at 80% lightness to stay visible;
  // dark end is capped at 20% to stay distinguishable from black.
  // Colors and symbols are assigned over all configured scenarios, so a
  // scenario keeps its look whichever scenarios the settings include.
  const scenarioColors = {}
  Object.values(categoryInfo).forEach(cat => {
    const base = d3.hsl(d3.color(cat.baseColor))
    const n = cat.scenarios.length
    const lightHigh = Math.min(0.80, base.l + 0.28)
    const lightLow  = Math.max(0.20, base.l - 0.28)
    cat.scenarios.forEach((scenario, i) => {
      const t = n <= 1 ? 0 : i / (n - 1)
      const l = lightHigh - t * (lightHigh - lightLow)
      scenarioColors[scenario] = d3.hsl(base.h, base.s, l)
    })
  })
  const colorOf = id => String(scenarioColors[id] || '#999')

  const symbols = [
    d3.symbolCircle, d3.symbolCross, d3.symbolDiamond, d3.symbolSquare,
    d3.symbolStar, d3.symbolTriangle, d3.symbolWye
  ]

  const scenarioSymbols = {}
  varianten.forEach((scenario, i) => {
    scenarioSymbols[scenario] = symbols[i % symbols.length]
  })
  const symbolPath = (id, size) => d3.symbol().type(scenarioSymbols[id] || d3.symbolCircle).size(size)()

  if (globalVisibleScenarios === undefined) {
    globalVisibleScenarios = new Set(varianten)
  }
  const isOn = id => globalVisibleScenarios.has(id)

  // The scenario selected in the viewer's menu is drawn a little heavier
  const currentScenarioId = (typeof globalActiveScenario !== 'undefined' && globalActiveScenario) ? globalActiveScenario.id : null

  // All years are shown by default; the toggle in the legend hides the years
  // up to 2024. The choice is kept while the page is open.
  let showAllYears = flowPopupView.showAllYears
  const hasEarlyYears = allYears.some(y => y < 2025)
  const yearsInView = () => showAllYears ? allYears : allYears.filter(y => y >= 2025)

  /* ----------  POP-UP SHELL  ---------- */
  injectFlowPopupStyles()

  // Remove any existing popup first
  d3.select('#nodeInfoPopup').remove()

  d3.select('#popupContainer')
    .style('background-color', 'rgba(30,28,25,0.42)')
    .style('pointer-events', 'auto')
    .on('click', closePopup)

  if (!flowPopupKeyHandler) {
    flowPopupKeyHandler = event => { if (event.key === 'Escape') closePopup() }
    document.addEventListener('keydown', flowPopupKeyHandler)
  }

  const popup = d3.select('#popupContainer')
    .append('div')
    .attr('id', 'nodeInfoPopup')
    .style('pointer-events', 'none')
    .style('position', 'absolute')
    .style('top', 0)
    .style('left', 0)
    .style('width', '100%')
    .style('height', '100%')
    .style('display', 'flex')
    .style('justify-content', 'center')
    .style('align-items', 'center')
    .append('div')
    .on('click', (event) => event.stopPropagation())
    .attr('id', 'flowAnalysisPopup')
    .style('width', `${Math.min(popupWidth, window.innerWidth - 48)}px`)

  /* ----------  HEADER  ---------- */
  const sourceNode = nodesGlobal.find(n => n.id === data.source) || {'title.system': 'Onbekende bron'}
  const targetNode = nodesGlobal.find(n => n.id === data.target) || {'title.system': 'Onbekende bestemming'}
  const sourceTitle = sourceNode['title.system']
  const targetTitle = targetNode['title.system']

  const head = popup.append('div').attr('class', 'flp-head')

  const heading = head.append('div').attr('class', 'flp-heading')
  heading.append('div').attr('class', 'flp-eyebrow').text('Stroom')
  const title = heading.append('div').attr('class', 'flp-title').attr('title', `${sourceTitle} → ${targetTitle}`)
  title.append('span').text(sourceTitle)
  title.append('span').attr('class', 'flp-arrow').text('→')
  title.append('span').text(targetTitle)

  const meta = heading.append('div').attr('class', 'flp-meta')
  ;[['bron', data.source], ['doel', data.target], ['type', data.legend]].forEach(([label, value], i) => {
    if (i > 0) meta.append('span').attr('class', 'flp-sep').text('·')
    meta.append('span').text(label + ' ')
    meta.append('b').text(value)
  })

  const actions = head.append('div').attr('class', 'flp-actions')

  // Unit toggle (PJ | TWh); CO2 flows have their own unit
  if (!isCO2) {
    const setUnit = (nextUnit) => {
      if (typeof currentUnit === 'undefined' || currentUnit === nextUnit) return
      currentUnit = nextUnit
      // Update the main sankey toggle indicator
      d3.selectAll('#selectorStatus').transition().duration(200).attr('cx', function () {
        return currentUnit === 'PJ' ? 63 : 87
      })
      // Redraw sankey with new unit
      if (typeof tick === 'function') {
        sankeyConfigs.forEach(element => {
          tick({ ...config, sankeyDataID: element.sankeyDataID })
        })
      }
      // Redraw popup with the new unit (popup removal is handled in drawBarGraph)
      drawBarGraph(data, config)
    }
    const segmented = actions.append('div').attr('class', 'flp-segmented')
    ;['PJ', 'TWh'].forEach(option => {
      segmented.append('button')
        .attr('type', 'button')
        .classed('is-active', unit === option)
        .text(option)
        .on('click', () => setUnit(option))
    })
  }

  actions.append('button')
    .attr('type', 'button')
    .text('Exporteer data (xlsx)')
    .on('click', () => {
      if (typeof window.exportLinegraphToXLSX === 'function') window.exportLinegraphToXLSX(exportPayload())
    })

  actions.append('button')
    .attr('type', 'button')
    .text('Kopieer data naar klembord')
    .on('click', () => {
      if (typeof window.copyLinegraphToClipboard === 'function') window.copyLinegraphToClipboard(exportPayload())
    })

  actions.append('button')
    .attr('type', 'button')
    .attr('class', 'flp-close')
    .attr('title', 'Sluiten')
    .attr('aria-label', 'Sluiten')
    .on('click', closePopup)
    .html('<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 2l10 10M12 2L2 12"/></svg>')

  /* ----------  SCENARIO GROUPS  ---------- */
  // Grouped as in the settings menu; used by the legend, the range per study
  // and the comparison per year
  const groups = []
  const groupOf = {}
  shownScenarios.forEach(s => {
    const name = s.scenarioGroup || 'Overig'
    let group = groups.find(g => g.name === name)
    if (!group) {
      group = { name, scenarios: [] }
      groups.push(group)
    }
    group.scenarios.push(s)
    groupOf[s.id] = group
  })
  // A group's own colour: that of its middle scenario, whichever are switched on
  groups.forEach(group => {
    group.color = colorOf(group.scenarios[Math.floor((group.scenarios.length - 1) / 2)].id)
  })

  /* ----------  GRAPH CARD  ---------- */
  // Three ways to compare the scenarios:
  //   Verloop  - the flow over the years, as a line per scenario or as a range
  //              (lowest to highest) per study, in absolute values or indexed
  //   Per jaar - all scenarios in one year, ranked, against a reference scenario
  const view = flowPopupView
  const chartHeight = Math.max(240, Math.min(340, Math.round(window.innerHeight * 0.38)))
  const card = popup.append('div').attr('class', 'flp-card')
  const toolbar = card.append('div').attr('class', 'flp-toolbar')
  const chart = card.append('div').attr('class', 'flp-chart').style('height', `${chartHeight}px`)
  const svg = chart.append('svg').attr('id', 'flowAnalysisSVG_main')
  const bars = chart.append('div').attr('class', 'flp-bars')
  const emptyNote = chart.append('div').attr('class', 'flp-empty').style('display', 'none')
  const tooltip = chart.append('div').attr('class', 'flp-tooltip')
  const tooltipValue = tooltip.append('div').attr('class', 'flp-tooltip-value')
  const tooltipName = tooltip.append('div').attr('class', 'flp-tooltip-name')
  const note = card.append('div').attr('class', 'flp-note')

  const formatValue = value => {
    const abs = Math.abs(value)
    return d3.format(abs >= 1000 ? ',.0f' : abs >= 100 ? ',.1f' : ',.2f')(value)
  }
  const formatIndex = d3.format(',.0f')

  const emptyText = () => shownScenarios.length
    ? 'Geen scenario\'s geselecteerd'
    : 'Geen data voor deze stroom in de scenario\'s die in de instellingen zijn opgenomen'

  // The year of the comparison per year: the one picked here, else the year
  // selected in the viewer
  function activeYear() {
    const years = yearsInView()
    if (years.includes(view.year)) return view.year
    const viewerYear = (typeof globalActiveYear !== 'undefined' && globalActiveYear) ? parseInt(globalActiveYear.id) : null
    if (years.includes(viewerYear)) return viewerYear
    return years.includes(2050) ? 2050 : years[years.length - 1]
  }

  // The reference of the comparison: the one picked here, else the scenario
  // selected in the viewer
  function referenceId() {
    if (shownScenarios.some(s => s.id === view.referenceId)) return view.referenceId
    return shownScenarios.some(s => s.id === currentScenarioId) ? currentScenarioId : null
  }

  /* ----------  HIGHLIGHT  ---------- */
  function applyHighlight(matchSeries, matchItem, dimRows) {
    const series = svg.selectAll('.flp-series')
    series.style('opacity', function () { return !matchSeries || matchSeries(this) ? 1 : 0.14 })
    if (matchSeries) series.filter(function () { return matchSeries(this) }).raise()
    legend.selectAll('.flp-item').classed('is-dim', function () { return !!matchItem && !matchItem(this.dataset.id) })
    bars.selectAll('.flp-row').classed('is-dim', function () { return !!matchItem && dimRows && !matchItem(this.dataset.id) })
  }

  // One scenario: its line, or the range of its study
  function setHighlight(id, dimRows = true) {
    if (!id) return applyHighlight(null, null, false)
    const group = groupOf[id]
    applyHighlight(
      el => el.dataset.id === id || (el.dataset.group !== undefined && !!group && el.dataset.group === group.name),
      itemId => itemId === id,
      dimRows)
  }

  // One study: its range, and its scenarios in the legend
  function setGroupHighlight(group) {
    applyHighlight(el => el.dataset.group === group.name, itemId => groupOf[itemId] === group, false)
  }

  /* ----------  TOOLBAR  ---------- */
  function addSegmented(parent, options, current, onPick) {
    const el = parent.append('div').attr('class', 'flp-segmented')
    options.forEach(([value, label, hint]) => {
      el.append('button')
        .attr('type', 'button')
        .attr('title', hint || null)
        .classed('is-active', current === value)
        .text(label)
        .on('click', () => { if (current !== value) onPick(value) })
    })
  }

  function renderToolbar() {
    toolbar.selectAll('*').remove()

    addSegmented(toolbar, [
      ['trend', 'Verloop', 'De stroom door de jaren heen'],
      ['year', 'Per jaar', 'Alle scenario\'s in één jaar, van hoog naar laag']
    ], view.view, value => { view.view = value; renderView() })

    if (view.view === 'trend') {
      addSegmented(toolbar, [
        ['lines', 'Lijnen', 'Eén lijn per scenario'],
        ['range', 'Bandbreedte', 'Per studie de band van het laagste tot het hoogste scenario']
      ], view.display, value => { view.display = value; renderView() })

      addSegmented(toolbar, [
        ['absolute', 'Absoluut', `Waarden in ${unitLabel}`],
        ['index', 'Index', 'Elk scenario op 100 in het basisjaar, om de groei te vergelijken']
      ], view.scale, value => { view.scale = value; renderView() })
    } else {
      const year = activeYear()
      const yearsEl = toolbar.append('div').attr('class', 'flp-years')
      yearsInView().forEach(option => {
        yearsEl.append('button')
          .attr('type', 'button')
          .attr('class', 'flp-year')
          .classed('is-active', option === year)
          .text(option)
          .on('click', () => { view.year = option; renderView() })
      })

      toolbar.append('span').attr('class', 'flp-spacer')

      addSegmented(toolbar, [
        ['value', 'Hoog → laag'],
        ['group', 'Per studie']
      ], view.sort, value => { view.sort = value; renderView() })
    }
  }

  /* ----------  VIEW: VERLOOP  ---------- */
  function updateGraph() {
    svg.selectAll('*').remove()
    tooltip.style('display', 'none')

    const width = chart.node().clientWidth
    const margin = { top: 28, right: 16, bottom: 30, left: 60 }
    const plotLeft = margin.left
    const plotRight = width - margin.right
    const plotTop = margin.top
    const plotBottom = chartHeight - margin.bottom
    svg.attr('width', width).attr('height', chartHeight)

    const filteredYears = yearsInView()
    const yearSet = new Set(filteredYears)
    const indexed = view.scale === 'index'
    const ranges = view.display === 'range'

    const switchedOn = shownScenarios
      .filter(s => isOn(s.id))
      .map(s => ({ id: s.id, points: seriesById[s.id].filter(p => yearSet.has(p.year)) }))
      .filter(s => s.points.length > 0)

    // Index: the base is the earliest year that most scenarios cover (at
    // least two thirds of the best-covered year), so the index reads as
    // growth from a common start. A scenario without a value there has no index.
    let baseYear = null
    let withoutIndex = 0
    if (indexed && switchedOn.length) {
      const coverage = year => switchedOn.filter(s => s.points.some(p => p.year === year && p.value > 0)).length
      const best = d3.max(filteredYears, coverage)
      baseYear = filteredYears.find(year => coverage(year) >= best * 2 / 3)
    }

    const drawn = switchedOn
      .map(s => {
        let points = s.points
        if (indexed) {
          const base = points.find(p => p.year === baseYear)
          if (!base || !(base.value > 0)) {
            withoutIndex++
            return null
          }
          points = points.map(p => ({ year: p.year, value: p.value / base.value * 100, absolute: p.value }))
        }
        return { id: s.id, color: colorOf(s.id), points, byYear: new Map(points.map(p => [p.year, p])) }
      })
      .filter(Boolean)
      // The scenario selected in the viewer goes on top
      .sort((a, b) => (a.id === currentScenarioId) - (b.id === currentScenarioId))

    emptyNote
      .style('display', drawn.length ? 'none' : 'flex')
      .text(emptyText())

    const format = indexed ? formatIndex : formatValue

    // x-scale: years on a linear scale, so slopes compare between periods of different length
    const yearExtent = filteredYears.length ? d3.extent(filteredYears) : [2025, 2050]
    const x = d3.scaleLinear()
      .domain(yearExtent[0] === yearExtent[1] ? [yearExtent[0] - 1, yearExtent[1] + 1] : yearExtent)
      .range([plotLeft + 10, plotRight - 10])

    // y-scale: from the scenarios that are switched on only
    const values = drawn.flatMap(s => s.points.map(p => p.value))
    const maxVal = Math.max(0, d3.max(values) || 0)
    const minVal = Math.min(0, d3.min(values) || 0)
    const y = d3.scaleLinear()
      .domain(maxVal === 0 && minVal === 0 ? [0, 1] : [minVal, maxVal * 1.05])
      .nice(5)
      .range([plotBottom, plotTop])

    // Horizontal gridlines with their values; the zero line a step heavier
    const yAxis = svg.append('g').attr('class', 'y-axis')
    y.ticks(5).forEach(tickValue => {
      yAxis.append('line')
        .attr('x1', plotLeft).attr('x2', plotRight)
        .attr('y1', y(tickValue)).attr('y2', y(tickValue))
        .attr('stroke', tickValue === 0 ? INK.axis : INK.grid)
        .attr('shape-rendering', 'crispEdges')
      yAxis.append('text')
        .attr('x', plotLeft - 12)
        .attr('y', y(tickValue))
        .attr('dy', '0.35em')
        .attr('text-anchor', 'end')
        .text(d3.format(',')(tickValue))
    })

    // The level every indexed scenario starts from
    if (indexed && drawn.length) {
      yAxis.append('line')
        .attr('x1', plotLeft).attr('x2', plotRight)
        .attr('y1', y(100)).attr('y2', y(100))
        .attr('stroke', INK.axis)
        .attr('shape-rendering', 'crispEdges')
    }

    // Unit, above the value axis
    svg.append('text')
      .attr('x', 10)
      .attr('y', 8)
      .text(indexed && baseYear !== null ? `Index (${baseYear} = 100)` : `${unitLabel}/jaar`)

    // Years: a tick for every year with data, a label where there is room
    // (decades first, then five-year steps, then the years in between)
    const rank = year => year % 10 === 0 ? 0 : (year % 5 === 0 ? 1 : 2)
    const labelledYears = []
    ;[...filteredYears].sort((a, b) => rank(a) - rank(b) || a - b).forEach(year => {
      if (labelledYears.every(other => Math.abs(x(other) - x(year)) >= 40)) labelledYears.push(year)
    })
    const xAxis = svg.append('g').attr('class', 'x-axis')
    filteredYears.forEach(year => {
      xAxis.append('line')
        .attr('x1', x(year)).attr('x2', x(year))
        .attr('y1', plotBottom).attr('y2', plotBottom + 4)
        .attr('stroke', INK.axis)
        .attr('shape-rendering', 'crispEdges')
    })
    labelledYears.forEach(year => {
      xAxis.append('text')
        .attr('x', x(year))
        .attr('y', plotBottom + 20)
        .attr('text-anchor', 'middle')
        .text(year)
    })

    // Crosshair on the year under the pointer
    const crosshair = svg.append('line')
      .attr('y1', plotTop).attr('y2', plotBottom)
      .attr('stroke', INK.axis)
      .attr('shape-rendering', 'crispEdges')
      .style('display', 'none')

    const seriesLayer = svg.append('g')
    const bands = []

    if (ranges) {
      // Per study: the band from its lowest to its highest scenario, with the median as a line
      groups.forEach(group => {
        const members = drawn.filter(s => groupOf[s.id] === group)
        if (!members.length) return
        const rows = filteredYears
          .map(year => {
            const yearValues = members.map(m => m.byYear.get(year)).filter(Boolean).map(p => p.value)
            return yearValues.length
              ? { year, min: d3.min(yearValues), max: d3.max(yearValues), median: d3.median(yearValues), count: yearValues.length }
              : null
          })
          .filter(Boolean)
        if (rows.length) bands.push({ group, rows, byYear: new Map(rows.map(r => [r.year, r])) })
      })

      bands.forEach(band => {
        const color = band.group.color
        const el = seriesLayer.append('g')
          .attr('class', 'flp-series')
          .attr('data-group', band.group.name)

        el.append('path')
          .datum(band.rows)
          .attr('fill', color)
          .attr('fill-opacity', 0.18)
          .attr('d', d3.area().x(d => x(d.year)).y0(d => y(d.min)).y1(d => y(d.max)))

        ;['min', 'max'].forEach(edge => {
          el.append('path')
            .datum(band.rows)
            .attr('fill', 'none')
            .attr('stroke', color)
            .attr('stroke-opacity', 0.55)
            .attr('d', d3.line().x(d => x(d.year)).y(d => y(d[edge])))
        })

        // A band of a single year has no width to show: a stroke from low to high instead
        if (band.rows.length === 1) {
          el.append('line')
            .attr('x1', x(band.rows[0].year)).attr('x2', x(band.rows[0].year))
            .attr('y1', y(band.rows[0].min)).attr('y2', y(band.rows[0].max))
            .attr('stroke', color)
            .attr('stroke-opacity', 0.55)
            .attr('stroke-width', 3)
        }

        el.append('path')
          .datum(band.rows)
          .attr('fill', 'none')
          .attr('stroke', color)
          .attr('stroke-width', 2)
          .attr('stroke-linejoin', 'round')
          .attr('stroke-linecap', 'round')
          .attr('d', d3.line().x(d => x(d.year)).y(d => y(d.median)))

        el.selectAll('circle')
          .data(band.rows)
          .enter()
          .append('circle')
          .attr('cx', d => x(d.year))
          .attr('cy', d => y(d.median))
          .attr('r', 3.5)
          .attr('fill', color)
          .attr('stroke', INK.surface)
          .attr('stroke-width', 1.25)
      })
    } else {
      // One line per scenario, with its own marker shape
      const line = d3.line()
        .x(d => x(d.year))
        .y(d => y(d.value))

      drawn.forEach(s => {
        const group = seriesLayer.append('g')
          .attr('class', 'flp-series')
          .attr('data-id', s.id)

        group.append('path')
          .datum(s.points)
          .attr('class', 'scenario-line')
          .attr('fill', 'none')
          .attr('stroke', s.color)
          .attr('stroke-width', s.id === currentScenarioId ? 2.75 : 1.75)
          .attr('stroke-linejoin', 'round')
          .attr('stroke-linecap', 'round')
          .attr('d', line)

        group.selectAll('.scenario-dot')
          .data(s.points)
          .enter()
          .append('path')
          .attr('class', 'scenario-dot')
          .attr('d', symbolPath(s.id, 50))
          .attr('transform', d => `translate(${x(d.year)}, ${y(d.value)})`)
          .attr('fill', s.color)
          .attr('stroke', INK.surface)
          .attr('stroke-width', 1.25)
      })
    }

    // Focus marks: a ring on a scenario's point, a stroke over a study's range
    const focusRing = svg.append('circle')
      .attr('r', 8)
      .attr('fill', 'none')
      .attr('stroke-width', 1.5)
      .style('display', 'none')
    const focusSpan = svg.append('line')
      .attr('stroke-width', 3)
      .attr('stroke-linecap', 'round')
      .style('display', 'none')

    function clearFocus() {
      crosshair.style('display', 'none')
      focusRing.style('display', 'none')
      focusSpan.style('display', 'none')
      tooltip.style('display', 'none')
      setHighlight(null)
    }

    function placeTooltip(pointX, pointY) {
      tooltip.style('display', 'block')
      const box = tooltip.node().getBoundingClientRect()
      const left = pointX + 16 + box.width > width ? pointX - 16 - box.width : pointX + 16
      const top = Math.max(0, Math.min(chartHeight - box.height, pointY - box.height / 2))
      tooltip.style('left', `${left}px`).style('top', `${top}px`)
    }

    const nearestYear = px => filteredYears.reduce((best, candidate) =>
      Math.abs(x(candidate) - px) < Math.abs(x(best) - px) ? candidate : best)

    // The pointer only has to be near a point: it snaps to the closest year
    // and, within reach, to the closest scenario (or study) in that year.
    // A click opens that year in the comparison per year.
    svg.append('rect')
      .attr('x', plotLeft)
      .attr('y', plotTop - 10)
      .attr('width', Math.max(0, plotRight - plotLeft))
      .attr('height', plotBottom - plotTop + 20)
      .attr('fill', 'transparent')
      .style('cursor', 'pointer')
      .on('pointerleave', clearFocus)
      .on('click', function (event) {
        if (!filteredYears.length) return
        view.year = nearestYear(d3.pointer(event, svg.node())[0])
        view.view = 'year'
        renderView()
      })
      .on('pointermove', function (event) {
        if (!drawn.length || !filteredYears.length) return
        const [px, py] = d3.pointer(event, svg.node())
        const year = nearestYear(px)
        const pointX = x(year)
        const context = indexed ? `index · ${year}` : `${unitLabel} · ${year}`

        crosshair.attr('x1', pointX).attr('x2', pointX).style('display', null)

        if (ranges) {
          let nearest = null
          bands.forEach(band => {
            const row = band.byYear.get(year)
            if (!row) return
            const top = y(row.max)
            const bottom = y(row.min)
            const distance = py < top ? top - py : (py > bottom ? py - bottom : 0)
            const span = bottom - top
            // Inside overlapping bands the narrowest one wins
            if (!nearest || distance < nearest.distance || (distance === nearest.distance && span < nearest.span)) {
              nearest = { band, row, distance, span }
            }
          })

          focusRing.style('display', 'none')
          if (!nearest || nearest.distance > 30) {
            focusSpan.style('display', 'none')
            tooltip.style('display', 'none')
            setHighlight(null)
            return
          }

          const row = nearest.row
          setGroupHighlight(nearest.band.group)
          focusSpan
            .attr('x1', pointX).attr('x2', pointX)
            .attr('y1', y(row.max)).attr('y2', y(row.min))
            .attr('stroke', nearest.band.group.color)
            .style('display', null)

          tooltipValue.text(row.min === row.max ? format(row.min) : `${format(row.min)} – ${format(row.max)}`)
          tooltipValue.append('span').text(context)
          tooltipName.text('')
          tooltipName.append('i').style('background', nearest.band.group.color)
          tooltipName.append('span').text(`${nearest.band.group.name} · ${row.count} ${row.count === 1 ? 'scenario' : 'scenario\'s'}`)
          placeTooltip(pointX, (y(row.max) + y(row.min)) / 2)
          return
        }

        let nearest = null
        drawn.forEach(s => {
          const point = s.byYear.get(year)
          if (!point) return
          const distance = Math.abs(y(point.value) - py)
          if (!nearest || distance < nearest.distance) nearest = { series: s, point, distance }
        })

        focusSpan.style('display', 'none')
        if (!nearest || nearest.distance > 30) {
          focusRing.style('display', 'none')
          tooltip.style('display', 'none')
          setHighlight(null)
          return
        }

        const pointY = y(nearest.point.value)
        setHighlight(nearest.series.id)
        focusRing
          .attr('cx', pointX).attr('cy', pointY)
          .attr('stroke', nearest.series.color)
          .style('display', null)

        tooltipValue.text(format(nearest.point.value))
        tooltipValue.append('span').text(indexed
          ? `${context} · ${formatValue(nearest.point.absolute)} ${unitLabel}`
          : context)
        tooltipName.text('')
        tooltipName.append('i').style('background', nearest.series.color)
        tooltipName.append('span').text(variantTitles[nearest.series.id] || nearest.series.id)
        placeTooltip(pointX, pointY)
      })

    // Note under the graph: what the view shows
    const remarks = []
    // (the base year of the index is on the axis label)
    if (indexed && baseYear !== null && withoutIndex > 0) {
      remarks.push(`${withoutIndex} ${withoutIndex === 1 ? 'scenario' : 'scenario\'s'} zonder waarde in ${baseYear} niet getoond`)
    }
    if (ranges) remarks.push('Band: laagste–hoogste per studie, lijn = mediaan')
    note.selectAll('*').remove()
    note.append('span').attr('title', remarks.join(' · ')).text(remarks.join(' · '))
    note.append('span').text(drawn.length ? 'Klik op een jaar om te vergelijken' : '')
  }

  /* ----------  VIEW: PER JAAR  ---------- */
  function renderYearView() {
    bars.selectAll('*').remove()
    note.selectAll('*').remove()

    const year = activeYear()
    const switchedOn = shownScenarios.filter(s => isOn(s.id))
    const rows = switchedOn
      .map(s => {
        const point = seriesById[s.id].find(p => p.year === year)
        return point
          ? { id: s.id, title: variantTitles[s.id] || s.id, color: colorOf(s.id), value: point.value, group: groupOf[s.id] }
          : null
      })
      .filter(Boolean)
    const withoutValue = switchedOn.length - rows.length

    emptyNote
      .style('display', rows.length ? 'none' : 'flex')
      .text(switchedOn.length ? `Geen waarden in ${year}` : emptyText())
    if (!rows.length) return

    const refId = referenceId()
    const reference = rows.find(r => r.id === refId) || null
    const byValue = (a, b) => b.value - a.value
    const ordered = view.sort === 'group'
      ? groups.flatMap(group => {
        const members = rows.filter(r => r.group === group).sort(byValue)
        return members.length ? [{ header: group.name }, ...members] : []
      })
      : [...rows].sort(byValue)

    // One scale for all bars, from zero
    const low = Math.min(0, d3.min(rows, r => r.value))
    const high = Math.max(0, d3.max(rows, r => r.value))
    const position = d3.scaleLinear().domain(low === high ? [0, 1] : [low, high]).range([0, 100])

    const difference = row => {
      if (!reference) return ''
      if (row.id === reference.id) return 'referentie'
      const delta = row.value - reference.value
      const sign = delta > 0 ? '+' : (delta < 0 ? '−' : '±')
      const share = reference.value !== 0 ? ` (${sign}${d3.format(',.0f')(Math.abs(delta / reference.value * 100))}%)` : ''
      return `${sign}${formatValue(Math.abs(delta))}${share}`
    }

    // Rows fill the height of the graph; with many scenarios the list scrolls
    const headHeight = 22
    const rowHeight = Math.max(15, Math.min(26, Math.floor((chartHeight - headHeight) / ordered.length)))

    const head = bars.append('div').attr('class', 'flp-row-head').style('height', `${headHeight}px`)
    head.append('div').attr('class', 'flp-row-label').text('Scenario')
    head.append('div')
    head.append('div').attr('class', 'flp-row-value').text(unitLabel)
    head.append('div').attr('class', 'flp-row-diff').text(reference ? 't.o.v. referentie' : '')

    const addTrack = row => {
      const track = row.append('div').attr('class', 'flp-row-track')
      // The reference value as a line through all rows
      if (reference) track.append('i').attr('class', 'flp-refline').style('left', `${position(reference.value)}%`)
      return track
    }

    ordered.forEach(entry => {
      if (entry.header) {
        const groupRow = bars.append('div').attr('class', 'flp-row-group').style('height', `${rowHeight}px`)
        groupRow.append('div').attr('class', 'flp-row-label').attr('title', entry.header).text(entry.header)
        addTrack(groupRow)
        return
      }

      const row = bars.append('div')
        .attr('class', 'flp-row')
        .attr('data-id', entry.id)
        .attr('title', 'Klik om dit scenario als referentie te gebruiken')
        .classed('is-reference', !!reference && entry.id === reference.id)
        .style('height', `${rowHeight}px`)
        .on('click', () => { view.referenceId = entry.id; renderView() })
        .on('mouseenter', () => setHighlight(entry.id, false))
        .on('mouseleave', () => setHighlight(null))

      row.append('div').attr('class', 'flp-row-label').text(entry.title)
      addTrack(row).append('i')
        .attr('class', 'flp-bar')
        .style('left', `${position(Math.min(0, entry.value))}%`)
        .style('width', `${Math.abs(position(entry.value) - position(0))}%`)
        .style('background', entry.color)
      row.append('div').attr('class', 'flp-row-value').text(formatValue(entry.value))
      row.append('div').attr('class', 'flp-row-diff').text(difference(entry))
    })

    // Note under the graph: the spread in this year, and the reference
    const yearValues = rows.map(r => r.value)
    const spread = [
      `${year}`,
      `laagste ${formatValue(d3.min(yearValues))}`,
      `mediaan ${formatValue(d3.median(yearValues))}`,
      `hoogste ${formatValue(d3.max(yearValues))} ${unitLabel}`
    ]
    if (withoutValue > 0) spread.push(`${withoutValue} ${withoutValue === 1 ? 'scenario' : 'scenario\'s'} zonder waarde`)
    note.append('span').attr('title', spread.join(' · ')).text(spread.join(' · '))

    const referenceTitle = refId ? (variantTitles[refId] || refId) : null
    note.append('span').text(reference
      ? `Referentie: ${referenceTitle} · klik om te wisselen`
      : (referenceTitle
        ? `Referentie zonder waarde in ${year} · klik op een scenario`
        : 'Klik op een scenario als referentie'))
  }

  function renderView() {
    renderToolbar()
    const perYear = view.view === 'year'
    chart.classed('is-bars', perYear)
    svg.style('display', perYear ? 'none' : null)
    bars.style('display', perYear ? 'block' : 'none')
    tooltip.style('display', 'none')
    if (perYear) renderYearView()
    else updateGraph()
    updateLegend()
  }

  /* ----------  LEGEND  ---------- */
  const legendPanel = popup.append('div').attr('class', 'flp-legend-panel')
  const legendHead = legendPanel.append('div').attr('class', 'flp-legend-head')
  legendHead.append('span').attr('class', 'flp-legend-title').text('Scenario\'s')
  const legendCount = legendHead.append('span').attr('class', 'flp-legend-count')

  legendHead.append('button')
    .attr('type', 'button')
    .attr('class', 'flp-link')
    .text('Alles tonen')
    .on('click', function () {
      shownScenarios.forEach(s => globalVisibleScenarios.add(s.id))
      renderView()
    })

  legendHead.append('button')
    .attr('type', 'button')
    .attr('class', 'flp-link')
    .text('Alles verbergen')
    .on('click', function () {
      shownScenarios.forEach(s => globalVisibleScenarios.delete(s.id))
      renderView()
    })

  legendHead.append('span').attr('class', 'flp-spacer')

  // Year range toggle button
  if (hasEarlyYears) {
    const yearToggleBtn = legendHead.append('button')
      .attr('type', 'button')
      .attr('class', 'flp-link')
      .text(showAllYears ? 'Verberg ≤2024' : 'Toon alle jaren')
      .on('click', function () {
        showAllYears = !showAllYears
        flowPopupView.showAllYears = showAllYears
        yearToggleBtn.text(showAllYears ? 'Verberg ≤2024' : 'Toon alle jaren')
        renderView()
      })
  }

  const legend = legendPanel.append('div').attr('class', 'flp-legend')

  // A group's title switches the whole group
  groups.forEach(group => {
    const groupEl = legend.append('div').attr('class', 'flp-group')

    groupEl.append('button')
      .attr('type', 'button')
      .attr('class', 'flp-group-title')
      .attr('title', group.name)
      .text(group.name)
      .on('click', function () {
        const allOn = group.scenarios.every(s => isOn(s.id))
        group.scenarios.forEach(s => {
          if (allOn) globalVisibleScenarios.delete(s.id)
          else globalVisibleScenarios.add(s.id)
        })
        renderView()
      })

    group.scenarios.forEach(s => {
      const label = variantTitles[s.id] || s.id
      const item = groupEl.append('button')
        .attr('type', 'button')
        .attr('class', 'flp-item')
        .attr('data-id', s.id)
        .attr('title', label)
        .classed('is-current', s.id === currentScenarioId)
        .on('click', function () {
          if (isOn(s.id)) {
            globalVisibleScenarios.delete(s.id)
          } else {
            globalVisibleScenarios.add(s.id)
          }
          renderView()
        })
        .on('mouseenter', () => { if (isOn(s.id)) setHighlight(s.id) })
        .on('mouseleave', () => setHighlight(null))

      // Key: a stroke of the line with the scenario's marker
      const key = item.append('svg')
        .attr('class', 'flp-key')
        .attr('width', 26)
        .attr('height', 12)
        .style('color', colorOf(s.id))
      key.append('line')
        .attr('x1', 1).attr('x2', 25)
        .attr('y1', 6).attr('y2', 6)
        .attr('stroke', 'currentColor')
        .attr('stroke-width', 1.75)
        .attr('stroke-linecap', 'round')
      key.append('path')
        .attr('d', symbolPath(s.id, 46))
        .attr('transform', 'translate(13, 6)')
        .attr('fill', 'currentColor')
        .attr('stroke', INK.panel)
        .attr('stroke-width', 1)

      item.append('span').attr('class', 'flp-item-label').text(label)
    })
  })

  function updateLegend() {
    legend.selectAll('.flp-item')
      .classed('is-off', function () { return !isOn(this.dataset.id) })
      .attr('aria-pressed', function () { return isOn(this.dataset.id) ? 'true' : 'false' })
    const onCount = shownScenarios.filter(s => isOn(s.id)).length
    legendCount.text(`${onCount} / ${shownScenarios.length}`)
  }

  renderView()
}
