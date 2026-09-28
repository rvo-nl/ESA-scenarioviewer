// Carrier Treemaps — "Treemaps en staafdiagrammen"
//
// A single nested treemap on one canvas, on one shared scale, for the scenario
// and year selected in the viewer. Two views, switchable:
//   Per sector — each sector's energy input broken down by carrier
//   Per drager — each carrier broken down by the sectors it flows into
// Sectors:
//   Finaal verbruik: gebouwde omgeving, industrie, landbouw, mobiliteit
//                    nationaal, mobiliteit internationaal
//   Conversie:       elektriciteitsproductie, waterstofproductie,
//                    waterstofconversie, brand- en grondstofproductie
//
// Data: the incoming links of each sector's nodes in the sankey dataset
// (sankeyDataLibraries[diagramId].links.system). Only links flagged for the
// system view are summed — other views repeat some links (e.g. hydrogen into
// power plants), so this keeps totals equal to the main diagram. Tiles are one
// per carrier, summed over a sector's nodes; the per-node split is in the
// tooltip. Values are PJ in the data and follow the viewer's PJ/TWh toggle.
//
// Overridable from viewer-config.json under "carrierTreemaps":
//   { "diagramId": "basis", "groups": [...], "carrierLabels": { "<carrier>": "Label" } }
//
// Public API: window.initCarrierTreemaps(), window.updateCarrierTreemaps()
// Depends on globals: d3, XLSX, viewerConfig, sankeyDataLibraries,
// globalActiveScenario, globalActiveYear, currentUnit.

