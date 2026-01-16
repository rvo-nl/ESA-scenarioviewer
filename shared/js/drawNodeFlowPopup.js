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
  let popupHeight = 850

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
    .append('div')
    .on('click', (event) => event.stopPropagation())
    .style('pointer-events', 'auto')
    .attr('id', 'nodeFlowPopupContent')
    .style('position', 'relative')
    .style('box-shadow', '0 4px 10px rgba(0,0,0,0.2)')
    .style('border-radius', '10px')
    .style('width', `${popupWidth}px`)
    .style('height', `${popupHeight}px`)
    .style('background-color', '#f9f9f9')
    .style('overflow', 'hidden')

  const svg = popup.append('svg')
    .style('position', 'absolute')
    .style('width', '100%')
    .style('height', '100%')
    .attr('id', 'nodeFlowPopupSVG')

  const canvas = svg.append('g')

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
      exportNodeFlowData(node, incomingData, outgoingData, unit)
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
      copyNodeFlowDataToClipboard(node, incomingData, outgoingData, unit)
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

  /* ----------  LAYOUT CONSTANTS  ---------- */
  // Fixed layout - mapping section is now at the bottom
  const chartTop = 120
  const chartHeight = 240
  const leftChartX = 60
  const rightChartX = popupWidth / 2 + 20
  const chartWidth = popupWidth / 2 - 80  // Ensure right table doesn't get cut off (rightChartX + chartWidth + margin = popupWidth)
  const tableTop = chartTop + chartHeight + 15
  const tableHeight = 280

  /* ----------  INCOMING FLOWS (LEFT SIDE)  ---------- */
  canvas.append('text')
    .attr('x', leftChartX)
    .attr('y', chartTop)
    .style('font-size', '13px')
    .style('font-weight', 600)
    .style('fill', '#444')
    .text(`Incoming Flows (${incomingData.length})`)

  if (incomingData.length > 0) {
    drawStackedBarChart(canvas, incomingData, leftChartX, chartTop + 20, chartWidth, chartHeight - 40, getValue, getUnit, 'incoming')
  } else {
    canvas.append('text')
      .attr('x', leftChartX + chartWidth / 2)
      .attr('y', chartTop + chartHeight / 2)
      .attr('text-anchor', 'middle')
      .style('font-size', '13px')
      .style('fill', '#999')
      .text('No incoming flows')
  }

  /* ----------  OUTGOING FLOWS (RIGHT SIDE)  ---------- */
  canvas.append('text')
    .attr('x', rightChartX)
    .attr('y', chartTop)
    .style('font-size', '13px')
    .style('font-weight', 600)
    .style('fill', '#444')
    .text(`Outgoing Flows (${outgoingData.length})`)

  if (outgoingData.length > 0) {
    drawStackedBarChart(canvas, outgoingData, rightChartX, chartTop + 20, chartWidth, chartHeight - 40, getValue, getUnit, 'outgoing')
  } else {
    canvas.append('text')
      .attr('x', rightChartX + chartWidth / 2)
      .attr('y', chartTop + chartHeight / 2)
      .attr('text-anchor', 'middle')
      .style('font-size', '13px')
      .style('fill', '#999')
      .text('No outgoing flows')
  }

  /* ----------  TABLES  ---------- */
  // Incoming table (left)
  canvas.append('text')
    .attr('x', leftChartX)
    .attr('y', tableTop)
    .style('font-size', '12px')
    .style('font-weight', 600)
    .style('fill', '#444')
    .text('Incoming Flow Details')

  drawFlowTable(popup, incomingData, leftChartX, tableTop + 15, chartWidth, tableHeight - 30, getValue, getUnit, true)

  // Outgoing table (right)
  canvas.append('text')
    .attr('x', rightChartX)
    .attr('y', tableTop)
    .style('font-size', '12px')
    .style('font-weight', 600)
    .style('fill', '#444')
    .text('Outgoing Flow Details')

  drawFlowTable(popup, outgoingData, rightChartX, tableTop + 15, chartWidth, tableHeight - 30, getValue, getUnit, false)

  /* ----------  MAPPED ASSETS (BOTTOM)  ---------- */
  if (mappingInfo && mappingInfo.assets && mappingInfo.assets.length > 0) {
    const mappingTop = tableTop + tableHeight + 20
    const maxScrollHeight = 100

    // Add mapping info label
    canvas.append('text')
      .attr('x', 50)
      .attr('y', mappingTop)
      .style('font-size', '10px')
      .style('font-weight', 500)
      .style('fill', '#333')
      .text(`Mapped assets (${mappingInfo.modelType.toUpperCase()}, ${mappingInfo.assets.length}) (scrollable):`)

    // Display assets in a scrollable div using foreignObject
    const assetsText = mappingInfo.assets.join(', ')

    // Create scrollable container for assets using foreignObject
    const foreignObject = canvas.append('foreignObject')
      .attr('x', 50)
      .attr('y', mappingTop + 5)
      .attr('width', popupWidth - 100)
      .attr('height', maxScrollHeight)

    foreignObject.append('xhtml:div')
      .style('max-height', maxScrollHeight + 'px')
      .style('overflow-y', 'auto')
      .style('font-size', '9px')
      .style('color', '#555')
      .style('line-height', '1.4')
      .style('word-wrap', 'break-word')
      .style('padding-right', '10px')
      .text(assetsText)
  }
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
