// Export functionality for sankey diagrams and linegraphs

/**
 * Export sankey diagram data to XLSX
 * @param {Object} options - Export options
 * @param {string} options.scenario - Current scenario ID
 * @param {string} options.year - Current year
 * @param {string} options.scope - Current scope (system, electricity, etc.)
 * @param {Array} options.links - Sankey links data
 * @param {Array} options.nodes - Sankey nodes data
 * @param {Object} options.settings - Sankey settings
 */
function exportSankeyToXLSX(options) {
  const { scenario, year, scope, links, nodes, settings } = options

  // Create workbook
  const wb = XLSX.utils.book_new()

  // Prepare links data for export, filtering out entries with value = 0
  const linksData = links
    .filter(link => link.value !== 0 && link.value !== '0')
    .map(link => ({
      'Source': link.source?.title || link.source,
      'Target': link.target?.title || link.target,
      'Value': link.value,
      'Legend': link.legend || '',
      'Scenario': scenario,
      'Year': year,
      'Scope': scope
    }))

  // Prepare nodes data for export
  const nodesData = nodes.map(node => ({
    'ID': node.id,
    'Title': node.title,
    'Column': node.column,
    'Row': node.row,
    'Cluster': node.cluster,
    'Scenario': scenario,
    'Year': year,
    'Scope': scope
  }))

  // Create worksheets
  const wsLinks = XLSX.utils.json_to_sheet(linksData)
  const wsNodes = XLSX.utils.json_to_sheet(nodesData)

  // Add worksheets to workbook
  XLSX.utils.book_append_sheet(wb, wsLinks, 'Links')
  XLSX.utils.book_append_sheet(wb, wsNodes, 'Nodes')

  // Generate filename
  const filename = `sankey_${scenario}_${year}_${scope}_${new Date().toISOString().slice(0, 10)}.xlsx`

  // Save file
  XLSX.writeFile(wb, filename)

  console.log(`Exported sankey data to ${filename}`)
}

/**
 * Export sankey diagram data to Flux format XLSX
 * Flux format has 4 tabs: links, nodes, carriers, settings
 * @param {Object} options - Export options
 * @param {string} options.scenario - Current scenario ID
 * @param {string} options.year - Current year
 * @param {string} options.scope - Current scope (system, electricity, etc.)
 * @param {Array} options.links - Sankey links data
 * @param {Array} options.nodes - Sankey nodes data
 * @param {Array} options.legend - Legend array with carrier colors
 * @param {string} options.unit - Current unit (PJ or TWh)
 * @param {Object} options.settings - Sankey settings
 */