(function () {
  const DEFAULT_GROUPS = [
    {
      title: 'Finaal verbruik',
      sectors: [
        { id: 'industrie', title: 'Industrie', nodePattern: '^finaal_industrie_(?!.*_post_)' },
        { id: 'gebouwde_omgeving', title: 'Gebouwde omgeving', nodes: ['finaal_huishoudens', 'finaal_utiliteit'] },
        { id: 'landbouw', title: 'Landbouw', nodes: ['finaal_landbouw'] },
        { id: 'mobiliteit_nationaal', title: 'Mobiliteit nationaal', nodes: ['finaal_mobiliteit_nationaal'] },
        { id: 'mobiliteit_internationaal', title: 'Mobiliteit internationaal', nodes: ['finaal_mobiliteit_internationaal_lucht', 'finaal_mobiliteit_internationaal_zee'] }
      ]
    },
    {
      title: 'Conversie — input',
      sectors: [
        { id: 'elektriciteitsproductie', title: 'Elektriciteitsproductie', nodePattern: '^elektriciteitsproductie_' },
        { id: 'waterstofproductie', title: 'Waterstofproductie', nodes: ['waterstofproductie'] },
        { id: 'waterstofconversie', title: 'Waterstofconversie', nodes: ['waterstofconversie'] },
        { id: 'brand_en_grondstofproductie', title: 'Brand- en grondstofproductie', nodes: ['brand_en_grondstofproductie'] }
      ]
    }
  ]

  const CARRIER_LABELS = {
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
    plastic: 'Plastic afval',
    solar_pv: 'Zon-PV',
    solar_thermal: 'Zonthermie',
    synthetic: 'Synthetisch',
    uranium: 'Uranium',
    waste_heat: 'Restwarmte',
    wind: 'Wind',
    methane: 'Methaan',
    waste_mix: 'Afvalmix',
    gas_power_fuel_mix: 'Brandstofmix centrales'
  }

  // Line icons on a 24×24 grid, drawn as 1.2px strokes. Sectors and carriers
  // have separate sets that never share a shape, because both appear together:
  // per sector, block headers carry sector icons and tiles carrier icons; per
  // drager it is the other way round. viewer-config.json can override any
  // sector icon with `icon` on the sector, carriers under carrierIcons.
  const SECTOR_ICONS = {
    industrie: 'M3 21V11l5 3v-3l5 3v-3l5 3V4h3v17Z',
    gebouwde_omgeving: 'M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5',
    landbouw: 'M12 21v-9M12 12c0-4.4 3-7 8-7 0 5-3 7-8 7ZM12 15c0-3.3-2.2-5.5-7-5.5 0 4 2.2 5.5 7 5.5Z',
    mobiliteit_nationaal: 'M3 15l2-5.5A2 2 0 0 1 6.9 8h10.2a2 2 0 0 1 1.9 1.5L21 15v3h-2.5M5.5 18H3v-3M3 15h18M6 18a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M15 18a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
    mobiliteit_internationaal: 'M12 3c1 0 1.5 1 1.5 2v5l7 4v2l-7-2v4l2 1.5V21l-3.5-1-3.5 1v-1.5l2-1.5v-4l-7 2v-2l7-4V5c0-1 .5-2 1.5-2Z',
    // power plant: cooling tower with steam, and a stack
    elektriciteitsproductie: 'M5 21c1.5-4.5 1.5-9.5 0-13h8c-1.5 3.5-1.5 8.5 0 13ZM16 21v-9h3v9M3 21h18M6.5 5c.6-1.2 1.8-1.2 2.4 0s1.8 1.2 2.4 0',
    // electrolysis: a cell with two electrodes and rising bubbles
    waterstofproductie: 'M4 9h16v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3ZM8.5 4v10M15.5 4v10M11 17a1 1 0 1 0 2 0a1 1 0 1 0-2 0M11.3 12.5a.8.8 0 1 0 1.6 0a.8.8 0 1 0-1.6 0',
    waterstofconversie: 'M4 12a8 8 0 0 1 14-5.3M18 3v4h-4M20 12a8 8 0 0 1-14 5.3M6 21v-4h4',
    brand_en_grondstofproductie: 'M9 3h6M10 3v6l-5.5 9.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3M7.5 15h9'
  }

  const TILE_INK = '#FFFFFF' // icons and values on tiles, on every tile colour
  const TILE_ICON_MIN = 15 // px, icon size in tiles that just fit one
  const TILE_ICON_MAX = 36

  const CHIP_NEUTRAL = '#E6E2DA' // badge and chip fill for sectors

  const FLAME = 'M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5Z'
  const DROP = 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z'
  const BIN = 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6'
  const CARRIER_ICONS = {
    electricity: 'M13 3 5 13h6l-1 8 8-10h-6l1-8Z',
    heat: 'M8 20c-2-3 2-5 0-8s2-5 0-8M12 20c-2-3 2-5 0-8s2-5 0-8M16 20c-2-3 2-5 0-8s2-5 0-8',
    waste_heat: 'M6 20c-2-3 2-5 0-8s2-5 0-8M10 20c-2-3 2-5 0-8s2-5 0-8M14 12h7M18 9l3 3-3 3',
    // "H₂": an H with a subscript 2 on the baseline
    hydrogen: 'M3.5 5v14M12.5 5v14M3.5 12h9M15.5 14.6c.3-1.3 1.3-2 2.5-2 1.4 0 2.5 1 2.5 2.3 0 1.1-.7 1.9-1.6 2.7L15.5 20h5',
    methane: FLAME,
    gas_power_fuel_mix: FLAME,
    oil_products: DROP,
    oil_ruw: 'M6 4h12M6 20h12M7 4c-1.2 5-1.2 11 0 16M17 4c1.2 5 1.2 11 0 16M6.4 9.5h11.2M6.4 14.5h11.2',
    coal_products: 'M3 19l2.5-5 3.5 1.5 2.5-4.5 4 2.5 2.5-3.5L21 13v6Z',
    biomassa_ruw: 'M12 21v-6M12 15c-4 0-7-2.5-7-6a7 6 0 0 1 14 0c0 3.5-3 6-7 6Z',
    biomassa_product: 'M5 19c0-8 5-14 14-14 0 9-6 14-14 14ZM5 19l7-7',
    ammonia: 'M9.5 11a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M12 13.5V17M10 9.2 6.8 6.5M14 9.2l3.2-2.7M11 18.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0M5 5.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0M17 5.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
    geothermal: 'M3 20h18M3 16h6M15 16h6M12 20V6M9 9l3-3 3 3',
    omgevingswarmte: 'M3 9h11a3 3 0 1 0-3-3M3 15h14a3 3 0 1 1-3 3M3 12h7',
    solar_pv: 'M5.5 5h13l2 10h-17ZM4.5 10h15M12 5v10M9 20h6M12 15v5',
    solar_thermal: 'M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4',
    wind: 'M12 10v11M9 21h6M11 9a1 1 0 1 0 2 0a1 1 0 1 0-2 0M12 8 10 2.5M13 9.5l5.5 1.5M11.2 9.8 7 14',
    uranium: 'M10.5 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M3 12a9 3.5 0 1 0 18 0a9 3.5 0 1 0-18 0M7.5 4.2a9 3.5 60 1 0 9 15.6a9 3.5 60 1 0-9-15.6M7.5 19.8a9 3.5-60 1 0 9-15.6a9 3.5-60 1 0-9 15.6',
    synthetic: 'M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9ZM12 8l3.5 2v4L12 16l-3.5-2v-4Z',
    plastic: 'M10 3h4M10.5 3v3L8 9v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9l-2.5-3V3M8 13h8',
    non_biogenic_waste: BIN,
    waste_mix: BIN,
    methanol: DROP + 'M9.5 15h5',
    fossil_methanol: DROP + 'M9.5 15h5'
  }

  // Link carriers that are bookkeeping, not an energy input.
  const IGNORED_CARRIERS = new Set(['aggregate', 'verlies', 'mismatch'])

  const PJ_PER_TWH = 3.6
  const FALLBACK_COLOR = '#8A857D'

  let settings = null
  let index = null // { nodeTitles, carrierOrder, carrierColors, linksByTarget, columns:Set }
  const MODE_STORAGE_KEY = 'carrierTreemaps.mode'
  let mode = (() => {
    try { return localStorage.getItem(MODE_STORAGE_KEY) === 'carrier' ? 'carrier' : 'sector' } catch (e) { return 'sector' }
  })()
  const CHART_STORAGE_KEY = 'carrierTreemaps.chart'
  let chart = (() => {
    try { return localStorage.getItem(CHART_STORAGE_KEY) === 'bars' ? 'bars' : 'treemap' } catch (e) { return 'treemap' }
  })()
  // Comparison opens as a list unless the viewer chose the grid. (Key
  // versioned so earlier stored choices don't override the new default.)
  const CMP_LAYOUT_STORAGE_KEY = 'carrierTreemaps.compareLayout.v2'
  let compareLayout = (() => {
    try { return localStorage.getItem(CMP_LAYOUT_STORAGE_KEY) === 'grid' ? 'grid' : 'list' } catch (e) { return 'list' }
  })()
  const CMP_SORT_STORAGE_KEY = 'carrierTreemaps.compareSort'
  let compareSort = (() => {
    try { return localStorage.getItem(CMP_SORT_STORAGE_KEY) === 'group' ? 'group' : 'value' } catch (e) { return 'value' }
  })()
  let focus = null // { key, title } of the block being compared across scenarios
  let hoveredKey = null // carrier (per sector) or sector id (per drager) being highlighted
  let initialized = false
  let dom = {}

  // ── config & data ──────────────────────────────────────────────────────

  function cfg () {
    return (typeof viewerConfig !== 'undefined' && viewerConfig) || {}
  }

  function readSettings () {
    const own = cfg().carrierTreemaps || {}
    const defaultDiagram = (cfg().sankeyDiagrams || []).find(d => d.default) || (cfg().sankeyDiagrams || [])[0]
    return {
      // Pinned from config, or null to follow the diagram chosen in the menu.
      pinnedDiagramId: own.diagramId || null,
      defaultDiagramId: (defaultDiagram && defaultDiagram.id) || 'basis',
      groups: own.groups || DEFAULT_GROUPS,
      carrierLabels: Object.assign({}, CARRIER_LABELS, own.carrierLabels)
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

  // The viewer's config and diagram data both arrive asynchronously.
  // The diagram this section shows: pinned in config, else the one selected
  // in the viewer's diagram menu (falling back to the default until that
  // diagram's data is loaded).
  function activeDiagramId () {
    const s = settings || readSettings()
    const libs = getLibraries()
    const wanted = s.pinnedDiagramId || window.activeDiagramId || s.defaultDiagramId
    return libs && libs[wanted] && libs[wanted].links ? wanted : s.defaultDiagramId
  }

  function diagramTitle (id) {
    const d = (cfg().sankeyDiagrams || []).find(x => x.id === id)
    return d ? d.title : id
  }

  async function dataReady (timeout = 15000) {
    const start = Date.now()
    const ready = () => {
      const libs = getLibraries()
      const id = activeDiagramId()
      return cfg().viewer && libs && libs[id] && libs[id].links
    }
    while (!ready()) {
      if (Date.now() - start > timeout) return false
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return true
  }

  // The sankey legend colours are strong; this section shows them muted: less
  // chroma, and lightness pulled into a middle band so near-blacks become soft
  // greys and brights lose their glare. Done in HCL so hue and the relative
  // order of colours are kept.
  const MUTE = { chroma: 0.7, lightFloor: 30, lightSpan: 0.58 }
  function muteColor (color) {
    const c = d3.hcl(color)
    if (isNaN(c.h)) c.h = 0
    c.c = (c.c || 0) * MUTE.chroma
    c.l = MUTE.lightFloor + c.l * MUTE.lightSpan
    return c.formatHex()
  }

  function buildIndex () {
    const diagramId = activeDiagramId()
    const raw = getLibraries()[diagramId]
    const scope = raw.links.system ? 'system' : Object.keys(raw.links)[0]
    const links = raw.links[scope] || []
    const filterCol = 'filter_' + scope
    const hasFilter = links.some(row => Object.prototype.hasOwnProperty.call(row, filterCol))

    const nodeTitles = {}
    ;((raw.nodes && raw.nodes[scope]) || []).forEach(n => {
      if (!n || !n.id) return
      // A leading '.' hides the label in the sankey; the text is still the name.
      nodeTitles[n.id] = String(n['title.' + scope] || n['title.system'] || n.id).replace(/^\.+/, '').trim() || n.id
    })

    // Carriers whose legend colours look alike (e.g. 'grey' and '#777') get
    // stepped lightness so neighbouring tiles stay distinguishable.
    const legend = ((raw.legend && raw.legend[scope]) || []).filter(l => l && l.id && !IGNORED_CARRIERS.has(l.id))
    const carrierOrder = legend.map(l => l.id)
    const clusters = []
    legend.forEach(l => {
      const lab = d3.lab(d3.color(l.color || FALLBACK_COLOR))
      const near = clusters.find(c => Math.hypot(c.lab.l - lab.l, c.lab.a - lab.a, c.lab.b - lab.b) < 10)
      if (near) near.members.push(l)
      else clusters.push({ lab, hex: d3.color(l.color || FALLBACK_COLOR).formatHex(), members: [l] })
    })
    const carrierColors = {}
    clusters.forEach(({ hex, members }) => {
      if (members.length === 1) {
        carrierColors[members[0].id] = hex
        return
      }
      const base = d3.hsl(hex)
      const high = Math.min(0.8, base.l + 0.2)
      const low = Math.max(0.22, base.l - 0.2)
      members.forEach((m, i) => {
        carrierColors[m.id] = d3.hsl(base.h, base.s, high - (i / (members.length - 1)) * (high - low)).formatHex()
      })
    })

    Object.keys(carrierColors).forEach(id => { carrierColors[id] = muteColor(carrierColors[id]) })

    const linksByTarget = new Map()
    const columns = new Set()
    links.forEach(row => {
      if (!row) return
      // Rows omit empty cells, so collect value columns from every row.
      Object.keys(row).forEach(col => { if (/^\d{4}_/.test(col)) columns.add(col) })
      if (!row.target || !row.carrier) return
      if (hasFilter && !row[filterCol]) return
      if (IGNORED_CARRIERS.has(row.carrier)) return
      if (!linksByTarget.has(row.target)) linksByTarget.set(row.target, [])
      linksByTarget.get(row.target).push(row)
    })

    return { diagramId, nodeTitles, carrierOrder, carrierColors, linksByTarget, columns }
  }

  function sectorNodes (sector) {
    if (sector.nodes) return sector.nodes
    const pattern = new RegExp(sector.nodePattern)
    return [...index.linksByTarget.keys()].filter(id => pattern.test(id))
  }

  // Short node name inside its sector: "Industrie | chemie" -> "Chemie".
  function nodeLabel (sector, nodeId) {
    const title = index.nodeTitles[nodeId] || nodeId
    const prefix = new RegExp('^' + sector.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\|?\\s*', 'i')
    const short = title.replace(prefix, '').trim() || title
    return short.charAt(0).toUpperCase() + short.slice(1)
  }

  function currentColumn () {
    const scenario = window.globalActiveScenario && window.globalActiveScenario.id
    const year = window.globalActiveYear && window.globalActiveYear.id
    return scenario && year ? `${year}_${scenario}` : null
  }

  // Largest combined input over every scenario and year in the dataset. That
  // column fills the canvas; all others are drawn at the same pixels per PJ.
  function maxColumnTotal () {
    if (index.maxTotal != null) return index.maxTotal
    const known = new Set((cfg().scenarios || []).map(sc => sc.id))
    const sectors = settings.groups.flatMap(g => g.sectors)
    let max = 0
    index.columns.forEach(column => {
      const scenario = column.replace(/^\d{4}_/, '')
      if (known.size && !known.has(scenario)) return
      const total = d3.sum(sectors, sector => d3.sum(sectorCarriers(sector, column), c => c.value))
      if (total > max) {
        max = total
        index.maxColumn = column
      }
    })
    index.maxTotal = max
    return max
  }

  // Returns [{ carrier, value, parts: [{ node, value }] }] sorted large to small, in PJ.
  function sectorCarriers (sector, column) {
    const byCarrier = new Map()
    sectorNodes(sector).forEach(nodeId => {
      ;(index.linksByTarget.get(nodeId) || []).forEach(row => {
        const value = Number(row[column])
        if (!(value > 0)) return
        if (!byCarrier.has(row.carrier)) byCarrier.set(row.carrier, new Map())
        const parts = byCarrier.get(row.carrier)
        parts.set(nodeId, (parts.get(nodeId) || 0) + value)
      })
    })
    return [...byCarrier.entries()].map(([carrier, parts]) => ({
      carrier,
      value: d3.sum([...parts.values()]),
      parts: [...parts.entries()].map(([node, value]) => ({ node, label: nodeLabel(sector, node), value }))
        .sort((a, b) => b.value - a.value)
    })).sort((a, b) => b.value - a.value)
  }

  // ── units & formatting ─────────────────────────────────────────────────

  function unit () {
    return (typeof currentUnit !== 'undefined' && currentUnit === 'TWh') ? 'TWh' : 'PJ'
  }

  function convert (pj) {
    return unit() === 'TWh' ? pj / PJ_PER_TWH : pj
  }

  const nl = d3.formatLocale({ decimal: ',', thousands: '.', grouping: [3], currency: ['€', ''] })
  function formatValue (pj) {
    const v = convert(pj)
    return nl.format(v >= 100 ? ',.0f' : v >= 10 ? ',.1f' : ',.2f')(v)
  }
  const formatShare = nl.format('.0%')

  function carrierLabel (carrier) {
    return settings.carrierLabels[carrier] || carrier
  }

  function carrierColor (carrier) {
    return index.carrierColors[carrier] || FALLBACK_COLOR
  }

  function textColorFor (fill) {
    const c = d3.rgb(fill)
    const luminance = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255
    return luminance > 0.62 ? '#2B2B2B' : '#FFF'
  }

  // ── rendering ──────────────────────────────────────────────────────────

  // One nested treemap on one canvas — group › block › tile — so every tile
  // shares a single scale: area is proportional to energy everywhere.
  //   Per sector: groups Finaal verbruik / Conversie, a block per sector,
  //               a tile per carrier (coloured by carrier).
  //   Per drager: one group, a block per carrier, a tile per sector
  //               (coloured by sector).
  // Both views draw the same energy, so they share the pixels-per-PJ scale.
  //
  // Positions stay put across scenarios and years: each view's hierarchy is
  // built once with every tile that can ever carry a value, in fixed order
  // (not sorted by size), and treemapResquarify keeps the row layout of the
  // first render, only resizing tiles as values change. Empty tiles collapse.
  const PAD = {
    groupGap: 40, // between the groups
    groupLabel: 30, // label strip above a group
    blockGap: 18, // whitespace between blocks
    blockHead: 30, // header above a block's tiles: icon, title, total
    tileGap: 0 // tiles abut: each block reads as one shape
  }

  // Tiles below this share of their block would render as 1–2px slivers
  // that read as borders; they are left out of the layout (not the data).
  const MIN_TILE_SHARE = 0.005

  // Blocks below this share of everything drawn (e.g. a carrier of 0.1 PJ in
  // the per-drager view) cannot be drawn to scale under a fixed-height title;
  // they are left out of the layout too. Tooltips and export keep them.
  const MIN_BLOCK_SHARE = 0.005

  // Corner radius of each block's treemap; tiles inside stay square.
  const BLOCK_RADIUS = 6

  const CHARTS = {
    treemap: { label: 'Treemap', title: 'Oppervlak evenredig met de energie' },
    bars: { label: 'Staven', title: 'Elk blok als gestapelde staaf, liggend of staand naar de vorm van het blok' }
  }

  const MODES = {
    sector: { label: 'Per sector', title: 'Per sector, opgesplitst naar energiedrager' },
    carrier: { label: 'Per drager', title: 'Per energiedrager, opgesplitst naar sector' }
  }

  function sectorList () {
    return settings.groups.flatMap(g => g.sectors)
  }

  function carrierRank (carrier) {
    const i = index.carrierOrder.indexOf(carrier)
    return i === -1 ? Infinity : i
  }

  // Carriers that can ever flow into a sector, in legend order.
  function sectorCarrierIds (sector) {
    const carriers = new Set()
    sectorNodes(sector).forEach(id => (index.linksByTarget.get(id) || []).forEach(row => carriers.add(row.carrier)))
    return [...carriers].sort((a, b) => carrierRank(a) - carrierRank(b) || a.localeCompare(b))
  }

  // Built once per view: every group, block and tile that can ever carry a
  // value, in fixed order. treemapResquarify stores its rows on these nodes.
  function layoutRoot () {
    dom.layoutRoots = dom.layoutRoots || {}
    if (dom.layoutRoots[mode]) return dom.layoutRoots[mode]

    let groups
    if (mode === 'sector') {
      groups = settings.groups.map(group => ({
        kind: 'group',
        key: group.title,
        children: group.sectors.map(sector => ({
          kind: 'block',
          key: sector.id,
          children: sectorCarrierIds(sector).map(carrier => ({ kind: 'tile', sectorId: sector.id, carrier, blockKey: sector.id }))
        }))
      }))
    } else {
      const bySector = sectorList().map(sector => [sector.id, new Set(sectorCarrierIds(sector))])
      const carriers = [...new Set(bySector.flatMap(([, set]) => [...set]))]
        .sort((a, b) => carrierRank(a) - carrierRank(b) || a.localeCompare(b))
      groups = [{
        kind: 'group',
        key: 'Energiedragers',
        children: carriers.map(carrier => ({
          kind: 'block',
          key: carrier,
          children: bySector.filter(([, set]) => set.has(carrier))
            .map(([sectorId], i, list) => ({ kind: 'tile', sectorId, carrier, shade: i, shades: list.length, blockKey: carrier }))
        }))
      }]
    }
    dom.layoutRoots[mode] = d3.hierarchy({ children: groups })
    return dom.layoutRoots[mode]
  }

  // Point the persistent nodes at this render's figures.
  function bindData (root, data) {
    const sectorById = new Map(data.flatMap(g => g.sectors).map(s => [s.sector.id, s]))
    const carrierTotals = new Map()
    sectorById.forEach(s => s.carriers.forEach(c => carrierTotals.set(c.carrier, (carrierTotals.get(c.carrier) || 0) + c.value)))

    root.each(n => {
      const d = n.data
      if (d.kind === 'tile') {
        d.s = sectorById.get(d.sectorId)
        d.c = d.s.carriers.find(c => c.carrier === d.carrier) || { carrier: d.carrier, value: 0, parts: [] }
      }
    })
    root.each(n => {
      const d = n.data
      if (d.kind === 'block') {
        d.block = mode === 'sector'
          ? { title: sectorById.get(d.key).sector.title, total: sectorById.get(d.key).total, icon: sectorIcon(sectorById.get(d.key).sector) }
          : { title: carrierLabel(d.key), total: carrierTotals.get(d.key) || 0, icon: carrierIcon(d.key) }
      }
      if (d.kind === 'group') {
        const g = data.find(x => x.group.title === d.key)
        d.group = g
          ? { title: g.group.title, total: g.total }
          : { title: d.key, total: d3.sum(data, x => x.total) }
      }
    })
  }

  function visibleArea (root) {
    return d3.sum(root.leaves(), l => l.value > 0 ? (l.x1 - l.x0) * (l.y1 - l.y0) : 0)
  }

  // Energy actually drawn: tiles and blocks below their thresholds are not.
  function drawnTotal (root) {
    return d3.sum(root.leaves(), l => l.value > 0 ? l.data.c.value : 0)
  }

  // Pixels per PJ a view reaches when laid out on the full canvas.
  function fullCanvasScale (view, data, layout, width, height) {
    const current = mode
    mode = view
    try {
      const root = layoutRoot()
      bindData(root, data)
      layout.size([width, height])
      layoutEqualScale(root, layout)
      return visibleArea(root) / drawnTotal(root)
    } finally {
      mode = current
    }
  }

  // Pixels per PJ at which the largest column just fits the canvas in both
  // views (the view with most room lost to headers and gaps decides).
  // Measured on that column itself and cached per canvas size.
  function referenceScale (layout, width, height) {
    const key = `${width}x${height}`
    if (dom.reference && dom.reference.key === key) return dom.reference.pxPerPJ
    let pxPerPJ = 0
    if (maxColumnTotal() > 0) {
      const data = columnData(index.maxColumn)
      pxPerPJ = d3.min(Object.keys(MODES), view => fullCanvasScale(view, data, layout, width, height))
    }
    dom.reference = { key, pxPerPJ }
    return pxPerPJ
  }

  // Size each view needs for the largest column at the reference scale. The
  // canvas height follows it, so there is no empty band below the treemaps.
  // Cached with the reference scale.
  function referenceExtent (layout, width, height) {
    referenceScale(layout, width, height)
    if (dom.reference.extent) return dom.reference.extent
    const extent = {}
    const data = maxColumnTotal() > 0 ? columnData(index.maxColumn) : null
    Object.keys(MODES).forEach(view => {
      if (!data) {
        extent[view] = [width, height]
        return
      }
      const current = mode
      mode = view
      try {
        layoutUniformScale(layoutRoot(), layout, width, height, data)
        extent[view] = layout.size().slice()
      } finally {
        mode = current
      }
    })
    dom.reference.extent = extent
    return extent
  }

  // Same pixels per PJ for every scenario, year and view: the largest column
  // fills the canvas, everything else shrinks with it (and is centred).
  // Headers and gaps are fixed pixel sizes, so the canvas factor is corrected
  // against the tile area actually drawn until it matches the target.
  function layoutUniformScale (root, layout, width, height, data) {
    const pxPerPJ = referenceScale(layout, width, height)
    bindData(root, data)
    layout.size([width, height])
    layoutEqualScale(root, layout)
    const total = drawnTotal(root)
    if (!(pxPerPJ > 0) || !(total > 0)) return

    const target = pxPerPJ * total
    if (Math.abs(visibleArea(root) / target - 1) < 0.005) return

    // Area does not grow smoothly with canvas size (rows, pixel rounding), so
    // bisect on the size factor and keep the closest fit.
    const fit = f => {
      layout.size([Math.max(40, width * f), Math.max(40, height * f)])
      layoutEqualScale(root, layout)
      return visibleArea(root) / target - 1
    }
    let lo = 0.2
    let hi = 1
    let best = { f: 1, err: Math.abs(visibleArea(root) / target - 1) }
    for (let i = 0; i < 14 && best.err >= 0.005; i++) {
      const f = (lo + hi) / 2
      const err = fit(f)
      if (Math.abs(err) < best.err) best = { f, err: Math.abs(err) }
      if (err > 0) hi = f
      else lo = f
    }
    fit(best.f)
  }

  // Headers and gaps come out of each block's area, which would shrink small
  // blocks most. Re-weight blocks until their tile area matches their energy
  // at one shared pixels-per-PJ, so the canvas stays on equal scale.
  function layoutEqualScale (root, layout, weightsKey = mode) {
    dom.blockWeights = dom.blockWeights || {}
    const weights = dom.blockWeights[weightsKey] || (dom.blockWeights[weightsKey] = new Map())
    const tileArea = n => d3.sum(n.leaves(), l => Math.max(0, l.x1 - l.x0) * Math.max(0, l.y1 - l.y0))
    const blockKey = d => d.blockKey
    const blockTotals = new Map(root.descendants().filter(n => n.data.kind === 'block').map(n => [n.data.key, n.data.block.total]))
    const grandTotal = d3.sum([...blockTotals.values()])

    for (let i = 0; ; i++) {
      root.sum(d => {
        if (d.kind !== 'tile') return 0
        const key = blockKey(d)
        const blockTotal = blockTotals.get(key)
        if (blockTotal < grandTotal * MIN_BLOCK_SHARE || d.c.value < blockTotal * MIN_TILE_SHARE) return 0
        return d.c.value * (weights.get(key) || 1)
      })
      layout(root)
      const blocks = root.descendants().filter(n => n.data.kind === 'block' && n.value > 0)
      const pxPerPJ = d3.sum(blocks, tileArea) / d3.sum(blocks, n => n.data.block.total)
      const ratios = blocks.map(n => [n, tileArea(n) / (n.data.block.total * pxPerPJ)])
      if (i === 30 || ratios.every(([, r]) => Math.abs(1 - r) < 0.02)) break
      // Damped so blocks sharing a row don't push each other back and forth;
      // a block squeezed below its title height has no tile area yet and is
      // grown until it does.
      ratios.forEach(([n, r]) => {
        const factor = r > 0 ? Math.pow(r, -0.8) : 2
        const next = (weights.get(n.data.key) || 1) * factor
        weights.set(n.data.key, Math.max(0.02, Math.min(50, next)))
      })
    }
  }

  // Groups › sectors › carriers with PJ values for one "{year}_{scenario}" column.
  function columnData (column) {
    return settings.groups.map(group => {
      const sectors = group.sectors.map(sector => {
        const carriers = sectorCarriers(sector, column)
        return { sector, carriers, total: d3.sum(carriers, c => c.value) }
      })
      return { group, sectors, total: d3.sum(sectors, s => s.total) }
    })
  }

  // Groups and blocks are always laid out as a (resquarified) treemap, so the
  // grid is identical in both chart types. Inside a block, 'bars' stacks the
  // tiles as parallel strips — side by side in a wide block, top to bottom in
  // a tall one — making each block a stacked bar that fills its area. The
  // direction follows the block's actual shape; a block only switches when it
  // is clearly the other way round (STACK_HYSTERESIS), so near-square blocks
  // don't flip back and forth between scenarios.
  const STACK_HYSTERESIS = 1.2
  function tileMethod () {
    const squarify = d3.treemapResquarify.ratio(1.3)
    if (chart !== 'bars') return squarify
    return (parent, x0, y0, x1, y1) => {
      if (parent.data.kind !== 'block') return squarify(parent, x0, y0, x1, y1)
      const w = x1 - x0
      const h = y1 - y0
      const d = parent.data
      if (w > h * STACK_HYSTERESIS) d.stack = 'side'
      else if (h > w * STACK_HYSTERESIS) d.stack = 'stacked'
      else if (!d.stack) d.stack = w >= h ? 'side' : 'stacked'
      const tile = d.stack === 'side' ? d3.treemapDice : d3.treemapSlice
      tile(parent, x0, y0, x1, y1)
    }
  }

  function canvasSize () {
    const width = Math.max(320, dom.root.node().clientWidth)
    return { width, height: Math.max(460, Math.round(width * 0.58)) }
  }

  // Another diagram was chosen: rebuild the index and drop everything that
  // was derived from the previous one (layouts, weights, scale, comparison).
  function syncDiagram () {
    const wanted = activeDiagramId()
    if (index && index.diagramId === wanted) return
    index = buildIndex()
    dom.layoutRoots = {}
    dom.blockWeights = {}
    dom.reference = null
    dom.cmp = null
    if (focus) {
      focus = null
      dom.compareBar.classed('is-open', false)
    }
  }

  function render () {
    if (!dom.svg || !index) return
    syncDiagram()
    const column = currentColumn()
    const scenarioTitle = (window.globalActiveScenario && (window.globalActiveScenario.title || window.globalActiveScenario.id)) || ''
    const year = (window.globalActiveYear && window.globalActiveYear.id) || ''
    dom.context.text([diagramTitle(index.diagramId), scenarioTitle, year, unit()].filter(Boolean).join('  ·  '))

    if (!sectorList().some(sector => sectorNodes(sector).some(id => index.linksByTarget.has(id)))) {
      dom.svg.style('display', 'none')
      dom.message.style('display', null)
        .text(`Het diagram '${diagramTitle(index.diagramId)}' bevat geen van deze sectoren.`)
      updateLegend([])
      return
    }

    if (!column || !index.columns.has(column)) {
      dom.svg.style('display', 'none')
      dom.message.style('display', null).text('Voor dit scenario en jaar zijn geen gegevens beschikbaar in het systeemdiagram.')
      return
    }
    dom.svg.style('display', null)
    dom.message.style('display', 'none')

    const data = columnData(column)
    dom.data = data

    const { width, height } = canvasSize()
    const root = layoutRoot()
    bindData(root, data)

    const layout = d3.treemap()
      .tile(tileMethod())
      .round(true)
      .paddingInner(n => n.depth === 0 ? PAD.groupGap : n.depth === 1 ? PAD.blockGap : PAD.tileGap)
      .paddingTop(n => n.depth === 1 ? PAD.groupLabel : n.depth === 2 ? PAD.blockHead : 0)
    const [, canvasHeight] = referenceExtent(layout, width, height)[mode]
    layoutUniformScale(root, layout, width, height, data)
    const [contentWidth, contentHeight] = layout.size()
    const offsetX = Math.round((width - contentWidth) / 2)
    const offsetY = Math.round((canvasHeight - contentHeight) / 2)

    if (dom.animate) {
      hoveredKey = null
      hideTooltip()
    }

    const t = dom.svg.transition().duration(dom.animate ? (focus || dom.returnTo ? 750 : 500) : 0).ease(d3.easeCubicInOut)
    const h = Math.ceil(canvasHeight)
    dom.svg.attr('width', width).attr('viewBox', null)
    dom.svg.transition(t).attr('height', h)

    if (focus) {
      renderComparison(width, h, t)
      applyHighlight()
      updateLegend(data)
      return
    }

    // Returning from a comparison: leaving scenario blocks collapse into the
    // block they came from, at its place in the overview.
    if (dom.returnTo) {
      const back = root.descendants().find(n => n.data.kind === 'block' && n.data.key === dom.returnTo)
      dom.exitTo = back ? rectOf(back) : null
    }
    dom.content.transition(t).attr('transform', `translate(${offsetX},${offsetY})`)

    const visible = n => n.value > 0 && n.x1 > n.x0 && n.y1 > n.y0
    drawGroups((root.children || []).filter(visible), t)
    drawBlocks(root.descendants().filter(n => n.depth === 2 && visible(n)), t)
    drawTiles(root.leaves().filter(visible), t)
    applyHighlight()
    updateLegend(data)
  }

  function drawGroups (nodes, t) {
    const groups = dom.groupLayer.selectAll('g.ctm-group')
      .data(nodes, n => mode + '|' + n.data.key)
      .join(enter => {
        const g = enter.append('g').attr('class', 'ctm-group')
          .attr('transform', n => `translate(${n.x0},${n.y0})`).attr('opacity', 0)
        g.append('text').attr('class', 'ctm-group-label').attr('y', 10)
        g.append('line').attr('class', 'ctm-group-rule').attr('y1', 18.5).attr('y2', 18.5)
        return g
      }, update => update, exit => exit.transition(t).attr('opacity', 0).remove())

    groups.transition(t).attr('opacity', 1).attr('transform', n => `translate(${n.x0},${n.y0})`)
    groups.select('line').transition(t).attr('x2', n => n.x1 - n.x0)
    // Label and total must fit the group's width: the total goes first, then
    // the name is shortened.
    groups.select('text').each(function (n) {
      const w = n.x1 - n.x0
      const title = n.data.group.title.toUpperCase()
      const label = d3.select(this).text(null)
      label.append('tspan').text(title)
      if (n.data.group.total != null) {
        label.append('tspan').attr('class', 'ctm-group-total').attr('dx', 12)
          .text(`${formatValue(n.data.group.total)} ${unit()}`)
      }
      if (this.getComputedTextLength() > w) fitText(label.text(null), title, w)
    })
  }

  function drawBlocks (nodes, t) {
    const blocks = dom.blockLayer.selectAll('g.ctm-block')
      .data(nodes, n => mode + '|' + n.data.key)
      .join(enter => {
        const g = enter.append('g').attr('class', 'ctm-block')
          .attr('transform', n => dom.enterFrom ? centreOf(dom.enterFrom) : `translate(${n.x0},${n.y0})`).attr('opacity', 0)
        g.append('rect').attr('class', 'ctm-row-band').attr('rx', 6).attr('ry', 6).style('opacity', 0)
        g.append('path').attr('class', 'ctm-icon ctm-block-icon').attr('transform', 'translate(0,2) scale(0.6667)')
        g.append('text').attr('class', 'ctm-block-title').attr('y', 14)
        g.append('text').attr('class', 'ctm-block-total').attr('y', 14).attr('text-anchor', 'end')
        return g
      }, update => update, exit => leave(exit, t))

    blocks.transition(t).attr('opacity', 1).attr('transform', n => `translate(${n.x0},${n.y0})`)
    blocks
      .classed('is-current', n => !!n.data.block.current)
      .classed('is-clickable', true)
      .on('click', (event, n) => onBlockClick(n))

    // Each block's tiles are clipped to a rounded rectangle over its tile area.
    dom.defs.selectAll('clipPath.ctm-treeclip')
      .data(nodes, n => clipId(n.data.key))
      .join(enter => {
        const clip = enter.append('clipPath').attr('class', 'ctm-treeclip').attr('id', n => clipId(n.data.key))
        clip.append('rect').attr('rx', BLOCK_RADIUS).attr('ry', BLOCK_RADIUS)
          .attr('x', n => n.x0).attr('y', n => n.y0 + PAD.blockHead)
        return clip
      }, update => update, exit => exit.transition(t).remove())
      .attr('id', n => clipId(n.data.key))
      .select('rect')
      .transition(t)
      .attr('x', n => n.x0)
      .attr('y', n => n.y0 + PAD.blockHead)
      .attr('width', n => n.x1 - n.x0)
      .attr('height', n => Math.max(0, n.y1 - n.y0 - PAD.blockHead))

    // Title and total share the header strip; the total gives way first.
    // In the comparison list they sit beside the bar instead: name in the
    // label column on the left, total just after the bar's end.
    blocks.each(function (n) {
      const g = d3.select(this)
      const w = n.x1 - n.x0
      const { title, fullTitle, total, icon, current } = n.data.block
      const row = n.data.listRow
      const band = g.select('.ctm-row-band')
      if (row) {
        const mid = PAD.blockHead + LIST.bar / 2 + 4
        band.transition(t).style('opacity', current ? 1 : 0)
          .attr('x', -row.labelWidth - 8).attr('y', PAD.blockHead - (LIST.pitch - LIST.bar) / 2 + 2)
          .attr('width', dom.root.node().clientWidth + 16).attr('height', LIST.pitch - 4)
        g.select('.ctm-block-icon').style('display', 'none')
        const totalText = g.select('.ctm-block-total').style('display', null).attr('text-anchor', 'start')
          .text(`${formatValue(total)} ${unit()}`)
        totalText.transition(t).attr('x', w + 10).attr('y', mid)
        const name = g.select('.ctm-block-title')
        fitText(name, row.grouped ? title : (fullTitle || title), row.labelWidth - 20)
        name.transition(t).attr('x', -row.labelWidth).attr('y', mid)
        return
      }
      band.transition(t).style('opacity', 0)
      const inset = icon ? 24 : 0
      g.select('.ctm-block-icon').style('display', icon ? null : 'none').attr('d', icon || null)
      // Shown before measuring: a hidden text element measures as 0 wide.
      const totalText = g.select('.ctm-block-total').style('display', null).attr('text-anchor', 'end')
        .text(`${formatValue(total)} ${unit()}`)
      totalText.transition(t).attr('x', w).attr('y', 14)
      const room = w - inset - totalText.node().getComputedTextLength() - 12
      const showTotal = room >= 60
      totalText.style('display', showTotal ? null : 'none')
      const name = g.select('.ctm-block-title')
      fitText(name, title, showTotal ? room : w - inset)
      name.transition(t).attr('x', inset).attr('y', 14)
    })
  }

  function sectorIcon (sector) {
    return sector.icon || SECTOR_ICONS[sector.id] || null
  }

  function carrierIcon (carrier) {
    const custom = cfg().carrierTreemaps && cfg().carrierTreemaps.carrierIcons
    return (custom && custom[carrier]) || CARRIER_ICONS[carrier] || null
  }

  // The icon a tile shows: the carrier per sector, the sector per drager.
  function tileIcon (d) {
    return mode === 'sector' ? carrierIcon(d.carrier) : sectorIcon(d.s.sector)
  }

  // A small rounded chip with an icon, as used in the legend and tooltip.
  function chipHtml (icon, fill, ink) {
    return `<span class="ctm-chip" style="background:${fill}"><svg viewBox="0 0 24 24"><path class="ctm-icon" style="stroke:${ink}" d="${icon || ''}"/></svg></span>`
  }

  // Leaving elements fade out; when returning from a comparison they also
  // shrink into the block they collapse into.
  function leave (selection, t, shrink) {
    selection.classed('is-leaving', true)
    const tr = selection.transition(t).attr('opacity', 0)
    if (dom.exitTo) {
      tr.attr('transform', centreOf(dom.exitTo))
      if (shrink) selection.select('rect').transition(t).attr('width', 0).attr('height', 0)
    }
    return tr.remove()
  }

  function onBlockClick (blockNode) {
    if (!focus) openComparison(blockNode)
    else if (blockNode.data.block && blockNode.data.block.current) closeComparison()
  }

  function clipId (key) {
    return `ctm-clip-${mode}-${key}`
  }

  // The tile's own label, colour and highlight key depend on the view.
  function tileKey (d) {
    return mode === 'sector' ? d.carrier : d.sectorId
  }

  function tileLabel (d) {
    return mode === 'sector' ? carrierLabel(d.carrier) : d.s.sector.title
  }

  function tileColor (d) {
    return mode === 'sector' ? carrierColor(d.carrier) : carrierShade(d.carrier, d.shade, d.shades)
  }

  // Per drager, sectors are told apart by tints and shades of the carrier's
  // own colour: mixed toward ink for the first sector it can flow to, toward
  // white for the last. Mixing (rather than shifting HSL lightness) keeps dark
  // steps from turning oversaturated. The steps follow the fixed tile list, so
  // a sector keeps its shade.
  const SHADE_DARK = 0.22 // strongest mix toward ink
  const SHADE_LIGHT = 0.55 // strongest mix toward white
  function carrierShade (carrier, i, count) {
    const base = carrierColor(carrier)
    if (!(count >= 2) || !(i >= 0)) return base
    const v = -SHADE_DARK + (i / (count - 1)) * (SHADE_DARK + SHADE_LIGHT)
    return v < 0
      ? d3.interpolateLab(base, '#3A3632')(-v)
      : d3.interpolateLab(base, '#FFFFFF')(v)
  }

  function drawTiles (leaves, t) {
    // Tiles are grouped per block so the block's rounded clip applies to them.
    const containers = dom.tileLayer.selectAll('g.ctm-block-tiles')
      .data(d3.groups(leaves, n => n.parent.data.key), d => mode + '|' + d[0])
      .join(enter => enter.append('g').attr('class', 'ctm-block-tiles')
        .attr('clip-path', d => `url(#${clipId(d[0])})`),
      update => update,
      exit => {
        exit.selectAll('g.ctm-tile').call(sel => leave(sel, t, true))
        return exit.transition(t).remove()
      })

    const tiles = containers.selectAll('g.ctm-tile')
      .data(d => d[1], n => `${mode}|${n.data.sectorId}|${n.data.carrier}`)
      .join(enter => {
        const g = enter.append('g').attr('class', 'ctm-tile')
          .attr('transform', n => dom.enterFrom ? centreOf(dom.enterFrom) : `translate(${n.x0},${n.y0})`).attr('opacity', 0)
        // Coloured from the start: a rect without fill is black, and the CSS
        // fill transition (for hover) would fade in from that black.
        g.append('rect').attr('width', 0).attr('height', 0).style('fill', n => tileColor(n.data))
        g.append('path').attr('class', 'ctm-icon ctm-tile-icon').attr('transform', `translate(8,8) scale(${TILE_ICON_MIN / 24})`)
        return g
      }, update => update, exit => leave(exit, t, true))

    tiles
      .on('click', (event, n) => onBlockClick(n.parent))
      .on('mouseenter', (event, n) => { setHovered(tileKey(n.data)); showTooltip(event, n) })
      .on('mousemove', (event, n) => showTooltip(event, n))
      .on('mouseleave', () => { setHovered(null); hideTooltip() })

    tiles.transition(t).attr('opacity', 1).attr('transform', n => `translate(${n.x0},${n.y0})`)
    tiles.select('rect')
      .style('fill', n => tileColor(n.data))
      .transition(t)
      .attr('width', n => n.x1 - n.x0)
      .attr('height', n => n.y1 - n.y0)

    // Tiles carry only an icon, centred, where it fits; the tooltip gives the
    // name, value and share.
    tiles.each(function (n) {
      const g = d3.select(this)
      const tw = n.x1 - n.x0
      const th = n.y1 - n.y0
      // Icons grow with the tile: 15px in small tiles up to 36px in large ones.
      const icon = tileIcon(n.data)
      const size = Math.round(Math.max(TILE_ICON_MIN, Math.min(TILE_ICON_MAX, Math.min(tw, th) * 0.22)))
      g.select('.ctm-tile-icon')
        .style('display', icon && tw >= size + 16 && th >= size + 16 ? null : 'none')
        .style('stroke', TILE_INK)
        .attr('d', icon)
        .transition(t)
        .attr('transform', `translate(${(tw - size) / 2},${(th - size) / 2}) scale(${size / 24})`)
    })
  }

  // Sets the text, shortened with an ellipsis until its rendered width fits.
  function fitText (selection, text, maxWidth) {
    const node = selection.text(text).node()
    if (maxWidth < 14) return selection.text('')
    if (node.getComputedTextLength() <= maxWidth) return selection
    let lo = 0
    let hi = text.length
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      selection.text(text.slice(0, mid) + '…')
      if (node.getComputedTextLength() <= maxWidth) lo = mid
      else hi = mid - 1
    }
    return selection.text(lo > 0 ? text.slice(0, lo).trimEnd() + '…' : '')
  }

  // ── scenario comparison ────────────────────────────────────────────────

  // Clicking a block compares it across every scenario for the current year:
  // the canvas becomes a treemap of scenarios (grouped by study), each holding
  // the same tiles in the same order and colours. All scenarios share one
  // scale, so block sizes compare directly. The clicked block keeps its DOM
  // key and morphs into the current scenario's block; the other scenarios
  // grow out of it, and collapse back into it on return.
  const CMP_PAD = { groupGap: 26, groupLabel: 28, blockGap: 10 }

  function shortScenarioTitle (title) {
    const parts = String(title).split(' | ')
    return parts.length > 1 ? parts.slice(1).join(' | ') : title
  }

  function comparisonScenarios (year) {
    const visible = sc => !window.ScenarioSettings || typeof window.ScenarioSettings.isScenarioVisible !== 'function' ||
      window.ScenarioSettings.isScenarioVisible(sc.id) !== false
    return (cfg().scenarios || []).filter(sc => visible(sc) && index.columns.has(`${year}_${sc.id}`))
  }

  // Built when the focus or the set of scenarios changes; reused otherwise so
  // treemapResquarify keeps rows stable across years and units.
  function comparisonRoot (scenarios) {
    const signature = `${mode}|${focus.key}|${scenarios.map(sc => sc.id).join(',')}`
    if (dom.cmp && dom.cmp.signature === signature) return dom.cmp.root

    // The focused block's tiles, as in the overview: same order, same shades.
    const block = layoutRoot().descendants().find(n => n.data.kind === 'block' && n.data.key === focus.key)
    const tiles = block ? block.children.map(n => n.data) : []
    const groups = []
    scenarios.forEach(sc => {
      const name = sc.scenarioGroup || 'Overig'
      let group = groups.find(g => g.key === name)
      if (!group) groups.push(group = { kind: 'group', key: name, children: [] })
      group.children.push({
        kind: 'block',
        key: `cmp-${sc.id}`,
        scenario: sc,
        children: tiles.map(t => ({ kind: 'tile', sectorId: t.sectorId, carrier: t.carrier, shade: t.shade, shades: t.shades, blockKey: `cmp-${sc.id}` }))
      })
    })
    const root = d3.hierarchy({ children: groups })
    dom.cmp = { signature, root }
    return root
  }

  function bindComparison (root, year) {
    const currentId = window.globalActiveScenario && window.globalActiveScenario.id
    root.children.forEach(g => {
      g.children.forEach(b => {
        const sc = b.data.scenario
        const current = sc.id === currentId
        // The scenario that was current when the comparison opened takes over
        // the clicked block's key, so that block morphs into it (and back).
        // It stays fixed while comparing: keys must not move between
        // scenarios, or elements get rebound to the wrong block.
        const key = sc.id === focus.scenarioId ? focus.key : `cmp-${sc.id}`
        b.data.key = key
        const sectors = columnData(`${year}_${sc.id}`).flatMap(x => x.sectors)
        b.children.forEach(n => {
          const d = n.data
          d.blockKey = key
          d.s = sectors.find(s => s.sector.id === d.sectorId)
          d.c = (d.s && d.s.carriers.find(c => c.carrier === d.carrier)) || { carrier: d.carrier, value: 0, parts: [] }
        })
        b.data.listRow = null
        b.data.block = {
          title: shortScenarioTitle(sc.title || sc.id),
          fullTitle: sc.title || sc.id,
          total: d3.sum(b.children, n => n.data.c.value),
          current
        }
      })
      // No group total: scenarios of one study are alternatives, not parts.
      g.data.group = { title: g.data.key, total: null }
    })
  }

  function renderComparison (width, canvasHeight, t) {
    const year = (window.globalActiveYear && window.globalActiveYear.id) || ''
    const scenarios = comparisonScenarios(year)
    const root = comparisonRoot(scenarios)
    bindComparison(root, year)

    dom.compareTitle.text(`${focus.title}  ·  ${year}  ·  ${unit()}`)
    dom.compareNote.text(`${scenarios.length} scenario's op één schaal`)
    dom.content.transition(t).attr('transform', 'translate(0,0)')
    dom.compareLayoutButtons.classed('is-active', key => key === compareLayout)

    const visible = n => n.value > 0 && n.x1 > n.x0 && n.y1 > n.y0
    dom.compareSortButtons.classed('is-active', key => key === compareSort)
    dom.compareSort.classed('is-hidden', compareLayout !== 'list')
    if (compareLayout === 'list') {
      const { height, headers } = layoutComparisonList(root, width)
      dom.svg.transition(t).attr('height', height)
      drawGroups(headers, t)
      drawBlocks(root.descendants().filter(n => n.depth === 2 && visible(n)), t)
      drawTiles(root.leaves().filter(visible), t)
      return
    }

    const layout = d3.treemap()
      .tile(tileMethod())
      .round(true)
      .size([width, canvasHeight])
      .paddingInner(n => n.depth === 0 ? CMP_PAD.groupGap : n.depth === 1 ? CMP_PAD.blockGap : PAD.tileGap)
      .paddingTop(n => n.depth === 1 ? CMP_PAD.groupLabel : n.depth === 2 ? PAD.blockHead : 0)
    layoutEqualScale(root, layout, `cmp|${mode}|${focus.key}`)

    drawGroups((root.children || []).filter(visible), t)
    drawBlocks(root.descendants().filter(n => n.depth === 2 && visible(n)), t)
    drawTiles(root.leaves().filter(visible), t)
  }

  // List layout: one row per scenario, all the same height, sorted from high
  // to low. Each row is a stacked bar on one shared length scale; the block's
  // node is placed so its header strip sits just above the bar, and the row's
  // name and total are positioned beside it in drawBlocks.
  // Sorted high to low, or grouped by study (studies and their scenarios in
  // the viewer's order) with each study's name as a header above its rows.
  const LIST = { pitch: 34, bar: 20, value: 96, groupHead: 30, groupGap: 14 }
  function layoutComparisonList (root, width) {
    const labelWidth = Math.round(Math.min(360, Math.max(220, width * 0.26)))
    const barMax = Math.max(60, width - labelWidth - LIST.value)
    const all = root.descendants().filter(n => n.depth === 2)
    const max = d3.max(all, b => b.data.block.total) || 1
    const scale = v => barMax * v / max

    // Rows in display order, each with its top y; group headers in between.
    const rows = []
    const headers = []
    let y = 0
    if (compareSort === 'group') {
      root.children.forEach((g, i) => {
        if (i > 0) y += LIST.groupGap
        Object.assign(g, { x0: 0, x1: width, y0: y, y1: y + LIST.groupHead })
        headers.push(g)
        y += LIST.groupHead
        g.children.forEach(b => { rows.push([b, y]); y += LIST.pitch })
      })
    } else {
      all.slice()
        .sort((a, b) => b.data.block.total - a.data.block.total || a.data.block.fullTitle.localeCompare(b.data.block.fullTitle))
        .forEach(b => { rows.push([b, y]); y += LIST.pitch })
    }

    rows.forEach(([b, top]) => {
      const barY = top + (LIST.pitch - LIST.bar) / 2
      b.data.listRow = { labelWidth, grouped: compareSort === 'group' }
      b.x0 = labelWidth
      b.x1 = labelWidth + scale(b.data.block.total)
      b.y0 = barY - PAD.blockHead
      b.y1 = barY + LIST.bar
      b.value = b.data.block.total
      let x = labelWidth
      b.children.forEach(n => {
        const w = scale(n.data.c.value)
        Object.assign(n, { x0: x, x1: x + w, y0: barY, y1: barY + LIST.bar, value: n.data.c.value })
        x += w
      })
    })
    return { height: y + 8, headers }
  }

  function setCompareSort (next) {
    if (next === compareSort) return
    compareSort = next
    try { localStorage.setItem(CMP_SORT_STORAGE_KEY, next) } catch (e) {}
    hoveredKey = null
    hideTooltip()
    dom.animate = true
    render()
  }

  function setCompareLayout (next) {
    if (next === compareLayout) return
    compareLayout = next
    try { localStorage.setItem(CMP_LAYOUT_STORAGE_KEY, next) } catch (e) {}
    hoveredKey = null
    hideTooltip()
    dom.animate = true
    render()
  }

  function openComparison (blockNode) {
    if (focus || !blockNode || !blockNode.data.block) return
    focus = {
      key: blockNode.data.key,
      title: blockNode.data.block.title,
      scenarioId: window.globalActiveScenario && window.globalActiveScenario.id
    }
    dom.enterFrom = rectOf(blockNode)
    hoveredKey = null
    hideTooltip()
    dom.compareBar.classed('is-open', true)
    dom.animate = true
    render()
    dom.enterFrom = null
  }

  function closeComparison () {
    if (!focus) return
    dom.returnTo = focus.key
    focus = null
    hoveredKey = null
    hideTooltip()
    dom.compareBar.classed('is-open', false)
    dom.animate = true
    render()
    dom.returnTo = null
    dom.exitTo = null
  }

  function rectOf (n) {
    return { x0: n.x0, y0: n.y0, x1: n.x1, y1: n.y1 }
  }

  // Where entering elements start (the clicked block) and where leaving ones
  // go (the block they collapse into), both as a point: that rect's centre.
  function centreOf (r) {
    return `translate(${(r.x0 + r.x1) / 2},${(r.y0 + r.y1) / 2})`
  }

  // ── interaction ────────────────────────────────────────────────────────

  function setHovered (key) {
    if (hoveredKey === key) return
    hoveredKey = key
    applyHighlight()
  }

  // Hovering a tile or legend item picks out that carrier (per sector) or
  // sector (per drager) across the whole canvas.
  // Hovering picks out a carrier (per sector) or sector (per drager): its
  // tiles everywhere turn more vivid; everything else stays as it is.
  function applyHighlight () {
    // Tiles on their way out belong to the previous view; leave them be.
    dom.root.selectAll('g.ctm-tile:not(.is-leaving)').each(function (n) {
      const match = hoveredKey && tileKey(n.data) === hoveredKey
      d3.select(this).classed('is-match', !!match)
        .select('rect').style('fill', match ? vivid(tileColor(n.data)) : tileColor(n.data))
    })
    dom.root.selectAll('.ctm-legend-item').each(function (item) {
      const match = hoveredKey && item.key === hoveredKey
      const el = d3.select(this).classed('is-match', !!match)
      if (item.color) el.select('.ctm-chip').style('background', match ? vivid(item.color) : item.color)
    })
  }

  // A richer version of a (muted) colour: more chroma and a touch darker;
  // greys, which have no chroma to add, just get darker.
  function vivid (color) {
    const c = d3.hcl(color)
    if (!(c.c > 8)) {
      c.l = Math.max(0, c.l - 12)
      return c.formatHex()
    }
    c.c = Math.min(c.c * 1.7, c.c + 38)
    c.l = Math.max(0, c.l - 5)
    return c.formatHex()
  }

  function showTooltip (event, n) {
    const d = n.data
    const block = n.parent.data.block
    const share = block.total > 0 ? d.c.value / block.total : 0
    const parts = d.c.parts.length > 1
      ? `<div class="ctm-tt-parts">${d.c.parts.map(p => `
          <div class="ctm-tt-row"><span>${p.label}</span><b>${formatValue(p.value)}</b></div>`).join('')}</div>`
      : ''
    dom.tooltip.html(`
      <div class="ctm-tt-sector">${block.fullTitle || block.title}</div>
      <div class="ctm-tt-head">${chipHtml(tileIcon(d), tileColor(d), textColorFor(tileColor(d)))}${tileLabel(d)}</div>
      <div class="ctm-tt-total"><b>${formatValue(d.c.value)} ${unit()}</b><span>${formatShare(share)} van ${formatValue(block.total)} ${unit()}</span></div>
      ${parts}`)

    const bounds = dom.root.node().getBoundingClientRect()
    const tip = dom.tooltip.style('opacity', 1).node()
    let left = event.clientX - bounds.left + 16
    let top = event.clientY - bounds.top + 14
    if (left + tip.offsetWidth > bounds.width - 8) left = event.clientX - bounds.left - tip.offsetWidth - 16
    if (top + tip.offsetHeight > bounds.height - 8) top = event.clientY - bounds.top - tip.offsetHeight - 14
    dom.tooltip.style('left', left + 'px').style('top', Math.max(8, top) + 'px')
  }

  function hideTooltip () {
    dom.tooltip.style('opacity', 0)
  }

  // Per sector the legend lists carriers (legend-sheet order); per drager it
  // lists the sectors. Only entries with a value in this scenario and year.
  function updateLegend (data) {
    let items
    if (mode === 'sector') {
      const present = new Set()
      data.forEach(g => g.sectors.forEach(s => s.carriers.forEach(c => present.add(c.carrier))))
      items = index.carrierOrder.filter(c => present.has(c))
        .concat([...present].filter(c => !index.carrierOrder.includes(c)))
        .map(c => ({ key: c, label: carrierLabel(c), color: carrierColor(c), icon: carrierIcon(c) }))
    } else {
      // Shades differ per carrier, so sectors are listed as plain names.
      items = data.flatMap(g => g.sectors).filter(s => s.total > 0)
        .map(s => ({ key: s.sector.id, label: s.sector.title, color: null, icon: sectorIcon(s.sector) }))
    }

    const nodes = dom.legend.selectAll('.ctm-legend-item')
      .data(items, item => mode + '|' + item.key)
      .join(enter => {
        const item = enter.append('span').attr('class', 'ctm-legend-item')
        item.append('span').attr('class', 'ctm-chip-slot')
        item.append('span').attr('class', 'ctm-legend-label')
        return item
      })
      .on('mouseenter', (event, item) => setHovered(item.key))
      .on('mouseleave', () => setHovered(null))
    nodes.select('.ctm-chip-slot').html(item => item.color
      ? chipHtml(item.icon, item.color, textColorFor(item.color))
      : chipHtml(item.icon, CHIP_NEUTRAL, '#2B2B2B'))
    nodes.select('.ctm-legend-label').text(item => item.label)
    nodes.order()
    layoutLegend(items.length)
  }

  // Even grid: as many equal columns as the widest entry allows, then
  // balanced so the rows fill evenly (2 × 10 rather than 13 + 7).
  const LEGEND_GAP = 20
  function layoutLegend (count) {
    if (!count) return
    const widest = d3.max(dom.legend.selectAll('.ctm-legend-label').nodes(), el => el.scrollWidth) || 0
    const itemWidth = 18 + 8 + widest + 6 // chip, gap, label, breathing room
    const available = dom.legend.node().clientWidth
    const maxCols = Math.max(1, Math.floor((available + LEGEND_GAP) / (itemWidth + LEGEND_GAP)))
    const rows = Math.ceil(count / maxCols)
    const cols = Math.ceil(count / rows)
    dom.legend.style('grid-template-columns', `repeat(${cols}, minmax(0, 1fr))`)
  }

  function setChart (next) {
    if (!CHARTS[next] || next === chart) return
    chart = next
    try { localStorage.setItem(CHART_STORAGE_KEY, chart) } catch (e) {}
    dom.chartButtons.classed('is-active', key => key === chart)
    hoveredKey = null
    dom.animate = true
    render()
  }

  function setMode (next) {
    if (!MODES[next] || next === mode) return
    if (focus) {
      focus = null
      dom.compareBar.classed('is-open', false)
    }
    mode = next
    try { localStorage.setItem(MODE_STORAGE_KEY, mode) } catch (e) {}
    dom.modeButtons.classed('is-active', key => key === mode)
    hoveredKey = null
    dom.animate = true
    render()
  }

  function exportXlsx () {
    if (typeof XLSX === 'undefined' || !dom.data) return
    const scenario = (window.globalActiveScenario && (window.globalActiveScenario.title || window.globalActiveScenario.id)) || ''
    const year = (window.globalActiveYear && window.globalActiveYear.id) || ''
    const rows = [
      ['Scenario', scenario],
      ['Jaar', year],
      ['Eenheid', unit()],
      [],
      ['Groep', 'Sector', 'Drager', 'Node', `Waarde (${unit()})`, 'Aandeel in sector']
    ]
    dom.data.forEach(g => g.sectors.forEach(s => s.carriers.forEach(c => {
      c.parts.forEach(p => {
        rows.push([g.group.title, s.sector.title, carrierLabel(c.carrier), p.label, convert(p.value), s.total > 0 ? p.value / s.total : 0])
      })
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Dragers per sector')
    XLSX.writeFile(wb, `dragers_per_sector_${year}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ── setup ──────────────────────────────────────────────────────────────

  function injectStyles () {
    if (document.getElementById('ctm-styles')) return
    const style = document.createElement('style')
    style.id = 'ctm-styles'
    style.textContent = `
      #section-treemaps .ctm-root { position: relative; margin-top: 22px; }
      .ctm-context { font-size: 12px; color: #8A8A8A; margin-top: 6px; letter-spacing: 0.01em; }
      .ctm-legend { display: grid; column-gap: 20px; row-gap: 10px; margin: 0 0 30px; }
      .ctm-legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: #6F6F6F;
        cursor: default; transition: opacity 0.15s; }
      .ctm-legend-item { gap: 8px; min-width: 0; }
      .ctm-legend-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
      .ctm-legend-item.is-match { color: #2B2B2B; }
      .ctm-chip { transition: background 0.2s ease; }
      .ctm-svg { display: block; overflow: visible; }
      .ctm-group-label { font-size: 10px; letter-spacing: 0.12em; fill: #2B2B2B; }
      .ctm-group-total { fill: #9A9A9A; letter-spacing: 0.04em; font-variant-numeric: tabular-nums; }
      .ctm-group-rule { stroke: #2B2B2B; stroke-width: 1; shape-rendering: crispEdges; }
      .ctm-block-title { font-size: 11.5px; fill: #2B2B2B; }
      .ctm-icon { fill: none; stroke: #2B2B2B; stroke-width: 1.2; stroke-linecap: round; stroke-linejoin: round;
        vector-effect: non-scaling-stroke; }
      .ctm-tile-icon { stroke-width: 1.4; pointer-events: none; }
      .ctm-chip { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px;
        flex: 0 0 18px; border-radius: 5px; }
      .ctm-chip svg { width: 12px; height: 12px; display: block; }
      .ctm-chip-slot { display: inline-flex; }
      .ctm-block-total { font-size: 11px; fill: #9A9A9A; font-variant-numeric: tabular-nums; }
      .ctm-tile { cursor: default; transition: opacity 0.2s; }
      .ctm-tile rect { shape-rendering: crispEdges; }
      .ctm-tile rect { transition: fill 0.2s ease; }
      .ctm-message { color: #888; font-size: 13px; padding: 16px 0; }
      .ctm-block.is-clickable, .ctm-tile { cursor: pointer; }
      .ctm-block.is-current .ctm-block-title { font-weight: 600; }
      .ctm-compare { display: flex; align-items: baseline; gap: 16px; height: 0; overflow: hidden; opacity: 0;
        transition: height 0.45s ease, opacity 0.45s ease, margin 0.45s ease; margin: 0; }
      .ctm-compare.is-open { height: 32px; opacity: 1; margin: -8px 0 18px; }
      #section-treemaps button.ctm-compare-back { all: unset; cursor: pointer; font-size: 12px; color: #2B2B2B;
        padding: 3px 10px 3px 8px; border: 1px solid #D5D1CA; border-radius: 6px; background: #FFF; transition: background 0.15s; }
      #section-treemaps button.ctm-compare-back:hover { background: #F2F0EC; }
      .ctm-compare-title { font-size: 13px; color: #2B2B2B; }
      .ctm-compare-note { font-size: 11.5px; color: #9A9A9A; }
      .ctm-compare { align-items: center; }
      .ctm-compare-sort { margin-left: auto; transition: opacity 0.2s; }
      .ctm-compare-sort.is-hidden { opacity: 0; pointer-events: none; }
      .ctm-row-band { fill: #E9E5DE; pointer-events: none; }
      .ctm-tooltip { position: absolute; pointer-events: none; opacity: 0; transition: opacity 0.12s; min-width: 200px;
        max-width: 280px; background: #FFF; border: 1px solid #2B2B2B; padding: 10px 12px;
        font-size: 11px; color: #2B2B2B; z-index: 5; }
      .ctm-tt-sector { font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: #9A9A9A; margin-bottom: 6px; }
      .ctm-tt-head { display: flex; align-items: center; gap: 8px; font-size: 12px; }
      .ctm-tt-head .ctm-chip { width: 20px; height: 20px; flex-basis: 20px; }
      .ctm-tt-total { display: flex; justify-content: space-between; gap: 12px; margin: 8px 0 0 28px;
        font-variant-numeric: tabular-nums; }
      .ctm-tt-total b { font-weight: 400; }
      .ctm-tt-total span { color: #9A9A9A; }
      .ctm-tt-parts { margin: 8px 0 0 28px; padding-top: 6px; border-top: 1px solid #E6E3DE; }
      .ctm-tt-row { display: flex; justify-content: space-between; gap: 16px; padding: 1.5px 0; font-variant-numeric: tabular-nums; }
      .ctm-tt-row span { color: #6F6F6F; }
      .ctm-tt-row b { font-weight: 400; }
      #treemapControls { display: flex; align-items: center; gap: 12px; }
      #section-treemaps button.ctm-btn { height: 24px; line-height: 22px; padding: 0 12px; margin: 0; font-size: 11px;
        font-weight: 400; font-family: inherit; text-transform: none; letter-spacing: normal; color: #555;
        background: transparent; border: 1px solid transparent; border-radius: 4px; cursor: pointer;
        transition: background 0.15s, color 0.15s; }
      #section-treemaps button.ctm-btn:hover { background: #F2F0EC; }
      .ctm-segmented { display: inline-flex; border: 1px solid #D5D1CA; border-radius: 6px; padding: 2px; background: #FFF; }
      #section-treemaps .ctm-segmented button.ctm-btn.is-active { background: #2B2B2B; color: #FFF; }
      #section-treemaps button.ctm-btn-export { height: 28px; background: #FFF; border-color: #CCC; color: #444; }
    `
    document.head.appendChild(style)
  }

  function buildControls () {
    const controls = d3.select('#treemapControls')
    if (controls.empty()) return
    controls.html('')
    dom.chartButtons = controls.append('div').attr('class', 'ctm-segmented')
      .selectAll('button').data(Object.keys(CHARTS)).join('button')
      .attr('type', 'button')
      .attr('class', 'ctm-btn')
      .attr('title', key => CHARTS[key].title)
      .classed('is-active', key => key === chart)
      .text(key => CHARTS[key].label)
      .on('click', (event, key) => setChart(key))

    dom.modeButtons = controls.append('div').attr('class', 'ctm-segmented')
      .selectAll('button').data(Object.keys(MODES)).join('button')
      .attr('type', 'button')
      .attr('class', 'ctm-btn')
      .attr('title', key => MODES[key].title)
      .classed('is-active', key => key === mode)
      .text(key => MODES[key].label)
      .on('click', (event, key) => setMode(key))

    controls.append('button')
      .attr('type', 'button')
      .attr('class', 'ctm-btn ctm-btn-export')
      .text('Export data (xlsx)')
      .on('click', exportXlsx)
  }

  function buildLayout (container) {
    container.innerHTML = ''
    dom.root = d3.select(container).append('div').attr('class', 'ctm-root')
    dom.legend = dom.root.append('div').attr('class', 'ctm-legend')
    dom.compareBar = dom.root.append('div').attr('class', 'ctm-compare')
    dom.compareBar.append('button').attr('type', 'button').attr('class', 'ctm-compare-back')
      .html('<span aria-hidden="true">←</span> Overzicht')
      .on('click', closeComparison)
    dom.compareTitle = dom.compareBar.append('span').attr('class', 'ctm-compare-title')
    dom.compareNote = dom.compareBar.append('span').attr('class', 'ctm-compare-note')
    dom.compareSort = dom.compareBar.append('div').attr('class', 'ctm-segmented ctm-compare-sort')
    dom.compareSortButtons = dom.compareSort
      .selectAll('button').data(['value', 'group']).join('button')
      .attr('type', 'button')
      .attr('class', 'ctm-btn')
      .classed('is-active', key => key === compareSort)
      .attr('title', key => key === 'value' ? 'Van hoog naar laag' : 'Gegroepeerd per studie')
      .text(key => key === 'value' ? 'Hoog → laag' : 'Per studie')
      .on('click', (event, key) => setCompareSort(key))
    dom.compareLayoutButtons = dom.compareBar.append('div').attr('class', 'ctm-segmented ctm-compare-layout')
      .selectAll('button').data(['grid', 'list']).join('button')
      .attr('type', 'button')
      .attr('class', 'ctm-btn')
      .classed('is-active', key => key === compareLayout)
      .text(key => key === 'grid' ? 'Raster' : 'Lijst')
      .on('click', (event, key) => setCompareLayout(key))
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeComparison() })
    dom.message = dom.root.append('p').attr('class', 'ctm-message').style('display', 'none')
    dom.svg = dom.root.append('svg').attr('class', 'ctm-svg')
      .attr('role', 'img').attr('aria-label', 'Treemaps en staafdiagrammen')
    dom.defs = dom.svg.append('defs')
    // Layers share one group that centres the treemaps on the canvas.
    dom.content = dom.svg.append('g')
    dom.groupLayer = dom.content.append('g')
    dom.blockLayer = dom.content.append('g')
    dom.tileLayer = dom.content.append('g')
    dom.tooltip = dom.root.append('div').attr('class', 'ctm-tooltip')

    if (typeof ResizeObserver === 'function') {
      let last = container.clientWidth
      new ResizeObserver(() => {
        if (container.clientWidth === last) return
        last = container.clientWidth
        dom.animate = false
        render()
      }).observe(container)
    }
  }

  window.initCarrierTreemaps = async function () {
    const section = document.getElementById('section-treemaps')
    const container = document.getElementById('treemapContainer')
    if (!section || !container || initialized) return
    initialized = true

    if (!(await dataReady())) {
      container.innerHTML = '<p class="ctm-message">Data voor deze sectie is niet beschikbaar.</p>'
      return
    }
    if (cfg().viewer && cfg().viewer.hasCarrierTreemaps === false) {
      section.style.display = 'none'
      return
    }

    settings = readSettings()
    index = buildIndex()
    dom.context = d3.select('#treemapContext')
    injectStyles()
    buildControls()
    buildLayout(container)
    dom.animate = false
    render()
  }

  window.updateCarrierTreemaps = function () {
    if (!index) return
    dom.animate = true
    render()
  }

  window.addEventListener('unitChanged', () => window.updateCarrierTreemaps())
})()
