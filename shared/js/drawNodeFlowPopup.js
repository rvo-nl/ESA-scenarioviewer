// Node Flow Popup Module
// Shows incoming and outgoing flows for a clicked node with stacked bar charts and tables

let globalNodePopupData = null
let globalNodePopupConfig = null

// Cache for loaded mapping data
let mappingDataCache = {}

/**
 * Parse CSV text into a mapping object
 * @param {string} csvText - The CSV text content
 * @returns {Object} - Object with asset IDs as keys and mapping values as values
 */
function parseMappingCsv(csvText) {
  const lines = csvText.split('\n')
  const mapping = {}

  // Skip header row, parse each line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Handle CSV parsing (simple case: no quoted commas)
    const parts = line.split(',')
    if (parts.length >= 2) {
      const asset = parts[0].trim()
      const mappingValue = parts[1].trim()
      if (asset && mappingValue) {
        mapping[asset] = mappingValue
      }
    }
  }

  return mapping
}

/**
 * Load and parse a mapping CSV file
 * Supports both file mode (data from ZIP) and URL mode (fetch from server)
 * @param {string} filename - The mapping CSV filename
 * @returns {Promise<Object>} - Object with asset IDs as keys and mapping values as values
 */
async function loadMappingData(filename) {
  // Return from cache if already loaded
  if (mappingDataCache[filename]) {
    return mappingDataCache[filename]
  }

  // Get the base name without extension (how it's stored in mappingCsvData)
  const baseName = filename.replace(/\.[^.]+$/, '')

  // First check if data is available from ZIP (file mode)
  if (typeof window.mappingCsvData !== 'undefined' && window.mappingCsvData[baseName]) {
    const csvText = window.mappingCsvData[baseName]
    const mapping = parseMappingCsv(csvText)
    mappingDataCache[filename] = mapping
    return mapping
  }

  // Fall back to fetching from server (URL mode)
  try {
    const response = await fetch(`private/${filename}`)
    if (!response.ok) {
      console.warn(`Could not load mapping file: ${filename}`)
      return null
    }

    const csvText = await response.text()
    const mapping = parseMappingCsv(csvText)

    // Cache the result
    mappingDataCache[filename] = mapping
    return mapping
  } catch (error) {
    console.warn(`Error loading mapping file ${filename}:`, error)
    return null
  }
}

/**
 * Get mapping info for a node based on current scenario's model type
 * Finds all assets from the mapping CSV that map to this sankey node
 * CSV structure: asset (column 1) -> mapping/sankeyNode (column 2)
 * @param {string} nodeId - The sankey node ID to look up in the 'mapping' column
 * @returns {Promise<Object|null>} - Object with assets array and modelType, or null if no mapping
 */
async function getNodeMappingInfo(nodeId) {
  // Get current scenario
  const currentScenario = typeof globalActiveScenario !== 'undefined' ? globalActiveScenario : null
  if (!currentScenario || !currentScenario.id) {
    return null
  }

  // Get scenario config from viewerConfig
  const viewerConfigRef = typeof viewerConfig !== 'undefined' ? viewerConfig : null
  if (!viewerConfigRef || !viewerConfigRef.scenarios) {
    return null
  }

  // Find the scenario config to get model type
  const scenarioConfig = viewerConfigRef.scenarios.find(s => s.id === currentScenario.id)
  if (!scenarioConfig || !scenarioConfig.model) {
    return null
  }

  const modelType = scenarioConfig.model

  // Get current diagram config
  const currentDiagramId = typeof activeDiagramId !== 'undefined' ? activeDiagramId : 'main'
  const diagramConfig = viewerConfigRef.sankeyDiagrams?.find(d => d.id === currentDiagramId) ||
                        viewerConfigRef.sankeyDiagrams?.[0]

  if (!diagramConfig) {
    return null
  }

  // Determine which mapping file to use based on model type
  let mappingFile = null
  if (modelType === 'etm') {
    mappingFile = diagramConfig.etm_mapping
  } else if (modelType === 'opera') {
    mappingFile = diagramConfig.opera_mapping
  } else if (modelType === 'pypsa') {
    mappingFile = diagramConfig.pypsa_mapping
  }

  // If mapping file is null, don't show mapping info
  if (!mappingFile) {
    return null
  }

  // Load the mapping data (asset -> sankeyNode)
  const mappingData = await loadMappingData(mappingFile)
  if (!mappingData) {
    return null
  }

  // Find all assets where the mapping value equals the nodeId
  // mappingData is { asset: sankeyNode, ... }
  // We want all assets where sankeyNode === nodeId
  const matchingAssets = []
  for (const [asset, sankeyNode] of Object.entries(mappingData)) {
    if (sankeyNode === nodeId) {
      matchingAssets.push(asset)
    }
  }

  if (matchingAssets.length === 0) {
    return null
  }

  // Sort assets alphabetically for consistent display
  matchingAssets.sort()

  return {
    assets: matchingAssets,
    modelType: modelType,
    mappingFile: mappingFile
  }
}

function closeNodePopup() {
  d3.select('#nodeFlowPopup').remove()
  const container = d3.select('#popupContainer')
  container.on('click', null)
  container
    .style('background-color', 'rgba(0,0,0,0)')
    .style('pointer-events', 'none')
  document.body.style.overflow = 'auto'
  globalNodePopupData = null
  globalNodePopupConfig = null
}

/**
 * Draw node flow popup showing incoming and outgoing flows
 * @param {Object} node - The clicked node data
 * @param {Object} sankeyData - The sankey data object containing links and nodes
 * @param {Object} config - Configuration object with scenarios etc.
 */