function exportSankeyToFlux(options) {
  const { scenario, year, scope, links, nodes, legend, unit, settings } = options

  console.log('Flux export - legend:', legend)
  console.log('Flux export - settings:', settings)

  // Create workbook
  const wb = XLSX.utils.book_new()

  // Helper function to get color for a carrier
  const getCarrierColor = (carrierId) => {
    if (legend && Array.isArray(legend)) {
      const legendEntry = legend.find(entry => entry.id === carrierId)
      if (legendEntry) {
        console.log(`Found color for ${carrierId}: ${legendEntry.color}`)
        return legendEntry.color
      }
    }
    console.log(`No color found for ${carrierId}, using default`)
    return '#999999' // Default gray color
  }

  // 1. LINKS TAB
  // Format: source.id, target.id, value, carrier, type, visibility, direction
  const linksData = links
    .filter(link => link.value !== 0 && link.value !== '0')
    .map(link => ({
      'source.id': typeof link.source === 'object' ? link.source.id : link.source,
      'target.id': typeof link.target === 'object' ? link.target.id : link.target,
      'value': link.value,
      'carrier': link.legend || '',
      'type': link.type || 0,
      'visibility': link.visibility !== undefined ? link.visibility : 1,
      'direction': link.direction || 'r'
    }))

  // 2. NODES TAB
  // Format: id, title, x, y, direction, labelposition
  const nodesData = nodes.map(node => ({
    'id': node.id,
    'title': node.title || node.id,
    'x': node.x || 0,
    'y': node.y || 0,
    'direction': node.direction || 'right',
    'labelposition': node.labelposition || 'right'
  }))

  // 3. CARRIERS TAB
  // Format: id, color
  // Extract unique carriers from links and get their colors from legend
  const carrierMap = new Map()
  links.forEach(link => {
    const carrier = link.legend || ''
    if (carrier && !carrierMap.has(carrier)) {
      const color = getCarrierColor(carrier)
      carrierMap.set(carrier, color)
    }
  })
  const carriersData = Array.from(carrierMap.entries()).map(([id, color]) => ({
    'id': id,
    'color': color
  }))

  // 4. SETTINGS TAB
  // Format: setting, waarde
  // Use fluxfileSetting_* settings from the original Excel file, with fallbacks

  // Use fluxfile-specific settings from Excel if available
  const scaleHeight = settings?.fluxfileSetting_scaleHeight ?? 0.3
  const scaleCanvas = settings?.fluxfileSetting_scaleCanvas ?? 0.8
  const backgroundColor = settings?.fluxfileSetting_backgroundColor ?? '#efeffa'
  const canvasWidth = settings?.fluxfileSetting_canvasWidth ?? settings?.diagramWidth ?? 1250
  const canvasHeight = settings?.fluxfileSetting_canvasHeight ?? settings?.diagramHeight ?? 1900

  console.log('Flux export settings values:')
  console.log('  scaleHeight:', scaleHeight, '(from fluxfileSetting_scaleHeight:', settings?.fluxfileSetting_scaleHeight, ')')
  console.log('  scaleCanvas:', scaleCanvas, '(from fluxfileSetting_scaleCanvas:', settings?.fluxfileSetting_scaleCanvas, ')')
  console.log('  backgroundColor:', backgroundColor, '(from fluxfileSetting_backgroundColor:', settings?.fluxfileSetting_backgroundColor, ')')
  console.log('  canvasWidth:', canvasWidth, '(from fluxfileSetting_canvasWidth:', settings?.fluxfileSetting_canvasWidth, ')')
  console.log('  canvasHeight:', canvasHeight, '(from fluxfileSetting_canvasHeight:', settings?.fluxfileSetting_canvasHeight, ')')

  const settingsData = [
    { 'setting': 'scaleDataValue', 'waarde': settings?.scaleDataValue ?? '' },
    { 'setting': 'scaleHeight', 'waarde': scaleHeight },
    { 'setting': 'scaleCanvas', 'waarde': scaleCanvas },
    { 'setting': 'canvasWidth', 'waarde': canvasWidth },
    { 'setting': 'canvasHeight', 'waarde': canvasHeight },
    { 'setting': 'title', 'waarde': `${scenario} | ${year}` },
    { 'setting': 'titleFontSize', 'waarde': 20 },
    { 'setting': 'titlePositionX', 'waarde': settings?.titlePositionX ?? 40 },
    { 'setting': 'titlePositionY', 'waarde': settings?.titlePositionY ?? 45 },
    { 'setting': 'titleColor', 'waarde': '#000000' },
    { 'setting': 'backgroundColor', 'waarde': backgroundColor },
    { 'setting': 'globalFlowOpacity', 'waarde': 0.9 },
    { 'setting': 'nodeWidth', 'waarde': 4 },
    { 'setting': 'nodeColor', 'waarde': '#000000' },
    { 'setting': 'labelFillColor', 'waarde': '#ffffff' },
    { 'setting': 'labelTextColor', 'waarde': '#000000' },
    { 'setting': 'showValueLabels', 'waarde': 'Yes' },
    { 'setting': 'showLabelBackground', 'waarde': 'No' },
    { 'setting': 'unit', 'waarde': unit || 'PJ' },
    { 'setting': 'decimalsRoundValues', 'waarde': 1 }
  ]

  // Create worksheets
  const wsLinks = XLSX.utils.json_to_sheet(linksData)
  const wsNodes = XLSX.utils.json_to_sheet(nodesData)
  const wsCarriers = XLSX.utils.json_to_sheet(carriersData)
  const wsSettings = XLSX.utils.json_to_sheet(settingsData)

  // Add worksheets to workbook
  XLSX.utils.book_append_sheet(wb, wsLinks, 'links')
  XLSX.utils.book_append_sheet(wb, wsNodes, 'nodes')
  XLSX.utils.book_append_sheet(wb, wsCarriers, 'carriers')
  XLSX.utils.book_append_sheet(wb, wsSettings, 'settings')

  // Generate filename
  const filename = `flux_${scenario}_${year}_${scope}_${new Date().toISOString().slice(0, 10)}.xlsx`

  // Save file
  XLSX.writeFile(wb, filename)

  console.log(`Exported sankey data to flux format: ${filename}`)
}

