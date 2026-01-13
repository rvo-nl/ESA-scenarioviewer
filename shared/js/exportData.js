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

      // Create a container div for the export button positioned to the left of the unit toggle
      const exportButtonContainer = document.createElement('div')
      exportButtonContainer.id = 'sankeyExportButtonContainer'
      exportButtonContainer.style.position = 'absolute'
      exportButtonContainer.style.top = '2px'
      exportButtonContainer.style.right = '200px'  // More spacing to the left of the PJ/TWh toggle
      exportButtonContainer.style.zIndex = '10'

      // Create the button element - styled to match linegraph popup export button
      const exportButton = document.createElement('button')
      exportButton.id = 'sankeyExportButton'
      exportButton.textContent = 'Export data (xlsx)'
      exportButton.style.width = '100px'
      exportButton.style.height = '26px'
      exportButton.style.padding = '0'
      exportButton.style.fontSize = '11px'
      exportButton.style.fontWeight = '400'
      exportButton.style.fontFamily = 'Arial, sans-serif'
      exportButton.style.backgroundColor = '#f5f5f5'
      exportButton.style.color = '#444'
      exportButton.style.border = '1px solid #ccc'
      exportButton.style.borderRadius = '4px'
      exportButton.style.cursor = 'pointer'
      exportButton.style.transition = 'background-color 0.2s'
      exportButton.style.textAlign = 'center'
      exportButton.style.lineHeight = '26px'
      exportButton.style.textTransform = 'none'
      exportButton.style.letterSpacing = 'normal'

      // Hover effects
      exportButton.onmouseover = function() {
        this.style.backgroundColor = '#e8e8e8'
      }
      exportButton.onmouseout = function() {
        this.style.backgroundColor = '#f5f5f5'
      }

      // Click handler
      exportButton.onclick = function() {
        // Get current state
        const scenario = globalActiveScenario?.id || 'unknown'
        const year = globalActiveYear?.id || 'unknown'
        const scope = globalActiveEnergyflowsSankey?.id || 'system'

        // Get sankey data for current scope - sankeyDataObjects is indexed by scope ID
        const sankeyData = sankeyDataObjects[scope] || sankeyDataObjects['system']

        if (!sankeyData || !sankeyData.links || !sankeyData.nodes) {
          console.error('No sankey data available for export. Available keys:', Object.keys(sankeyDataObjects))
          alert('No sankey data available for export')
          return
        }

        // Export the data
        exportSankeyToXLSX({
          scenario: scenario,
          year: year,
          scope: scope,
          links: sankeyData.links || [],
          nodes: sankeyData.nodes || [],
          settings: {}
        })
      }

      exportButtonContainer.appendChild(exportButton)
      unitSelector.appendChild(exportButtonContainer)
    }
  }, 100)
}

// Make functions globally available
window.exportSankeyToXLSX = exportSankeyToXLSX
window.exportLinegraphToXLSX = exportLinegraphToXLSX
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