async function drawNodeFlowPopup(node, sankeyData, config) {
  globalNodePopupData = { node, sankeyData }
  globalNodePopupConfig = config

  // Get popup dimensions from config or use defaults
  const popupWidth = 1200
  let popupHeight = 900  // Increased from 850 to add more space at bottom

  // Find incoming and outgoing flows for this node
  const incomingFlows = sankeyData.links.filter(link =>
    link.target === node.id && link.visibility === 1 && link.value > 0
  )
  const outgoingFlows = sankeyData.links.filter(link =>
    link.source === node.id && link.visibility === 1 && link.value > 0
  )

  // Get node titles for flows
  const getNodeTitle = (nodeId) => {
    const foundNode = sankeyData.nodes.find(n => n.id === nodeId)
    return foundNode ? (foundNode['title.system'] || foundNode.title || nodeId) : nodeId
  }

  // Prepare data for charts - group by legend (carrier type)
  const prepareChartData = (flows, isIncoming) => {
    return flows.map(flow => ({
      legend: flow.legend,
      value: flow.value,
      color: flow.color,
      source: flow.source,
      target: flow.target,
      sourceTitle: getNodeTitle(flow.source),
      targetTitle: getNodeTitle(flow.target),
      label: isIncoming ? getNodeTitle(flow.source) : getNodeTitle(flow.target)
    })).sort((a, b) => b.value - a.value)
  }

  const incomingData = prepareChartData(incomingFlows, true)
  const outgoingData = prepareChartData(outgoingFlows, false)

  // Unit handling
  const pjToTWh = 3.6
  const unit = (typeof currentUnit !== 'undefined' && currentUnit === 'TWh') ? 'TWh' : 'PJ'

  const getValue = (value, legend) => {
    if (legend === 'co2flow') {
      return value * (typeof globalCO2flowScale !== 'undefined' ? globalCO2flowScale : 1)
    }
    if (unit === 'TWh') {
      return value / pjToTWh
    }
    return value
  }

  const getUnit = (legend) => {
    if (legend === 'co2flow') return 'kton CO2'
    return unit
  }

  /* ----------  POP-UP SHELL  ---------- */
  d3.select('#popupContainer')
    .style('background-color', 'rgba(0,0,0,0.3)')
    .style('pointer-events', 'auto')
    .on('click', closeNodePopup)

  const popup = d3.select('#popupContainer')
    .append('div')
    .attr('id', 'nodeFlowPopup')
    .style('pointer-events', 'none')
    .style('position', 'absolute')
    .style('top', 0)
    .style('left', 0)
    .style('width', '100%')
    .style('height', '100%')
    .style('display', 'flex')
    .style('justify-content', 'center')
    .style('align-items', 'center')
    .style('overflow-y', 'auto')
    .style('padding', '20px 0')
    .append('div')
    .on('click', (event) => event.stopPropagation())
    .style('pointer-events', 'auto')
    .attr('id', 'nodeFlowPopupContent')
    .style('position', 'relative')
    .style('box-shadow', '0 4px 10px rgba(0,0,0,0.2)')
    .style('border-radius', '10px')
    .style('width', `${popupWidth}px`)
    .style('min-height', `${popupHeight}px`)
    .style('background-color', '#f9f9f9')
    .style('overflow', 'visible')
    .style('flex-shrink', '0')

  const svg = popup.append('svg')
    .style('position', 'absolute')
    .style('width', '100%')
    .attr('height', popupHeight)
    .attr('id', 'nodeFlowPopupSVG')

  const canvas = svg.append('g')

  // Create HTML container divs for tab content (for HTML elements like tables)
  const flowDetailsHtmlContainer = popup.append('div')
    .attr('class', 'flow-details-html-content')
    .style('position', 'absolute')
    .style('top', '0')
    .style('left', '0')
    .style('width', '100%')
    .style('height', '100%')
    .style('pointer-events', 'none')  // Allow clicks to pass through to SVG

  const flowTrendsHtmlContainer = popup.append('div')
    .attr('class', 'flow-trends-html-content')
    .style('position', 'absolute')
    .style('top', '0')
    .style('left', '0')
    .style('width', '100%')
    .style('height', '100%')
    .style('pointer-events', 'none')  // Allow clicks to pass through to SVG
    .style('display', 'none')  // Hidden by default

  /* ----------  HEADER  ---------- */
  const nodeTitle = node['title.system'] || node.title || node.id

  canvas.append('text')
    .attr('x', 50)
    .attr('y', 48)
    .style('font-size', '20px')
    .style('font-weight', 600)
    .style('fill', '#222')
    .text(`Node: ${nodeTitle}`)

  canvas.append('text')
    .attr('x', 50)
    .attr('y', 72)
    .style('font-size', '11px')
    .style('font-weight', 400)
    .style('fill', '#888')
    .text(`ID: ${node.id}`)

  // Add scenario and year info
  const currentScenario = typeof globalActiveScenario !== 'undefined' ? globalActiveScenario : null
  const currentYear = typeof globalActiveYear !== 'undefined' ? globalActiveYear : null

  if (currentScenario || currentYear) {
    const scenarioText = currentScenario ? currentScenario.title || currentScenario.id : 'Unknown'
    const yearText = currentYear ? currentYear.title || currentYear.id : 'Unknown'

    canvas.append('text')
      .attr('x', 50)
      .attr('y', 90)
      .style('font-size', '11px')
      .style('font-weight', 400)
      .style('fill', '#888')
      .text(`Scenario: ${scenarioText} | Year: ${yearText}`)
  }

  // Get mapping info (will be displayed at the bottom)
  const mappingInfo = await getNodeMappingInfo(node.id).catch(() => null)

  /* ----------  CLOSE BUTTON  ---------- */
  const CLOSE_SIZE = 30
  const CLOSE_X = popupWidth - 50
  const CLOSE_Y = 25

  const closeGroup = canvas.append('g')
    .attr('class', 'close-btn')
    .attr('transform', `translate(${CLOSE_X}, ${CLOSE_Y})`)
    .style('cursor', 'pointer')
    .on('click', closeNodePopup)

  closeGroup.append('rect')
    .attr('width', CLOSE_SIZE)
    .attr('height', CLOSE_SIZE)
    .attr('rx', 4)
    .attr('fill', '#fff')
    .on('mouseover', function() { d3.select(this).attr('fill', '#eee') })
    .on('mouseout', function() { d3.select(this).attr('fill', '#fff') })

  const ICON_PATH = 'm249 849-42-42 231-231-231-231 42-42 231 231 231-231 42 42-231 231 231 231-42 42-231-231-231 231Z'
  closeGroup.append('path')
    .attr('d', ICON_PATH)
    .attr('transform', 'translate(15,15) scale(0.03125) translate(-480,-480)')
    .attr('fill', '#666')
    .style('pointer-events', 'none')

  /* ----------  EXPORT BUTTON  ---------- */
  const EXPORT_WIDTH = 130
  const EXPORT_HEIGHT = 28
  const EXPORT_X = popupWidth - 200
  const EXPORT_Y = 30

  const exportGroup = canvas.append('g')
    .attr('class', 'export-btn')
    .attr('transform', `translate(${EXPORT_X}, ${EXPORT_Y})`)
    .style('cursor', 'pointer')
    .on('click', function() {
      // Export based on active tab
      if (activeTab === 'flowDetails') {
        exportNodeFlowData(node, incomingData, outgoingData, unit)
      } else {
        exportNodeLineGraphData()
      }
    })

  exportGroup.append('rect')
    .attr('width', EXPORT_WIDTH)
    .attr('height', EXPORT_HEIGHT)
    .attr('rx', 4)
    .attr('fill', '#f5f5f5')
    .attr('stroke', '#ccc')
    .attr('stroke-width', 1)
    .on('mouseover', function() { d3.select(this).attr('fill', '#e8e8e8') })
    .on('mouseout', function() { d3.select(this).attr('fill', '#f5f5f5') })

  exportGroup.append('text')
    .attr('x', EXPORT_WIDTH / 2)
    .attr('y', EXPORT_HEIGHT / 2 + 4)
    .attr('text-anchor', 'middle')
    .attr('fill', '#444')
    .style('font-size', '12px')
    .style('font-weight', '400')
    .style('pointer-events', 'none')
    .text('Export data (xlsx)')

  /* ----------  COPY TO CLIPBOARD BUTTON  ---------- */
  const COPY_WIDTH = 140
  const COPY_HEIGHT = 28
  const COPY_X = popupWidth - 350
  const COPY_Y = 30

  const copyGroup = canvas.append('g')
    .attr('class', 'copy-btn')
    .attr('transform', `translate(${COPY_X}, ${COPY_Y})`)
    .style('cursor', 'pointer')
    .on('click', function() {
      // Copy based on active tab
      if (activeTab === 'flowDetails') {
        copyNodeFlowDataToClipboard(node, incomingData, outgoingData, unit)
      } else {
        copyNodeLineGraphData()
      }
    })

  copyGroup.append('rect')
    .attr('width', COPY_WIDTH)
    .attr('height', COPY_HEIGHT)
    .attr('rx', 4)
    .attr('fill', '#f5f5f5')
    .attr('stroke', '#ccc')
    .attr('stroke-width', 1)
    .on('mouseover', function() { d3.select(this).attr('fill', '#e8e8e8') })
    .on('mouseout', function() { d3.select(this).attr('fill', '#f5f5f5') })

  copyGroup.append('text')
    .attr('x', COPY_WIDTH / 2)
    .attr('y', COPY_HEIGHT / 2 + 4)
    .attr('text-anchor', 'middle')
    .attr('fill', '#444')
    .style('font-size', '12px')
    .style('font-weight', '400')
    .style('pointer-events', 'none')
    .text('Copy data to clipboard')

  /* ----------  TAB SYSTEM  ---------- */
  const TAB_Y = 110
  const TAB_HEIGHT = 36
  const TAB_GAP = 2
  const TAB_START_X = 60

  let activeTab = 'flowDetails' // 'flowDetails' or 'flowTrends'

  // Get current scenario and year for tab label
  const getCurrentScenarioYear = () => {
    const scenarioId = typeof globalActiveScenario !== 'undefined' ? globalActiveScenario?.id : null
    const year = typeof globalActiveYear !== 'undefined' ? globalActiveYear?.id : null

    if (!scenarioId || !year) {
      return 'Flow Details'
    }

    // Get scenario title from viewerConfig
    let scenarioTitle = scenarioId
    if (typeof viewerConfig !== 'undefined' && viewerConfig.scenarios) {
      const scenario = viewerConfig.scenarios.find(s => s.id === scenarioId)
      if (scenario) {
        scenarioTitle = scenario.title
      }
    }

    return `${scenarioTitle} | ${year}`
  }

  const tab1Label = getCurrentScenarioYear()
  const tab2Label = 'Alle scenario\'s'

  // Calculate tab widths based on text content (with padding)
  // Estimate ~7px per character for 12px font
  const TAB1_WIDTH = Math.max(200, tab1Label.length * 7 + 20)
  const TAB2_WIDTH = Math.max(140, tab2Label.length * 7 + 20)

  // Draw tab bar background line (full width)
  canvas.append('line')
    .attr('x1', 0)
    .attr('y1', TAB_Y + TAB_HEIGHT)
    .attr('x2', popupWidth)
    .attr('y2', TAB_Y + TAB_HEIGHT)
    .attr('stroke', '#ddd')
    .attr('stroke-width', 2)

  // Tab button styling
  const getTabStyle = (isActive) => ({
    fill: isActive ? '#f9f9f9' : '#e8e8e8',
    stroke: isActive ? '#ddd' : '#ccc',
    strokeWidth: 1.5
  })

  const getTabTextStyle = (isActive) => ({
    fill: isActive ? '#2196F3' : '#666',
    fontWeight: isActive ? 600 : 400
  })

  // Tab 1: Flow Details
  const tab1Group = canvas.append('g')
    .attr('class', 'tab-btn-flow-details')
    .attr('transform', `translate(${TAB_START_X}, ${TAB_Y})`)
    .style('cursor', 'pointer')
    .on('click', function() {
      if (activeTab !== 'flowDetails') {
        activeTab = 'flowDetails'
        updateTabDisplay()
      }
    })

  // Custom path for tab with rounded top corners only
  const tab1Path = `M 0,${TAB_HEIGHT} L 0,4 Q 0,0 4,0 L ${TAB1_WIDTH - 4},0 Q ${TAB1_WIDTH},0 ${TAB1_WIDTH},4 L ${TAB1_WIDTH},${TAB_HEIGHT}`

  const tab1Rect = tab1Group.append('path')
    .attr('d', tab1Path)
    .attr('fill', '#f9f9f9')
    .attr('stroke', '#ddd')
    .attr('stroke-width', 1.5)

  const tab1Text = tab1Group.append('text')
    .attr('x', TAB1_WIDTH / 2)
    .attr('y', TAB_HEIGHT / 2 + 4)
    .attr('text-anchor', 'middle')
    .attr('fill', '#2196F3')
    .style('font-size', '12px')
    .style('font-weight', '600')
    .style('pointer-events', 'none')
    .text(tab1Label)

  // Tab 2: Flow Trends
  const tab2Group = canvas.append('g')
    .attr('class', 'tab-btn-flow-trends')
    .attr('transform', `translate(${TAB_START_X + TAB1_WIDTH + TAB_GAP}, ${TAB_Y})`)
    .style('cursor', 'pointer')
    .on('click', function() {
      if (activeTab !== 'flowTrends') {
        activeTab = 'flowTrends'
        updateTabDisplay()
      }
    })

  // Custom path for tab with rounded top corners only
  const tab2Path = `M 0,${TAB_HEIGHT} L 0,4 Q 0,0 4,0 L ${TAB2_WIDTH - 4},0 Q ${TAB2_WIDTH},0 ${TAB2_WIDTH},4 L ${TAB2_WIDTH},${TAB_HEIGHT}`

  const tab2Rect = tab2Group.append('path')
    .attr('d', tab2Path)
    .attr('fill', '#e8e8e8')
    .attr('stroke', '#ccc')
    .attr('stroke-width', 1.5)

  const tab2Text = tab2Group.append('text')
    .attr('x', TAB2_WIDTH / 2)
    .attr('y', TAB_HEIGHT / 2 + 4)
    .attr('text-anchor', 'middle')
    .attr('fill', '#666')
    .style('font-size', '12px')
    .style('font-weight', '400')
    .style('pointer-events', 'none')
    .text(tab2Label)

  /* ----------  LAYOUT CONSTANTS  ---------- */
  // Fixed layout - mapping section is now at the bottom
  const chartTop = 180  // Increased from 160 to add more spacing below tabs
  const chartHeight = 240
  const leftChartX = 60
  const rightChartX = popupWidth / 2 + 20
  const chartWidth = popupWidth / 2 - 80  // Ensure right table doesn't get cut off (rightChartX + chartWidth + margin = popupWidth)
  const tableTop = chartTop + chartHeight + 15
  const tableHeight = 280

  /* ----------  FLOW DETAILS TAB CONTENT  ---------- */
  const flowDetailsGroup = canvas.append('g')
    .attr('class', 'flow-details-content')

  /* ----------  INCOMING FLOWS (LEFT SIDE)  ---------- */
  flowDetailsGroup.append('text')
    .attr('x', leftChartX)
    .attr('y', chartTop)
    .style('font-size', '13px')
    .style('font-weight', 600)
    .style('fill', '#444')
    .text(`Incoming Flows (${incomingData.length})`)

  if (incomingData.length > 0) {
    drawStackedBarChart(flowDetailsGroup, incomingData, leftChartX, chartTop + 20, chartWidth, chartHeight - 40, getValue, getUnit, 'incoming')
  } else {
    flowDetailsGroup.append('text')
      .attr('x', leftChartX + chartWidth / 2)
      .attr('y', chartTop + chartHeight / 2)
      .attr('text-anchor', 'middle')
      .style('font-size', '13px')
      .style('fill', '#999')
      .text('No incoming flows')
  }

  /* ----------  OUTGOING FLOWS (RIGHT SIDE)  ---------- */
  flowDetailsGroup.append('text')
    .attr('x', rightChartX)
    .attr('y', chartTop)
    .style('font-size', '13px')
    .style('font-weight', 600)
    .style('fill', '#444')
    .text(`Outgoing Flows (${outgoingData.length})`)

  if (outgoingData.length > 0) {
    drawStackedBarChart(flowDetailsGroup, outgoingData, rightChartX, chartTop + 20, chartWidth, chartHeight - 40, getValue, getUnit, 'outgoing')
  } else {
    flowDetailsGroup.append('text')
      .attr('x', rightChartX + chartWidth / 2)
      .attr('y', chartTop + chartHeight / 2)
      .attr('text-anchor', 'middle')
      .style('font-size', '13px')
      .style('fill', '#999')
      .text('No outgoing flows')
  }

  /* ----------  TABLES  ---------- */
  // Incoming table (left)
  flowDetailsGroup.append('text')
    .attr('x', leftChartX)
    .attr('y', tableTop)
    .style('font-size', '12px')
    .style('font-weight', 600)
    .style('fill', '#444')
    .text('Incoming Flow Details')

  drawFlowTable(flowDetailsHtmlContainer, incomingData, leftChartX, tableTop + 15, chartWidth, tableHeight - 30, getValue, getUnit, true)

  // Outgoing table (right)
  flowDetailsGroup.append('text')
    .attr('x', rightChartX)
    .attr('y', tableTop)
    .style('font-size', '12px')
    .style('font-weight', 600)
    .style('fill', '#444')
    .text('Outgoing Flow Details')

  drawFlowTable(flowDetailsHtmlContainer, outgoingData, rightChartX, tableTop + 15, chartWidth, tableHeight - 30, getValue, getUnit, false)

  // Calculate mapping section position after tables
  const mappingSectionTop = tableTop + tableHeight + 20  // Decreased from 40 to 20

  /* ----------  MAPPED ASSETS (in Flow Details tab)  ---------- */
  if (mappingInfo && mappingInfo.assets && mappingInfo.assets.length > 0) {
    const mappingTop = mappingSectionTop
    const maxScrollHeight = 100

    // Add mapping info label
    flowDetailsGroup.append('text')
      .attr('x', 50)
      .attr('y', mappingTop)
      .style('font-size', '10px')
      .style('font-weight', 500)
      .style('fill', '#333')
      .text(`Mapped assets (${mappingInfo.modelType.toUpperCase()}, ${mappingInfo.assets.length}) (scrollable):`)

    // Display assets in a scrollable div using foreignObject
    const assetsText = mappingInfo.assets.join(', ')

    // Create scrollable container for assets using foreignObject
    const foreignObject = flowDetailsGroup.append('foreignObject')
      .attr('x', 50)
      .attr('y', mappingTop + 5)
      .attr('width', popupWidth - 100)
      .attr('height', maxScrollHeight)

    const assetsDiv = foreignObject.append('xhtml:div')
      .style('width', '100%')
      .style('height', '100%')
      .style('overflow-y', 'auto')
      .style('overflow-x', 'hidden')
      .style('font-size', '9px')
      .style('font-family', 'monospace')
      .style('line-height', '1.3')
      .style('color', '#555')
      .style('background-color', '#f5f5f5')
      .style('padding', '8px')
      .style('border', '1px solid #ddd')
      .style('border-radius', '4px')
      .text(assetsText)
  }

  /* ----------  FLOW TRENDS TAB CONTENT  ---------- */
  const flowTrendsGroup = canvas.append('g')
    .attr('class', 'flow-trends-content')
    .style('display', 'none')  // Hidden by default

  // Function to update tab display (defined here after both groups are created)
  const updateTabDisplay = () => {
    // Update tab button styles
    const tab1Style = getTabStyle(activeTab === 'flowDetails')
    const tab1TextStyle = getTabTextStyle(activeTab === 'flowDetails')
    tab1Rect.attr('fill', tab1Style.fill)
      .attr('stroke', tab1Style.stroke)
      .attr('stroke-width', tab1Style.strokeWidth)
    tab1Text.attr('fill', tab1TextStyle.fill)
      .style('font-weight', tab1TextStyle.fontWeight)

    const tab2Style = getTabStyle(activeTab === 'flowTrends')
    const tab2TextStyle = getTabTextStyle(activeTab === 'flowTrends')
    tab2Rect.attr('fill', tab2Style.fill)
      .attr('stroke', tab2Style.stroke)
      .attr('stroke-width', tab2Style.strokeWidth)
    tab2Text.attr('fill', tab2TextStyle.fill)
      .style('font-weight', tab2TextStyle.fontWeight)

    // Show/hide content groups (both SVG and HTML containers)
    const showFlowDetails = activeTab === 'flowDetails'
    flowDetailsGroup.style('display', showFlowDetails ? 'block' : 'none')
    flowDetailsHtmlContainer.style('display', showFlowDetails ? 'block' : 'none')

    const showFlowTrends = activeTab === 'flowTrends'
    flowTrendsGroup.style('display', showFlowTrends ? 'block' : 'none')
    flowTrendsHtmlContainer.style('display', showFlowTrends ? 'block' : 'none')
  }

  /* ----------  LINEGRAPH SECTION  ---------- */
  const lineGraphTop = chartTop + 20  // Add spacing below tab bar (was chartTop)
  const lineGraphHeight = 450  // Increased height to utilize more vertical space
  const lineGraphWidth = popupWidth - 120

  // Get lineGraphFlow config from viewerConfig
  const lineGraphConfig = typeof viewerConfig !== 'undefined' ? viewerConfig.lineGraphFlow || {} : {}
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

  // State for incoming/outgoing toggle
  let showIncomingFlows = true

  // Build scenario colors from config
  const scenarioColors = {}
  Object.values(categoryInfo).forEach(cat => {
    const colorScale = d3.scaleLinear()
      .domain([0, cat.scenarios.length - 1])
      .range([d3.color(cat.baseColor).brighter(1.5), d3.color(cat.baseColor).darker(1.5)])
    cat.scenarios.forEach((scenario, i) => {
      scenarioColors[scenario] = colorScale(i)
    })
  })

  // Define symbols for scenarios
  const symbols = [
    d3.symbolCircle, d3.symbolCross, d3.symbolDiamond, d3.symbolSquare,
    d3.symbolStar, d3.symbolTriangle, d3.symbolWye
  ]

  const scenarioSymbols = {}
  varianten.forEach((scenario, i) => {
    scenarioSymbols[scenario] = symbols[i % symbols.length]
  })

  // Initialize visible scenarios for this popup - load from localStorage if available
  const STORAGE_KEY = 'nodePopupVisibleScenarios'
  let nodePopupVisibleScenarios
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const storedArray = JSON.parse(stored)
      // Filter to only include scenarios that are still valid
      nodePopupVisibleScenarios = new Set(storedArray.filter(s => varianten.includes(s)))
    }
  } catch (e) {
    console.warn('Failed to load scenario selection from localStorage:', e)
  }

  // Default to all scenarios if nothing was loaded or stored data was empty
  if (!nodePopupVisibleScenarios || nodePopupVisibleScenarios.size === 0) {
    nodePopupVisibleScenarios = new Set(varianten)
  }

  // Helper function to save scenario selection to localStorage
  const saveScenarioSelection = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...nodePopupVisibleScenarios]))
    } catch (e) {
      console.warn('Failed to save scenario selection to localStorage:', e)
    }
  }

  // Get available years from sankey links - check all links to find all scenario keys
  // New format: "2030_TNOAT2024_ADAPT", Old format: "scenario0_x2030x_TNOAT2024_ADAPT"
  const allScenarioKeys = new Set()
  sankeyData.links.forEach(link => {
    Object.keys(link).forEach(key => {
      if (/^\d{4}_/.test(key) || (key.includes('scenario') && key.match(/x\d{4}x/))) {
        allScenarioKeys.add(key)
      }
    })
  })

  const availableYears = [...new Set(
    [...allScenarioKeys]
      .map(k => {
        // New format: "2030_SCENARIONAME"
        const newMatch = k.match(/^(\d{4})_/)
        if (newMatch) return parseInt(newMatch[1])
        // Old format: "scenario0_x2030x_SCENARIONAME"
        const oldMatch = k.match(/x(\d{4})x/)
        return oldMatch ? parseInt(oldMatch[1]) : null
      })
      .filter(year => year !== null)
  )].sort((a, b) => a - b)
    .filter(year => {
      if (typeof viewerConfig !== 'undefined' && viewerConfig && viewerConfig.years) {
        const configYears = viewerConfig.years.map(y => parseInt(y.id))
        return configYears.includes(year)
      }
      return true
    })

  // Function to calculate total flows for a node across scenarios/years
  const calculateNodeFlowData = (isIncoming) => {
    const flowDataMap = {}

    // Use global scenarioIdLookup (auto-built from data columns, or from viewerConfig)
    const lookupRef = typeof scenarioIdLookup !== 'undefined' && Object.keys(scenarioIdLookup).length > 0
      ? scenarioIdLookup
      : (typeof viewerConfig !== 'undefined' ? viewerConfig.scenarioIdLookup || {} : {})

    varianten.forEach(scenarioId => {
      flowDataMap[scenarioId] = {}

      availableYears.forEach(year => {
        let total = 0

        // Check if this scenario+year combination exists in the lookup
        const scenarioExists = lookupRef[scenarioId]?.[year.toString()]
        if (scenarioExists === undefined) {
          return // Skip if not found for this scenario+year combination
        }

        // Construct the key in the format: "{YEAR}_{SCENARIO_ID}"
        const scenarioKey = `${year}_${scenarioId}`

        // Sum all flows for this node
        sankeyData.links.forEach(link => {
          const matchesDirection = isIncoming
            ? link.target === node.id
            : link.source === node.id

          // Only include visible links (same filter as Flow Details tab)
          if (matchesDirection && link.visibility === 1 && link[scenarioKey] !== undefined) {
            const value = parseFloat(link[scenarioKey]) || 0
            if (value > 0) {
              total += getValue(value, link.legend)
            }
          }
        })

        if (total > 0) {
          flowDataMap[scenarioId][year] = total
        }
      })
    })

    return flowDataMap
  }

  // Create the linegraph group (inside flowTrendsGroup)
  const lineGraphGroup = flowTrendsGroup.append('g')
    .attr('class', 'node-linegraph-section')

  // Section title
  lineGraphGroup.append('text')
    .attr('x', leftChartX)
    .attr('y', lineGraphTop)
    .style('font-size', '13px')
    .style('font-weight', 600)
    .style('fill', '#444')
    .text('Flow Trends Across Scenarios')

  // Incoming/Outgoing toggle
  const toggleGroup = lineGraphGroup.append('g')
    .attr('transform', `translate(${leftChartX + 250}, ${lineGraphTop - 12})`)

  const toggleWidth = 140
  const toggleHeight = 22

  toggleGroup.append('rect')
    .attr('class', 'toggle-bg')
    .attr('width', toggleWidth)
    .attr('height', toggleHeight)
    .attr('rx', 11)
    .attr('fill', '#e0e0e0')

  const toggleSlider = toggleGroup.append('rect')
    .attr('class', 'toggle-slider')
    .attr('width', toggleWidth / 2)
    .attr('height', toggleHeight - 2)
    .attr('x', 1)
    .attr('y', 1)
    .attr('rx', 10)
    .attr('fill', '#fff')
    .style('transition', 'x 0.2s')

  toggleGroup.append('text')
    .attr('x', toggleWidth / 4)
    .attr('y', toggleHeight / 2 + 4)
    .attr('text-anchor', 'middle')
    .style('font-size', '11px')
    .style('fill', '#444')
    .style('pointer-events', 'none')
    .text('Incoming')

  toggleGroup.append('text')
    .attr('x', toggleWidth * 3 / 4)
    .attr('y', toggleHeight / 2 + 4)
    .attr('text-anchor', 'middle')
    .style('font-size', '11px')
    .style('fill', '#444')
    .style('pointer-events', 'none')
    .text('Outgoing')

  toggleGroup.append('rect')
    .attr('width', toggleWidth)
    .attr('height', toggleHeight)
    .attr('fill', 'transparent')
    .style('cursor', 'pointer')
    .on('click', function() {
      showIncomingFlows = !showIncomingFlows
      toggleSlider.attr('x', showIncomingFlows ? 1 : toggleWidth / 2)
      updateNodeLineGraph()
    })

  // Create the graph area
  const graphX = leftChartX + 50  // Add 50px more left spacing (was leftChartX)
  const graphY = lineGraphTop + 20
  const graphWidth = lineGraphWidth - 120  // Adjust width to compensate for left spacing (was 100)
  const graphHeight = 380  // Increased from 200 to 380 to better utilize vertical space

  // X scale for years
  const xScale = d3.scalePoint()
    .domain(availableYears)
    .range([graphX, graphX + graphWidth])

  // Draw axes backgrounds and gridlines first
  const yAxisGroup = lineGraphGroup.append('g').attr('class', 'y-axis')
  const xAxisGroup = lineGraphGroup.append('g').attr('class', 'x-axis')
  const gridGroup = lineGraphGroup.append('g').attr('class', 'grid-bands')
  const linesGroup = lineGraphGroup.append('g').attr('class', 'lines')
  const dotsGroup = lineGraphGroup.append('g').attr('class', 'dots')

  // Add tooltip
  const lgTooltip = lineGraphGroup.append('g')
    .attr('class', 'lg-tooltip')
    .style('display', 'none')

  lgTooltip.append('rect')
    .attr('rx', 5).attr('ry', 5)
    .attr('fill', '#f9f9f9')
    .attr('stroke', '#ccc')

  lgTooltip.append('text')
    .attr('fill', '#333')
    .style('font-size', '11px')
    .attr('text-anchor', 'middle')

  // Legend section
  const legendTop = graphY + graphHeight + 70  // Increased spacing from 50 to 70
  const legendGroup = lineGraphGroup.append('g')
    .attr('transform', `translate(${graphX}, ${legendTop})`)

  legendGroup.append('text')
    .attr('x', 0)
    .attr('y', -15)
    .style('font-size', '12px')
    .style('font-weight', 'bold')
    .text('Scenarios')

  // Select All button
  const selectAllBtn = legendGroup.append('g')
    .attr('transform', 'translate(90, -27)')
    .style('cursor', 'pointer')
    .on('click', function() {
      nodePopupVisibleScenarios = new Set(varianten)
      updateNodeLineGraph()
      updateNodeLegend()
    })

  selectAllBtn.append('rect')
    .attr('width', 70)
    .attr('height', 20)
    .attr('rx', 3)
    .attr('fill', '#f5f5f5')
    .attr('stroke', '#ccc')
    .attr('stroke-width', 1)
    .on('mouseover', function() { d3.select(this).attr('fill', '#e8e8e8') })
    .on('mouseout', function() { d3.select(this).attr('fill', '#f5f5f5') })

  selectAllBtn.append('text')
    .attr('x', 35)
    .attr('y', 14)
    .attr('text-anchor', 'middle')
    .style('font-size', '10px')
    .style('fill', '#444')
    .style('pointer-events', 'none')
    .text('Select All')

  // Deselect All button
  const deselectAllBtn = legendGroup.append('g')
    .attr('transform', 'translate(165, -27)')
    .style('cursor', 'pointer')
    .on('click', function() {
      nodePopupVisibleScenarios = new Set()
      updateNodeLineGraph()
      updateNodeLegend()
    })

  deselectAllBtn.append('rect')
    .attr('width', 80)
    .attr('height', 20)
    .attr('rx', 3)
    .attr('fill', '#f5f5f5')
    .attr('stroke', '#ccc')
    .attr('stroke-width', 1)
    .on('mouseover', function() { d3.select(this).attr('fill', '#e8e8e8') })
    .on('mouseout', function() { d3.select(this).attr('fill', '#f5f5f5') })

  deselectAllBtn.append('text')
    .attr('x', 40)
    .attr('y', 14)
    .attr('text-anchor', 'middle')
    .style('font-size', '10px')
    .style('fill', '#444')
    .style('pointer-events', 'none')
    .text('Deselect All')

  // Create legend items
  const itemsPerColumn = Math.ceil(varianten.length / 3)
  const columnWidth = 320
  const itemHeight = 20

  const legendItems = legendGroup.selectAll('.legend-item')
    .data(varianten)
    .enter()
    .append('g')
    .attr('class', 'legend-item')
    .attr('transform', (d, i) => {
      const col = Math.floor(i / itemsPerColumn)
      const row = i % itemsPerColumn
      return `translate(${col * columnWidth}, ${row * itemHeight})`
    })
    .style('cursor', 'pointer')
    .on('click', function(event, d) {
      if (nodePopupVisibleScenarios.has(d)) {
        nodePopupVisibleScenarios.delete(d)
      } else {
        nodePopupVisibleScenarios.add(d)
      }
      saveScenarioSelection()
      updateNodeLineGraph()
      updateNodeLegend()
    })

  legendItems.append('rect')
    .attr('class', 'checkmark-box')
    .attr('width', 12)
    .attr('height', 12)
    .attr('rx', 2)
    .attr('fill', '#fff')
    .attr('stroke', d => scenarioColors[d])
    .attr('stroke-width', 1.5)

  legendItems.append('text')
    .attr('class', 'checkmark')
    .attr('x', 2)
    .attr('y', 10)
    .style('font-size', '10px')
    .style('user-select', 'none')
    .style('fill', '#fff')
    .style('pointer-events', 'none')
    .text('✔')

  legendItems.append('path')
    .attr('d', d => d3.symbol().type(scenarioSymbols[d]).size(40)())
    .attr('transform', 'translate(24, 6)')
    .attr('fill', d => scenarioColors[d])
    .style('pointer-events', 'none')

  legendItems.append('text')
    .attr('x', 38)
    .attr('y', 10)
    .style('font-size', '10px')
    .text(d => variantTitles[d] || d)
    .style('pointer-events', 'none')

  function updateNodeLegend() {
    legendGroup.selectAll('.legend-item')
      .each(function(d) {
        const item = d3.select(this)
        const isVisible = nodePopupVisibleScenarios.has(d)
        item.select('.checkmark-box')
          .attr('fill', isVisible ? scenarioColors[d] : '#fff')
        item.select('.checkmark')
          .style('display', isVisible ? 'inline' : 'none')
        item.style('opacity', isVisible ? 1 : 0.6)
      })
  }

  function updateNodeLineGraph() {
    // Clear existing lines and dots
    linesGroup.selectAll('*').remove()
    dotsGroup.selectAll('*').remove()
    yAxisGroup.selectAll('*').remove()
    gridGroup.selectAll('*').remove()

    // Get flow data
    const flowData = calculateNodeFlowData(showIncomingFlows)

    // Find max value for y scale
    let maxValue = 0
    varianten.forEach(scenarioId => {
      if (!nodePopupVisibleScenarios.has(scenarioId)) return
      Object.values(flowData[scenarioId] || {}).forEach(val => {
        if (val > maxValue) maxValue = val
      })
    })

    // Debug: Check if flowData has actual values
    let totalDataPoints = 0
    let sampleData = {}
    varianten.forEach(scenarioId => {
      const yearData = flowData[scenarioId] || {}
      const yearCount = Object.keys(yearData).length
      totalDataPoints += yearCount
      if (yearCount > 0 && Object.keys(sampleData).length < 3) {
        sampleData[scenarioId] = yearData
      }
    })

    if (maxValue === 0) maxValue = 100  // Default if no data

    // Y scale
    const yScale = d3.scaleLinear()
      .domain([0, maxValue])
      .range([graphY + graphHeight, graphY + 10])

    // Draw grid bands
    const yTicks = yScale.ticks(5)
    gridGroup.selectAll('rect')
      .data(d3.range(0, yTicks.length - 1, 2))
      .enter()
      .append('rect')
      .attr('x', graphX)
      .attr('y', i => yScale(yTicks[i + 1]))
      .attr('width', graphWidth)
      .attr('height', i => yScale(yTicks[i]) - yScale(yTicks[i + 1]))
      .style('fill', '#f5f5f5')

    // Draw y-axis
    yAxisGroup.append('g')
      .attr('transform', `translate(${graphX}, 0)`)
      .call(d3.axisLeft(yScale).ticks(5).tickSize(0).tickPadding(8))
      .style('font-size', '10px')
      .select('.domain').remove()

    // Y-axis label
    yAxisGroup.append('text')
      .attr('transform', `translate(${graphX - 45}, ${graphY + graphHeight / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .style('font-size', '10px')
      .style('fill', '#666')
      .text(unit === 'TWh' ? 'TWh/year' : 'PJ/year')

    // Draw x-axis
    xAxisGroup.selectAll('*').remove()
    xAxisGroup.append('g')
      .attr('transform', `translate(0, ${graphY + graphHeight})`)
      .call(d3.axisBottom(xScale).tickSize(0).tickPadding(8))
      .style('font-size', '10px')
      .select('.domain').remove()

    // Line generator
    const line = d3.line()
      .x(d => xScale(d.year))
      .y(d => yScale(d.value))

    // Draw lines and dots for each scenario
    varianten.forEach(scenarioId => {
      if (!nodePopupVisibleScenarios.has(scenarioId)) return

      const scenarioData = availableYears
        .filter(year => flowData[scenarioId] && flowData[scenarioId][year] !== undefined)
        .map(year => ({ year, value: flowData[scenarioId][year] }))

      if (scenarioData.length === 0) return

      const color = scenarioColors[scenarioId]

      // Draw line
      linesGroup.append('path')
        .datum(scenarioData)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('d', line)

      // Draw dots
      const symbolGenerator = d3.symbol().type(scenarioSymbols[scenarioId]).size(50)
      scenarioData.forEach(d => {
        dotsGroup.append('path')
          .attr('d', symbolGenerator())
          .attr('transform', `translate(${xScale(d.year)}, ${yScale(d.value)})`)
          .attr('fill', color)
          .style('cursor', 'pointer')
          .on('mouseover', function(event) {
            lgTooltip.raise().style('display', 'block')

            const scenarioTitle = variantTitles[scenarioId] || scenarioId
            const valueText = `${d.year}: ${d3.format(',.1f')(d.value)} ${unit}`
            const textEl = lgTooltip.select('text')

            textEl.selectAll('tspan').remove()
            textEl.append('tspan')
              .attr('x', 0)
              .attr('dy', '1.1em')
              .style('font-weight', 'bold')
              .style('font-size', '10px')
              .text(scenarioTitle.substring(0, 30))

            textEl.append('tspan')
              .attr('x', 0)
              .attr('dy', '1.3em')
              .style('font-size', '10px')
              .text(valueText)

            const padding = 8
            const textBBox = textEl.node().getBBox()
            const tooltipWidth = textBBox.width + padding * 2
            const tooltipHeight = textBBox.height + padding * 2

            lgTooltip.select('rect')
              .attr('x', 0)
              .attr('y', 0)
              .attr('width', tooltipWidth)
              .attr('height', tooltipHeight)

            textEl.attr('transform', `translate(${tooltipWidth / 2}, ${padding - textBBox.y})`)

            let tooltipX = xScale(d.year) - tooltipWidth / 2
            let tooltipY = yScale(d.value) - tooltipHeight - 10

            if (tooltipY < graphY) tooltipY = yScale(d.value) + 15
            if (tooltipX < graphX) tooltipX = graphX
            if (tooltipX + tooltipWidth > graphX + graphWidth) tooltipX = graphX + graphWidth - tooltipWidth

            lgTooltip.attr('transform', `translate(${tooltipX}, ${tooltipY})`)
          })
          .on('mouseout', function() {
            lgTooltip.style('display', 'none')
          })
      })
    })
  }

  // Export function for linegraph data
  function exportNodeLineGraphData() {
    const flowData = calculateNodeFlowData(showIncomingFlows)
    const nodeTitle = node['title.system'] || node.title || node.id
    const flowType = showIncomingFlows ? 'Incoming' : 'Outgoing'

    // Create workbook
    const wb = XLSX.utils.book_new()

    // Build header row
    const headerRow = ['Scenario', ...availableYears.map(y => y.toString())]

    // Build data rows
    const dataRows = varianten.map(scenarioId => {
      const row = [variantTitles[scenarioId] || scenarioId]
      availableYears.forEach(year => {
        const val = flowData[scenarioId] && flowData[scenarioId][year]
        row.push(val !== undefined ? Math.round(val * 100) / 100 : '')
      })
      return row
    })

    // Create sheet data
    const sheetData = [
      [`Node: ${nodeTitle}`],
      [`Flow Type: ${flowType}`],
      [`Unit: ${unit}`],
      [`Export Date: ${new Date().toISOString().slice(0, 10)}`],
      [],
      headerRow,
      ...dataRows
    ]

    const ws = XLSX.utils.aoa_to_sheet(sheetData)
    XLSX.utils.book_append_sheet(wb, ws, 'Node Flow Trends')

    const safeTitle = nodeTitle.replace(/[^a-z0-9]/gi, '_').substring(0, 30)
    const filename = `node_flow_trends_${safeTitle}_${flowType}_${new Date().toISOString().slice(0, 10)}.xlsx`
    XLSX.writeFile(wb, filename)
  }

  // Copy function for linegraph data
  function copyNodeLineGraphData() {
    const flowData = calculateNodeFlowData(showIncomingFlows)
    const nodeTitle = node['title.system'] || node.title || node.id
    const flowType = showIncomingFlows ? 'Incoming' : 'Outgoing'

    let tsvData = `Node Flow Trends\n`
    tsvData += `Node\t${nodeTitle}\n`
    tsvData += `Flow Type\t${flowType}\n`
    tsvData += `Unit\t${unit}\n`
    tsvData += `Export Date\t${new Date().toISOString().slice(0, 10)}\n\n`

    // Header row
    tsvData += `Scenario\t${availableYears.join('\t')}\n`

    // Data rows
    varianten.forEach(scenarioId => {
      tsvData += variantTitles[scenarioId] || scenarioId
      availableYears.forEach(year => {
        const val = flowData[scenarioId] && flowData[scenarioId][year]
        tsvData += `\t${val !== undefined ? Math.round(val * 100) / 100 : ''}`
      })
      tsvData += '\n'
    })

    navigator.clipboard.writeText(tsvData).then(() => {
      console.log('Node flow trend data copied to clipboard')
    }).catch(err => {
      console.error('Failed to copy:', err)
    })
  }

  // Initial render
  updateNodeLineGraph()
  updateNodeLegend()
}

/**
 * Draw a horizontal stacked bar chart
 */
function drawStackedBarChart(canvas, data, x, y, width, height, getValue, getUnit, type) {
  const barHeight = 35
  const barSpacing = 8
  const labelWidth = 150
  const valueWidth = 80
  const barAreaWidth = width - labelWidth - valueWidth - 20

  // Calculate total for percentage
  const total = data.reduce((sum, d) => sum + getValue(d.value, d.legend), 0)

  // Find max value for scaling
  const maxValue = d3.max(data, d => getValue(d.value, d.legend))

  // Scale for bar width
  const xScale = d3.scaleLinear()
    .domain([0, maxValue])
    .range([0, barAreaWidth])

  // Draw each bar
  const maxBars = Math.min(data.length, Math.floor((height - 30) / (barHeight + barSpacing)))

  data.slice(0, maxBars).forEach((d, i) => {
    const barY = y + 25 + i * (barHeight + barSpacing)
    const value = getValue(d.value, d.legend)
    const barW = xScale(value)

    // Label (source/target node name)
    canvas.append('text')
      .attr('x', x)
      .attr('y', barY + barHeight / 2 + 4)
      .style('font-size', '11px')
      .style('fill', '#333')
      .text(truncateText(d.label, 20))
      .append('title')
      .text(d.label)

    // Bar background
    canvas.append('rect')
      .attr('x', x + labelWidth)
      .attr('y', barY)
      .attr('width', barAreaWidth)
      .attr('height', barHeight)
      .attr('fill', '#eee')
      .attr('rx', 3)

    // Bar fill
    canvas.append('rect')
      .attr('x', x + labelWidth)
      .attr('y', barY)
      .attr('width', barW)
      .attr('height', barHeight)
      .attr('fill', d.color || '#666')
      .attr('rx', 3)

    // Value label inside bar (if bar is wide enough)
    if (barW > 40) {
      canvas.append('text')
        .attr('x', x + labelWidth + barW - 5)
        .attr('y', barY + barHeight / 2 + 4)
        .attr('text-anchor', 'end')
        .style('font-size', '10px')
        .style('fill', '#fff')
        .style('font-weight', '500')
        .text(formatValue(value))
    }

    // Value and unit outside bar
    canvas.append('text')
      .attr('x', x + labelWidth + barAreaWidth + 8)
      .attr('y', barY + barHeight / 2 + 4)
      .style('font-size', '11px')
      .style('fill', '#666')
      .text(`${formatValue(value)} ${getUnit(d.legend)}`)

    // Carrier type (legend) label
    canvas.append('text')
      .attr('x', x + labelWidth + barAreaWidth + 8)
      .attr('y', barY + barHeight / 2 + 16)
      .style('font-size', '9px')
      .style('fill', '#999')
      .text(d.legend)
  })

  // Show "and X more..." if there are more items
  if (data.length > maxBars) {
    canvas.append('text')
      .attr('x', x + labelWidth)
      .attr('y', y + 25 + maxBars * (barHeight + barSpacing) + 15)
      .style('font-size', '11px')
      .style('fill', '#999')
      .style('font-style', 'italic')
      .text(`... and ${data.length - maxBars} more (see table below)`)
  }

  // Total line
  canvas.append('line')
    .attr('x1', x)
    .attr('x2', x + width - 10)
    .attr('y1', y + 10)
    .attr('y2', y + 10)
    .style('stroke', '#ddd')
    .style('stroke-width', 1)

  canvas.append('text')
    .attr('x', x + width - 10)
    .attr('y', y + 5)
    .attr('text-anchor', 'end')
    .style('font-size', '11px')
    .style('fill', '#666')
    .text(`Total: ${formatValue(total)} ${getUnit(data[0]?.legend || '')}`)
}

/**
 * Draw a flow table using HTML
 */
function drawFlowTable(container, data, x, y, width, height, getValue, getUnit, isIncoming) {
  const tableDiv = container.append('div')
    .style('position', 'absolute')
    .style('left', `${x}px`)
    .style('top', `${y}px`)
    .style('width', `${width}px`)
    .style('height', `${height}px`)
    .style('overflow-y', 'auto')
    .style('overflow-x', 'hidden')
    .style('background-color', '#fff')
    .style('border', '1px solid #ddd')
    .style('border-radius', '4px')
    .style('pointer-events', 'auto')  // Enable interactions on tables

  if (data.length === 0) {
    tableDiv.append('div')
      .style('padding', '20px')
      .style('text-align', 'center')
      .style('color', '#999')
      .style('font-size', '12px')
      .text('No flows')
    return
  }

  const table = tableDiv.append('table')
    .style('width', '100%')
    .style('border-collapse', 'collapse')
    .style('font-size', '11px')

  // Header
  const thead = table.append('thead')
  const headerRow = thead.append('tr')
    .style('background-color', '#f5f5f5')
    .style('position', 'sticky')
    .style('top', '0')

  const headers = isIncoming
    ? ['Source', 'ID', 'Carrier', 'Value', 'Unit']
    : ['Target', 'ID', 'Carrier', 'Value', 'Unit']

  headers.forEach(h => {
    headerRow.append('th')
      .style('padding', '8px 6px')
      .style('text-align', 'left')
      .style('border-bottom', '2px solid #ddd')
      .style('font-weight', '500')
      .text(h)
  })

  // Body
  const tbody = table.append('tbody')

  data.forEach((d, i) => {
    const row = tbody.append('tr')
      .style('background-color', i % 2 === 0 ? '#fff' : '#fafafa')

    // Source/Target
    row.append('td')
      .style('padding', '6px')
      .style('border-bottom', '1px solid #eee')
      .style('max-width', '120px')
      .style('overflow', 'hidden')
      .style('text-overflow', 'ellipsis')
      .style('white-space', 'nowrap')
      .attr('title', d.label)
      .text(d.label)

    // ID (source or target)
    const nodeId = isIncoming ? d.source : d.target
    row.append('td')
      .style('padding', '6px')
      .style('border-bottom', '1px solid #eee')
      .style('max-width', '100px')
      .style('overflow', 'hidden')
      .style('text-overflow', 'ellipsis')
      .style('white-space', 'nowrap')
      .style('font-size', '10px')
      .style('color', '#666')
      .attr('title', nodeId)
      .text(nodeId)

    // Carrier (legend)
    const carrierCell = row.append('td')
      .style('padding', '6px')
      .style('border-bottom', '1px solid #eee')
      .style('max-width', '120px')
      .style('overflow', 'hidden')
      .style('text-overflow', 'ellipsis')
      .style('white-space', 'nowrap')
      .attr('title', d.legend)

    carrierCell.append('span')
      .style('display', 'inline-block')
      .style('width', '10px')
      .style('height', '10px')
      .style('background-color', d.color || '#666')
      .style('border-radius', '2px')
      .style('margin-right', '5px')
      .style('vertical-align', 'middle')

    carrierCell.append('span')
      .text(d.legend)

    // Value
    row.append('td')
      .style('padding', '6px')
      .style('border-bottom', '1px solid #eee')
      .style('text-align', 'right')
      .style('font-family', 'monospace')
      .text(formatValue(getValue(d.value, d.legend)))

    // Unit
    row.append('td')
      .style('padding', '6px')
      .style('border-bottom', '1px solid #eee')
      .text(getUnit(d.legend))
  })

  // Total row
  const totalValue = data.reduce((sum, d) => sum + getValue(d.value, d.legend), 0)
  const totalRow = tbody.append('tr')
    .style('background-color', '#f0f0f0')
    .style('font-weight', '500')

  totalRow.append('td')
    .style('padding', '8px 6px')
    .style('border-top', '2px solid #ddd')
    .text('Total')

  totalRow.append('td')
    .style('padding', '8px 6px')
    .style('border-top', '2px solid #ddd')
    .text('')  // ID column

  totalRow.append('td')
    .style('padding', '8px 6px')
    .style('border-top', '2px solid #ddd')
    .text('')  // Carrier column

  totalRow.append('td')
    .style('padding', '8px 6px')
    .style('border-top', '2px solid #ddd')
    .style('text-align', 'right')
    .style('font-family', 'monospace')
    .text(formatValue(totalValue))

  totalRow.append('td')
    .style('padding', '8px 6px')
    .style('border-top', '2px solid #ddd')
    .text(getUnit(data[0]?.legend || ''))
}

/**
 * Copy node flow data to clipboard as TSV
 */
function copyNodeFlowDataToClipboard(node, incomingData, outgoingData, unit) {
  const nodeTitle = node['title.system'] || node.title || node.id

  // Unit conversion helper
  const pjToTWh = 3.6
  const convertValue = (value, legend) => {
    let converted = value
    if (legend === 'co2flow') {
      converted = value * (typeof globalCO2flowScale !== 'undefined' ? globalCO2flowScale : 1)
    } else if (unit === 'TWh') {
      converted = value / pjToTWh
    }
    return Math.round(converted) // Round to 0 decimals
  }

  const getFlowUnit = (legend) => {
    if (legend === 'co2flow') return 'kton CO2'
    return unit
  }

  // Build TSV data
  let tsvData = `Node Flow Analysis\n`
  tsvData += `Node Title\t${nodeTitle}\n`
  tsvData += `Node ID\t${node.id}\n`
  tsvData += `Energy Unit\t${unit}\n`
  tsvData += `Export Date\t${new Date().toISOString().slice(0, 10)}\n`
  tsvData += `\n`
  tsvData += `INCOMING FLOWS\n`
  tsvData += `Source\tSource ID\tCarrier\tValue\tUnit\n`

  // Add incoming flows
  incomingData.forEach(d => {
    tsvData += `${d.sourceTitle}\t${d.source}\t${d.legend}\t${convertValue(d.value, d.legend)}\t${getFlowUnit(d.legend)}\n`
  })

  // Add incoming total
  const incomingTotal = incomingData.reduce((sum, d) => sum + convertValue(d.value, d.legend), 0)
  tsvData += `TOTAL\t\t\t${incomingTotal}\t${unit}\n`

  // Add outgoing flows
  tsvData += `\n`
  tsvData += `OUTGOING FLOWS\n`
  tsvData += `Target\tTarget ID\tCarrier\tValue\tUnit\n`

  outgoingData.forEach(d => {
    tsvData += `${d.targetTitle}\t${d.target}\t${d.legend}\t${convertValue(d.value, d.legend)}\t${getFlowUnit(d.legend)}\n`
  })

  // Add outgoing total
  const outgoingTotal = outgoingData.reduce((sum, d) => sum + convertValue(d.value, d.legend), 0)
  tsvData += `TOTAL\t\t\t${outgoingTotal}\t${unit}\n`

  // Copy to clipboard
  navigator.clipboard.writeText(tsvData).then(() => {
    console.log('Data copied to clipboard')
  }).catch(err => {
    console.error('Failed to copy:', err)
  })
}

/**
 * Export node flow data to XLSX (single sheet)
 */
function exportNodeFlowData(node, incomingData, outgoingData, unit) {
  const nodeTitle = node['title.system'] || node.title || node.id

  // Unit conversion helper
  const pjToTWh = 3.6
  const convertValue = (value, legend) => {
    let converted = value
    if (legend === 'co2flow') {
      converted = value * (typeof globalCO2flowScale !== 'undefined' ? globalCO2flowScale : 1)
    } else if (unit === 'TWh') {
      converted = value / pjToTWh
    }
    return Math.round(converted) // Round to 0 decimals
  }

  const getFlowUnit = (legend) => {
    if (legend === 'co2flow') return 'kton CO2'
    return unit
  }

  // Create workbook
  const wb = XLSX.utils.book_new()

  // Build single sheet with all data
  const sheetData = [
    ['Node Flow Analysis'],
    ['Node Title', nodeTitle],
    ['Node ID', node.id],
    ['Energy Unit', unit],
    ['Export Date', new Date().toISOString().slice(0, 10)],
    [],
    ['INCOMING FLOWS'],
    ['Source', 'Source ID', 'Carrier', 'Value', 'Unit']
  ]

  // Add incoming flows
  incomingData.forEach(d => {
    sheetData.push([
      d.sourceTitle,
      d.source,
      d.legend,
      convertValue(d.value, d.legend),
      getFlowUnit(d.legend)
    ])
  })

  // Add incoming total
  const incomingTotal = incomingData.reduce((sum, d) => sum + convertValue(d.value, d.legend), 0)
  sheetData.push(['TOTAL', '', '', incomingTotal, unit])

  // Add spacing and outgoing flows header
  sheetData.push([])
  sheetData.push(['OUTGOING FLOWS'])
  sheetData.push(['Target', 'Target ID', 'Carrier', 'Value', 'Unit'])

  // Add outgoing flows
  outgoingData.forEach(d => {
    sheetData.push([
      d.targetTitle,
      d.target,
      d.legend,
      convertValue(d.value, d.legend),
      getFlowUnit(d.legend)
    ])
  })

  // Add outgoing total
  const outgoingTotal = outgoingData.reduce((sum, d) => sum + convertValue(d.value, d.legend), 0)
  sheetData.push(['TOTAL', '', '', outgoingTotal, unit])

  // Create worksheet from array of arrays
  const ws = XLSX.utils.aoa_to_sheet(sheetData)
  XLSX.utils.book_append_sheet(wb, ws, 'Node Flows')

  // Generate filename
  const safeTitle = nodeTitle.replace(/[^a-z0-9]/gi, '_')
  const filename = `node_flows_${safeTitle}_${new Date().toISOString().slice(0, 10)}.xlsx`

  // Save file
  XLSX.writeFile(wb, filename)
}

/**
 * Helper: Format value with appropriate precision (0 decimals)
 */
function formatValue(value) {
  return d3.format(',.0f')(value)
}

/**
 * Helper: Truncate text with ellipsis
 */
function truncateText(text, maxLength) {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength - 2) + '...'
}

// Make functions globally available
window.drawNodeFlowPopup = drawNodeFlowPopup
window.closeNodePopup = closeNodePopup
window.exportNodeFlowData = exportNodeFlowData
window.copyNodeFlowDataToClipboard = copyNodeFlowDataToClipboard
window.getNodeMappingInfo = getNodeMappingInfo
window.loadMappingData = loadMappingData

// Also expose as nodeVisualisatieSingular for backward compatibility with existing click handlers
window.nodeVisualisatieSingular = function(config, node, sankeyData, scenarios, targetDIV) {
  if (!node || !sankeyData) {
    return
  }
  drawNodeFlowPopup(node, sankeyData, config)
}