/**
 * Copy sankey diagram data to clipboard as TSV
 * @param {Object} options - Export options
 * @param {string} options.scenario - Current scenario ID
 * @param {string} options.year - Current year
 * @param {string} options.scope - Current scope (system, electricity, etc.)
 * @param {Array} options.links - Sankey links data
 * @param {Array} options.nodes - Sankey nodes data
 */
function copySankeyToClipboard(options) {
  const { scenario, year, scope, links, nodes } = options

  // Build TSV data
  let tsvData = `Sankey Diagram Data\n`
  tsvData += `Scenario\t${scenario}\n`
  tsvData += `Year\t${year}\n`
  tsvData += `Scope\t${scope}\n`
  tsvData += `Export Date\t${new Date().toISOString().slice(0, 10)}\n`
  tsvData += `\n`
  tsvData += `LINKS\n`
  tsvData += `Source\tTarget\tValue\tLegend\n`

  // Add links data
  links
    .filter(link => link.value !== 0 && link.value !== '0')
    .forEach(link => {
      tsvData += `${link.source?.title || link.source}\t${link.target?.title || link.target}\t${link.value}\t${link.legend || ''}\n`
    })

  // Add nodes data
  tsvData += `\n`
  tsvData += `NODES\n`
  tsvData += `ID\tTitle\tColumn\tRow\tCluster\n`

  nodes.forEach(node => {
    tsvData += `${node.id}\t${node.title}\t${node.column}\t${node.row}\t${node.cluster}\n`
  })

  // Copy to clipboard
  navigator.clipboard.writeText(tsvData).then(() => {
    console.log('Sankey data copied to clipboard')
  }).catch(err => {
    console.error('Failed to copy:', err)
  })
}

/**
 * Export linegraph data to XLSX
 * @param {Object} options - Export options
 * @param {string} options.nodeTitle - Node title
 * @param {string} options.sourceNode - Source node title
 * @param {string} options.targetNode - Target node title
 * @param {string} options.flowType - Flow type (e.g., 'methane', 'electricity')
 * @param {string} options.scenario - Current scenario ID
 * @param {Array} options.data - Linegraph data with scenario, year, and value
 * @param {string} options.unit - Unit of measurement
 */
function exportLinegraphToXLSX(options) {
  const { nodeTitle, sourceNode, targetNode, flowType, scenario, data, unit } = options

  // Create workbook
  const wb = XLSX.utils.book_new()

  // Group data by scenario and year
  const dataByScenario = {}
  const allYears = new Set()

  data.forEach(point => {
    const scenarioId = point.scenario
    const year = point.year
    const value = point.value

    if (!dataByScenario[scenarioId]) {
      dataByScenario[scenarioId] = {}
    }
    dataByScenario[scenarioId][year] = value
    allYears.add(year)
  })

  // Sort years
  const sortedYears = Array.from(allYears).sort()

  // Get scenario titles from viewerConfig if available
  const getScenarioTitle = (scenarioId) => {
    if (typeof viewerConfig !== 'undefined' && viewerConfig.scenarios) {
      const scenarioConfig = viewerConfig.scenarios.find(s => s.id === scenarioId)
      return scenarioConfig ? scenarioConfig.title : scenarioId
    }
    return scenarioId
  }

  // Create header information
  const headerData = [
    ['Flow data'],
    ['Source', sourceNode || ''],
    ['Target', targetNode || ''],
    ['Type', flowType || ''],
    ['Unit', unit],
    ['Export Date', new Date().toISOString().slice(0, 10)],
    [], // Empty row for spacing
  ]

  // Prepare data in wide format: Scenario column first, then years
  const exportData = Object.keys(dataByScenario).map(scenarioId => {
    const row = {
      'Scenario': getScenarioTitle(scenarioId)
    }
    sortedYears.forEach(year => {
      row[year] = dataByScenario[scenarioId][year] || ''
    })
    return row
  })

  // Create worksheet starting with header
  const ws = XLSX.utils.aoa_to_sheet(headerData)

  // Append the data table below the header with explicit column order
  const columnOrder = ['Scenario', ...sortedYears]
  XLSX.utils.sheet_add_json(ws, exportData, {
    origin: -1,
    skipHeader: false,
    header: columnOrder
  })

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Data')

  // Generate filename
  const safeTitle = nodeTitle.replace(/[^a-z0-9]/gi, '_')
  const filename = `linegraph_${safeTitle}_${unit}_${new Date().toISOString().slice(0, 10)}.xlsx`

  // Save file
  XLSX.writeFile(wb, filename)

  console.log(`Exported linegraph data to ${filename}`)
}

