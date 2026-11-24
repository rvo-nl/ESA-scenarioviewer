// Ternary Energy Mix — "Energiemix-trajecten"
//
// Based on Ember's (Electrotech Revolution) "Historical Final Energy Mix
// Trajectories (1900–2023)": https://energy-history-ternary.electrotech-revolution.com/
//
// A ternary plot of the final energy mix, one trajectory per scenario over
// its years (and the CBS energiebalans as history). Each point is the split
// of final energy use into three shares that sum to 100%:
//   Elektronen   electricity
//   Fossiel      oil products, crude oil, coal, fossil methanol, non-biogenic
//                waste, plastic, and the fossil part of the mixed carriers
//   Bio & overig everything else (biomass, heat, ambient heat, geothermal,
//                solar thermal, hydrogen, ammonia, synthetic fuels, …)
// Mixed carriers are split between fossil and bio by origin, per scenario-year:
//   methane    natural gas and green gas, by the inputs of greengas_mixer:
//              natural gas (fossil) against the green gas made there — its
//              bio inputs minus what leaves the mixer as anything but methane
//              (biomass passed through, conversion losses). In some scenarios
//              the mixer puts out more methane than comes in; that gap takes
//              the same ratio.
//   waste_mix  by the inputs of waste_mixer: non-biogenic waste against
//              biomass
//   koolstof   (systeemnode) by the ratio of its fossil and biogenic supply
// Every user of a mixed carrier gets the same ratio — an approximation, since
// the diagram does not track the split downstream. Without mixer data (the
// industry diagrams, or a scenario-year without flows through the mixer) a
// mixed carrier keeps its usual group: methane fossil, the waste mix bio.
//
// Works for every diagram: final energy use is taken as the flows entering
// the final-consumption nodes (ids containing "finaal" or "bunkers", minus
// "_post_" aggregates and refineries' own use) from outside them, so chains of finaal nodes (as in
// the detailed industry diagram) are not double counted. Carriers are
// classified by prefix, which also covers the detailed carrier names
// (oil_products_naphta, methane_aardgas, …) and the Dutch names of the
// systeemnode diagram (elektriciteit, koolstof_fossiel, …). The section
// follows the diagram chosen in the viewer's menu.
//
// Zoom: by default each share gets a lower bound just below the lowest value
// any visible scenario reaches (rounded down to 5%), and the plot shows only
// the sub-triangle where every share is at least its bound — itself an
// equilateral triangle, so it reads as a normal ternary plot with narrower
// axis domains. Bounds follow the diagram and the visible scenarios, not the
// selected scenario or year. Zoomed, the triangle also widens to the plot's
// full width: still a ternary plot (grid lines stay parallel to the edges and
// values read the same), but no longer equilateral, which spreads the
// trajectories apart sideways. "Volledig" shows the equilateral 0–100% plot.
//
// Basis ("Eindgebruik" / "Elektriciteitsproductie"): the same triangle for
// the inputs of electricity production — the flows into the production nodes
// (elektriciteitsproductie_*) — with the corners Hernieuwbaar (solar, wind;
// top-right), Regelbaar fossiel (bottom) and Regelbaar overig (nuclear,
// biomass, hydrogen and other; top-left). Inputs are fuel energy, so thermal
// plants weigh more than their electricity output. The end-use sector filter
// and "Per sector" apply to Eindgebruik only. Each basis keeps its own
// carrier grouping; config under "ternaryMix.electricity" ({ classes,
// carrierGroups, nodePattern }).
//
// Lines "Per sector": instead of one line per scenario (the mix of all chosen
// end-use sectors together), one line per scenario × end-use sector, coloured
// by sector; the selected scenario's lines are drawn heavier, CBS history
// dashed. The legend then lists the sectors (hover highlights, click hides).
//
// Carrier grouping can also be changed in the viewer ("Dragerindeling"):
// per carrier Elektronen / Fossiel / Bio & overig (or, for a mixed carrier,
// by origin). Those choices are remembered per browser and take precedence
// over the configured classes.
//
// Overridable from viewer-config.json under "ternaryMix":
//   { "diagramId": "...",
//     "carrierGroups": { "<carrier id>": "electrons" | "fossil" | "bio" | "split" | "exclude" },
//     "classes": { "electrons": [...], "fossil": [...], "bio": [...] },
//     "splits": { "<mixed carrier>": { "fossil": [...], "bio": [...] } |
//                                    { "node": "<mixer node>", "fossil": [...] } },
//     "consumptionPattern": "finaal|bunkers" }
// A carrier's group is decided by, in order: the viewer's Dragerindeling
// panel (per browser), carrierGroups (exact ids), splits, then the classes
// (id prefixes, so "oil_products" also covers "oil_products_naphta"); a
// carrier matching none counts as bio & overig.
// "exclude" (Weglaten) leaves a carrier out altogether: it counts towards no
// share and not towards the total.
//
// Public API: window.initTernaryMix(), window.updateTernaryMix()
// Depends on globals: d3, viewerConfig, sankeyDataLibraries,
// globalActiveScenario, globalActiveYear, currentUnit, ScenarioSettings.

