// TVKN Service Demand Analysis Module
// Visualizes service demand volumes and energy intensity per unit demand

;(function () {
  'use strict'

  // ── state ──────────────────────────────────────────────────────────────
  let energyFlowsRaw = []
  let serviceDemandRaw = []
  let optiesMetadataRaw = [] // Metadata for options
  let carrierColorMapping = {} // Carrier color mapping from CSV
  let allScenarios = []
  let allServiceDemands = []
  let selectedScenario = null // Changed from Set to single selection
  let selectedServiceDemand = null
  let selectedDemandType = 'Activity' // 'Activity' or 'Capacity'
  let selectedDataSource = 'Run' // 'Baseline' or 'Run'
  let tvknUnit = 'PJ'
  const YEARS = [2030, 2035, 2040, 2045, 2050]
  let useGlobalScenario = true // Flag to use global scenario selection
  let optiesMetadataIndex = {} // Index: { Optie -> metadata row }
  let allSectors = [] // All unique sectors from metadata
  let selectedSector = 'All' // Selected sector filter

  const DATA_SOURCES = [
    { id: 'Baseline', label: 'Baseline' },
    { id: 'Run', label: 'Run' }
  ]

  const DEMAND_TYPES = [
    { id: 'Activity', label: 'Activity' },
    { id: 'Capacity', label: 'Capacity' }
  ]

  // Helper to get the correct service demand column name
  function getSDColumn() {
    if (selectedDemandType === 'Activity') {
      return selectedDataSource === 'Baseline' ? 'Activity Baseline' : 'Activitity Run'
    }
    return selectedDataSource === 'Baseline' ? 'Capacity Baseline' : 'Capacity Run'
  }

  // scenario colour palette
  const scenarioPalette = [
    '#1f78b4', '#33a02c', '#e31a1c', '#ff7f00', '#6a3d9a',
    '#b15928', '#a6cee3', '#b2df8a', '#fb9a99', '#fdbf6f',
    '#cab2d6', '#ffff99', '#8dd3c7', '#fb8072', '#80b1d3',
    '#fdb462', '#b3de69', '#fccde5', '#d9d9d9', '#bc80bd',
    '#ccebc5', '#ffed6f', '#e41a1c', '#377eb8', '#4daf4a',
    '#984ea3', '#ff7f00', '#a65628', '#f781bf', '#999999',
    '#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854',
    '#ffd92f'
  ]
  const scenarioColorMap = {}

  // indexes for fast lookup
  let energyFlowIndex = {} // { scenario -> { option -> [rows] } }
  let serviceDemandIndex = {} // { scenario -> { serviceDemand -> { option -> { year -> demandValue } } } }

  // Returns service demands that have non-zero data for the current scenario
  // Filters by selected sector if a sector is selected
  function getAvailableServiceDemands() {
    if (!selectedScenario || !serviceDemandIndex[selectedScenario]) return []
    const sdMap = serviceDemandIndex[selectedScenario]
    return allServiceDemands.filter(sd => {
      if (!sdMap[sd]) return false
      const options = sdMap[sd]

      // Check if any option in this service demand matches the sector filter
      for (const opt of Object.keys(options)) {
        // Apply sector filter
        if (selectedSector !== 'All') {
          const metadata = optiesMetadataIndex[opt]
          const optSector = metadata && metadata.Sector && metadata.Sector.trim() !== '' && metadata.Sector !== '0'
            ? metadata.Sector.trim()
            : 'Uncategorized'
          if (optSector !== selectedSector) {
            continue // Skip this option if it doesn't match the sector
          }
        }

        // Check if this option has non-zero data
        for (const yr of YEARS) {
          if (options[opt][yr] && options[opt][yr] !== 0) return true
        }
      }
      return false
    })
  }

  // Count how many service demands are available for each sector
  function countServiceDemandsPerSector() {
    const counts = {}
    if (!selectedScenario || !serviceDemandIndex[selectedScenario]) return counts

    const sdMap = serviceDemandIndex[selectedScenario]

    allServiceDemands.forEach(sd => {
      if (!sdMap[sd]) return
      const options = sdMap[sd]
      const sectorsForSD = new Set()

      for (const opt of Object.keys(options)) {
        // Check if this option has non-zero data
        let hasData = false
        for (const yr of YEARS) {
          if (options[opt][yr] && options[opt][yr] !== 0) {
            hasData = true
            break
          }
        }
        if (!hasData) continue

        // Determine sector for this option
        const metadata = optiesMetadataIndex[opt]
        const sector = metadata && metadata.Sector && metadata.Sector.trim() !== '' && metadata.Sector !== '0'
          ? metadata.Sector.trim()
          : 'Uncategorized'
        sectorsForSD.add(sector)
      }

      // Add this service demand to all its sectors
      sectorsForSD.forEach(sector => {
        counts[sector] = (counts[sector] || 0) + 1
      })
    })

    return counts
  }

  // Returns sectors with counts, filtering out sectors with no service demands
  function getAvailableSectorsWithCounts() {
    const counts = countServiceDemandsPerSector()
    const result = []

    // Add "All" with total count
    const totalCount = Object.values(counts).reduce((sum, count) => sum + count, 0)
    result.push({ value: 'All', label: `All (${totalCount})` })

    // Add sectors that have data, sorted alphabetically
    allSectors
      .filter(s => s !== 'All' && counts[s] > 0)
      .sort()
      .forEach(sector => {
        result.push({ value: sector, label: `${sector} (${counts[sector]})` })
      })

    return result
  }

  // Updates the sector dropdown with current counts and filters
  function updateSectorDropdown() {
    const sel = document.getElementById('tvkn-sector-select')
    if (!sel) return
    const sectorsWithCounts = getAvailableSectorsWithCounts()
    sel.innerHTML = ''
    sectorsWithCounts.forEach(sector => {
      const opt = document.createElement('option')
      opt.value = sector.value
      opt.textContent = sector.label
      if (sector.value === selectedSector) opt.selected = true
      sel.appendChild(opt)
    })
    // If current selection is no longer available, select "All"
    const availableValues = sectorsWithCounts.map(s => s.value)
    if (!availableValues.includes(selectedSector)) {
      selectedSector = 'All'
      sel.value = selectedSector
    }
  }

  // Updates the service demand dropdown to only show available options
  function updateServiceDemandDropdown() {
    const sel = document.getElementById('tvkn-sd-select')
    if (!sel) return
    const available = getAvailableServiceDemands()
    sel.innerHTML = ''
    available.forEach(sd => {
      const opt = document.createElement('option')
      opt.value = sd
      opt.textContent = sd
      if (sd === selectedServiceDemand) opt.selected = true
      sel.appendChild(opt)
    })
    // If current selection is no longer available, select the first one
    if (!available.includes(selectedServiceDemand)) {
      selectedServiceDemand = available[0] || null
      sel.value = selectedServiceDemand
    }
  }

  // ── CSV loader ──────────────────────────────────────────────────────────
  async function loadCSV(path) {
    // Check if we're in file mode and have zip data available
    if (typeof dataSource !== 'undefined' && dataSource === 'file' && typeof window.getTVKNZipData === 'function') {
      const zipData = window.getTVKNZipData()
      const filename = path.split('/').pop().replace('.csv', '')
      if (zipData && zipData[filename]) {
        return d3.csvParse(zipData[filename])
      }
    }

    // Default: fetch from URL
    const resp = await fetch(path)
    const text = await resp.text()
    return d3.csvParse(text)
  }

  function buildIndexes() {
    // Build energy flow index: scenario -> option -> [rows]
    // New format: Option, Carrier, Value, Year, Scenario
    energyFlowIndex = {}
    energyFlowsRaw.forEach(row => {
      const sc = row.Scenario
      const opt = row.Option
      if (!energyFlowIndex[sc]) energyFlowIndex[sc] = {}
      if (!energyFlowIndex[sc][opt]) energyFlowIndex[sc][opt] = []
      energyFlowIndex[sc][opt].push(row)
    })

    // Build service demand index with values from the selected column
    // Column is determined by selectedDemandType + selectedDataSource
    // Structure: { scenario -> { serviceDemand -> { option -> { year -> value } } } }
    const col = getSDColumn()
    serviceDemandIndex = {}
    serviceDemandRaw.forEach(row => {
      const sc = row['Short.Name']
      const sd = row['Service demand']
      const opt = row.Option
      const year = parseInt(row.jaar)
      const value = parseFloat(row[col])

      if (!serviceDemandIndex[sc]) serviceDemandIndex[sc] = {}
      if (!serviceDemandIndex[sc][sd]) serviceDemandIndex[sc][sd] = {}
      if (!serviceDemandIndex[sc][sd][opt]) serviceDemandIndex[sc][sd][opt] = {}
      serviceDemandIndex[sc][sd][opt][year] = isNaN(value) ? 0 : value
    })
  }

  // ── global scenario sync ────────────────────────────────────────────────
  window.updateTVKNScenario = function() {
    if (!useGlobalScenario) {
      return
    }

    // Access global scenario from window (exposed by drawSankey.js)
    if (!window.globalActiveScenario || !window.globalActiveScenario.id) {
      console.log('TVKN Analysis: No global scenario available yet')
      return
    }

    const globalId = window.globalActiveScenario.id
    const globalYear = window.globalActiveYear?.id
    console.log(`TVKN Analysis: Syncing with global scenario ${globalId}, year ${globalYear}`)
    const matchingScenario = allScenarios.find(s => s === globalId || s.includes(globalId.split('_')[0]))

    if (matchingScenario && matchingScenario !== selectedScenario) {
      selectedScenario = matchingScenario
      updateSectorDropdown()
      updateServiceDemandDropdown()
      renderCharts()
      console.log(`TVKN Analysis: Scenario updated to ${selectedScenario}`)
    } else if (matchingScenario) {
      // Same scenario but potentially different year - still need to re-render
      renderCharts()
      console.log(`TVKN Analysis: Re-rendering for year ${globalYear}`)
    } else if (!matchingScenario) {
      console.warn(`TVKN Analysis: No matching scenario found for ${globalId}. Available scenarios:`, allScenarios)
    }
  }

  // ── public entry point ─────────────────────────────────────────────────
  window.initTVKNAnalysis = async function () {
    const container = document.getElementById('tvknAnalysisContainer')
    if (!container) return

    container.innerHTML = '<p style="color:#666;">Laden TVKN data…</p>'

    try {
      const [flows, demand, colorMap, metadata] = await Promise.all([
        loadCSV('private/tvkn_energy_flows.csv'),
        loadCSV('private/tvkn_service_demand.csv'),
        loadCSV('private/tvkn_carrier_color_mapping.csv'),
        loadCSV('private/tvkn_opties_metadata.csv')
      ])

      energyFlowsRaw = flows
      serviceDemandRaw = demand
      optiesMetadataRaw = metadata

      // Build carrier color mapping
      colorMap.forEach(row => {
        carrierColorMapping[row.carrier] = row.color
      })

      // Build metadata index and extract unique sectors
      optiesMetadataIndex = {}
      const sectorsSet = new Set()
      optiesMetadataRaw.forEach(row => {
        optiesMetadataIndex[row.Optie] = row
        if (row.Sector && row.Sector.trim() !== '' && row.Sector !== '0') {
          sectorsSet.add(row.Sector.trim())
        }
      })
      // We'll filter and add counts after indexes are built
      allSectors = ['All', ...Array.from(sectorsSet).sort(), 'Uncategorized']

      // build indexes
      buildIndexes()

      // derive unique values
      allScenarios = [...new Set(serviceDemandRaw.map(r => r['Short.Name']))].sort()
      allServiceDemands = [...new Set(serviceDemandRaw.map(r => r['Service demand']))].sort()

      // assign colours
      allScenarios.forEach((s, i) => {
        scenarioColorMap[s] = scenarioPalette[i % scenarioPalette.length]
      })

      // default: select first scenario, then pick first available service demand
      if (useGlobalScenario && window.globalActiveScenario && window.globalActiveScenario.id) {
        // Try to find matching scenario by ID
        const globalId = window.globalActiveScenario.id
        const matchingScenario = allScenarios.find(s => s === globalId || s.includes(globalId.split('_')[0]))
        selectedScenario = matchingScenario || allScenarios[0] || null
      } else {
        selectedScenario = allScenarios[0] || null
      }
      const available = getAvailableServiceDemands()
      selectedServiceDemand = available[0] || allServiceDemands[0] || null

      container.innerHTML = ''
      buildUI(container)
      console.log(`TVKN Analysis loaded: ${energyFlowsRaw.length} energy flows, ${serviceDemandRaw.length} service demand rows, ${allScenarios.length} scenarios, ${allServiceDemands.length} service demands`)
    } catch (err) {
      console.error('TVKN Analysis load error:', err)
      container.innerHTML = `<p style="color:red;">Fout bij laden TVKN data: ${err.message}</p>`
    }
  }

  // ── build controls + chart area ────────────────────────────────────────
  function buildUI(container) {
    const wrap = document.createElement('div')
    wrap.id = 'tvkn-analysis-wrap'
    wrap.style.cssText = 'background-color: #DCE6EF; padding: 0;'
    container.appendChild(wrap)

    // Place download buttons and unit toggle in the existing top controls div
    const topControls = document.getElementById('tvknTopControls')
    if (topControls) {
      topControls.innerHTML = ''

      const clipboardBtn = document.createElement('button')
      clipboardBtn.textContent = 'Copy data to clipboard'
      clipboardBtn.style.width = '130px'
      clipboardBtn.style.height = '26px'
      clipboardBtn.style.padding = '0'
      clipboardBtn.style.fontSize = '11px'
      clipboardBtn.style.fontWeight = '400'
      clipboardBtn.style.fontFamily = 'Arial, sans-serif'
      clipboardBtn.style.backgroundColor = '#FFF'
      clipboardBtn.style.color = '#444'
      clipboardBtn.style.border = '1px solid #ccc'
      clipboardBtn.style.borderRadius = '4px'
      clipboardBtn.style.cursor = 'pointer'
      clipboardBtn.style.transition = 'background-color 0.2s'
      clipboardBtn.style.textAlign = 'center'
      clipboardBtn.style.lineHeight = '26px'
      clipboardBtn.style.textTransform = 'none'
      clipboardBtn.style.letterSpacing = 'normal'
      clipboardBtn.onmouseover = function () { this.style.backgroundColor = '#e8e8e8' }
      clipboardBtn.onmouseout = function () { this.style.backgroundColor = '#FFF' }
      clipboardBtn.addEventListener('click', () => {
        copyDataToClipboard()
        clipboardBtn.textContent = 'Copied!'
        setTimeout(() => { clipboardBtn.textContent = 'Copy data to clipboard' }, 2000)
      })
      topControls.appendChild(clipboardBtn)

      const xlsxBtn = document.createElement('button')
      xlsxBtn.textContent = 'Export data (xlsx)'
      xlsxBtn.style.width = '100px'
      xlsxBtn.style.height = '26px'
      xlsxBtn.style.padding = '0'
      xlsxBtn.style.fontSize = '11px'
      xlsxBtn.style.fontWeight = '400'
      xlsxBtn.style.fontFamily = 'Arial, sans-serif'
      xlsxBtn.style.backgroundColor = '#FFF'
      xlsxBtn.style.color = '#444'
      xlsxBtn.style.border = '1px solid #ccc'
      xlsxBtn.style.borderRadius = '4px'
      xlsxBtn.style.cursor = 'pointer'
      xlsxBtn.style.transition = 'background-color 0.2s'
      xlsxBtn.style.textAlign = 'center'
      xlsxBtn.style.lineHeight = '26px'
      xlsxBtn.style.textTransform = 'none'
      xlsxBtn.style.letterSpacing = 'normal'
      xlsxBtn.onmouseover = function () { this.style.backgroundColor = '#e8e8e8' }
      xlsxBtn.onmouseout = function () { this.style.backgroundColor = '#FFF' }
      xlsxBtn.addEventListener('click', () => downloadDataToXlsx())
      topControls.appendChild(xlsxBtn)

      // Unit toggle
      const unitToggleDiv = document.createElement('div')
      unitToggleDiv.style.cssText = 'display: inline-block; flex-shrink: 0;'
      topControls.appendChild(unitToggleDiv)

      const unitSvg = d3.select(unitToggleDiv).append('svg')
        .attr('width', 100)
        .attr('height', 26)
        .style('vertical-align', 'middle')

      const unitG = unitSvg.append('g').attr('transform', 'translate(0, 3)')

      unitG.append('rect')
        .attr('x', 22)
        .attr('y', 0)
        .attr('width', 42)
        .attr('height', 20)
        .attr('fill', '#FFF')
        .attr('rx', 10)
        .attr('ry', 10)
        .style('stroke', '#333')
        .style('stroke-width', 0.5)
        .style('cursor', 'pointer')
        .on('click', function () {
          tvknUnit = (tvknUnit === 'PJ') ? 'TWh' : 'PJ'
          updateUnitToggle()
          renderCharts()
        })

      const unitCircle = unitG.append('circle')
        .attr('cx', tvknUnit === 'PJ' ? 32 : 54)
        .attr('cy', 10)
        .attr('r', 8)
        .attr('fill', '#444')
        .style('pointer-events', 'none')

      unitG.append('text').attr('x', 6).attr('y', 14.5).attr('fill', '#444')
        .style('font-size', '12px').style('font-weight', 400).text('PJ')

      unitG.append('text').attr('x', 69).attr('y', 14.5).attr('fill', '#444')
        .style('font-size', '12px').style('font-weight', 400).text('TWh')

      function updateUnitToggle() {
        unitCircle.transition().duration(200)
          .attr('cx', tvknUnit === 'PJ' ? 32 : 54)
      }
    }

    // Content area with selectors and charts
    const contentArea = document.createElement('div')
    contentArea.style.cssText = 'display: flex; gap: 24px; padding: 0 40px 20px 40px; background-color: #DCE6EF;'
    wrap.appendChild(contentArea)

    // Selectors column (vertical)
    const selectorsCol = document.createElement('div')
    selectorsCol.id = 'tvkn-selectors'
    selectorsCol.style.cssText = 'display: flex; flex-direction: column; gap: 14px; flex-shrink: 0; padding-top: 4px;'
    contentArea.appendChild(selectorsCol)

    // Helper to create a labelled select
    function addSelect(parent, labelText, id, items, selectedVal, onChange, options = {}) {
      const group = document.createElement('div')
      group.style.cssText = 'display: flex; flex-direction: column; gap: 2px;'

      const label = document.createElement('div')
      label.style.cssText = 'font-size: 10px; color: #888; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;'
      label.textContent = labelText
      group.appendChild(label)

      const sel = document.createElement('select')
      sel.id = id
      const borderWidth = options.emphasize ? '2px' : '1px'
      sel.style.cssText = `font-size: 11px; padding: 5px 10px; border: ${borderWidth} solid #bbb; border-radius: 6px; background: white; cursor: pointer; width: 220px;`
      items.forEach(item => {
        const opt = document.createElement('option')
        opt.value = typeof item === 'object' ? (item.value || item.id) : item
        opt.textContent = typeof item === 'object' ? item.label : item
        if (opt.value === selectedVal) opt.selected = true
        sel.appendChild(opt)
      })
      sel.addEventListener('change', () => onChange(sel.value))
      group.appendChild(sel)
      parent.appendChild(group)
      return sel
    }

    addSelect(selectorsCol, 'Databron', 'tvkn-datasource-select', DATA_SOURCES, selectedDataSource, val => {
      selectedDataSource = val
      buildIndexes()
      updateSectorDropdown()
      updateServiceDemandDropdown()
      renderCharts()
    })

    addSelect(selectorsCol, 'Demand type', 'tvkn-demandtype-select', DEMAND_TYPES, selectedDemandType, val => {
      selectedDemandType = val
      buildIndexes()
      updateSectorDropdown()
      updateServiceDemandDropdown()
      renderCharts()
    })

    addSelect(selectorsCol, 'Sector filter', 'tvkn-sector-select', getAvailableSectorsWithCounts(), selectedSector, val => {
      selectedSector = val
      updateServiceDemandDropdown()
      renderCharts()
    })

    addSelect(selectorsCol, 'Service demand', 'tvkn-sd-select', getAvailableServiceDemands(), selectedServiceDemand, val => {
      selectedServiceDemand = val
      renderCharts()
    }, { emphasize: true })

    // Only show scenario selector if not using global scenario
    if (!useGlobalScenario) {
      addSelect(selectorsCol, 'Scenario', 'tvkn-scenario-select', allScenarios, selectedScenario, val => {
        selectedScenario = val
        updateSectorDropdown()
        updateServiceDemandDropdown()
        renderCharts()
      })
    }

    // Charts container
    const chartDiv = document.createElement('div')
    chartDiv.id = 'tvkn-charts'
    chartDiv.style.cssText = 'flex: 1;'
    contentArea.appendChild(chartDiv)

    renderCharts()
  }

  // ── download functions ─────────────────────────────────────────────────
  function copyDataToClipboard() {
    const data = generateExportData(selectedScenario)
    const tsv = data.map(row => row.join('\t')).join('\n')
    navigator.clipboard.writeText(tsv).catch(err => {
      console.error('Failed to copy to clipboard:', err)
    })
  }

  function downloadDataToXlsx() {
    if (typeof XLSX === 'undefined') {
      console.error('XLSX library not loaded')
      return
    }

    const wb = XLSX.utils.book_new()

    // Tab 1: Selected scenario
    const selectedData = generateExportData(selectedScenario)
    const ws1 = XLSX.utils.aoa_to_sheet(selectedData)
    XLSX.utils.book_append_sheet(wb, ws1, selectedScenario.slice(0, 31))

    // Tab 2: All scenarios for the selected service demand
    const allScenariosData = generateAllScenariosExportData()
    const ws2 = XLSX.utils.aoa_to_sheet(allScenariosData)
    XLSX.utils.book_append_sheet(wb, ws2, 'All Scenarios')

    const filename = `tvkn_${selectedServiceDemand}_${selectedDemandType}_${selectedDataSource}_${new Date().toISOString().slice(0, 10)}.xlsx`
    XLSX.writeFile(wb, filename)
  }

  function generateExportData(scenario) {
    const rows = [
      ['Service Demand', selectedServiceDemand],
      ['Databron', selectedDataSource],
      ['Demand Type', selectedDemandType],
      ['Scenario', scenario],
      ['Unit', tvknUnit],
      []
    ]

    const header = ['Year', 'Service Demand Volume']
    // Get carriers for this scenario
    const carriers = getCarriersForScenario(scenario)
    carriers.forEach(c => header.push(c))
    header.push('Total Energy Intensity')
    rows.push(header)

    if (!selectedServiceDemand || !scenario) return rows

    const sdMap = serviceDemandIndex[scenario]
    if (!sdMap || !sdMap[selectedServiceDemand]) return rows

    const optionsMap = sdMap[selectedServiceDemand]
    const options = Object.keys(optionsMap)

    YEARS.forEach(year => {
      let demandVal = 0
      options.forEach(opt => {
        demandVal += getServiceDemandValue(scenario, selectedServiceDemand, opt, year)
      })

      const flows = getEnergyFlows(options, scenario)
      const carrierEnergy = {}
      let totalEnergy = 0
      flows.forEach(row => {
        const yr = parseInt(row.Year)
        if (yr !== year) return
        const val = parseVal(row.Value)
        const carrier = row.Carrier
        if (!carrierEnergy[carrier]) carrierEnergy[carrier] = 0
        carrierEnergy[carrier] += val
        if (val > 0) totalEnergy += val
      })

      const rowData = [year, demandVal]
      carriers.forEach(c => {
        const e = carrierEnergy[c] || 0
        rowData.push(demandVal === 0 ? 0 : convertUnit(e / demandVal))
      })
      rowData.push(demandVal === 0 ? 0 : convertUnit(totalEnergy / demandVal))
      rows.push(rowData)
    })

    return rows
  }

  function generateAllScenariosExportData() {
    const rows = [
      ['Service Demand', selectedServiceDemand],
      ['Databron', selectedDataSource],
      ['Demand Type', selectedDemandType],
      ['Unit', tvknUnit],
      []
    ]

    // Header: Year, Scenario, Service Demand Volume, Total Energy Intensity
    rows.push(['Year', 'Scenario', 'Service Demand Volume', 'Total Energy Intensity'])

    allScenarios.forEach(scenario => {
      const sdMap = serviceDemandIndex[scenario]
      if (!sdMap || !sdMap[selectedServiceDemand]) return

      const optionsMap = sdMap[selectedServiceDemand]
      const options = Object.keys(optionsMap)

      YEARS.forEach(year => {
        let demandVal = 0
        options.forEach(opt => {
          demandVal += getServiceDemandValue(scenario, selectedServiceDemand, opt, year)
        })

        const flows = getEnergyFlows(options, scenario)
        let totalEnergy = 0
        flows.forEach(row => {
          const yr = parseInt(row.Year)
          if (yr !== year) return
          const val = parseVal(row.Value)
          if (val > 0) totalEnergy += val
        })

        const intensity = demandVal === 0 ? 0 : convertUnit(totalEnergy / demandVal)
        rows.push([year, scenario, demandVal, intensity])
      })
    })

    return rows
  }

  function getCarriersForScenario(scenario) {
    const sdMap = serviceDemandIndex[scenario]
    if (!sdMap || !sdMap[selectedServiceDemand]) return []
    const options = Object.keys(sdMap[selectedServiceDemand])
    const flows = getEnergyFlows(options, scenario)
    const carrierSet = new Set()
    flows.forEach(row => carrierSet.add(row.Carrier))
    return [...carrierSet].sort()
  }

  // ── data wrangling ─────────────────────────────────────────────────────

  function getServiceDemandValue(scenario, serviceDemand, option, year) {
    const sdMap = serviceDemandIndex[scenario]
    if (!sdMap || !sdMap[serviceDemand] || !sdMap[serviceDemand][option]) return 0
    return sdMap[serviceDemand][option][year] || 0
  }

  function getEnergyFlows(options, scenario) {
    const scMap = energyFlowIndex[scenario]
    if (!scMap) return []
    const rows = []
    options.forEach(opt => {
      if (scMap[opt]) rows.push(...scMap[opt])
    })
    return rows
  }

  function parseVal(v) {
    if (v === undefined || v === null || v === '') return 0
    const n = parseFloat(v)
    return isNaN(n) ? 0 : n
  }

  function convertUnit(valPJ) {
    return tvknUnit === 'TWh' ? valPJ / 3.6 : valPJ
  }

  // ── render ─────────────────────────────────────────────────────────────
  function renderCharts() {
    const chartDiv = document.getElementById('tvkn-charts')
    if (!chartDiv) return
    chartDiv.innerHTML = ''

    if (!selectedServiceDemand || !selectedScenario) {
      chartDiv.innerHTML = '<p style="color:#888;font-size:13px;">Selecteer een scenario om de grafieken te tonen.</p>'
      return
    }

    const scenarioArr = [selectedScenario]

    // Get unit from first service demand row for this category
    let demandUnit = ''
    const unitCol = selectedDemandType === 'Activity' ? 'unit_activity' : 'unit_capacity'
    const sdIndex = serviceDemandIndex[scenarioArr[0]]
    if (sdIndex && sdIndex[selectedServiceDemand]) {
      const firstOpt = Object.keys(sdIndex[selectedServiceDemand])[0]
      if (firstOpt) {
        const matchRow = serviceDemandRaw.find(r =>
          r['Short.Name'] === scenarioArr[0] &&
          r['Service demand'] === selectedServiceDemand &&
          r.Option === firstOpt
        )
        demandUnit = matchRow ? (matchRow[unitCol] || '') : ''
      }
    }

    // Aggregate data per scenario/year
    // demandData: { scenario -> { year -> totalDemand } }
    // energyData: { scenario -> { year -> totalEnergy } }
    // energyByCarrier: { scenario -> { carrier -> { year -> energy } } }
    const demandData = {}
    const energyData = {}
    const energyByCarrier = {}

    scenarioArr.forEach(sc => {
      demandData[sc] = {}
      energyData[sc] = {}
      energyByCarrier[sc] = {}
      YEARS.forEach(y => {
        demandData[sc][y] = 0
        energyData[sc][y] = 0
      })

      const sdMap = serviceDemandIndex[sc]
      if (!sdMap || !sdMap[selectedServiceDemand]) return

      const optionsMap = sdMap[selectedServiceDemand]
      const options = Object.keys(optionsMap)

      // Sum up demand values across all options
      options.forEach(opt => {
        YEARS.forEach(y => {
          const demandVal = getServiceDemandValue(sc, selectedServiceDemand, opt, y)
          demandData[sc][y] += demandVal
        })
      })

      // Sum up energy flows (total and per carrier)
      // New format: each row has Value, Year, Scenario columns
      // Exclude CO2 flows from energy calculations
      const flows = getEnergyFlows(options, sc)
      flows.forEach(row => {
        const carrier = row.Carrier
        const yr = parseInt(row.Year)
        const val = parseVal(row.Value)
        if (!YEARS.includes(yr)) return

        // Skip CO2 flows - they are tracked separately
        if (carrier === 'CO2Flow' || carrier === 'CO2flow') return

        if (!energyByCarrier[sc][carrier]) {
          energyByCarrier[sc][carrier] = {}
          YEARS.forEach(y => { energyByCarrier[sc][carrier][y] = 0 })
        }

        // Only add positive values (inputs) to total energy
        if (val > 0) {
          energyData[sc][yr] += val
        }
        // Store actual value (positive for input, negative for output)
        energyByCarrier[sc][carrier][yr] += val
      })
    })

    // Get all carriers used by this scenario (excluding CO2 flows)
    const sc = scenarioArr[0]
    const carriers = Object.keys(energyByCarrier[sc] || {})
      .filter(c => c !== 'CO2Flow' && c !== 'CO2flow')
      .sort()

    // Create two-column layout for charts
    const chartsRow = document.createElement('div')
    chartsRow.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 0px; align-items: start;'
    chartDiv.appendChild(chartsRow)

    const leftCol = document.createElement('div')
    leftCol.style.cssText = 'display: flex; flex-direction: column; gap: 18px;'
    const rightCol = document.createElement('div')
    rightCol.style.cssText = 'display: flex; flex-direction: column; gap: 18px;'
    chartsRow.appendChild(leftCol)
    chartsRow.appendChild(rightCol)

    // ── LEFT COLUMN ──
    // CHART 1: Service demand volume with demand amounts inside
    const leftChartWrapper = document.createElement('div')
    leftCol.appendChild(leftChartWrapper)
    renderLineChart(leftChartWrapper, {
      title: `Service demand | ${selectedServiceDemand}`,
      yLabel: demandUnit,
      scenarios: scenarioArr,
      getData: (sc, y) => demandData[sc][y],
      skipUnit: true,
      compact: true,
      demandData: demandData[sc],
      demandUnit: demandUnit,
      serviceDemandName: selectedServiceDemand,
      energyData: energyData[sc],
      tvknUnit: tvknUnit
    })

    // Metadata tile under left chart
    const metadataWrapper = document.createElement('div')
    leftCol.appendChild(metadataWrapper)
    renderMetadataTile(metadataWrapper, sc, demandUnit)

    // ── RIGHT COLUMN ──
    // CHART 2: Energy intensity per carrier
    const rightChartWrapper = document.createElement('div')
    rightCol.appendChild(rightChartWrapper)
    const chartResult = carriers.length > 0 ? renderMultiCarrierChart(rightChartWrapper, {
      title: `Energie-intensiteit | ${selectedServiceDemand}`,
      yLabel: `${tvknUnit} per ${demandUnit}`,
      scenario: sc,
      carriers: carriers,
      demandData: demandData,
      energyByCarrier: energyByCarrier,
      energyData: energyData,
      compact: true
    }) : null

    // Legend tile under right chart
    if (chartResult) {
      const legendWrapper = document.createElement('div')
      rightCol.appendChild(legendWrapper)
      renderLegendTile(legendWrapper, chartResult)
    }
  }

  // ── reusable D3 line chart renderer ────────────────────────────────────
  function renderLineChart(parentEl, opts) {
    const { title, yLabel, scenarios, getData, skipUnit, demandData, demandUnit, serviceDemandName, energyData, tvknUnit } = opts

    // Dimensions - fixed height for consistency
    const W = 320
    const H = 250
    const chartH = 160
    const leftMargin = 45
    const rightMargin = 15

    // Legend in single row
    const legendHeight = scenarios.length > 0 ? 22 : 0
    const margin = { top: 30, right: rightMargin, bottom: legendHeight + 18, left: leftMargin }
    const innerW = W - margin.left - margin.right
    const innerH = chartH

    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'margin-bottom:0; background:#fff; border:1px solid #e0e0e0; border-radius:12px; padding:16px 18px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);'
    parentEl.appendChild(wrapper)

    const svg = d3.select(wrapper).append('svg')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('width', '100%')
      .style('height', 'auto')

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    svg.append('text')
      .attr('x', margin.left)
      .attr('y', 17)
      .style('font-size', '11px')
      .style('font-weight', '600')
      .style('fill', '#222')
      .text(title)

    const x = d3.scalePoint()
      .domain(YEARS)
      .range([0, innerW])

    let maxVal = 0
    scenarios.forEach(sc => {
      YEARS.forEach(y => {
        const v = getData(sc, y)
        if (v > maxVal) maxVal = v
      })
    })
    if (maxVal === 0) maxVal = 1

    const y = d3.scaleLinear()
      .domain([0, maxVal * 1.1])
      .range([innerH, 0])

    // X-axis
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickFormat(d3.format('d')).tickSize(0).tickPadding(8))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick text')
        .style('font-size', '9px')
        .style('fill', '#555')
        .style('font-weight', '400'))

    // Y-axis with horizontal gridlines
    const yAxisG = g.append('g')
      .call(d3.axisLeft(y).ticks(5).tickSize(-innerW).tickPadding(8))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line')
        .style('stroke', '#e5e5e5')
        .style('stroke-width', '1px'))
      .call(g => g.selectAll('.tick text')
        .style('font-size', '9px')
        .style('fill', '#555')
        .style('font-weight', '400'))

    // Y-axis label
    g.append('text')
      .attr('transform', `translate(-35,${innerH / 2}) rotate(-90)`)
      .style('text-anchor', 'middle')
      .style('font-size', '9px')
      .style('fill', '#666')
      .style('font-weight', '500')
      .text(yLabel)

    const lineGen = d3.line()
      .x(d => x(d.year))
      .y(d => y(d.value))

    const symbols = [
      d3.symbolCircle, d3.symbolSquare, d3.symbolTriangle,
      d3.symbolDiamond, d3.symbolCross, d3.symbolStar, d3.symbolWye
    ]

    const tooltip = svg.append('g').style('display', 'none')
    tooltip.append('rect')
      .attr('rx', 4).attr('ry', 4)
      .attr('fill', '#fff')
      .attr('stroke', '#ccc')
      .attr('filter', 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))')
    tooltip.append('text')
      .attr('fill', '#333')
      .style('font-size', '9px')
      .attr('text-anchor', 'middle')

    scenarios.forEach((sc, idx) => {
      const color = '#000000' // Always use black
      const pts = YEARS.map(yr => ({ year: yr, value: getData(sc, yr) }))

      g.append('path')
        .datum(pts)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('d', lineGen)

      const symGen = d3.symbol().type(symbols[idx % symbols.length]).size(36)
      pts.forEach(d => {
        g.append('path')
          .attr('d', symGen())
          .attr('transform', `translate(${x(d.year)},${y(d.value)})`)
          .attr('fill', color)
          .style('cursor', 'pointer')
          .on('mouseover', function (event) {
            tooltip.raise().style('display', 'block')
            const textEl = tooltip.select('text')
            textEl.selectAll('tspan').remove()
            textEl.append('tspan').attr('x', 0).attr('dy', '1.1em').style('font-weight', 'bold').text(sc)
            const valText = skipUnit ? d3.format('.2f')(d.value) : `${d3.format('.2f')(d.value)} ${tvknUnit}`
            textEl.append('tspan').attr('x', 0).attr('dy', '1.3em').text(`${d.year}: ${valText}`)
            const bbox = textEl.node().getBBox()
            const pad = 5
            tooltip.select('rect')
              .attr('x', -bbox.width / 2 - pad)
              .attr('y', 0)
              .attr('width', bbox.width + pad * 2)
              .attr('height', bbox.height + pad * 2)
            textEl.attr('transform', `translate(0, ${pad - bbox.y})`)
            const tx = margin.left + x(d.year)
            const ty = margin.top + y(d.value) - bbox.height - pad * 2 - 8
            tooltip.attr('transform', `translate(${tx},${Math.max(5, ty)})`)
          })
          .on('mouseout', () => tooltip.style('display', 'none'))
      })
    })

    // Legend in horizontal row (only show if there are scenarios)
    if (scenarios.length > 0) {
      const legendTop = margin.top + innerH + 20
      const legendG = svg.append('g')
        .attr('transform', `translate(${margin.left}, ${legendTop})`)

      scenarios.forEach((sc, idx) => {
        const row = legendG.append('g')
          .attr('transform', `translate(${idx * 100}, 0)`)

        const symGen = d3.symbol().type(symbols[idx % symbols.length]).size(25)
        row.append('path')
          .attr('d', symGen())
          .attr('transform', 'translate(5, 5)')
          .attr('fill', '#000000') // Always use black

        row.append('text')
          .attr('x', 13)
          .attr('y', 8)
          .style('font-size', '7px')
          .style('fill', '#333')
          .text(sc)
      })
    }

    // ── Add demand amounts section below the chart (if data provided) ──
    if (demandData && demandUnit && serviceDemandName) {
      const demandSection = document.createElement('div')
      demandSection.style.cssText = 'margin-top: 16px; padding-top: 12px; border-top: 1px solid #e0e0e0;'
      wrapper.appendChild(demandSection)

      const demandTitle = document.createElement('div')
      demandTitle.style.cssText = 'font-size:11px; font-weight:600; color:#222; margin-bottom:8px;'
      demandTitle.textContent = `Vraag per jaar (${demandUnit}) | ${serviceDemandName}`
      demandSection.appendChild(demandTitle)

      const demandValuesDiv = document.createElement('div')
      demandValuesDiv.style.cssText = 'display: flex; gap: 16px; flex-wrap: wrap;'
      demandSection.appendChild(demandValuesDiv)

      YEARS.forEach(yr => {
        const demand = demandData[yr] || 0
        const energy = energyData ? (energyData[yr] || 0) : 0
        const intensity = demand > 0 ? convertUnit(energy / demand) : 0

        const yearBox = document.createElement('div')
        yearBox.style.cssText = 'display: flex; flex-direction: column; align-items: center;'

        const yearLabel = document.createElement('div')
        yearLabel.style.cssText = 'font-size:9px; color:#666; margin-bottom:2px;'
        yearLabel.textContent = yr

        const demandLabel = document.createElement('div')
        demandLabel.style.cssText = 'font-size:11px; font-weight:500; color:#222;'
        demandLabel.textContent = d3.format('.2f')(demand)

        yearBox.appendChild(yearLabel)
        yearBox.appendChild(demandLabel)

        // Add energy per unit if energy data is provided
        if (energyData && tvknUnit) {
          const intensityLabel = document.createElement('div')
          intensityLabel.style.cssText = 'font-size:9px; color:#666; margin-top:2px;'
          intensityLabel.textContent = `${d3.format('.2f')(intensity)} ${tvknUnit}/unit`
          yearBox.appendChild(intensityLabel)
        }

        demandValuesDiv.appendChild(yearBox)
      })
    }
  }

  // ── compact line chart for option detail ──────────────────────────────
  function renderOptionLineChart(parentEl, opts) {
    const { title, yLabel, data, skipUnit } = opts

    // Larger dimensions for full-width stacked layout
    const W = 460
    const H = 210
    const chartH = 110
    const leftMargin = 45
    const rightMargin = 10

    const margin = { top: 50, right: rightMargin, bottom: 25, left: leftMargin }
    const innerW = W - margin.left - margin.right
    const innerH = chartH

    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'background:#fff; border:1px solid #ddd; border-radius:6px; padding:8px; font-size: 9px;'
    parentEl.appendChild(wrapper)

    const svg = d3.select(wrapper).append('svg')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('width', '100%')
      .style('height', 'auto')

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    svg.append('text')
      .attr('x', margin.left)
      .attr('y', 18)
      .style('font-size', '13px')
      .style('font-weight', '600')
      .style('fill', '#333')
      .text(title)

    const x = d3.scalePoint()
      .domain(YEARS)
      .range([0, innerW])

    let maxVal = 0
    YEARS.forEach(y => {
      const v = data[y] || 0
      if (v > maxVal) maxVal = v
    })
    if (maxVal === 0) maxVal = 1

    const y = d3.scaleLinear()
      .domain([0, maxVal])
      .range([innerH, 0])
      .nice()

    // X-axis
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickSize(4).tickPadding(4))
      .call(g => g.select('.domain').attr('stroke', '#ccc'))
      .call(g => g.selectAll('.tick line').attr('stroke', '#ccc'))
      .call(g => g.selectAll('.tick text').style('font-size', '10px').style('fill', '#666'))

    // Y-axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(5).tickSize(4).tickPadding(4).tickFormat(d3.format('.1f')))
      .call(g => g.select('.domain').attr('stroke', '#ccc'))
      .call(g => g.selectAll('.tick line').attr('stroke', '#ccc'))
      .call(g => g.selectAll('.tick text').style('font-size', '10px').style('fill', '#666'))

    // Y-axis label
    g.append('text')
      .attr('transform', `translate(-35,${innerH / 2}) rotate(-90)`)
      .style('text-anchor', 'middle')
      .style('font-size', '10px')
      .style('fill', '#666')
      .text(yLabel)

    // Grid bands
    const yTicks = y.ticks(5)
    const bandGroup = g.append('g').attr('class', 'grid-bands')
    bandGroup.selectAll('rect')
      .data(d3.range(0, yTicks.length - 1, 2))
      .enter()
      .append('rect')
      .attr('x', 0)
      .attr('y', i => y(yTicks[i + 1]))
      .attr('width', innerW)
      .attr('height', i => y(yTicks[i]) - y(yTicks[i + 1]))
      .style('fill', '#f8f8f8')
    bandGroup.lower()

    // Line
    const lineGen = d3.line()
      .x(d => x(d.year))
      .y(d => y(d.value))

    const pts = YEARS.map(yr => ({ year: yr, value: data[yr] || 0 }))

    g.append('path')
      .datum(pts)
      .attr('fill', 'none')
      .attr('stroke', '#000')
      .attr('stroke-width', 1.5)
      .attr('d', lineGen)

    // Tooltip
    const tooltip = svg.append('g')
      .style('display', 'none')
      .style('pointer-events', 'none')

    tooltip.append('rect')
      .attr('rx', 3)
      .attr('ry', 3)
      .attr('fill', '#333')
      .attr('opacity', 0.9)

    const tooltipText = tooltip.append('text')
      .attr('fill', '#fff')
      .style('font-size', '9px')
      .attr('text-anchor', 'middle')

    // Points with hover interaction
    const symGen = d3.symbol().type(d3.symbolCircle).size(16)
    pts.forEach(d => {
      g.append('path')
        .attr('d', symGen())
        .attr('transform', `translate(${x(d.year)},${y(d.value)})`)
        .attr('fill', '#000')
        .style('cursor', 'pointer')
        .on('mouseover', function(event) {
          tooltip.style('display', 'block')
          const valueText = skipUnit ? d3.format('.2f')(d.value) : `${d3.format('.2f')(d.value)} ${yLabel}`
          tooltipText.text(`${d.year}: ${valueText}`)

          const bbox = tooltipText.node().getBBox()
          const pad = 4
          tooltip.select('rect')
            .attr('x', -bbox.width / 2 - pad)
            .attr('y', -bbox.height - pad)
            .attr('width', bbox.width + pad * 2)
            .attr('height', bbox.height + pad * 2)

          tooltipText.attr('y', -pad - 2)

          const tx = margin.left + x(d.year)
          const ty = margin.top + y(d.value) - bbox.height - pad * 2 - 8
          tooltip.attr('transform', `translate(${tx},${Math.max(margin.top, ty)})`)
        })
        .on('mouseout', () => {
          tooltip.style('display', 'none')
        })
    })
  }

  // ── compact stacked area chart for option energy intensity ───────────
  function renderOptionMultiCarrierChart(parentEl, opts) {
    const { title, yLabel, carriers, demandData, carrierData, energyData } = opts

    // Larger dimensions for full-width stacked layout
    const W = 460
    const H = 210
    const chartH = 110
    const leftMargin = 45
    const rightMargin = 10

    const margin = { top: 50, right: rightMargin, bottom: 25, left: leftMargin }
    const innerW = W - margin.left - margin.right
    const innerH = chartH

    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'background:#fff; border:1px solid #ddd; border-radius:6px; padding:8px; font-size: 9px;'
    parentEl.appendChild(wrapper)

    const svg = d3.select(wrapper).append('svg')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('width', '100%')
      .style('height', 'auto')

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    svg.append('text')
      .attr('x', margin.left)
      .attr('y', 18)
      .style('font-size', '13px')
      .style('font-weight', '600')
      .style('fill', '#333')
      .text(title)

    const x = d3.scalePoint()
      .domain(YEARS)
      .range([0, innerW])

    // Calculate max intensity
    let maxIntensity = 0
    YEARS.forEach(yr => {
      const demand = demandData[yr] || 0
      const energy = energyData[yr] || 0
      const intensity = demand > 0 ? energy / demand : 0
      if (intensity > maxIntensity) maxIntensity = intensity
    })
    if (maxIntensity === 0) maxIntensity = 1

    const y = d3.scaleLinear()
      .domain([0, maxIntensity])
      .range([innerH, 0])
      .nice()

    // X-axis
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickSize(4).tickPadding(4))
      .call(g => g.select('.domain').attr('stroke', '#ccc'))
      .call(g => g.selectAll('.tick line').attr('stroke', '#ccc'))
      .call(g => g.selectAll('.tick text').style('font-size', '8px').style('fill', '#666'))

    // Y-axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(5).tickSize(4).tickPadding(4).tickFormat(d3.format('.1f')))
      .call(g => g.select('.domain').attr('stroke', '#ccc'))
      .call(g => g.selectAll('.tick line').attr('stroke', '#ccc'))
      .call(g => g.selectAll('.tick text').style('font-size', '8px').style('fill', '#666'))

    // Y-axis label
    g.append('text')
      .attr('transform', `translate(-35,${innerH / 2}) rotate(-90)`)
      .style('text-anchor', 'middle')
      .style('font-size', '8px')
      .style('fill', '#666')
      .text(yLabel)

    // Grid bands
    const yTicks = y.ticks(5)
    const bandGroup = g.append('g').attr('class', 'grid-bands')
    bandGroup.selectAll('rect')
      .data(d3.range(0, yTicks.length - 1, 2))
      .enter()
      .append('rect')
      .attr('x', 0)
      .attr('y', i => y(yTicks[i + 1]))
      .attr('width', innerW)
      .attr('height', i => y(yTicks[i]) - y(yTicks[i + 1]))
      .style('fill', '#f8f8f8')
    bandGroup.lower()

    // Build stacked data
    const stackData = YEARS.map(yr => {
      const obj = { year: yr }
      const demand = demandData[yr] || 0
      const yearCarriers = carrierData[yr] || {}

      carriers.forEach(carrier => {
        const carrierEnergy = yearCarriers[carrier] || 0
        obj[carrier] = demand > 0 ? carrierEnergy / demand : 0
      })

      return obj
    })

    // Create stack generator
    const stack = d3.stack()
      .keys(carriers)
      .order(d3.stackOrderNone)
      .offset(d3.stackOffsetNone)

    const series = stack(stackData)

    // Area generator
    const area = d3.area()
      .x(d => x(d.data.year))
      .y0(d => y(d[0]))
      .y1(d => y(d[1]))

    // Draw areas
    series.forEach(s => {
      const carrier = s.key
      const color = carrierColorMapping[carrier] || '#999'

      g.append('path')
        .datum(s)
        .attr('fill', color)
        .attr('opacity', 0.8)
        .attr('d', area)
    })

    // Tooltip
    const tooltip = svg.append('g')
      .style('display', 'none')
      .style('pointer-events', 'none')

    tooltip.append('rect')
      .attr('rx', 3)
      .attr('ry', 3)
      .attr('fill', '#333')
      .attr('opacity', 0.9)

    const tooltipText = tooltip.append('text')
      .attr('fill', '#fff')
      .style('font-size', '9px')
      .attr('text-anchor', 'middle')

    // Draw dots on top of each stack with hover interaction
    YEARS.forEach(yr => {
      const demand = demandData[yr] || 0
      const energy = energyData[yr] || 0
      const totalIntensity = demand > 0 ? energy / demand : 0
      const yearCarriers = carrierData[yr] || {}

      g.append('circle')
        .attr('cx', x(yr))
        .attr('cy', y(totalIntensity))
        .attr('r', 2)
        .attr('fill', '#666')
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.5)
        .style('cursor', 'pointer')
        .on('mouseover', function() {
          d3.select(this).attr('r', 3)
          tooltip.style('display', 'block')

          // Build tooltip content with breakdown by carrier
          tooltipText.selectAll('tspan').remove()
          const titleSpan = tooltipText.append('tspan')
            .attr('x', 0)
            .attr('dy', '1em')
            .style('font-weight', 'bold')
            .text(`${yr}: ${d3.format('.2f')(totalIntensity)} ${yLabel}`)

          // Add carrier breakdown
          carriers.forEach((carrier, idx) => {
            const carrierEnergy = yearCarriers[carrier] || 0
            const carrierIntensity = demand > 0 ? carrierEnergy / demand : 0
            if (Math.abs(carrierIntensity) > 0.01) {
              const carrierSpan = tooltipText.append('tspan')
                .attr('x', 0)
                .attr('dy', '1.2em')
                .style('font-weight', 'normal')
                .text(`${carrier}: ${d3.format('.2f')(carrierIntensity)}`)
            }
          })

          const bbox = tooltipText.node().getBBox()
          const pad = 5
          tooltip.select('rect')
            .attr('x', -bbox.width / 2 - pad)
            .attr('y', -bbox.height - pad)
            .attr('width', bbox.width + pad * 2)
            .attr('height', bbox.height + pad * 2)

          tooltipText.attr('y', -pad)

          const tx = margin.left + x(yr)
          const ty = margin.top + y(totalIntensity) - bbox.height - pad * 2 - 8
          tooltip.attr('transform', `translate(${tx},${Math.max(margin.top, ty)})`)
        })
        .on('mouseout', function() {
          d3.select(this).attr('r', 2)
          tooltip.style('display', 'none')
        })
    })
  }

  // ── metadata tile renderer ────────────────────────────────────────────
  function renderMetadataTile(parentEl, scenario, demandUnit) {
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'margin-bottom:0; background:#fff; border:1px solid #ddd; border-radius:10px; padding:10px 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);'
    parentEl.appendChild(wrapper)

    const mainTitle = document.createElement('div')
    mainTitle.style.cssText = 'font-size: 12px; font-weight: 700; color: #222; margin-bottom: 4px;'
    mainTitle.textContent = selectedServiceDemand
    wrapper.appendChild(mainTitle)

    const title = document.createElement('div')
    title.style.cssText = 'font-size: 10px; font-weight: 500; color: #666; margin-bottom: 10px;'
    title.textContent = 'Energy Flows & Options'
    wrapper.appendChild(title)

    // Get options for current service demand
    const sdMap = serviceDemandIndex[scenario]
    if (!sdMap || !sdMap[selectedServiceDemand]) {
      wrapper.innerHTML += '<p style="font-size: 10px; color: #888;">No data available</p>'
      return
    }

    const options = Object.keys(sdMap[selectedServiceDemand])

    // Calculate total input and output energy for the selected year, broken down by carrier
    // CO2 flows are tracked separately and not included in energy totals
    const selectedYear = (typeof globalActiveYear !== 'undefined' && globalActiveYear?.id)
      ? parseInt(globalActiveYear.id)
      : YEARS[YEARS.length - 1]
    const flows = getEnergyFlows(options, scenario)
    let totalInput = 0
    let totalOutput = 0
    const carrierInput = {}
    const carrierOutput = {}
    let co2Flow = 0 // Separate tracking for CO2 (in Mton)

    flows.forEach(row => {
      const yr = parseInt(row.Year)
      if (yr !== selectedYear) return
      const val = parseVal(row.Value)
      const carrier = row.Carrier

      // Check if this is a CO2 flow
      if (carrier === 'CO2Flow' || carrier === 'CO2flow') {
        co2Flow += val // CO2 is already in Mton, negative means captured/removed
        return // Don't include in energy totals
      }

      if (val > 0) {
        totalInput += val
        carrierInput[carrier] = (carrierInput[carrier] || 0) + val
      } else {
        totalOutput += Math.abs(val)
        carrierOutput[carrier] = (carrierOutput[carrier] || 0) + Math.abs(val)
      }
    })

    // Energy summary
    const energySummary = document.createElement('div')
    energySummary.style.cssText = 'font-size: 10px; color: #333; margin-bottom: 12px; padding: 8px; background: #f9f9f9; border-radius: 4px;'

    let summaryHTML = `<div style="margin-bottom: 6px; font-weight: 600;">Energy Flows (${selectedYear}):</div>`

    // Input carriers
    const inputCarriers = Object.keys(carrierInput).sort((a, b) => carrierInput[b] - carrierInput[a])
    if (inputCarriers.length > 0) {
      summaryHTML += `<div style="margin-bottom: 4px; font-weight: 600; color: #000;">Inputs (${d3.format('.2f')(convertUnit(totalInput))} ${tvknUnit}):</div>`
      inputCarriers.forEach(carrier => {
        const value = convertUnit(carrierInput[carrier])
        // Skip if value rounds to 0.00
        if (Math.abs(value) < 0.005) return
        const percentage = (carrierInput[carrier] / totalInput * 100).toFixed(1)
        const color = carrierColorMapping[carrier] || '#999'
        summaryHTML += `<div style="margin-left: 12px; margin-bottom: 2px; display: flex; align-items: center; gap: 6px;"><span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${color}; display: inline-block; flex-shrink: 0;"></span><span>${carrier}: <strong>${d3.format('.2f')(value)} ${tvknUnit}</strong> <span style="color: #888;">(${percentage}%)</span></span></div>`
      })
    }

    // Output carriers
    const outputCarriers = Object.keys(carrierOutput).sort((a, b) => carrierOutput[b] - carrierOutput[a])
    if (outputCarriers.length > 0) {
      summaryHTML += `<div style="margin-top: 6px; margin-bottom: 4px; font-weight: 600; color: #000;">Outputs (${d3.format('.2f')(convertUnit(totalOutput))} ${tvknUnit}):</div>`
      outputCarriers.forEach(carrier => {
        const value = convertUnit(carrierOutput[carrier])
        // Skip if value rounds to 0.00
        if (Math.abs(value) < 0.005) return
        const percentage = (carrierOutput[carrier] / totalOutput * 100).toFixed(1)
        const color = carrierColorMapping[carrier] || '#999'
        summaryHTML += `<div style="margin-left: 12px; margin-bottom: 2px; display: flex; align-items: center; gap: 6px;"><span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${color}; display: inline-block; flex-shrink: 0;"></span><span>${carrier}: <strong>${d3.format('.2f')(value)} ${tvknUnit}</strong> <span style="color: #888;">(${percentage}%)</span></span></div>`
      })
    }

    // CO2 Flow (if present)
    if (co2Flow !== 0) {
      const co2Label = co2Flow < 0 ? 'CO₂ Captured/Removed' : 'CO₂ Emitted'
      const co2Color = co2Flow < 0 ? '#000' : '#c44'
      summaryHTML += `<div style="margin-top: 8px; margin-bottom: 4px; font-weight: 600; color: ${co2Color};">${co2Label}:</div>`
      summaryHTML += `<div style="margin-left: 12px; margin-bottom: 2px;">CO₂: <strong>${d3.format('.2f')(Math.abs(co2Flow))} Mton</strong></div>`
    }

    energySummary.innerHTML = summaryHTML
    wrapper.appendChild(energySummary)

    // Options metadata - show all options for selected service demand
    if (options.length > 0) {
      const optionsTitle = document.createElement('div')
      optionsTitle.style.cssText = 'font-size: 10px; font-weight: 600; color: #333; margin-bottom: 6px;'
      optionsTitle.textContent = `Options (${options.length}):`
      wrapper.appendChild(optionsTitle)

      const optionsList = document.createElement('div')
      optionsList.style.cssText = 'font-size: 10px; color: #555; max-height: 600px; overflow-y: auto;'

      options.forEach((opt) => {
        const metadata = optiesMetadataIndex[opt]
        const optionDiv = document.createElement('div')
        optionDiv.style.cssText = 'margin-bottom: 8px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden;'

        // Calculate energy flows for this option for the header
        const optFlows = flows.filter(row =>
          row.Option === opt && parseInt(row.Year) === selectedYear
        )
        let optTotalInput = 0
        let optTotalOutput = 0
        let optCO2Total = 0

        optFlows.forEach(row => {
          const carrier = row.Carrier
          const val = parseVal(row.Value)

          if (carrier === 'CO2Flow' || carrier === 'CO2flow') {
            optCO2Total += val
            return
          }

          if (val > 0) {
            optTotalInput += val
          } else {
            optTotalOutput += Math.abs(val)
          }
        })

        // Option header (clickable)
        const optHeader = document.createElement('div')
        optHeader.style.cssText = 'font-weight: 600; padding: 8px; color: #000; font-size: 11px; background: #f5f5f5; cursor: pointer; display: flex; justify-content: space-between; align-items: flex-start; border-left: 3px solid #4a90e2; gap: 12px;'

        // Left side: title and description
        const optHeaderLeft = document.createElement('div')
        optHeaderLeft.style.cssText = 'flex: 1; min-width: 0;'

        const optTitle = document.createElement('div')
        optTitle.style.cssText = 'font-weight: 600; margin-bottom: 2px;'
        if (metadata && metadata['Nr']) {
          optTitle.textContent = `#${metadata['Nr']} - ${metadata['Naam optie'] || opt}`
        } else {
          optTitle.textContent = metadata ? metadata['Naam optie'] || opt : opt
        }
        optHeaderLeft.appendChild(optTitle)

        // Short description in header (if available)
        if (metadata && metadata['Korte omschrijving']) {
          const shortDesc = document.createElement('div')
          shortDesc.style.cssText = 'font-size: 9px; font-weight: 400; color: #666; line-height: 1.2; margin-top: 2px;'
          shortDesc.textContent = metadata['Korte omschrijving']
          optHeaderLeft.appendChild(shortDesc)
        }

        optHeader.appendChild(optHeaderLeft)

        // Right side: energy totals
        const optHeaderRight = document.createElement('div')
        optHeaderRight.style.cssText = 'display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0;'

        if (optTotalInput > 0 || optTotalOutput > 0) {
          if (optTotalInput > 0) {
            const inputDiv = document.createElement('div')
            inputDiv.style.cssText = 'font-size: 8px; color: #666; font-weight: 400;'
            inputDiv.textContent = `In: ${d3.format('.1f')(convertUnit(optTotalInput))} ${tvknUnit}`
            optHeaderRight.appendChild(inputDiv)
          }

          if (optTotalOutput > 0) {
            const outputDiv = document.createElement('div')
            outputDiv.style.cssText = 'font-size: 8px; color: #666; font-weight: 400;'
            outputDiv.textContent = `Out: ${d3.format('.1f')(convertUnit(optTotalOutput))} ${tvknUnit}`
            optHeaderRight.appendChild(outputDiv)
          }

          if (optCO2Total !== 0) {
            const co2Div = document.createElement('div')
            const co2Color = optCO2Total < 0 ? '#000' : '#c44'
            const co2Label = optCO2Total < 0 ? 'CO₂ captured:' : 'CO₂:'
            co2Div.style.cssText = `font-size: 8px; color: ${co2Color}; font-weight: 400;`
            co2Div.textContent = `${co2Label} ${d3.format('.1f')(Math.abs(optCO2Total))} Mt`
            optHeaderRight.appendChild(co2Div)
          }
        }

        optHeader.appendChild(optHeaderRight)

        // Arrow indicator
        const arrow = document.createElement('span')
        arrow.textContent = '▼'
        arrow.style.cssText = 'font-size: 10px; color: #666; transition: transform 0.2s; flex-shrink: 0;'
        optHeader.appendChild(arrow)

        optionDiv.appendChild(optHeader)

        // Content container (initially hidden)
        const contentDiv = document.createElement('div')
        contentDiv.style.cssText = 'display: none; padding: 8px; background: #fafafa;'

        // Energy flows for this option (shown first) - reuse optFlows from header calculation
        if (optFlows.length > 0) {
          const optInputs = {}
          const optOutputs = {}
          let optCO2 = 0

          optFlows.forEach(row => {
            const carrier = row.Carrier
            const val = parseVal(row.Value)

            // Separate CO2 tracking
            if (carrier === 'CO2Flow' || carrier === 'CO2flow') {
              optCO2 += val
              return
            }

            if (val > 0) {
              optInputs[carrier] = (optInputs[carrier] || 0) + val
            } else {
              optOutputs[carrier] = (optOutputs[carrier] || 0) + Math.abs(val)
            }
          })

          const flowsDiv = document.createElement('div')
          flowsDiv.style.cssText = 'margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid #e0e0e0; font-size: 9px;'

          let flowsHTML = '<div style="font-weight: 600; margin-bottom: 3px;">Energy Flows:</div>'

          // Input carriers for this option
          const optInputCarriers = Object.keys(optInputs).sort((a, b) => optInputs[b] - optInputs[a])
          const significantInputs = optInputCarriers.filter(c => Math.abs(convertUnit(optInputs[c])) >= 0.005)
          if (significantInputs.length > 0) {
            flowsHTML += '<div style="margin-top: 3px; margin-bottom: 2px; font-weight: 500; color: #000;">Inputs:</div>'
            significantInputs.forEach(carrier => {
              const value = convertUnit(optInputs[carrier])
              const color = carrierColorMapping[carrier] || '#999'
              flowsHTML += `<div style="margin-left: 8px; margin-bottom: 1px; display: flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background-color: ${color}; display: inline-block; flex-shrink: 0;"></span><span>${carrier}: ${d3.format('.2f')(value)} ${tvknUnit}</span></div>`
            })
          }

          // Output carriers for this option
          const optOutputCarriers = Object.keys(optOutputs).sort((a, b) => optOutputs[b] - optOutputs[a])
          const significantOutputs = optOutputCarriers.filter(c => Math.abs(convertUnit(optOutputs[c])) >= 0.005)
          if (significantOutputs.length > 0) {
            flowsHTML += '<div style="margin-top: 3px; margin-bottom: 2px; font-weight: 500; color: #000;">Outputs:</div>'
            significantOutputs.forEach(carrier => {
              const value = convertUnit(optOutputs[carrier])
              const color = carrierColorMapping[carrier] || '#999'
              flowsHTML += `<div style="margin-left: 8px; margin-bottom: 1px; display: flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background-color: ${color}; display: inline-block; flex-shrink: 0;"></span><span>${carrier}: ${d3.format('.2f')(value)} ${tvknUnit}</span></div>`
            })
          }

          // CO2 flow for this option
          if (optCO2 !== 0) {
            const co2Label = optCO2 < 0 ? 'CO₂ Captured' : 'CO₂ Emitted'
            const co2Color = optCO2 < 0 ? '#000' : '#c44'
            flowsHTML += `<div style="margin-top: 3px; margin-bottom: 2px; font-weight: 500; color: ${co2Color};">${co2Label}: ${d3.format('.2f')(Math.abs(optCO2))} Mton</div>`
          }

          flowsDiv.innerHTML = flowsHTML
          contentDiv.appendChild(flowsDiv)
        }

        // Add service demand and energy intensity graphs for this option
        const graphsDiv = document.createElement('div')
        graphsDiv.style.cssText = 'margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #e0e0e0;'

        // Get service demand data for this specific option across all years
        const optionDemandData = {}
        YEARS.forEach(yr => {
          optionDemandData[yr] = 0
        })

        // Find demand data for this option
        const sdIndex = serviceDemandIndex[selectedScenario]
        if (sdIndex && sdIndex[selectedServiceDemand] && sdIndex[selectedServiceDemand][opt]) {
          const optData = sdIndex[selectedServiceDemand][opt]
          YEARS.forEach(yr => {
            optionDemandData[yr] = optData[yr] || 0
          })
        }

        // Get energy data for this option across all years
        const optionEnergyData = {}
        const optionCarrierData = {}
        YEARS.forEach(yr => {
          optionEnergyData[yr] = 0
          optionCarrierData[yr] = {}
        })

        if (energyFlowIndex[selectedScenario] && energyFlowIndex[selectedScenario][opt]) {
          const optEnergyRows = energyFlowIndex[selectedScenario][opt]
          optEnergyRows.forEach(row => {
            const yr = parseInt(row.Year)
            const carrier = row.Carrier
            const val = parseVal(row.Value)

            // Skip CO2 flows
            if (carrier === 'CO2Flow' || carrier === 'CO2flow') return

            // Only add positive values (inputs) to total energy
            if (val > 0) {
              optionEnergyData[yr] += val
            }
            // Store actual value per carrier (positive for input, negative for output)
            if (!optionCarrierData[yr][carrier]) optionCarrierData[yr][carrier] = 0
            optionCarrierData[yr][carrier] += val
          })
        }

        // Create vertical layout for graphs (stacked)
        const graphsRow = document.createElement('div')
        graphsRow.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'

        // Get option name for graph titles
        const optionName = metadata ? (metadata['Naam optie'] || opt) : opt

        // Top: Service demand graph
        const demandGraphDiv = document.createElement('div')
        renderOptionLineChart(demandGraphDiv, {
          title: `Service demand | ${optionName}`,
          yLabel: demandUnit,
          data: optionDemandData,
          skipUnit: true
        })
        graphsRow.appendChild(demandGraphDiv)

        // Bottom: Energy intensity graph (only if there's demand data)
        const intensityGraphDiv = document.createElement('div')
        const intensityData = {}
        YEARS.forEach(yr => {
          const demand = optionDemandData[yr]
          const energy = optionEnergyData[yr]
          intensityData[yr] = demand > 0 ? energy / demand : 0
        })

        // Get unique carriers across all years for this option
        const allCarriersSet = new Set()
        YEARS.forEach(yr => {
          Object.keys(optionCarrierData[yr] || {}).forEach(carrier => {
            allCarriersSet.add(carrier)
          })
        })
        const carriersList = Array.from(allCarriersSet)

        // Sort carriers by total output across all years
        const carrierTotals = {}
        carriersList.forEach(carrier => {
          carrierTotals[carrier] = 0
          YEARS.forEach(yr => {
            carrierTotals[carrier] += optionCarrierData[yr][carrier] || 0
          })
        })
        const sortedCarriers = carriersList.sort((a, b) => carrierTotals[b] - carrierTotals[a])

        renderOptionMultiCarrierChart(intensityGraphDiv, {
          title: `Energie-intensiteit | ${optionName}`,
          yLabel: `${tvknUnit} per ${demandUnit}`,
          carriers: sortedCarriers,
          demandData: optionDemandData,
          carrierData: optionCarrierData,
          energyData: optionEnergyData
        })
        graphsRow.appendChild(intensityGraphDiv)

        graphsDiv.appendChild(graphsRow)
        contentDiv.appendChild(graphsDiv)

        if (metadata) {
          // Create a two-column grid for metadata
          const metaGrid = document.createElement('div')
          metaGrid.style.cssText = 'display: grid; grid-template-columns: auto 1fr; gap: 4px 8px; font-size: 9px;'

          const fields = [
            { label: 'Sector', key: 'Sector' },
            { label: 'Unit Capacity', key: 'Unit of Capacity' },
            { label: 'Unit Activity', key: 'Eenheid activiteit' },
            { label: 'Reference Option', key: 'ReferentieOptie' },
            { label: 'Intro Year', key: 'Introduction Year' },
            { label: 'Connector Point', key: 'ConnectorPointOption' },
            { label: 'Energy Balance MONIT', key: 'EnergyBalancePresentationMONIT' },
            { label: 'Sector Ref', key: 'SectorRef' },
            { label: 'NG Admixture', key: 'NG admixture option' },
            { label: 'Excl Max Admix', key: 'Excl for max admix value' },
            { label: 'Heat Demand Profile', key: 'Heat demand profile followed' },
            { label: 'Heat Supply Profile', key: 'Heat supply profile follows demand' },
            { label: 'Carbon Balance', key: 'Koolstofbalans' },
            { label: 'Ignore Emission Effect', key: 'Negeer emissieffect', transform: (v) => v === 'True' ? 'Yes' : v === 'False' ? 'No' : v },
            { label: 'Fraction Feedstock', key: 'FractionFeedstock' },
            { label: 'Lumpy', key: 'Lumpy', transform: (v) => v === 'True' ? 'Yes' : v === 'False' ? 'No' : v },
            { label: 'F56', key: 'F56' },
            { label: 'Institute', key: 'Instituut' },
            { label: 'Source', key: 'Source' },
            { label: 'Cost Info', key: 'Kosten toelichting' },
            { label: 'Other Effects', key: 'Overige effecten' }
          ]

          fields.forEach(field => {
            const value = metadata[field.key]
            if (value && value !== '' && value !== 'No') {
              const labelDiv = document.createElement('div')
              labelDiv.style.cssText = 'color: #666; font-weight: 500;'
              labelDiv.textContent = field.label + ':'
              metaGrid.appendChild(labelDiv)

              const valueDiv = document.createElement('div')
              valueDiv.style.cssText = 'color: #333;'
              const displayValue = field.transform ? field.transform(value) : value
              valueDiv.textContent = displayValue
              metaGrid.appendChild(valueDiv)
            }
          })

          contentDiv.appendChild(metaGrid)
        }

        // Add content to option div
        optionDiv.appendChild(contentDiv)

        // Click handler to toggle expansion
        optHeader.addEventListener('click', function() {
          const isExpanded = contentDiv.style.display === 'block'
          contentDiv.style.display = isExpanded ? 'none' : 'block'
          arrow.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)'
        })

        optionsList.appendChild(optionDiv)
      })

      wrapper.appendChild(optionsList)
    }
  }

  // ── legend tile renderer ──────────────────────────────────────────────
  function renderLegendTile(parentEl, legendData) {
    const { legendItems, inputCarriersCount } = legendData

    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'margin-bottom:0; background:#fff; border:1px solid #ddd; border-radius:10px; padding:10px 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);'
    parentEl.appendChild(wrapper)

    const title = document.createElement('div')
    title.style.cssText = 'font-size: 11px; font-weight: 600; color: #333; margin-bottom: 10px;'
    title.textContent = 'Legend'
    wrapper.appendChild(title)

    const legendGrid = document.createElement('div')
    legendGrid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px;'
    wrapper.appendChild(legendGrid)

    legendItems.forEach(item => {
      const itemDiv = document.createElement('div')
      itemDiv.style.cssText = 'display: flex; align-items: center; gap: 8px;'

      const symbolSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      symbolSvg.setAttribute('width', '20')
      symbolSvg.setAttribute('height', '12')
      symbolSvg.style.flexShrink = '0'

      if (item.type === 'total') {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
        line.setAttribute('x1', '0')
        line.setAttribute('x2', '14')
        line.setAttribute('y1', '5')
        line.setAttribute('y2', '5')
        line.setAttribute('stroke', '#000')
        line.setAttribute('stroke-width', '2')
        symbolSvg.appendChild(line)

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        circle.setAttribute('cx', '7')
        circle.setAttribute('cy', '5')
        circle.setAttribute('r', '2.5')
        circle.setAttribute('fill', '#000')
        symbolSvg.appendChild(circle)
      } else if (item.type === 'input') {
        if (inputCarriersCount > 1) {
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
          rect.setAttribute('x', '0')
          rect.setAttribute('y', '2')
          rect.setAttribute('width', '14')
          rect.setAttribute('height', '6')
          rect.setAttribute('fill', item.color)
          rect.style.opacity = '0.8'
          rect.setAttribute('stroke', item.color)
          rect.setAttribute('stroke-width', '0.5')
          symbolSvg.appendChild(rect)
        } else {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
          line.setAttribute('x1', '0')
          line.setAttribute('x2', '14')
          line.setAttribute('y1', '5')
          line.setAttribute('y2', '5')
          line.setAttribute('stroke', item.color)
          line.setAttribute('stroke-width', '1.5')
          symbolSvg.appendChild(line)

          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
          circle.setAttribute('cx', '7')
          circle.setAttribute('cy', '5')
          circle.setAttribute('r', '2')
          circle.setAttribute('fill', item.color)
          symbolSvg.appendChild(circle)
        }
      } else if (item.type === 'output') {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
        line.setAttribute('x1', '0')
        line.setAttribute('x2', '14')
        line.setAttribute('y1', '5')
        line.setAttribute('y2', '5')
        line.setAttribute('stroke', item.color)
        line.setAttribute('stroke-width', '1')
        line.setAttribute('stroke-dasharray', '2,1')
        symbolSvg.appendChild(line)

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        circle.setAttribute('cx', '7')
        circle.setAttribute('cy', '5')
        circle.setAttribute('r', '1.5')
        circle.setAttribute('fill', item.color)
        symbolSvg.appendChild(circle)
      }

      itemDiv.appendChild(symbolSvg)

      const label = document.createElement('span')
      label.style.cssText = 'font-size: 9px; color: #333;'
      const displayName = item.type === 'output'
        ? (item.name.length > 12 ? item.name.slice(0, 10) + '…' : item.name) + ' (out)'
        : item.name.length > 18 ? item.name.slice(0, 16) + '…' : item.name
      label.textContent = displayName
      if (item.type === 'total') {
        label.style.fontWeight = '600'
      }
      itemDiv.appendChild(label)

      legendGrid.appendChild(itemDiv)
    })
  }

  // ── multi-carrier chart renderer (stacked area for inputs, line for single carrier) ───
  function renderMultiCarrierChart(parentEl, opts) {
    const { title, yLabel, scenario, carriers, demandData, energyByCarrier, energyData } = opts

    // Separate carriers into inputs (positive) and outputs (negative)
    // Filter out carriers where all values are < 0.01 in absolute value
    const inputCarriers = []
    const outputCarriers = []

    carriers.forEach(carrier => {
      let totalValue = 0
      let maxAbsValue = 0
      YEARS.forEach(y => {
        const demand = demandData[scenario] ? demandData[scenario][y] : 0
        if (demand > 0) {
          const energy = energyByCarrier[scenario][carrier] ? energyByCarrier[scenario][carrier][y] : 0
          const intensity = convertUnit(energy / demand)
          totalValue += energy
          maxAbsValue = Math.max(maxAbsValue, Math.abs(intensity))
        }
      })
      // Only include carriers with at least one value >= 0.01
      if (maxAbsValue >= 0.01) {
        if (totalValue > 0) {
          inputCarriers.push(carrier)
        } else if (totalValue < 0) {
          outputCarriers.push(carrier)
        }
      }
    })

    // Dimensions - fixed height to match line chart
    const W = 320
    const H = 250
    const leftMargin = 45
    const rightMargin = 15

    // No legend in chart anymore - it will be in a separate tile
    const margin = { top: 30, right: rightMargin, bottom: 20, left: leftMargin }
    const chartH = 160
    const innerW = W - margin.left - margin.right
    const innerH = chartH

    // Fallback colors if carrier not in mapping
    const fallbackColors = [
      '#333333', '#555555', '#777777', '#999999', '#AAAAAA',
      '#BBBBBB', '#CCCCCC', '#444444', '#666666', '#888888'
    ]

    const colorMap = {}

    // Assign colors from carrier color mapping (solid colors only)
    inputCarriers.forEach((c, i) => {
      colorMap[c] = carrierColorMapping[c] || fallbackColors[i % fallbackColors.length]
    })
    outputCarriers.forEach((c, i) => {
      colorMap[c] = carrierColorMapping[c] || fallbackColors[i % fallbackColors.length]
    })
    colorMap['Totaal'] = '#000000' // Black for total

    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'margin-bottom:0; background:#fff; border:1px solid #e0e0e0; border-radius:12px; padding:16px 18px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);'
    parentEl.appendChild(wrapper)

    const svg = d3.select(wrapper).append('svg')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('width', '100%')
      .style('height', 'auto')

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    svg.append('text')
      .attr('x', margin.left)
      .attr('y', 17)
      .style('font-size', '11px')
      .style('font-weight', '600')
      .style('fill', '#222')
      .text(title)

    const x = d3.scalePoint()
      .domain(YEARS)
      .range([0, innerW])

    // Calculate max value considering stacked inputs and separate outputs
    let maxInputIntensity = 0
    let maxOutputIntensity = 0

    YEARS.forEach(y => {
      const demand = demandData[scenario][y]
      if (demand === 0) return

      // Sum all input intensities (for stacked area)
      let totalInputIntensity = 0
      inputCarriers.forEach(carrier => {
        const energy = energyByCarrier[scenario][carrier] ? energyByCarrier[scenario][carrier][y] : 0
        if (energy > 0) {
          totalInputIntensity += convertUnit(energy / demand)
        }
      })
      if (totalInputIntensity > maxInputIntensity) maxInputIntensity = totalInputIntensity

      // Check each output carrier separately (shown as lines)
      outputCarriers.forEach(carrier => {
        const energy = energyByCarrier[scenario][carrier] ? energyByCarrier[scenario][carrier][y] : 0
        if (energy < 0) {
          const intensity = Math.abs(convertUnit(energy / demand))
          if (intensity > maxOutputIntensity) maxOutputIntensity = intensity
        }
      })

      // Check total
      const totalEnergy = energyData[scenario][y]
      const totalIntensity = convertUnit(totalEnergy / demand)
      if (totalIntensity > maxInputIntensity) maxInputIntensity = totalIntensity
    })

    const maxVal = Math.max(maxInputIntensity, maxOutputIntensity)
    if (maxVal === 0) maxVal = 1

    const y = d3.scaleLinear()
      .domain([0, maxVal * 1.1])
      .range([innerH, 0])

    // X-axis
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickFormat(d3.format('d')).tickSize(0).tickPadding(8))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick text')
        .style('font-size', '9px')
        .style('fill', '#555')
        .style('font-weight', '400'))

    // Y-axis with gridlines
    g.append('g')
      .call(d3.axisLeft(y).ticks(5).tickSize(-innerW).tickPadding(8))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line')
        .style('stroke', '#e5e5e5')
        .style('stroke-width', '1px'))
      .call(g => g.selectAll('.tick text')
        .style('font-size', '9px')
        .style('fill', '#555')
        .style('font-weight', '400'))

    // Y-axis label
    g.append('text')
      .attr('transform', `translate(-35,${innerH / 2}) rotate(-90)`)
      .style('text-anchor', 'middle')
      .style('font-size', '9px')
      .style('fill', '#666')
      .style('font-weight', '500')
      .text(yLabel)

    const lineGen = d3.line()
      .x(d => x(d.year))
      .y(d => y(d.value))

    const tooltip = svg.append('g').style('display', 'none')
    tooltip.append('rect')
      .attr('rx', 4).attr('ry', 4)
      .attr('fill', '#fff')
      .attr('stroke', '#ccc')
      .attr('filter', 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))')
    tooltip.append('text')
      .attr('fill', '#333')
      .style('font-size', '9px')
      .attr('text-anchor', 'middle')

    // If multiple input carriers: draw as stacked area chart
    if (inputCarriers.length > 1) {
      // Prepare data for stack layout
      const stackData = YEARS.map(yr => {
        const demand = demandData[scenario][yr]
        const row = { year: yr }
        inputCarriers.forEach(carrier => {
          const energy = energyByCarrier[scenario][carrier] ? energyByCarrier[scenario][carrier][yr] : 0
          row[carrier] = demand === 0 ? 0 : Math.max(0, convertUnit(energy / demand))
        })
        return row
      })

      const stack = d3.stack()
        .keys(inputCarriers)
        .order(d3.stackOrderNone)
        .offset(d3.stackOffsetNone)

      const series = stack(stackData)

      const areaGen = d3.area()
        .x(d => x(d.data.year))
        .y0(d => y(d[0]))
        .y1(d => y(d[1]))

      // Draw stacked areas with solid colors
      series.forEach((s) => {
        const carrier = s.key
        const color = colorMap[carrier]

        g.append('path')
          .datum(s)
          .attr('d', areaGen)
          .attr('fill', color)
          .style('opacity', 0.8)
          .style('cursor', 'pointer')
          .on('mouseover', function (event) {
            d3.select(this).style('opacity', 1)

            // Show tooltip with carrier name
            tooltip.raise().style('display', 'block')
            const textEl = tooltip.select('text')
            textEl.selectAll('tspan').remove()
            textEl.append('tspan').attr('x', 0).attr('dy', '1.1em').style('font-weight', 'bold').text(carrier)

            const bbox = textEl.node().getBBox()
            const pad = 5
            tooltip.select('rect')
              .attr('x', -bbox.width / 2 - pad)
              .attr('y', 0)
              .attr('width', bbox.width + pad * 2)
              .attr('height', bbox.height + pad * 2)
            textEl.attr('transform', `translate(0, ${pad - bbox.y})`)

            // Position tooltip near mouse
            const [mx, my] = d3.pointer(event, svg.node())
            tooltip.attr('transform', `translate(${mx},${Math.max(5, my - bbox.height - pad * 2 - 8)})`)
          })
          .on('mouseout', function () {
            d3.select(this).style('opacity', 0.8)
            tooltip.style('display', 'none')
          })

        // Add border line to area
        const lineData = s.map(d => ({ year: d.data.year, value: d[1] }))
        g.append('path')
          .datum(lineData)
          .attr('fill', 'none')
          .attr('stroke', color)
          .attr('stroke-width', 1)
          .attr('d', lineGen)
          .style('opacity', 0.8)
      })

      // Add interactive circles on top of stacked areas
      YEARS.forEach(yr => {
        const demand = demandData[scenario][yr]
        if (demand === 0) return

        let cumulativeValue = 0
        inputCarriers.forEach(carrier => {
          const energy = energyByCarrier[scenario][carrier] ? energyByCarrier[scenario][carrier][yr] : 0
          const intensity = energy > 0 ? convertUnit(energy / demand) : 0
          cumulativeValue += intensity

          if (intensity > 0) {
            g.append('circle')
              .attr('cx', x(yr))
              .attr('cy', y(cumulativeValue))
              .attr('r', 2.5)
              .attr('fill', colorMap[carrier])
              .style('cursor', 'pointer')
              .on('mouseover', function () {
                tooltip.raise().style('display', 'block')
                const textEl = tooltip.select('text')
                textEl.selectAll('tspan').remove()
                textEl.append('tspan').attr('x', 0).attr('dy', '1.1em').style('font-weight', 'bold').text(carrier)
                textEl.append('tspan').attr('x', 0).attr('dy', '1.3em').text(`${yr}: ${d3.format('.2f')(intensity)} ${tvknUnit}`)
                const bbox = textEl.node().getBBox()
                const pad = 5
                tooltip.select('rect')
                  .attr('x', -bbox.width / 2 - pad)
                  .attr('y', 0)
                  .attr('width', bbox.width + pad * 2)
                  .attr('height', bbox.height + pad * 2)
                textEl.attr('transform', `translate(0, ${pad - bbox.y})`)
                const tx = margin.left + x(yr)
                const ty = margin.top + y(cumulativeValue) - bbox.height - pad * 2 - 8
                tooltip.attr('transform', `translate(${tx},${Math.max(5, ty)})`)
              })
              .on('mouseout', () => tooltip.style('display', 'none'))
          }
        })
      })
    } else if (inputCarriers.length === 1) {
      // Single input carrier: draw as area chart
      const carrier = inputCarriers[0]
      const color = colorMap[carrier]
      const pts = YEARS.map(yr => {
        const demand = demandData[scenario][yr]
        const energy = energyByCarrier[scenario][carrier] ? energyByCarrier[scenario][carrier][yr] : 0
        if (demand === 0) return { year: yr, value: 0 }
        return { year: yr, value: Math.max(0, convertUnit(energy / demand)) }
      })

      // Create area generator
      const areaGen = d3.area()
        .x(d => x(d.year))
        .y0(innerH)
        .y1(d => y(d.value))
        .curve(d3.curveMonotoneX)

      // Draw filled area
      g.append('path')
        .datum(pts)
        .attr('fill', color)
        .attr('stroke', 'none')
        .style('opacity', 0.8)
        .attr('d', areaGen)

      // Draw line on top
      g.append('path')
        .datum(pts)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 1.5)
        .attr('d', lineGen)

      // Draw interactive circles
      pts.forEach(d => {
        g.append('circle')
          .attr('cx', x(d.year))
          .attr('cy', y(d.value))
          .attr('r', 3)
          .attr('fill', color)
          .style('cursor', 'pointer')
          .on('mouseover', function () {
            tooltip.raise().style('display', 'block')
            const textEl = tooltip.select('text')
            textEl.selectAll('tspan').remove()
            textEl.append('tspan').attr('x', 0).attr('dy', '1.1em').style('font-weight', 'bold').text(carrier)
            textEl.append('tspan').attr('x', 0).attr('dy', '1.3em').text(`${d.year}: ${d3.format('.2f')(d.value)} ${tvknUnit}`)
            const bbox = textEl.node().getBBox()
            const pad = 5
            tooltip.select('rect')
              .attr('x', -bbox.width / 2 - pad)
              .attr('y', 0)
              .attr('width', bbox.width + pad * 2)
              .attr('height', bbox.height + pad * 2)
            textEl.attr('transform', `translate(0, ${pad - bbox.y})`)
            const tx = margin.left + x(d.year)
            const ty = margin.top + y(d.value) - bbox.height - pad * 2 - 8
            tooltip.attr('transform', `translate(${tx},${Math.max(5, ty)})`)
          })
          .on('mouseout', () => tooltip.style('display', 'none'))
      })
    }

    // Draw output carriers as lines (thinner, dashed)
    outputCarriers.forEach((carrier) => {
      const color = colorMap[carrier]
      const pts = YEARS.map(yr => {
        const demand = demandData[scenario][yr]
        const energy = energyByCarrier[scenario][carrier] ? energyByCarrier[scenario][carrier][yr] : 0
        if (demand === 0) return { year: yr, value: 0 }
        return { year: yr, value: Math.abs(convertUnit(energy / demand)) }
      })

      g.append('path')
        .datum(pts)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3,2')
        .attr('d', lineGen)
        .style('opacity', 0.8)

      pts.forEach(d => {
        g.append('circle')
          .attr('cx', x(d.year))
          .attr('cy', y(d.value))
          .attr('r', 2)
          .attr('fill', color)
          .style('cursor', 'pointer')
          .on('mouseover', function () {
            tooltip.raise().style('display', 'block')
            const textEl = tooltip.select('text')
            textEl.selectAll('tspan').remove()
            textEl.append('tspan').attr('x', 0).attr('dy', '1.1em').style('font-weight', 'bold').text(carrier + ' (output)')
            textEl.append('tspan').attr('x', 0).attr('dy', '1.3em').text(`${d.year}: ${d3.format('.2f')(d.value)} ${tvknUnit}`)
            const bbox = textEl.node().getBBox()
            const pad = 5
            tooltip.select('rect')
              .attr('x', -bbox.width / 2 - pad)
              .attr('y', 0)
              .attr('width', bbox.width + pad * 2)
              .attr('height', bbox.height + pad * 2)
            textEl.attr('transform', `translate(0, ${pad - bbox.y})`)
            const tx = margin.left + x(d.year)
            const ty = margin.top + y(d.value) - bbox.height - pad * 2 - 8
            tooltip.attr('transform', `translate(${tx},${Math.max(5, ty)})`)
          })
          .on('mouseout', () => tooltip.style('display', 'none'))
      })
    })

    // Draw total line (thicker, black)
    const totalPts = YEARS.map(yr => {
      const demand = demandData[scenario][yr]
      const energy = energyData[scenario][yr]
      if (demand === 0) return { year: yr, value: 0 }
      return { year: yr, value: convertUnit(energy / demand) }
    })

    g.append('path')
      .datum(totalPts)
      .attr('fill', 'none')
      .attr('stroke', '#000')
      .attr('stroke-width', 2.5)
      .attr('d', lineGen)

    // Add larger circles for total data points
    totalPts.forEach(d => {
      g.append('circle')
        .attr('cx', x(d.year))
        .attr('cy', y(d.value))
        .attr('r', 3.5)
        .attr('fill', '#000')
        .style('cursor', 'pointer')
        .on('mouseover', function () {
          tooltip.raise().style('display', 'block')
          const textEl = tooltip.select('text')
          textEl.selectAll('tspan').remove()
          textEl.append('tspan').attr('x', 0).attr('dy', '1.1em').style('font-weight', 'bold').text('Totaal')
          textEl.append('tspan').attr('x', 0).attr('dy', '1.3em').text(`${d.year}: ${d3.format('.2f')(d.value)} ${tvknUnit}`)
          const bbox = textEl.node().getBBox()
          const pad = 5
          tooltip.select('rect')
            .attr('x', -bbox.width / 2 - pad)
            .attr('y', 0)
            .attr('width', bbox.width + pad * 2)
            .attr('height', bbox.height + pad * 2)
          textEl.attr('transform', `translate(0, ${pad - bbox.y})`)
          const tx = margin.left + x(d.year)
          const ty = margin.top + y(d.value) - bbox.height - pad * 2 - 8
          tooltip.attr('transform', `translate(${tx},${Math.max(5, ty)})`)
        })
        .on('mouseout', () => tooltip.style('display', 'none'))
    })

    // Return legend data for rendering in separate tile
    const allLegendItems = [{ name: 'Totaal', type: 'total', color: '#000000' }]
    inputCarriers.forEach(c => allLegendItems.push({ name: c, type: 'input', color: colorMap[c] }))
    outputCarriers.forEach(c => allLegendItems.push({ name: c, type: 'output', color: colorMap[c] }))

    return {
      legendItems: allLegendItems,
      inputCarriersCount: inputCarriers.length,
      colorMap: colorMap
    }
  }
})()