/**
 * Copy linegraph data to clipboard as TSV
 * @param {Object} options - Export options
 * @param {string} options.nodeTitle - Node title
 * @param {string} options.sourceNode - Source node title
 * @param {string} options.targetNode - Target node title
 * @param {string} options.flowType - Flow type
 * @param {string} options.scenario - Current scenario ID
 * @param {Array} options.data - Linegraph data with scenario, year, and value
 * @param {string} options.unit - Unit of measurement
 */
function copyLinegraphToClipboard(options) {
  const { nodeTitle, sourceNode, targetNode, flowType, scenario, data, unit } = options

  // Group data by scenario and year
  const dataByScenario = {}
  const allYears = new Set()

  data.forEach(point => {
    const scenarioId = point.scenario
    const year = point.year
    const value = point.value

    if (!dataByScenario[scenarioId]) {
      dataByScenario[scenarioId] = {}
    }
    dataByScenario[scenarioId][year] = value
    allYears.add(year)
  })

  // Sort years
  const sortedYears = Array.from(allYears).sort()

  // Get scenario titles
  const getScenarioTitle = (scenarioId) => {
    if (typeof viewerConfig !== 'undefined' && viewerConfig.scenarios) {
      const scenarioConfig = viewerConfig.scenarios.find(s => s.id === scenarioId)
      return scenarioConfig ? scenarioConfig.title : scenarioId
    }
    return scenarioId
  }

  // Build TSV data
  let tsvData = `Flow data\n`
  tsvData += `Source\t${sourceNode || ''}\n`
  tsvData += `Target\t${targetNode || ''}\n`
  tsvData += `Type\t${flowType || ''}\n`
  tsvData += `Unit\t${unit}\n`
  tsvData += `Export Date\t${new Date().toISOString().slice(0, 10)}\n`
  tsvData += `\n`

  // Header row
  tsvData += `Scenario\t${sortedYears.join('\t')}\n`

  // Data rows
  Object.keys(dataByScenario).forEach(scenarioId => {
    tsvData += `${getScenarioTitle(scenarioId)}`
    sortedYears.forEach(year => {
      tsvData += `\t${dataByScenario[scenarioId][year] || ''}`
    })
    tsvData += `\n`
  })

  // Copy to clipboard
  navigator.clipboard.writeText(tsvData).then(() => {
    console.log('Linegraph data copied to clipboard')
  }).catch(err => {
    console.error('Failed to copy:', err)
  })
}

/**
 * Create export button and add to container
 * @param {string} containerId - ID of container element
 * @param {Function} exportFunction - Function to call when button is clicked
 * @param {string} label - Button label text
 */