(function () {
  const DEFAULT_CLASSES = {
    electrons: ['electricity', 'elektriciteit'],
    fossil: ['oil_products', 'oil_ruw', 'methane', 'coal_products', 'fossil_methanol', 'non_biogenic_waste',
      'gas_power_fuel_mix', 'plastic', 'koolstof_fossiel']
  }
  // A split by supply compares the flows of its fossil and bio carriers; a
  // split by node compares the inputs of the node that mixes the carrier
  // (inputs with a fossil carrier against all others).
  const DEFAULT_SPLITS = {
    koolstof: { fossil: ['koolstof_fossiel'], bio: ['koolstof_biogeen'] },
    methane: { node: 'greengas_mixer', fossil: ['methane'] },
    waste_mix: { node: 'waste_mixer', fossil: ['non_biogenic_waste'] }
  }
  const IGNORED_CARRIERS = new Set(['aggregate', 'verlies', 'mismatch'])

  // End-use categories a final-consumption node belongs to, matched on its id
  // in this order (internationaal before nationaal, which it contains);
  // listed in display order. The last one catches the rest.
  const DEFAULT_CATEGORIES = [
    { id: 'industrie', label: 'Industrie', pattern: 'industrie', order: 1 },
    { id: 'gebouwde_omgeving', label: 'Gebouwde omgeving', pattern: 'huishoudens|utiliteit|gebouwde_omgeving', order: 2 },
    { id: 'landbouw', label: 'Landbouw', pattern: 'landbouw', order: 3 },
    { id: 'mobiliteit_internationaal', label: 'Mobiliteit internationaal', pattern: 'internationaal|bunkers', order: 5 },
    { id: 'mobiliteit_nationaal', label: 'Mobiliteit nationaal', pattern: 'mobiliteit', order: 4 },
    { id: 'overig', label: 'Overig', pattern: '.', order: 6 }
  ]
  const EXCLUDED_STORAGE_KEY = 'ternaryMix.excludedCategories'
  const COLOR_BY_STORAGE_KEY = 'ternaryMix.colorBy'
  // Line colour per end-use sector in the "Per sector" view (a category in
  // viewer-config can set its own `color`).
  const SECTOR_COLORS = {
    industrie: '#4F7CA8',
    gebouwde_omgeving: '#D07A55',
    landbouw: '#5E9A5A',
    mobiliteit_nationaal: '#C29A35',
    mobiliteit_internationaal: '#8A68B0',
    overig: '#8C8C8C'
  }
  const ALL_GROUPS = ['electrons', 'fossil', 'bio']
  const GROUPING_STORAGE_KEY = 'ternaryMix.carrierGroups'

  const GROUP_OPTIONS = [
    { id: 'electrons' }, // labels come from the basis's axes
    { id: 'fossil' },
    { id: 'bio' },
    { id: 'split', label: 'Naar herkomst', splitOnly: true },
    { id: 'exclude', label: 'Weglaten' }
  ]

  // Readable carrier names; detailed carriers (oil_products_naphta) read as
  // "Olieproducten · naphta".
  const CARRIER_NAMES = {
    ammonia: 'Ammoniak',
    biomassa_ruw: 'Biomassa ruw',
    biomassa_product: 'Biomassa product',
    coal_products: 'Kolen(derivaten)',
    electricity: 'Elektriciteit',
    geothermal: 'Geothermie',
    heat: 'Warmte',
    hydrogen: 'Waterstof',
    methanol: 'Methanol',
    fossil_methanol: 'Methanol (fossiel)',
    non_biogenic_waste: 'Afval (niet-biogeen)',
    oil_products: 'Olieproducten',
    oil_ruw: 'Ruwe aardolie',
    omgevingswarmte: 'Omgevingswarmte',
    plastic: 'Plastic',
    solar_pv: 'Zon-PV',
    solar_thermal: 'Zonthermie',
    synthetic: 'Synthetisch',
    uranium: 'Uranium',
    waste_heat: 'Restwarmte',
    wind: 'Wind',
    methane: 'Methaan',
    waste_mix: 'Afvalmix',
    gas_power_fuel_mix: 'Brandstofmix centrales',
    ethylene: 'Etheen',
    elektriciteit: 'Elektriciteit',
    warmte: 'Warmte',
    waterstof_en_ammoniak: 'Waterstof & ammoniak',
    koolstof: 'Koolstof (gemengd)',
    koolstof_fossiel: 'Koolstof (fossiel)',
    koolstof_biogeen: 'Koolstof (biogeen)',
    zon: 'Zon'
  }

  // Optional upper bounds in the zoomed view (raised automatically if a
  // scenario goes beyond them). None by default: the zoomed view is the
  // triangle left by the lower bounds, so every axis runs its full width.
  const DEFAULT_ZOOM_MAX = {}

  // What the triangle shows. Both bases use the same three slots — 'bio'
  // top-left, 'electrons' top-right, 'fossil' at the bottom — with their own
  // labels, carrier classes and the nodes whose inflows are counted.
  const BASES = {
    finaal: {
      label: 'Eindgebruik',
      axes: {
        bio: { label: 'Bio & overig', low: 'Weinig bio & overig', high: 'Veel bio & overig' },
        electrons: { label: 'Elektronen', low: 'Weinig elektronen', high: 'Veel elektronen' },
        fossil: { label: 'Fossiel', low: 'Weinig fossiel', high: 'Veel fossiel' }
      },
      classes: DEFAULT_CLASSES,
      nodePattern: 'finaal|bunkers',
      // Refineries' own use (ETM "eigen verbruik") is left out: it is part of
      // fuel production, not end use.
      excludeNodes: /_post_|raffinaderij/,
      useCategories: true,
      measure: 'aandeel in finaal verbruik',
      total: 'Finaal verbruik',
      empty: 'bevat geen finaal verbruik om een energiemix van te maken'
    },
    elektriciteit: {
      label: 'Elektriciteitsproductie',
      axes: {
        bio: { label: 'Regelbaar overig', low: 'Weinig regelbaar overig', high: 'Veel regelbaar overig' },
        electrons: { label: 'Hernieuwbaar', low: 'Weinig hernieuwbaar', high: 'Veel hernieuwbaar' },
        fossil: { label: 'Regelbaar fossiel', low: 'Weinig regelbaar fossiel', high: 'Veel regelbaar fossiel' }
      },
      // Everything else (uranium, biomass, hydrogen, waste mix, …) counts as
      // regelbaar overig.
      classes: {
        electrons: ['wind', 'solar_pv', 'zon'],
        fossil: ['methane', 'oil_products', 'oil_ruw', 'coal_products', 'fossil_methanol', 'non_biogenic_waste',
          'gas_power_fuel_mix', 'plastic', 'koolstof_fossiel']
      },
      nodePattern: '^elektriciteitsproductie_',
      excludeNodes: /verlies|loss/,
      useCategories: false,
      measure: 'aandeel in input elektriciteitsproductie',
      total: 'Input elektriciteitsproductie',
      empty: 'bevat geen elektriciteitsproductie'
    }
  }
  const BASIS_STORAGE_KEY = 'ternaryMix.basis'
  let basis = (() => {
    try { return localStorage.getItem(BASIS_STORAGE_KEY) === 'elektriciteit' ? 'elektriciteit' : 'finaal' } catch (e) { return 'finaal' }
  })()
  // Corner labels of the current basis.
  let AXES = BASES[basis].axes

  const GROUP_PALETTE = ['#5B7FA3', '#C9795B', '#5E9A78', '#B08A3A', '#8A6FA8', '#4E9696', '#B5607A', '#7C8A55', '#9C7556', '#617084']
  const HISTORY_COLOR = '#2B2B2B'
  const INK = '#2B2B2B'
  const MUTED = '#8A8A8A'
  const PJ_PER_TWH = 3.6
  const HEIGHT = 620
  const HEIGHT_ZOOMED = 700

  let settings = null
  let index = null // { diagramId, links: [{ col values, cls }], columns:Set }
  let series = [] // [{ id, title, shortTitle, group, color, history, points: [{ year, bio, electrons, fossil, total }] }]
  const ZOOM_STORAGE_KEY = 'ternaryMix.zoom'
  let zoomed = (() => {
    try { return localStorage.getItem(ZOOM_STORAGE_KEY) !== 'full' } catch (e) { return true }
  })()
  let domain = { kind: 'triangle', lo: { bio: 0, electrons: 0, fossil: 0 }, hi: { bio: 1, electrons: 1, fossil: 1 }, step: 0.2 }
  let hidden = new Set() // scenario ids hidden via the legend
  // 'scenario': one line per scenario; 'sector': one per scenario × sector.
  let colorBy = (() => {
    try { return localStorage.getItem(COLOR_BY_STORAGE_KEY) === 'sector' ? 'sector' : 'scenario' } catch (e) { return 'scenario' }
  })()
  // Carrier → group chosen in the viewer (remembered per browser).
  // Each basis keeps its own grouping (Eindgebruik under the original key).
  function groupingKey () {
    return basis === 'finaal' ? GROUPING_STORAGE_KEY : `${GROUPING_STORAGE_KEY}.${basis}`
  }
  function loadOverrides () {
    try { return JSON.parse(localStorage.getItem(groupingKey()) || '{}') || {} } catch (e) { return {} }
  }
  let carrierOverrides = loadOverrides()
  let openPanel = null // 'categories' | 'grouping' | null — the panel below the controls
  // End-use categories left out of the shares (remembered per browser).
  let excludedCategories = (() => {
    try { return new Set(JSON.parse(localStorage.getItem(EXCLUDED_STORAGE_KEY) || '[]')) } catch (e) { return new Set() }
  })()
  let hoveredId = null
  let initialized = false
  let dom = {}

  // ── config & data ──────────────────────────────────────────────────────

  function cfg () {
    return (typeof viewerConfig !== 'undefined' && viewerConfig) || {}
  }

  function readSettings () {
    const own = cfg().ternaryMix || {}
    const defaultDiagram = (cfg().sankeyDiagrams || []).find(d => d.default) || (cfg().sankeyDiagrams || [])[0]
    const b = BASES[basis]
    const ownBasis = basis === 'finaal' ? own : (own.electricity || {})
    const classes = Object.assign({ bio: [] }, b.classes, ownBasis.classes)
    return {
      pinnedDiagramId: own.diagramId || null,
      defaultDiagramId: (defaultDiagram && defaultDiagram.id) || 'basis',
      classes,
      carrierGroups: ownBasis.carrierGroups || {},
      splits: Object.assign({}, DEFAULT_SPLITS, own.splits),
      zoomMax: Object.assign({}, DEFAULT_ZOOM_MAX, own.zoomMax),
      categories: (own.categories || DEFAULT_CATEGORIES).map((c, i) => Object.assign({ order: i }, c, { match: new RegExp(c.pattern, 'i') })),
      consumption: new RegExp(ownBasis.nodePattern || (basis === 'finaal' && own.consumptionPattern) || b.nodePattern, 'i'),
      excludeNodes: b.excludeNodes
    }
  }

  function getLibraries () {
    if (window.sankeyDataLibraries) return window.sankeyDataLibraries
    try {
      // Declared with `let` at the top level of the viewer's loadData.js.
      return sankeyDataLibraries
    } catch (e) {
      return null
    }
  }

  function activeDiagramId () {
    const libs = getLibraries()
    const wanted = settings.pinnedDiagramId || window.activeDiagramId || settings.defaultDiagramId
    return libs && libs[wanted] && libs[wanted].links ? wanted : settings.defaultDiagramId
  }

  function diagramTitle (id) {
    const d = (cfg().sankeyDiagrams || []).find(x => x.id === id)
    return d ? d.title : id
  }

  async function dataReady (timeout = 15000) {
    const start = Date.now()
    const ready = () => {
      const libs = getLibraries()
      const id = settings.pinnedDiagramId || settings.defaultDiagramId
      return cfg().viewer && libs && libs[id] && libs[id].links
    }
    while (!ready()) {
      if (Date.now() - start > timeout) return false
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return true
  }

  function classify (carrier) {
    const chosen = carrierOverrides[carrier]
    if (chosen && GROUP_OPTIONS.some(o => o.id === chosen) && (chosen !== 'split' || settings.splits[carrier])) return chosen
    return defaultClass(carrier)
  }

  function groupLabel (id) {
    return AXES[id] ? AXES[id].label : id
  }

  function isChanged (carrier) {
    return !!(carrierOverrides[carrier] && carrierOverrides[carrier] !== defaultClass(carrier))
  }

  // The group from configuration (everything but the viewer's panel).
  function defaultClass (carrier) {
    const configured = settings.carrierGroups[carrier]
    if (configured && GROUP_OPTIONS.some(o => o.id === configured) && (configured !== 'split' || settings.splits[carrier])) {
      return configured
    }
    if (settings.splits[carrier]) return 'split'
    return classByPrefix(carrier)
  }

  // The group from the class prefixes alone; also where a split carrier goes
  // when a scenario-year has no data to split it by.
  function classByPrefix (carrier) {
    const matches = prefixes => (prefixes || []).some(p => carrier === p || carrier.startsWith(p + '_'))
    if (matches(settings.classes.electrons)) return 'electrons'
    if (matches(settings.classes.fossil)) return 'fossil'
    if (matches(settings.classes.bio)) return 'bio'
    return 'bio'
  }

  // Final energy use: links entering the consumption nodes from outside them.
  function buildIndex () {
    const diagramId = activeDiagramId()
    const raw = getLibraries()[diagramId]
    const scope = raw.links.system ? 'system' : Object.keys(raw.links)[0]
    const rows = raw.links[scope] || []
    const filterCol = 'filter_' + scope
    const hasFilter = rows.some(r => r && Object.prototype.hasOwnProperty.call(r, filterCol))
    const isConsumption = id => settings.consumption.test(id) && !settings.excludeNodes.test(id)

    // The flows that set each split's ratio: the supply of its fossil and bio
    // carriers, or the flows through its mixer node.
    const splitSupply = {}
    Object.entries(settings.splits).forEach(([mixed, parts]) => {
      const fossil = parts.fossil || []
      const supply = splitSupply[mixed] = parts.node
        ? { node: true, fossilIn: [], bioIn: [], otherOut: [] }
        : { fossil: [], bio: [] }
      rows.forEach(r => {
        if (!r || !r.carrier || (hasFilter && !r[filterCol])) return
        if (parts.node) {
          if (r.target === parts.node) (fossil.includes(r.carrier) ? supply.fossilIn : supply.bioIn).push(r)
          else if (r.source === parts.node && r.carrier !== mixed) supply.otherOut.push(r)
          return
        }
        if (fossil.includes(r.carrier)) supply.fossil.push(r)
        if ((parts.bio || []).includes(r.carrier)) supply.bio.push(r)
      })
    })

    const links = []
    const columns = new Set()
    rows.forEach(r => {
      if (!r) return
      Object.keys(r).forEach(col => { if (/^\d{4}_/.test(col)) columns.add(col) })
      if (!r.source || !r.target || !r.carrier) return
      if (hasFilter && !r[filterCol]) return
      if (IGNORED_CARRIERS.has(r.carrier)) return
      if (!isConsumption(r.target) || isConsumption(r.source)) return
      const category = settings.categories.find(c => c.match.test(r.target))
      const carrier = String(r.carrier)
      links.push({ row: r, cls: classify(carrier), category: category ? category.id : 'overig' })
    })
    const present = new Set(links.map(l => l.category))
    const categories = settings.categories.filter(c => present.has(c.id)).sort((a, b) => a.order - b.order)

    // Carriers reaching final use, largest first (summed over all columns).
    const volume = new Map()
    links.forEach(l => {
      let v = 0
      columns.forEach(col => { const x = Number(l.row[col]); if (x > 0) v += x })
      volume.set(l.row.carrier, (volume.get(l.row.carrier) || 0) + v)
    })
    const carriers = [...volume.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([id]) => id)
    return { diagramId, links, columns, splitSupply, categories, carriers }
  }

  // Remembered exclusions that apply to this diagram — ignored altogether if
  // they would leave none of its categories.
  function effectiveExclusions () {
    if (!BASES[basis].useCategories) return new Set()
    const present = index.categories.map(c => c.id)
    return present.every(id => excludedCategories.has(id)) ? new Set() : excludedCategories
  }

  // "Per sector" lines only apply to Eindgebruik.
  function lineMode () {
    return BASES[basis].useCategories ? colorBy : 'scenario'
  }

  // Fossil share of a split carrier in one column (scenario-year), or null
  // when there is nothing to split it by.
  function fossilShare (carrier, column) {
    const supply = index.splitSupply[carrier]
    const sumOf = list => d3.sum(list, r => Math.max(0, Number(r[column]) || 0))
    let fossil, bio
    if (supply.node) {
      // Bio inputs that leave the mixer as another carrier or as losses never
      // became part of the mixed carrier.
      fossil = sumOf(supply.fossilIn)
      bio = Math.max(0, sumOf(supply.bioIn) - sumOf(supply.otherOut))
    } else {
      fossil = sumOf(supply.fossil)
      bio = sumOf(supply.bio)
    }
    return fossil + bio > 0 ? fossil / (fossil + bio) : null
  }

  function mixFor (column, onlyCategory) {
    const sums = { bio: 0, electrons: 0, fossil: 0 }
    const excluded = effectiveExclusions()
    index.links.forEach(l => {
      if (excluded.has(l.category)) return
      if (onlyCategory && l.category !== onlyCategory) return
      if (l.cls === 'exclude') return
      const v = Number(l.row[column])
      if (!(v > 0)) return
      if (l.cls !== 'split') {
        sums[l.cls] += v
        return
      }
      const share = fossilShare(l.row.carrier, column)
      if (share === null) {
        sums[classByPrefix(l.row.carrier)] += v
        return
      }
      sums.fossil += v * share
      sums.bio += v * (1 - share)
    })
    const total = d3.sum(ALL_GROUPS, k => sums[k])
    if (!(total > 0)) return null
    const mix = { total }
    ALL_GROUPS.forEach(k => { mix[k] = sums[k] / total })
    return mix
  }

  function sectorColor (cat) {
    if (cat.color) return cat.color
    if (SECTOR_COLORS[cat.id]) return SECTOR_COLORS[cat.id]
    const i = settings.categories.findIndex(c => c.id === cat.id)
    return GROUP_PALETTE[(i + 3) % GROUP_PALETTE.length]
  }

  function shortTitle (title) {
    const parts = String(title).split(' | ')
    return parts.length > 1 ? parts.slice(1).join(' | ') : title
  }

  function isVisibleInViewer (sc) {
    return !window.ScenarioSettings || typeof window.ScenarioSettings.isScenarioVisible !== 'function' ||
      window.ScenarioSettings.isScenarioVisible(sc.id) !== false
  }

  // One series per scenario with at least one year of data; colours by study,
  // shades per scenario within a study. CBS (historical) is the history line.
  function buildSeries () {
    const byScenario = new Map()
    index.columns.forEach(col => {
      const m = /^(\d{4})_(.+)$/.exec(col)
      if (!m) return
      if (!byScenario.has(m[2])) byScenario.set(m[2], [])
      byScenario.get(m[2]).push({ year: Number(m[1]), col })
    })

    const scenarios = (cfg().scenarios || []).filter(sc => byScenario.has(sc.id) && isVisibleInViewer(sc))
    const yearsOf = sc => byScenario.get(sc.id).slice().sort((a, b) => a.year - b.year)
    const isHistory = sc => /cbs/i.test(sc.id) || /cbs/i.test(sc.scenarioGroup || '')

    if (lineMode() === 'sector') {
      const excluded = effectiveExclusions()
      const sectors = index.categories.filter(c => !excluded.has(c.id))
      return scenarios.flatMap(sc => sectors.map(cat => ({
        id: `${sc.id}|${cat.id}`,
        scenarioId: sc.id,
        sectorId: cat.id,
        title: `${sc.title || sc.id} · ${cat.label}`,
        shortTitle: shortTitle(sc.title || sc.id),
        group: sc.scenarioGroup || 'Overig',
        sectorLabel: cat.label,
        history: isHistory(sc),
        color: sectorColor(cat),
        points: yearsOf(sc)
          .map(({ year, col }) => { const mix = mixFor(col, cat.id); return mix && Object.assign({ year }, mix) })
          .filter(Boolean)
      }))).filter(s => s.points.length)
    }

    const groups = [...new Set(scenarios.map(sc => sc.scenarioGroup || 'Overig'))]
    return scenarios.map(sc => {
      const points = byScenario.get(sc.id)
        .sort((a, b) => a.year - b.year)
        .map(({ year, col }) => { const mix = mixFor(col); return mix && Object.assign({ year }, mix) })
        .filter(Boolean)
      const group = sc.scenarioGroup || 'Overig'
      const history = /cbs/i.test(sc.id) || /cbs/i.test(group)
      const siblings = scenarios.filter(x => (x.scenarioGroup || 'Overig') === group)
      const rank = siblings.indexOf(sc)
      const base = d3.hcl(GROUP_PALETTE[groups.indexOf(group) % GROUP_PALETTE.length])
      if (siblings.length > 1) base.l += (rank / (siblings.length - 1) - 0.5) * 22
      return {
        id: sc.id,
        scenarioId: sc.id,
        sectorId: null,
        title: sc.title || sc.id,
        shortTitle: shortTitle(sc.title || sc.id),
        group,
        history,
        color: history ? HISTORY_COLOR : base.formatHex(),
        points
      }
    }).filter(s => s.points.length)
  }

  // ── geometry ───────────────────────────────────────────────────────────

  const SHARES = ['bio', 'electrons', 'fossil']
  const SQRT3_2 = Math.sqrt(3) / 2

  // Bounds per share. Zoomed: each lower bound just below the lowest value any
  // visible scenario reaches (5% steps), plus any configured upper bounds,
  // raised if a scenario exceeds them. Full view: 0–100%.
  function computeDomain () {
    const points = series.filter(s => !hidden.has(s.scenarioId)).flatMap(s => s.points)
    const lo = { bio: 0, electrons: 0, fossil: 0 }
    const hi = { bio: 1, electrons: 1, fossil: 1 }
    if (zoomed && points.length) {
      SHARES.forEach(k => {
        lo[k] = Math.max(0, Math.floor((d3.min(points, p => p[k]) - 0.01) * 20) / 20)
        const max = settings.zoomMax[k]
        if (max != null) hi[k] = Math.min(1, Math.max(max, Math.ceil((d3.max(points, p => p[k]) + 0.01) * 20) / 20))
      })
    }
    const span = d3.max(SHARES, k => Math.min(hi[k], 1 - d3.sum(SHARES.filter(j => j !== k), j => lo[j])) - lo[k])
    return { kind: 'triangle', lo, hi, step: span > 0.75 ? 0.2 : span > 0.35 ? 0.1 : 0.05 }
  }

  function tickValues (share) {
    const out = []
    const hi = domain.hi[share]
    for (let v = Math.ceil(domain.lo[share] / domain.step - 1e-9) * domain.step; v <= hi + 1e-9; v += domain.step) {
      out.push(Math.round(v * 1000) / 1000)
    }
    return out
  }

  // The bounds as half-planes a·e + c·f + d ≥ 0 in the (electrons, fossil)
  // plane, where bio = 1 − e − f.
  function constraints () {
    const { lo, hi } = domain
    return [
      [1, 0, -lo.electrons], [-1, 0, hi.electrons],
      [0, 1, -lo.fossil], [0, -1, hi.fossil],
      [-1, -1, 1 - lo.bio], [1, 1, -(1 - hi.bio)]
    ]
  }

  // Visible region: the full triangle clipped to every bound. With upper
  // bounds its empty corners are cut off, so it can have up to six sides.
  function domainPolygon () {
    let poly = [[0, 0], [1, 0], [0, 1]] // (e, f) of the bio, electrons and fossil corners
    constraints().forEach(([a, c, d]) => {
      const val = p => a * p[0] + c * p[1] + d
      const out = []
      poly.forEach((p, i) => {
        const q = poly[(i + 1) % poly.length]
        const vp = val(p)
        const vq = val(q)
        if (vp >= -1e-12) out.push(p)
        if ((vp > 1e-12 && vq < -1e-12) || (vp < -1e-12 && vq > 1e-12)) {
          const t = vp / (vp - vq)
          out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])])
        }
      })
      poly = out
    })
    return poly
  }

  // The part of a segment (in e, f) inside the bounds, or null.
  function clipSegment (p0, p1) {
    let t0 = 0
    let t1 = 1
    for (const [a, c, d] of constraints()) {
      const g0 = a * p0[0] + c * p0[1] + d
      const g1 = a * p1[0] + c * p1[1] + d
      if (g0 < -1e-9 && g1 < -1e-9) return null
      if (g0 < -1e-9) t0 = Math.max(t0, g0 / (g0 - g1))
      else if (g1 < -1e-9) t1 = Math.min(t1, g0 / (g0 - g1))
    }
    if (t1 - t0 < 1e-6) return null
    const at = t => [p0[0] + t * (p1[0] - p0[0]), p0[1] + t * (p1[1] - p0[1])]
    return [at(t0), at(t1)]
  }

  // Maps shares to the screen: the visible region is scaled to fill the plot.
  // Full view keeps the equilateral triangle; zoomed, the region may stretch
  // horizontally up to twice its natural proportion — still a ternary plot
  // (grid lines stay parallel), which spreads the trajectories sideways.
  function geometry () {
    const width = Math.max(320, dom.plot.node().clientWidth)
    const height = width < 640 ? Math.round(width * 0.95) : (zoomed ? HEIGHT_ZOOMED : HEIGHT)
    const margin = { top: 92, side: zoomed ? 110 : 120, bottom: 70 }
    const availW = width - 2 * margin.side
    const availH = height - margin.top - margin.bottom
    const abstract = ([e, f]) => [e + f / 2, f * SQRT3_2]
    const region = domainPolygon()
    const pts = region.map(abstract)
    const [x0, x1] = d3.extent(pts, p => p[0])
    const [y0, y1] = d3.extent(pts, p => p[1])
    const bw = Math.max(1e-6, x1 - x0)
    const bh = Math.max(1e-6, y1 - y0)
    let sx = availW / bw
    let sy = availH / bh
    const maxStretch = zoomed ? 2 : 1
    if (sx > sy * maxStretch) sx = sy * maxStretch
    if (sx < sy) sy = sx
    const ox = margin.side + (availW - bw * sx) / 2
    const oy = margin.top
    const toScreen = ef => {
      const [X, Y] = abstract(ef)
      return [ox + (X - x0) * sx, oy + (Y - y0) * sy]
    }
    return {
      kind: 'triangle',
      width,
      height,
      toScreen,
      at: p => toScreen([p.electrons, p.fossil]),
      polygon: region.map(toScreen),
      bbox: { x0: ox, x1: ox + bw * sx, y0: oy, y1: oy + bh * sy }
    }
  }

  // Outline vertices in a fixed order (bio, electrons, fossil corner), so the
  // outline morphs cleanly when the zoom changes.
  function outlinePoints (g) {
    const poly = domainPolygon()
    if (poly.length !== 3) return g.polygon
    const bio = d3.least(poly, v => v[0] + v[1])
    const electrons = d3.greatest(poly, v => v[0])
    const fossil = d3.greatest(poly, v => v[1])
    return [bio, electrons, fossil].map(g.toScreen)
  }

  // ── rendering ──────────────────────────────────────────────────────────

  function currentScenarioId () {
    return window.globalActiveScenario && window.globalActiveScenario.id
  }

  function currentYear () {
    return window.globalActiveYear && Number(window.globalActiveYear.id)
  }

  function render (animate) {
    if (!dom.svg || !index) return
    syncDiagram()
    series = buildSeries()
    domain = computeDomain()
    // A share's effective top: its own bound, or what the other lower bounds leave.
    const top = k => Math.min(domain.hi[k], 1 - d3.sum(SHARES.filter(j => j !== k), j => domain.lo[j]))
    const pctRange = k => `${Math.round(domain.lo[k] * 100)}–${Math.round(top(k) * 100)}%`
    const zoomText = zoomed
      ? `ingezoomd: ${['electrons', 'fossil', 'bio'].map(k => `${AXES[k].label.toLowerCase()} ${pctRange(k)}`).join(', ')}`
      : null
    const b = BASES[basis]
    const included = index.categories.filter(c => !effectiveExclusions().has(c.id))
    dom.context.text([
      diagramTitle(index.diagramId),
      b.useCategories && included.length < index.categories.length
        ? `${b.measure} van ${included.map(c => c.label.toLowerCase()).join(', ')}`
        : b.measure,
      index.carriers.some(isChanged) ? 'aangepaste dragerindeling' : null,
      (n => n ? `${n} ${n === 1 ? 'drager' : 'dragers'} weggelaten` : null)(index.carriers.filter(id => classify(id) === 'exclude').length),
      zoomText
    ].filter(Boolean).join('  ·  '))
    drawGroupingPanel()
    if (dom.zoomButtons) dom.zoomButtons.classed('is-active', key => (key === 'zoom') === zoomed)
    if (dom.colorByButtons) {
      dom.colorByButtons.classed('is-active', key => key === colorBy)
      d3.select(dom.colorByButtons.node().parentNode).style('display', b.useCategories ? null : 'none')
    }
    if (dom.basisButtons) dom.basisButtons.classed('is-active', key => key === basis)
    drawCategoryChips()

    if (!series.length) {
      dom.card.style('display', 'none')
      dom.message.style('display', null).text(index.links.length
        ? 'Er is geen verbruik met de gekozen eindgebruiksectoren en dragers.'
        : `Het diagram '${diagramTitle(index.diagramId)}' ${b.empty}.`)
      return
    }
    dom.card.style('display', null)
    dom.message.style('display', 'none')

    paint(animate)
    drawLegend()
    applyHighlight()
  }

  // Everything that depends on the view (zoom and size).
  function paint (animate) {
    const g = geometry()
    const t = dom.svg.transition().duration(animate ? 750 : 0).ease(d3.easeCubicInOut)
    dom.svg.attr('width', g.width).attr('height', g.height)

    // The outline morphs between shapes; grid and labels crossfade.
    morphOutline(outlinePoints(g), animate, t)
    drawFrame(g, t, animate)
    drawSeries(g, t)
  }

  // Both outlines are padded to the same number of vertices, and the new one
  // is rotated to start near the old one's first vertex, so it morphs cleanly.
  function morphOutline (pts, animate, t) {
    const path = a => `M${a.map(v => `${v[0]},${v[1]}`).join('L')}Z`
    const prev = dom.outlinePts
    if (!animate || !prev || !prev.length || !pts.length) {
      dom.outline.interrupt().attr('d', pts.length ? path(pts) : null)
      dom.outlinePts = pts
      return
    }
    const area = a => d3.polygonArea(a)
    let next = pts.slice()
    if (Math.sign(area(next)) !== Math.sign(area(prev)) && area(prev) !== 0) next.reverse()
    const start = d3.minIndex(next, v => (v[0] - prev[0][0]) ** 2 + (v[1] - prev[0][1]) ** 2)
    next = next.slice(start).concat(next.slice(0, start))
    const n = Math.max(prev.length, next.length)
    const pad = a => a.concat(Array(n - a.length).fill(a[a.length - 1]))
    dom.outline.interrupt().attr('d', path(pad(prev))).transition(t).attr('d', path(pad(next)))
    dom.outlinePts = next
  }

  function drawFrame (g, t, animate) {
    // Unchanged grid (same basis, bounds and size): keep it as it is.
    const signature = JSON.stringify([basis, domain.lo, domain.hi, g.width, g.height])
    if (dom.frame && signature === dom.frameSignature) return
    dom.frameSignature = signature
    // Crossfade: the new frame fades in over the old one as the grid changes.
    const previous = dom.frame
    // Explicit opacity: a fade-out starting from a missing attribute would jump to 0.
    const frame = dom.frame = dom.svg.insert('g', () => dom.outline.node()).attr('opacity', 1)
    if (previous && animate) {
      frame.attr('opacity', 0).transition(t).attr('opacity', 1)
      previous.transition(t).attr('opacity', 0).remove()
    } else if (previous) {
      previous.remove()
    }
    const text = (p, str, cls, anchor, dx = 0, dy = 0) => frame.append('text').attr('class', cls)
      .attr('x', p[0] + dx).attr('y', p[1] + dy).attr('text-anchor', anchor).text(str)
    const arrow = (from, to, low, high, anchor, lowShift, highShift) => {
      frame.append('line').attr('class', 'ter-arrow')
        .attr('x1', from[0]).attr('y1', from[1]).attr('x2', to[0]).attr('y2', to[1])
        .attr('marker-end', 'url(#ter-arrowhead)')
      text(from, low, 'ter-hint', anchor, ...lowShift)
      text(to, high, 'ter-hint', anchor, ...highShift)
    }
    drawTriangleFrame(frame, g, text, arrow)
  }

  function drawTriangleFrame (frame, g, text, arrow) {
    const fmt = v => Math.round(v * 100)

    // Lines of constant share (full-triangle segments, clipped to the bounds),
    // and where each tick label sits on its line: electrons at the top end,
    // fossil at the right end, bio at the left end.
    const axes = {
      electrons: { segment: v => [[v, 0], [v, 1 - v]], end: s => s[0][1] <= s[1][1] ? s[0] : s[1], label: ['middle', 0, -12] },
      fossil: { segment: v => [[0, v], [1 - v, v]], end: s => s[0][0] >= s[1][0] ? s[0] : s[1], label: ['start', 9, 4] },
      bio: { segment: v => [[1 - v, 0], [0, 1 - v]], end: s => s[0][0] <= s[1][0] ? s[0] : s[1], label: ['end', -9, 4] }
    }
    SHARES.forEach(share => {
      const axis = axes[share]
      tickValues(share).forEach(v => {
        const seg = clipSegment(...axis.segment(v))
        if (!seg) return
        const [p, q] = seg.map(g.toScreen)
        frame.append('line').attr('class', 'ter-grid').attr('x1', p[0]).attr('y1', p[1]).attr('x2', q[0]).attr('y2', q[1])
        const [anchor, dx, dy] = axis.label
        text(g.toScreen(axis.end(seg)), fmt(v), 'ter-tick', anchor, dx, dy)
      })
    })

    // Corner names around the region.
    const { x0, x1, y0, y1 } = g.bbox
    const bottom = d3.greatest(g.polygon, p => p[1])
    text([x0, y0], AXES.bio.label, 'ter-corner', 'end', -22, -12)
    text([x1, y0], AXES.electrons.label, 'ter-corner', 'start', 22, -12)
    text(bottom, AXES.fossil.label, 'ter-corner', 'middle', 0, 44)

    // Direction arrows outside the top, right and left of the region; the side
    // arrows follow the region's edges.
    const w = x1 - x0
    const h = y1 - y0
    arrow([x0 + 0.2 * w, y0 - 50], [x0 + 0.8 * w, y0 - 50], AXES.electrons.low, AXES.electrons.high, 'middle', [0, -10], [0, -10])
    const ya = y0 + 0.2 * h
    const yb = y0 + 0.8 * h
    // Each side arrow runs parallel to its axis direction (fossil: from the
    // electrons corner towards the fossil corner; bio: from the fossil corner
    // towards the bio corner), 44px beyond the region's outermost point, so it
    // clears any cut-off corner.
    const sideLine = (from, to, outwardRight) => {
      const [p, q] = [g.toScreen(from), g.toScreen(to)]
      let nx = q[1] - p[1]
      let ny = -(q[0] - p[0])
      if ((nx > 0) !== outwardRight) { nx = -nx; ny = -ny }
      const len = Math.hypot(nx, ny)
      nx /= len
      ny /= len
      const reach = d3.max(g.polygon, v => v[0] * nx + v[1] * ny) + 44
      return y => [(reach - y * ny) / nx, y]
    }
    const right = sideLine([1, 0], [0, 1], true)
    const left = sideLine([0, 1], [0, 0], false)
    arrow(right(ya), right(yb), AXES.fossil.low, AXES.fossil.high, 'start', [8, -6], [8, 18])
    arrow(left(yb), left(ya), AXES.bio.low, AXES.bio.high, 'end', [-8, 18], [-8, -6])
  }

  function drawSeries (g, t) {
    const visible = series.filter(s => !hidden.has(s.scenarioId))
    const current = currentScenarioId()
    dom.lines.classed('ter-sectors', lineMode() === 'sector')
    const year = currentYear()
    const lineGen = d3.line().curve(d3.curveCatmullRom.alpha(0.5))
    const pathOf = s => lineGen(s.points.map(g.at))

    // History first so scenarios draw over it; the selected scenario last.
    const ordered = visible.slice().sort((a, b) =>
      (b.history - a.history) || ((a.scenarioId === current) - (b.scenarioId === current)))

    const groups = dom.lines.selectAll('g.ter-series')
      .data(ordered, s => s.id)
      .join(enter => {
        const gs = enter.append('g').attr('class', 'ter-series').attr('opacity', 0)
        gs.append('path').attr('class', 'ter-line').attr('d', pathOf)
        gs.append('path').attr('class', 'ter-hit').attr('d', pathOf)
        gs.append('g').attr('class', 'ter-dots')
        // New elements start where they belong; only existing ones glide
        gs.append('circle').attr('class', 'ter-end').attr('r', 4.5)
          .attr('cx', s => g.at(s.points[s.points.length - 1])[0])
          .attr('cy', s => g.at(s.points[s.points.length - 1])[1])
        gs.append('circle').attr('class', 'ter-now').attr('r', 7)
        gs.append('g').attr('class', 'ter-years')
        return gs
      }, update => update, exit => exit.transition(t).attr('opacity', 0).remove())

    groups.order()
    groups.classed('is-current', s => s.scenarioId === current).classed('is-history', s => s.history)
    groups.transition(t).attr('opacity', 1)

    groups.select('.ter-line').style('stroke', s => s.color).transition(t).attr('d', pathOf)
    groups.select('.ter-hit').attr('d', pathOf)
      .on('mouseenter', (event, s) => setHovered(s.id))
      .on('mousemove', (event, s) => showTooltip(event, s, g))
      .on('mouseleave', () => { setHovered(null); hideTooltip() })

    // A dot per year (the last year gets the larger end dot); each shows its
    // own values on hover.
    const pos = g.at
    const pointEvents = (sel, pointOf) => sel
      .on('mouseenter', (event, d) => { setHovered(d.s.id); showTooltip(event, d.s, g, pointOf(d)) })
      .on('mousemove', (event, d) => showTooltip(event, d.s, g, pointOf(d)))
      .on('mouseleave', () => { setHovered(null); hideTooltip() })
    groups.select('.ter-dots').each(function (s) {
      const dots = d3.select(this).selectAll('circle')
        .data(s.points.slice(0, -1).map(p => ({ s, p })), d => d.p.year)
        .join(enter => enter.append('circle').attr('class', 'ter-dot-pt').attr('r', 2.6)
          .attr('cx', d => pos(d.p)[0]).attr('cy', d => pos(d.p)[1]))
        .style('fill', d => d.s.color)
      pointEvents(dots, d => d.p)
      dots.transition(t).attr('cx', d => pos(d.p)[0]).attr('cy', d => pos(d.p)[1])
    })
    const endDots = groups.select('.ter-end').datum(s => ({ s, p: s.points[s.points.length - 1] }))
      .style('fill', d => d.s.color)
    pointEvents(endDots, d => d.p)
    endDots.transition(t).attr('cx', d => pos(d.p)[0]).attr('cy', d => pos(d.p)[1])

    // Ring at the selected year on the selected scenario (and on history).
    groups.select('.ter-now').each(function (s) {
      const p = s.points.find(pt => pt.year === year)
      const show = p && (s.scenarioId === current)
      const el = d3.select(this).style('stroke', s.color)
      if (!show) {
        el.style('display', 'none')
        return
      }
      // A ring that was hidden appears in place; a visible one glides along.
      const [cx, cy] = g.at(p)
      if (el.style('display') === 'none' || el.attr('cx') === null) el.interrupt().attr('cx', cx).attr('cy', cy)
      else el.transition(t).attr('cx', cx).attr('cy', cy)
      el.style('display', null)
    })

    // Year labels along the selected scenario and the history line.
    groups.select('.ter-years').each(function (s) {
      // Per sector, only the selected scenario's lines get (first and last) years.
      const labelled = lineMode() === 'sector' ? s.scenarioId === current : s.scenarioId === current || s.history
      const ends = lineMode() === 'sector' || s.history
      const pts = labelled ? s.points.filter((p, i) => !ends || i === 0 || i === s.points.length - 1 || (colorBy !== 'sector' && p.year % 10 === 0)) : []
      // New labels fade in at their point
      d3.select(this).selectAll('text')
        .data(pts, p => p.year)
        .join(enter => enter.append('text')
          .attr('x', p => g.at(p)[0] + 7)
          .attr('y', p => g.at(p)[1] - 6)
          .attr('opacity', 0))
        .attr('class', 'ter-year')
        .attr('text-anchor', 'start')
        .text(p => p.year)
        .transition(t)
        .attr('opacity', 1)
        .attr('x', p => g.at(p)[0] + 7)
        .attr('y', p => g.at(p)[1] - 6)
    })
  }

  // ── interaction ────────────────────────────────────────────────────────

  // Chips for the end-use categories in this diagram; at least one stays on.
  function drawCategoryChips () {
    const many = BASES[basis].useCategories && index.categories.length > 1
    if (!many && openPanel === 'categories') openPanel = null
    const onCount = index.categories.filter(c => !effectiveExclusions().has(c.id)).length
    dom.categoryButton.style('display', many ? null : 'none')
      .classed('is-active', openPanel === 'categories').attr('aria-expanded', String(openPanel === 'categories'))
    dom.categoryButton.select('.ter-count')
      .style('display', onCount < index.categories.length ? null : 'none')
      .text(`${onCount}/${index.categories.length}`)
    dom.categoryButton.select('.ter-chevron').text(openPanel === 'categories' ? '▴' : '▾')
    dom.categoryPanel.classed('is-open', openPanel === 'categories')
    dom.categoryAll.style('visibility', onCount < index.categories.length ? 'visible' : 'hidden')
    dom.categoryList.selectAll('button')
      .data(index.categories, c => c.id)
      .join('button')
      .attr('type', 'button')
      .attr('class', 'ter-chip')
      .classed('is-on', c => !effectiveExclusions().has(c.id))
      .attr('aria-pressed', c => !effectiveExclusions().has(c.id))
      .text(c => c.label)
      .on('click', (event, c) => toggleCategory(c))
  }

  // Switch between Eindgebruik and Elektriciteitsproductie: other nodes,
  // corner labels and carrier grouping; lines glide to their new positions.
  function setBasis (next) {
    if (next === basis || !BASES[next]) return
    basis = next
    try { localStorage.setItem(BASIS_STORAGE_KEY, next) } catch (e) {}
    AXES = BASES[basis].axes
    settings = readSettings()
    carrierOverrides = loadOverrides()
    if (openPanel === 'categories') openPanel = null
    hoveredId = null
    index = buildIndex()
    dom.legend.selectAll('.ter-legend-group').remove()
    dom.legend.selectAll('.ter-legend-note').remove()
    render(true)
  }

  function togglePanel (name) {
    openPanel = openPanel === name ? null : name
    drawCategoryChips()
    drawGroupingPanel()
  }

  function toggleCategory (c) {
    const excluded = effectiveExclusions()
    const on = !excluded.has(c.id)
    const onCount = index.categories.filter(x => !excluded.has(x.id)).length
    if (on && onCount <= 1) return
    if (excluded !== excludedCategories) excludedCategories = new Set()
    if (on) excludedCategories.add(c.id)
    else excludedCategories.delete(c.id)
    try { localStorage.setItem(EXCLUDED_STORAGE_KEY, JSON.stringify([...excludedCategories])) } catch (e) {}
    render(true)
  }

  function setHovered (id) {
    if (hoveredId === id) return
    hoveredId = id
    applyHighlight()
  }

  // Hover picks out one scenario (line and legend); the rest recede a little.
  // hoveredId is a series id, or 'sector:<id>' when a sector is hovered in
  // the legend (then all its lines are picked out).
  function applyHighlight () {
    const matches = s => s.id === hoveredId || (s.sectorId && hoveredId === 'sector:' + s.sectorId)
    dom.lines.selectAll('g.ter-series')
      .classed('is-hover', s => !!hoveredId && matches(s))
      .classed('is-faded', s => !!hoveredId && !matches(s))
    if (lineMode() === 'sector') {
      dom.legend.selectAll('.ter-legend-item')
        .classed('is-hover', c => hoveredId === 'sector:' + c.id)
        .classed('is-hidden', c => effectiveExclusions().has(c.id))
        .classed('is-current', false)
      return
    }
    dom.legend.selectAll('.ter-legend-item')
      .classed('is-hover', s => s.id === hoveredId)
      .classed('is-hidden', s => hidden.has(s.id))
      .classed('is-current', s => s.id === currentScenarioId())
  }

  const pct = d3.format('.0%')
  const nl = d3.formatLocale({ decimal: ',', thousands: '.', grouping: [3], currency: ['€', ''] })
  function formatTotal (pj) {
    const twh = typeof currentUnit !== 'undefined' && currentUnit === 'TWh'
    const v = twh ? pj / PJ_PER_TWH : pj
    return `${nl.format(v >= 100 ? ',.0f' : ',.1f')(v)} ${twh ? 'TWh' : 'PJ'}`
  }

  // Tooltip for the point of the hovered trajectory nearest the pointer.
  // Tooltip for a given point, or — on the line — the point nearest the pointer.
  function showTooltip (event, s, g, point) {
    const bounds = dom.plot.node().getBoundingClientRect()
    const mx = event.clientX - bounds.left
    const my = event.clientY - bounds.top
    const nearest = point || d3.least(s.points, p => {
      const [x, y] = g.at(p)
      return (x - mx) ** 2 + (y - my) ** 2
    })
    showGuides(g, nearest, s.color)
    dom.tooltip.html(`
      <div class="ter-tt-group">${s.sectorId ? `${s.sectorLabel} · ${s.history ? 'Historie' : s.group}` : s.history ? 'Historie' : s.group}</div>
      <div class="ter-tt-head"><i style="background:${s.color}"></i>${s.shortTitle}<span>${nearest.year}</span></div>
      ${['electrons', 'fossil', 'bio']
        .map(k => `<div class="ter-tt-row"><span>${groupLabel(k)}</span><b>${pct(nearest[k])}</b></div>`).join('')}
      <div class="ter-tt-total"><span>${index.carriers.some(id => classify(id) === 'exclude') ? `${BASES[basis].total} (meegeteld)` : BASES[basis].total}</span><b>${formatTotal(nearest.total)}</b></div>`)
    const tip = dom.tooltip.style('opacity', 1).node()
    let left = mx + 16
    let top = my + 14
    if (left + tip.offsetWidth > bounds.width - 8) left = mx - tip.offsetWidth - 16
    if (top + tip.offsetHeight > bounds.height - 8) top = my - tip.offsetHeight - 14
    dom.tooltip.style('left', left + 'px').style('top', Math.max(8, top) + 'px')
  }

  function hideTooltip () {
    dom.tooltip.style('opacity', 0)
    dom.guides.style('display', 'none')
  }

  // Reading aid for the hovered point: a dashed guide along each share's grid
  // line to the axis where that share is labelled, with the value there.
  // Triangle: electrons to the top edge, fossil to the right, bio to the left
  // (along lines parallel to the edges).
  function showGuides (g, p, color) {
    const layer = dom.guides.style('display', null)
    layer.selectAll('*').remove()
    const from = g.at(p)
    const label = v => `${Math.round(v * 100)}%`
    const guide = (to, value, anchor, dx, dy) => {
      layer.append('line').attr('class', 'ter-guide').style('stroke', color)
        .attr('x1', from[0]).attr('y1', from[1]).attr('x2', to[0]).attr('y2', to[1])
      layer.append('text').attr('class', 'ter-guide-label').style('fill', color)
        .attr('x', to[0] + dx).attr('y', to[1] + dy).attr('text-anchor', anchor).text(label(value))
    }
    const e = p.electrons
    const f = p.fossil
    const b = 1 - e - f
    const end = (seg, pick) => seg && g.toScreen(pick(seg[0], seg[1]) ? seg[0] : seg[1])
    const top = end(clipSegment([e, 0], [e, 1 - e]), (a, c) => a[1] <= c[1])
    const right = end(clipSegment([0, f], [1 - f, f]), (a, c) => a[0] >= c[0])
    const left = end(clipSegment([1 - b, 0], [0, 1 - b]), (a, c) => a[0] <= c[0])
    if (top) guide(top, e, 'middle', 0, -12)
    if (right) guide(right, f, 'start', 9, 4)
    if (left) guide(left, b, 'end', -9, 4)
  }

  // Legend grouped by study; history on top. Click hides/shows a scenario.
  function drawLegend () {
    if (lineMode() === 'sector') return drawSectorLegend()
    dom.legend.selectAll('.ter-legend-note').remove()
    const groups = d3.groups(series, s => s.history ? 'Historie' : s.group)
      .sort((a, b) => (b[0] === 'Historie') - (a[0] === 'Historie'))
    const blocks = dom.legend.selectAll('.ter-legend-group')
      .data(groups, d => d[0])
      .join(enter => {
        const b = enter.append('div').attr('class', 'ter-legend-group')
        b.append('div').attr('class', 'ter-legend-title')
        b.append('div').attr('class', 'ter-legend-items')
        return b
      })
    blocks.order()
    blocks.select('.ter-legend-title').text(d => d[0])
    blocks.select('.ter-legend-items').selectAll('.ter-legend-item')
      .data(d => d[1], s => s.id)
      .join(enter => {
        const item = enter.append('button').attr('type', 'button').attr('class', 'ter-legend-item')
        item.append('i')
        item.append('span')
        return item
      })
      .attr('title', s => s.title)
      .on('mouseenter', (event, s) => setHovered(s.id))
      .on('mouseleave', () => setHovered(null))
      .on('click', (event, s) => {
        if (hidden.has(s.id)) hidden.delete(s.id)
        else hidden.add(s.id)
        render(true)
      })
      .call(sel => sel.select('i').style('background', s => s.color))
      .call(sel => sel.select('span').text(s => s.history ? s.title : s.shortTitle))
  }

  // Per sector: the legend lists the sectors of this diagram (the same set as
  // the Eindgebruik chips); hover highlights a sector's lines, click hides it.
  function drawSectorLegend () {
    const cats = index.categories
    const current = (cfg().scenarios || []).find(sc => sc.id === currentScenarioId())
    const blocks = dom.legend.selectAll('.ter-legend-group')
      .data([['Eindgebruiksectoren', cats]], d => d[0])
      .join(enter => {
        const b = enter.append('div').attr('class', 'ter-legend-group')
        b.append('div').attr('class', 'ter-legend-title')
        b.append('div').attr('class', 'ter-legend-items')
        return b
      })
    blocks.select('.ter-legend-title').text(d => d[0])
    blocks.select('.ter-legend-items').selectAll('.ter-legend-item')
      .data(d => d[1], c => c.id)
      .join(enter => {
        const item = enter.append('button').attr('type', 'button').attr('class', 'ter-legend-item')
        item.append('i')
        item.append('span')
        return item
      })
      .attr('title', 'Klik om te tonen of te verbergen')
      .on('mouseenter', (event, c) => setHovered('sector:' + c.id))
      .on('mouseleave', () => setHovered(null))
      .on('click', (event, c) => toggleCategory(c))
      .call(sel => sel.select('i').style('background', c => sectorColor(c)))
      .call(sel => sel.select('span').text(c => c.label))
    dom.legend.selectAll('.ter-legend-note').data([0]).join('p').attr('class', 'ter-legend-note')
      .html(`Eén lijn per scenario en sector.${current ? ` Dikke lijnen: <b>${current.title || current.id}</b>.` : ''} Historie (CBS) gestreept.`)
  }

  // ── setup ──────────────────────────────────────────────────────────────

  function syncDiagram () {
    if (index && index.diagramId === activeDiagramId()) return
    index = buildIndex()
  }

  function carrierName (id) {
    if (CARRIER_NAMES[id]) return CARRIER_NAMES[id]
    const base = Object.keys(CARRIER_NAMES).filter(k => id.startsWith(k + '_')).sort((a, b) => b.length - a.length)[0]
    const rest = (base ? id.slice(base.length + 1) : id).replace(/_/g, ' ')
    return base ? `${CARRIER_NAMES[base]} · ${rest}` : rest.charAt(0).toUpperCase() + rest.slice(1)
  }

  // The grouping panel: one row per carrier with a switch for its group.
  function drawGroupingPanel () {
    const groupingOpen = openPanel === 'grouping'
    dom.groupingButton.classed('is-active', groupingOpen).attr('aria-expanded', String(groupingOpen))
      .classed('has-changes', Object.keys(carrierOverrides).length > 0)
    dom.groupingButton.select('.ter-chevron').text(groupingOpen ? '▴' : '▾')
    dom.grouping.classed('is-open', groupingOpen)
    if (!groupingOpen) return
    const changed = isChanged
    dom.groupingReset.style('visibility',
      index.carriers.some(changed) || Object.keys(carrierOverrides).length ? 'visible' : 'hidden')

    const rows = dom.groupingList.selectAll('.ter-grp-row')
      .data(index.carriers, id => id)
      .join(enter => {
        const row = enter.append('div').attr('class', 'ter-grp-row')
        row.append('span').attr('class', 'ter-grp-name')
        row.append('div').attr('class', 'ter-grp-switch')
        return row
      })
    rows.order()
    rows.classed('is-changed', changed)
    rows.classed('is-excluded', id => classify(id) === 'exclude')
    rows.select('.ter-grp-name').text(carrierName).attr('title', id => id)
    rows.select('.ter-grp-switch').each(function (id) {
      const options = GROUP_OPTIONS.filter(o => !o.splitOnly || settings.splits[id])
      d3.select(this).selectAll('button')
        .data(options, o => o.id)
        .join('button')
        .attr('type', 'button')
        .attr('class', 'ter-grp-btn')
        .classed('is-exclude', o => o.id === 'exclude')
        .classed('is-active', o => classify(id) === o.id)
        .text(o => o.label || AXES[o.id].label)
        .on('click', (event, o) => setCarrierGroup(id, o.id))
    })
  }

  function setCarrierGroup (carrier, group, rerender = true) {
    if (group === defaultClass(carrier)) delete carrierOverrides[carrier]
    else carrierOverrides[carrier] = group
    saveOverrides()
    index = buildIndex()
    if (rerender) render(true)
  }

  function saveOverrides () {
    try { localStorage.setItem(groupingKey(), JSON.stringify(carrierOverrides)) } catch (e) {}
  }

  function injectStyles () {
    if (document.getElementById('ter-styles')) return
    const style = document.createElement('style')
    style.id = 'ter-styles'
    style.textContent = `
      .ter-context { font-size: 12px; color: ${MUTED}; margin-top: 6px; letter-spacing: 0.01em; }
      .ter-card { display: flex; gap: 24px; margin-top: 12px; }
      /* Controls: one row, every control 32px high with the same border, radius and type. */
      .ter-bar { display: flex; justify-content: space-between; align-items: center; gap: 12px 24px; flex-wrap: wrap; margin-top: 20px; }
      .ter-bar-group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      #section-ternary button.ter-dropdown, #section-ternary .ter-segmented, #section-ternary button.ter-action {
        box-sizing: border-box; height: 32px; margin: 0; border: 1px solid #D5D1CA; border-radius: 7px; background: #FFF;
        font-family: inherit; font-size: 11.5px; font-weight: 400; letter-spacing: normal; text-transform: none; color: ${INK}; }
      #section-ternary button.ter-dropdown { display: inline-flex; align-items: center; gap: 7px; padding: 0 12px; line-height: 30px;
        cursor: pointer; transition: background 0.15s, border-color 0.15s; }
      #section-ternary button.ter-dropdown:hover { background: #F7F5F1; border-color: #BDB8B0; }
      #section-ternary button.ter-dropdown.is-active { background: #F2EFEA; border-color: #B9B3AA; }
      #section-ternary button.ter-dropdown svg { width: 13px; height: 13px; flex: 0 0 13px; color: #6F6F6F; }
      #section-ternary button.ter-dropdown .ter-chevron { font-size: 9px; color: ${MUTED}; }
      #section-ternary button.ter-dropdown .ter-count { font-size: 10px; line-height: 16px; padding: 0 6px; border-radius: 8px;
        background: #EFEBE4; color: #555; font-variant-numeric: tabular-nums; }
      #section-ternary button.ter-dropdown .ter-count:empty { display: none; }
      #section-ternary button.ter-dropdown .ter-dot { width: 6px; height: 6px; border-radius: 50%; background: #C9795B; display: none; }
      #section-ternary button.ter-dropdown.has-changes .ter-dot { display: inline-block; }
      #section-ternary .ter-segmented { display: inline-flex; align-items: center; gap: 2px; padding: 2px; }
      #section-ternary button.ter-seg-btn { box-sizing: border-box; height: 26px; line-height: 26px; padding: 0 12px; margin: 0;
        border: 0; border-radius: 5px; background: transparent; font-family: inherit; font-size: 11.5px; font-weight: 400;
        letter-spacing: normal; text-transform: none; color: #6F6F6F; cursor: pointer; transition: background 0.15s, color 0.15s; }
      #section-ternary button.ter-seg-btn:hover { background: #F2F0EC; color: ${INK}; }
      #section-ternary button.ter-seg-btn.is-active { background: ${INK}; color: #FFF; }
      #section-ternary button.ter-action { height: 28px; line-height: 26px; padding: 0 12px; cursor: pointer; transition: background 0.15s; }
      #section-ternary button.ter-action:hover { background: #F7F5F1; }
      /* Panels below the controls (one open at a time). */
      .ter-panel { max-height: 0; opacity: 0; overflow: hidden; background: #FFF; border: 0 solid #E6E2DB; border-radius: 12px;
        transition: max-height 0.4s ease, opacity 0.3s ease, margin 0.3s ease; }
      .ter-panel.is-open { max-height: 900px; opacity: 1; margin-top: 12px; border-width: 1px; overflow-y: auto; }
      .ter-panel > .ter-chips-list { padding: 4px 18px 16px; }
      .ter-grp-head { display: flex; align-items: baseline; gap: 14px; padding: 14px 18px 8px; }
      .ter-grp-title { font-size: 12.5px; color: ${INK}; }
      .ter-grp-note { font-size: 11px; color: ${MUTED}; }
      .ter-grp-head .ter-push { margin-left: auto !important; }
      .ter-grp-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 2px 28px; padding: 4px 18px 16px; }
      .ter-grp-row { display: flex; align-items: center; gap: 12px; padding: 4px 0; border-bottom: 1px solid #F1EEE9; }
      .ter-grp-name { flex: 1 1 auto; min-width: 0; font-size: 11.5px; color: #444; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ter-grp-row.is-changed .ter-grp-name { color: ${INK}; font-weight: 600; }
      .ter-grp-row.is-excluded .ter-grp-name { color: #A5A19A; text-decoration: line-through; }
      #section-ternary button.ter-grp-btn.is-exclude { border-left: 1px solid #E6E2DB; border-radius: 0 4px 4px 0; }
      #section-ternary button.ter-grp-btn.is-exclude.is-active { background: #9A958D; color: #FFF; }
      .ter-grp-row.is-changed .ter-grp-name::before { content: '●'; color: #C9795B; font-size: 8px; margin-right: 6px; vertical-align: 2px; }
      .ter-grp-switch { display: inline-flex; flex: 0 0 auto; border: 1px solid #DDD9D2; border-radius: 6px; padding: 1px; }
      #section-ternary button.ter-grp-btn { height: 22px; line-height: 20px; padding: 0 8px; margin: 0; font-size: 10.5px; font-weight: 400;
        font-family: inherit; text-transform: none; letter-spacing: normal; color: #6F6F6F; background: transparent;
        border: 1px solid transparent; border-radius: 4px; cursor: pointer; transition: background 0.15s, color 0.15s; }
      #section-ternary button.ter-grp-btn:hover { background: #F2EFEA; }
      #section-ternary button.ter-grp-btn.is-active { background: ${INK}; color: #FFF; }
      .ter-chips-list { display: flex; gap: 6px; flex-wrap: wrap; }
      #section-ternary button.ter-chip { box-sizing: border-box; height: 28px; line-height: 26px; padding: 0 12px; margin: 0; font-size: 11.5px;
        font-weight: 400; font-family: inherit; text-transform: none; letter-spacing: normal; border-radius: 7px;
        cursor: pointer; color: ${MUTED}; background: transparent; border: 1px solid #D5D1CA;
        transition: background 0.15s, color 0.15s, border-color 0.15s; }
      #section-ternary button.ter-chip:hover { border-color: #A9A49C; color: ${INK}; }
      /* Selected: white on ink, like the active switches. */
      #section-ternary button.ter-chip.is-on { background: ${INK}; color: #FFF; border-color: ${INK}; }
      #section-ternary button.ter-chip.is-on:hover { background: #444; border-color: #444; }
      .ter-plot { position: relative; flex: 1 1 0; min-width: 0; }
      .ter-plot svg { display: block; overflow: visible; }
      .ter-plot svg text { font-family: inherit; }
      .ter-grid { stroke: #E4E0D9; stroke-width: 1; shape-rendering: crispEdges; }
      .ter-outline { fill: none; stroke: #CFCAC2; stroke-width: 1; }
      .ter-tick { font-size: 10px; fill: ${MUTED}; font-variant-numeric: tabular-nums; }
      .ter-corner { font-size: 12.5px; font-weight: 600; fill: ${INK}; }
      .ter-hint { font-size: 10px; fill: #A5A19A; letter-spacing: 0.02em; }
      .ter-arrow { stroke: #BDB8B0; stroke-width: 1; }
      .ter-line { fill: none; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; opacity: 0.85;
        transition: stroke-width 0.15s, opacity 0.15s; }
      .ter-hit { fill: none; stroke: transparent; stroke-width: 12; cursor: pointer; pointer-events: stroke; }
      .ter-end { stroke: #FFF; stroke-width: 1.5; cursor: pointer; transition: r 0.12s; }
      .ter-end:hover { r: 6; }
      .ter-guides { pointer-events: none; }
      .ter-sectors .ter-line { stroke-width: 1.1; opacity: 0.55; }
      .ter-sectors .ter-series.is-current .ter-line { stroke-width: 2.6; opacity: 1; }
      .ter-sectors .ter-series.is-history .ter-line { stroke-dasharray: 5 3; opacity: 0.9; }
      .ter-sectors .ter-series:not(.is-current) .ter-dot-pt { r: 1.8; }
      .ter-sectors .ter-series:not(.is-current):not(.is-hover) .ter-end { r: 3; }
      .ter-sectors .ter-series.is-hover .ter-line { stroke-width: 2.6; opacity: 1; }
      .ter-legend-note { font-size: 11px; line-height: 1.5; color: ${MUTED}; margin: 14px 0 0; }
      .ter-legend-note b { font-weight: 600; color: ${INK}; }
      .ter-guide { stroke-width: 1.2; stroke-dasharray: 3 3; opacity: 0.85; }
      .ter-guide-label { font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums;
        paint-order: stroke; stroke: #EDEAE5; stroke-width: 5px; stroke-linejoin: round; }
      .ter-dot-pt { stroke: #FFF; stroke-width: 1; cursor: pointer; transition: r 0.12s; }
      .ter-dot-pt:hover { r: 4.5; }
      .ter-series.is-current .ter-dot-pt, .ter-series.is-hover .ter-dot-pt { r: 3.2; }
      .ter-now { fill: none; stroke-width: 1.5; pointer-events: none; }
      .ter-year { font-size: 9.5px; fill: ${MUTED}; pointer-events: none; font-variant-numeric: tabular-nums; }
      .ter-series.is-history .ter-line { stroke-width: 1.8; opacity: 0.9; }
      .ter-series.is-current .ter-line { stroke-width: 2.8; opacity: 1; }
      .ter-series.is-hover .ter-line { stroke-width: 3; opacity: 1; }
      .ter-series.is-faded { opacity: 0.35 !important; }
      .ter-series { transition: opacity 0.15s; }
      .ter-side { flex: 0 0 250px; max-height: ${HEIGHT_ZOOMED - 40}px; overflow-y: auto; padding: 16px 18px; background: #FFF;
        border: 1px solid #E6E2DB; border-radius: 12px; align-self: flex-start; box-sizing: border-box; }
      .ter-legend-group + .ter-legend-group { margin-top: 14px; }
      .ter-legend-title { font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase; color: ${MUTED};
        margin-bottom: 4px; line-height: 1.35; }
      #section-ternary button.ter-legend-item { all: unset; box-sizing: border-box; display: flex; align-items: center;
        gap: 9px; width: 100%; padding: 3px 6px; margin: 0 -6px; border-radius: 5px; cursor: pointer;
        font-size: 11.5px; line-height: 1.35; color: #444; transition: background 0.15s, opacity 0.15s; }
      #section-ternary button.ter-legend-item:hover, #section-ternary button.ter-legend-item.is-hover { background: #F2EFEA; }
      #section-ternary button.ter-legend-item.is-current { color: ${INK}; font-weight: 600; }
      #section-ternary button.ter-legend-item.is-hidden { opacity: 0.35; }
      .ter-legend-item i { flex: 0 0 9px; height: 9px; border-radius: 50%; }
      .ter-message { color: #888; font-size: 13px; padding: 16px 0; }
      .ter-tooltip { position: absolute; pointer-events: none; opacity: 0; transition: opacity 0.12s; min-width: 190px;
        background: #FFF; border: 1px solid ${INK}; padding: 10px 12px; font-size: 11px; color: ${INK}; z-index: 5; }
      .ter-tt-group { font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase; color: #9A9A9A; margin-bottom: 5px; }
      .ter-tt-head { display: flex; align-items: center; gap: 8px; font-size: 12px; margin-bottom: 7px; }
      .ter-tt-head i { flex: 0 0 9px; height: 9px; border-radius: 50%; }
      .ter-tt-head span { margin-left: auto; color: #9A9A9A; font-variant-numeric: tabular-nums; }
      .ter-tt-row, .ter-tt-total { display: flex; justify-content: space-between; gap: 16px; padding: 1.5px 0 1.5px 17px;
        font-variant-numeric: tabular-nums; }
      .ter-tt-row span, .ter-tt-total span { color: #6F6F6F; }
      .ter-tt-row b, .ter-tt-total b { font-weight: 400; }
      .ter-tt-total { margin-top: 6px; padding-top: 6px; border-top: 1px solid #E6E3DE; }
      @media (max-width: 900px) { .ter-card { flex-direction: column; } .ter-side { flex-basis: auto; max-height: none; } }
    `
    document.head.appendChild(style)
  }

  function buildLayout (container) {
    container.innerHTML = ''
    const root = d3.select(container)
    // One row: filters (panels open below) on the left, view switches right.
    const bar = root.append('div').attr('class', 'ter-bar')
    const filters = bar.append('div').attr('class', 'ter-bar-group')
    const views = bar.append('div').attr('class', 'ter-bar-group')
    const icon = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    const dropdown = (label, iconPath, title, panel) => filters.append('button').attr('type', 'button')
      .attr('class', 'ter-dropdown').attr('aria-expanded', 'false').attr('title', title)
      .html(`${icon(iconPath)}<span>${label}</span><span class="ter-count"></span><i class="ter-dot"></i><span class="ter-chevron">▾</span>`)
      .on('click', () => togglePanel(panel))
    const segmented = (keys, label, title, onPick, parent = views) => parent.append('div').attr('class', 'ter-segmented')
      .selectAll('button').data(keys).join('button')
      .attr('type', 'button')
      .attr('class', 'ter-seg-btn')
      .attr('title', title)
      .text(label)
      .on('click', (event, key) => onPick(key))

    dom.basisButtons = segmented(Object.keys(BASES),
      key => BASES[key].label,
      key => key === 'elektriciteit'
        ? 'Input voor elektriciteitsproductie: hernieuwbaar, regelbaar fossiel en regelbaar overig'
        : 'Finaal verbruik: elektronen, fossiel en bio & overig',
      key => setBasis(key), filters)
    dom.categoryButton = dropdown('Sectoren', 'M4 5h16l-6 7v6l-4 2v-8Z',
      'Kies welke eindgebruiksectoren meetellen', 'categories')
    dom.groupingButton = dropdown('Dragerindeling', 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
      'Kies per drager in welke groep die meetelt', 'grouping')

    dom.colorByButtons = segmented(['scenario', 'sector'],
      key => key === 'sector' ? 'Per sector' : 'Per scenario',
      key => key === 'sector'
        ? 'Eén lijn per scenario en eindgebruiksector, gekleurd per sector'
        : 'Eén lijn per scenario (alle gekozen sectoren samen)',
      key => {
        if (key === colorBy) return
        colorBy = key
        hoveredId = null
        try { localStorage.setItem(COLOR_BY_STORAGE_KEY, key) } catch (e) {}
        dom.legend.selectAll('.ter-legend-group').remove()
        render(true)
      })
    dom.zoomButtons = segmented(['zoom', 'full'],
      key => key === 'zoom' ? 'Ingezoomd' : 'Volledig',
      key => key === 'zoom' ? 'Assen ingekort tot het bereik van de scenario\'s' : 'Alle assen 0–100%',
      key => {
        if ((key === 'zoom') === zoomed) return
        zoomed = key === 'zoom'
        try { localStorage.setItem(ZOOM_STORAGE_KEY, zoomed ? 'zoom' : 'full') } catch (e) {}
        render(true)
      })

    // Panel: which end-use sectors count.
    dom.categoryPanel = root.append('div').attr('class', 'ter-panel')
    const catHead = dom.categoryPanel.append('div').attr('class', 'ter-grp-head')
    catHead.append('span').attr('class', 'ter-grp-title').text('Eindgebruiksectoren')
    catHead.append('span').attr('class', 'ter-grp-note').text('Klik een sector aan of uit; minstens één blijft aan.')
    dom.categoryAll = catHead.append('button').attr('type', 'button').attr('class', 'ter-action ter-push')
      .text('Alles')
      .on('click', () => {
        excludedCategories = new Set()
        try { localStorage.setItem(EXCLUDED_STORAGE_KEY, '[]') } catch (e) {}
        render(true)
      })
    dom.categoryList = dom.categoryPanel.append('div').attr('class', 'ter-chips-list')

    // Panel: carrier grouping.
    dom.grouping = root.append('div').attr('class', 'ter-panel ter-grouping')
    const head = dom.grouping.append('div').attr('class', 'ter-grp-head')
    head.append('span').attr('class', 'ter-grp-title').text('Indeling van dragers')
    head.append('span').attr('class', 'ter-grp-note').text('Grootste dragers eerst; gewijzigde indeling is gemarkeerd.')
    dom.groupingReset = head.append('button').attr('type', 'button').attr('class', 'ter-action ter-push')
      .text('Reset')
      .attr('title', 'Terug naar de standaardindeling')
      .on('click', () => {
        carrierOverrides = {}
        saveOverrides()
        index = buildIndex()
        render(true)
      })
    dom.groupingList = dom.grouping.append('div').attr('class', 'ter-grp-list')

    dom.message = root.append('p').attr('class', 'ter-message').style('display', 'none')
    dom.card = root.append('div').attr('class', 'ter-card')
    dom.plot = dom.card.append('div').attr('class', 'ter-plot')
    dom.svg = dom.plot.append('svg').attr('role', 'img').attr('aria-label', 'Ternair diagram van de energiemix per scenario')
    dom.svg.append('defs').append('marker')
      .attr('id', 'ter-arrowhead').attr('viewBox', '0 0 10 10').attr('refX', 9).attr('refY', 5)
      .attr('markerWidth', 7).attr('markerHeight', 7).attr('orient', 'auto-start-reverse')
      .append('path').attr('d', 'M0 1.5L9 5L0 8.5').attr('fill', 'none').attr('stroke', '#BDB8B0').attr('stroke-width', 1.2)
    dom.frame = null // created by drawFrame, below the outline and lines
    dom.outline = dom.svg.append('path').attr('class', 'ter-outline')
    dom.lines = dom.svg.append('g')
    dom.guides = dom.svg.append('g').attr('class', 'ter-guides').style('display', 'none')

    dom.tooltip = dom.plot.append('div').attr('class', 'ter-tooltip')
    dom.legend = dom.card.append('div').attr('class', 'ter-side')

    if (typeof ResizeObserver === 'function') {
      let last = container.clientWidth
      new ResizeObserver(() => {
        if (container.clientWidth === last) return
        last = container.clientWidth
        render(false)
      }).observe(container)
    }
  }

  window.initTernaryMix = async function () {
    const section = document.getElementById('section-ternary')
    const container = document.getElementById('ternaryContainer')
    if (!section || !container || initialized) return
    initialized = true

    settings = readSettings()
    if (!(await dataReady())) {
      container.innerHTML = '<p class="ter-message">Data voor deze sectie is niet beschikbaar.</p>'
      return
    }
    if (cfg().viewer && cfg().viewer.hasTernaryMix === false) {
      section.style.display = 'none'
      return
    }
    settings = readSettings()
    index = buildIndex()
    dom.context = d3.select('#ternaryContext')
    injectStyles()
    buildLayout(container)
    render(false)
  }

  window.updateTernaryMix = function () {
    if (!index) return
    render(true)
  }

  window.addEventListener('unitChanged', () => window.updateTernaryMix())
  window.addEventListener('scenarioVisibilityChanged', () => window.updateTernaryMix())
})()