function createExportButton(containerId, exportFunction, label = 'Export (XLSX)') {
  const container = document.getElementById(containerId)
  if (!container) {
    console.warn(`Container ${containerId} not found`)
    return
  }

  // Check if button already exists
  if (container.querySelector('.export-button')) {
    return
  }

  const button = document.createElement('button')
  button.className = 'export-button'
  button.textContent = label
  button.style.marginLeft = '10px'
  button.style.padding = '5px 10px'
  button.style.cursor = 'pointer'
  button.style.backgroundColor = '#4CAF50'
  button.style.color = 'white'
  button.style.border = 'none'
  button.style.borderRadius = '4px'
  button.style.fontSize = '12px'

  button.onclick = exportFunction

  container.appendChild(button)
}

/**
 * Initialize sankey export button
 * This should be called after the sankey data is loaded
 * Button is positioned to the left of the PJ/TWh unit toggle
 */
function initializeSankeyExportButton() {
  // Wait for the unit selector to be created
  const checkUnitSelector = setInterval(() => {
    const unitSelector = document.getElementById('unitSelector')

    if (unitSelector) {
      clearInterval(checkUnitSelector)

      // Check if button already exists
      if (document.getElementById('sankeyExportButton')) {
        return
      }

      // Hide the export menu container since button is now in the sankey view
      const exportContainer = document.getElementById('exportButtonsContainer')
      if (exportContainer) {
        exportContainer.style.display = 'none'
      }

      // Create a container div for the buttons positioned to the left of the unit toggle
      const exportButtonContainer = document.createElement('div')
      exportButtonContainer.id = 'sankeyExportButtonContainer'
      exportButtonContainer.style.position = 'absolute'
      exportButtonContainer.style.top = '2px'
      exportButtonContainer.style.right = '200px'
      exportButtonContainer.style.zIndex = '10'
      exportButtonContainer.style.display = 'flex'
      exportButtonContainer.style.gap = '6px'

      // Helper function to get current sankey data
      const getSankeyDataForExport = () => {
        const scenario = globalActiveScenario?.id || 'unknown'
        const year = globalActiveYear?.id || 'unknown'
        const scope = globalActiveEnergyflowsSankey?.id || 'system'
        const sankeyData = sankeyDataObjects[scope] || sankeyDataObjects['system']

        if (!sankeyData || !sankeyData.links || !sankeyData.nodes) {
          console.error('No sankey data available for export. Available keys:', Object.keys(sankeyDataObjects))
          alert('No sankey data available for export')
          return null
        }

        // Get legend (carrier colors) and settings from global config
        let legend = []
        let configSettings = null

        console.log('getSankeyDataForExport - checking for config...')
        console.log('  window.sankeyExportConfig:', window.sankeyExportConfig)

        // Use the globally stored config
        if (window.sankeyExportConfig) {
          const config = window.sankeyExportConfig
          console.log('  Found config:', config ? 'yes' : 'no')

          if (config.legend) {
            legend = config.legend
            console.log('  Found legend with', legend.length, 'entries')
          }
          // Get all settings from config (loaded from Excel file settings tab)
          if (config.settings && config.settings[0]) {
            configSettings = config.settings[0]
            console.log('  Found settings:', Object.keys(configSettings).length, 'keys')
          }
        } else {
          console.log('  window.sankeyExportConfig not found!')
        }

        // Get current unit (PJ or TWh)
        const unit = (typeof currentUnit !== 'undefined' && currentUnit === 'TWh') ? 'TWh' : 'PJ'

        return {
          scenario: scenario,
          year: year,
          scope: scope,
          links: sankeyData.links || [],
          nodes: sankeyData.nodes || [],
          legend: legend,
          unit: unit,
          settings: configSettings
        }
      }

      // Create the export button
      const exportButton = document.createElement('button')
      exportButton.id = 'sankeyExportButton'
      exportButton.textContent = 'Export data (xlsx)'
      exportButton.style.width = '100px'
      exportButton.style.height = '26px'
      exportButton.style.padding = '0'
      exportButton.style.fontSize = '11px'
      exportButton.style.fontWeight = '400'
      exportButton.style.fontFamily = 'Arial, sans-serif'
      exportButton.style.backgroundColor = '#FFF'
      exportButton.style.color = '#444'
      exportButton.style.border = '1px solid #ccc'
      exportButton.style.borderRadius = '4px'
      exportButton.style.cursor = 'pointer'
      exportButton.style.transition = 'background-color 0.2s'
      exportButton.style.textAlign = 'center'
      exportButton.style.lineHeight = '26px'
      exportButton.style.textTransform = 'none'
      exportButton.style.letterSpacing = 'normal'

      exportButton.onmouseover = function() {
        this.style.backgroundColor = '#e8e8e8'
      }
      exportButton.onmouseout = function() {
        this.style.backgroundColor = '#FFF'
      }

      exportButton.onclick = function() {
        const data = getSankeyDataForExport()
        if (data) exportSankeyToXLSX(data)
      }

      // Create the copy button
      const copyButton = document.createElement('button')
      copyButton.id = 'sankeyCopyButton'
      copyButton.textContent = 'Copy data to clipboard'
      copyButton.style.width = '130px'
      copyButton.style.height = '26px'
      copyButton.style.padding = '0'
      copyButton.style.fontSize = '11px'
      copyButton.style.fontWeight = '400'
      copyButton.style.fontFamily = 'Arial, sans-serif'
      copyButton.style.backgroundColor = '#FFF'
      copyButton.style.color = '#444'
      copyButton.style.border = '1px solid #ccc'
      copyButton.style.borderRadius = '4px'
      copyButton.style.cursor = 'pointer'
      copyButton.style.transition = 'background-color 0.2s'
      copyButton.style.textAlign = 'center'
      copyButton.style.lineHeight = '26px'
      copyButton.style.textTransform = 'none'
      copyButton.style.letterSpacing = 'normal'

      copyButton.onmouseover = function() {
        this.style.backgroundColor = '#e8e8e8'
      }
      copyButton.onmouseout = function() {
        this.style.backgroundColor = '#FFF'
      }

      copyButton.onclick = function() {
        const data = getSankeyDataForExport()
        if (data) copySankeyToClipboard(data)
      }

      // Create the flux export button
      const fluxButton = document.createElement('button')
      fluxButton.id = 'sankeyFluxButton'
      fluxButton.textContent = 'Export fluxfile (xlsx)'
      fluxButton.style.width = '110px'
      fluxButton.style.height = '26px'
      fluxButton.style.padding = '0'
      fluxButton.style.fontSize = '11px'
      fluxButton.style.fontWeight = '400'
      fluxButton.style.fontFamily = 'Arial, sans-serif'
      fluxButton.style.backgroundColor = '#FFF'
      fluxButton.style.color = '#444'
      fluxButton.style.border = '1px solid #ccc'
      fluxButton.style.borderRadius = '4px'
      fluxButton.style.cursor = 'pointer'
      fluxButton.style.transition = 'background-color 0.2s'
      fluxButton.style.textAlign = 'center'
      fluxButton.style.lineHeight = '26px'
      fluxButton.style.textTransform = 'none'
      fluxButton.style.letterSpacing = 'normal'

      fluxButton.onmouseover = function() {
        this.style.backgroundColor = '#e8e8e8'
      }
      fluxButton.onmouseout = function() {
        this.style.backgroundColor = '#FFF'
      }

      fluxButton.onclick = function() {
        const data = getSankeyDataForExport()
        if (data) exportSankeyToFlux(data)
      }

      exportButtonContainer.appendChild(exportButton)
      exportButtonContainer.appendChild(copyButton)
      exportButtonContainer.appendChild(fluxButton)
      unitSelector.appendChild(exportButtonContainer)
    }
  }, 100)
}

// Make functions globally available
window.exportSankeyToXLSX = exportSankeyToXLSX
window.exportSankeyToFlux = exportSankeyToFlux
window.copySankeyToClipboard = copySankeyToClipboard
window.exportLinegraphToXLSX = exportLinegraphToXLSX
window.copyLinegraphToClipboard = copyLinegraphToClipboard
window.createExportButton = createExportButton
window.initializeSankeyExportButton = initializeSankeyExportButton

// Initialize export button when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(initializeSankeyExportButton, 1000)
    })
  } else {
    setTimeout(initializeSankeyExportButton, 1000)
  }
}
