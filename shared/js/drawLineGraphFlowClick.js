// Generic Line Graph Flow Click Module
// Loads configuration from viewer-config.json

let globalVisibleScenarios
var globalPopupData = null
var globalPopupConfig = null

function closePopup() {
  d3.select('#nodeInfoPopup').remove()
  const container = d3.select('#popupContainer')
  container.on('click', null)
  container
    .style('background-color', 'rgba(0,0,0,0)')
    .style('pointer-events', 'none')
  document.body.style.overflow = 'auto'
  globalPopupData = null
  globalPopupConfig = null
}

function drawBarGraph(data, config) {
  globalPopupData = data
  globalPopupConfig = config
  console.log(config, data)

  // Get config from viewerConfig (loaded by drawSelectionButtons.js)
  const lineGraphConfig = viewerConfig?.lineGraphFlow || {}
  const popupWidth = lineGraphConfig.popupWidth || 1100
  const popupHeight = lineGraphConfig.popupHeight || 800
  const varianten = lineGraphConfig.varianten || []
  const variantTitles = lineGraphConfig.variantTitles || {}
  const categoryInfo = lineGraphConfig.categoryInfo || {}

  /* ----------  POP-UP SHELL  ---------- */
  d3.select('#popupContainer')
    .style('background-color', 'rgba(0,0,0,0.3)')
    .style('pointer-events', 'auto')
    .on('click', closePopup)

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
    .style('pointer-events', 'auto')
    .attr('id', 'flowAnalysisPopup')
    .style('position', 'absolute')
    .style('box-shadow', '0 4px 10px rgba(0,0,0,0.2)')
    .style('border-radius', '10px')
    .style('width', `${popupWidth}px`)
    .style('height', `${popupHeight}px`)
    .style('background-color', '#f9f9f9')

  const svg = popup.append('svg')
    .style('position', 'absolute')
    .style('width', '100%')
    .style('height', '100%')
    .attr('id', 'flowAnalysisSVG_main')

  const canvas = svg.append('g')

  /* ----------  HEADER & FRAME  ---------- */
  const sourceNode = nodesGlobal.find(n => n.id === data.source) || {title: 'Unknown source'}
  const targetNode = nodesGlobal.find(n => n.id === data.target) || {title: 'Unknown target'}

  // Calculate available width for title (leave space for export button)
  const EXPORT_BUTTON_SPACE = 350  // Space reserved for export button + margin
  const titleMaxWidth = popupWidth - 50 - EXPORT_BUTTON_SPACE

  // Main title - matching node popup style
  canvas.append('text')
    .attr('x', 50)
    .attr('y', 40)
    .style('font-size', '18px')
    .style('font-weight', 600)
    .style('max-width', `${titleMaxWidth}px`)
    .text(`Flow: ${sourceNode['title.system']} → ${targetNode['title.system']} (${data.legend === 'co2flow' ? 'kton CO2' : (currentUnit === 'TWh' ? 'TWh' : 'PJ')})`)
    .each(function() {
      // Truncate text if it's too long
      const textElement = d3.select(this)
      const textNode = this
      let textContent = textNode.textContent

      // Check if text is too wide
      while (textNode.getComputedTextLength() > titleMaxWidth && textContent.length > 10) {
        textContent = textContent.slice(0, -4) + '...'
        textNode.textContent = textContent
      }
    })

  // Subtitle line 1 - source and target node IDs
  canvas.append('text')
    .attr('x', 50)
    .attr('y', 62)
    .style('font-size', '12px')
    .style('fill', '#666')
    .text(`source node: ${data.source} | target node: ${data.target}`)

  // Subtitle line 2 - flow type
  canvas.append('text')
    .attr('x', 50)
    .attr('y', 80)
    .style('font-size', '12px')
    .style('fill', '#666')
    .text(`type: ${data.legend}`)

  /* ----------  CLOSE BUTTON  ---------- */
  const CLOSE_SIZE = 30
  const CLOSE_X = popupWidth - 50
  const CLOSE_Y = 25

  const closeGroup = canvas.append('g')
    .attr('class', 'close-btn')
    .attr('transform', `translate(${CLOSE_X}, ${CLOSE_Y})`)
    .style('cursor', 'pointer')
    .on('click', closePopup)

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
  const EXPORT_X = popupWidth - 530  // Position to the left, with space for copy button
  const EXPORT_Y = 50

  const exportGroup = canvas.append('g')
    .attr('class', 'export-btn')
    .attr('transform', `translate(${EXPORT_X}, ${EXPORT_Y})`)
    .style('cursor', 'pointer')
    .on('click', function() {
      // Prepare data for export
      const sourceNode = nodesGlobal.find(n => n.id === data.source) || {'title.system': 'Unknown source'}
      const targetNode = nodesGlobal.find(n => n.id === data.target) || {'title.system': 'Unknown target'}
      const flowTitle = `${sourceNode['title.system']}_to_${targetNode['title.system']}`
      const exportUnit = (typeof currentUnit !== 'undefined' && currentUnit === 'TWh') ? 'TWh' : 'PJ'

      // Get getValue function
      const pjToTWh = 3.6
      const getExportValue = (value) => {
        if (data.legend === 'co2flow') {
          return value * globalCO2flowScale
        }
        if (exportUnit === 'TWh') {
          return value / pjToTWh
        }
        return value
      }

      // Extract all scenario data from the data object
      const exportData = []

      // Find all available years from data keys
      const availableYears = [...new Set(
        Object.keys(data)
          .filter(k => k.includes('scenario') && k.includes('x') && k.includes('x'))
          .map(k => {
            const match = k.match(/x(\d{4})x/)
            return match ? match[1] : null
          })
          .filter(year => year !== null)
      )].sort()

      // Extract data for each year and scenario
      availableYears.forEach(year => {
        Object.keys(data).forEach(key => {
          if (key.includes(`x${year}x`) && key.includes('scenario')) {
            // Extract scenario name from key (e.g., "scenario_x2030x_TNOAT2024_ADAPT" -> "TNOAT2024_ADAPT")
            const parts = key.split('_')
            const scenarioName = parts.slice(2).join('_')

            exportData.push({
              year: year,
              value: getExportValue(data[key]),
              scenario: scenarioName
            })
          }
        })
      })

      // Call export function
      if (typeof window.exportLinegraphToXLSX === 'function') {
        window.exportLinegraphToXLSX({
          nodeTitle: flowTitle,
          sourceNode: sourceNode['title.system'],
          targetNode: targetNode['title.system'],
          flowType: data.legend,
          scenario: 'all_scenarios',
          data: exportData,
          unit: exportUnit
        })
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
  const COPY_X = popupWidth - 390  // To the right of export button, left of toggle
  const COPY_Y = 50

  const copyGroup = canvas.append('g')
    .attr('class', 'copy-btn')
    .attr('transform', `translate(${COPY_X}, ${COPY_Y})`)
    .style('cursor', 'pointer')
    .on('click', function() {
      // Prepare data for clipboard (same as export)
      const sourceNode = nodesGlobal.find(n => n.id === data.source) || {'title.system': 'Unknown source'}
      const targetNode = nodesGlobal.find(n => n.id === data.target) || {'title.system': 'Unknown target'}
      const flowTitle = `${sourceNode['title.system']}_to_${targetNode['title.system']}`
      const exportUnit = (typeof currentUnit !== 'undefined' && currentUnit === 'TWh') ? 'TWh' : 'PJ'

      // Get getValue function
      const pjToTWh = 3.6
      const getExportValue = (value) => {
        if (data.legend === 'co2flow') {
          return value * globalCO2flowScale
        }
        if (exportUnit === 'TWh') {
          return value / pjToTWh
        }
        return value
      }

      // Extract all scenario data from the data object
      const exportData = []

      // Find all available years from data keys
      const availableYears = [...new Set(
        Object.keys(data)
          .filter(k => k.includes('scenario') && k.includes('x') && k.includes('x'))
          .map(k => {
            const match = k.match(/x(\d{4})x/)
            return match ? match[1] : null
          })
          .filter(year => year !== null)
      )].sort()

      // Extract data for each year and scenario
      availableYears.forEach(year => {
        Object.keys(data).forEach(key => {
          if (key.includes(`x${year}x`) && key.includes('scenario')) {
            // Extract scenario name from key
            const parts = key.split('_')
            const scenarioName = parts.slice(2).join('_')

            exportData.push({
              year: year,
              value: getExportValue(data[key]),
              scenario: scenarioName
            })
          }
        })
      })

      // Call copy function
      if (typeof window.copyLinegraphToClipboard === 'function') {
        window.copyLinegraphToClipboard({
          nodeTitle: flowTitle,
          sourceNode: sourceNode['title.system'],
          targetNode: targetNode['title.system'],
          flowType: data.legend,
          scenario: 'all_scenarios',
          data: exportData,
          unit: exportUnit
        })
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

  /* ----------  CONSTANTS  ---------- */
  const graphWidth = 900
  const graphHeight = 330
  const shiftX = 100  // Left margin with padding
  const graphTop = 120  // Top spacing below header
  const graphBottom = graphTop + graphHeight

  /* ----------  DATA WRANGLING  ---------- */
  const pjToTWh = 3.6
  const unit = (typeof currentUnit !== 'undefined' && currentUnit === 'TWh') ? 'TWh' : 'PJ'

  const getValue = (value) => {
    if (data.legend === 'co2flow') {
      return value * globalCO2flowScale
    }
    if (unit === 'TWh') {
      return value / pjToTWh
    }
    return value
  }

  const determineMaxValue = Object.entries(data)
    .filter(([k]) => k.includes('scenario'))

  const co2Scale = v => data.legend !== 'co2flow' ? v : v * globalCO2flowScale

  const yearData = y => Object.entries(data)
    .filter(([k]) => k.includes('scenario') && k.includes('x' + y + 'x'))
    .map(([k, v]) => [k, getValue(v)])

  // Dynamically determine available years from the data
  const availableYears = [...new Set(
    Object.keys(data)
      .filter(k => k.includes('scenario') && k.includes('x') && k.includes('x'))
      .map(k => {
        const match = k.match(/x(\d{4})x/)
        return match ? parseInt(match[1]) : null
      })
      .filter(year => year !== null)
  )].sort((a, b) => a - b)

  // Create a mapping from scenario titles to their data across all years
  const scenarioDataMap = {}

  const graphScenarios = window.currentDiagramScenarios || (config && config.scenarios)
  if (graphScenarios) {
    graphScenarios.forEach((scenarioConfig, scenarioIndex) => {
      const scenarioTitle = scenarioConfig.title
      scenarioDataMap[scenarioTitle] = {}

      availableYears.forEach(year => {
        const yearScenarios = yearData(year)
        const matchingScenario = yearScenarios.find(([key, value]) => key.includes(scenarioTitle))

        if (matchingScenario) {
          scenarioDataMap[scenarioTitle][year] = matchingScenario[1]
        }
      })
    })
  }

  /* ----------  DRAW LINE GRAPH  ---------- */
  const years = availableYears

  // Create displayNameToDataMap by directly using viewer scenarios
  const displayNameToDataMap = {}

  // Use viewerConfig.scenarios to map scenario IDs to their data
  if (viewerConfig && viewerConfig.scenarios) {
    viewerConfig.scenarios.forEach((scenario) => {
      const scenarioId = scenario.id

      // Check if this scenario ID is in the varianten list
      if (!varianten.includes(scenarioId)) {
        return
      }

      // Initialize the display name entry
      if (!displayNameToDataMap[scenarioId]) {
        displayNameToDataMap[scenarioId] = {}
      }

      // For each year, find the matching data in scenarioDataMap
      availableYears.forEach(year => {
        // Look for data keys that match this scenario and year
        // Data keys are like "scenario_x2030x_TNOAT2024_TRANSFORM_CI"
        const yearScenarios = yearData(year)
        const matchingScenario = yearScenarios.find(([key, value]) => {
          // Extract scenario name from key: "scenario_x2030x_TNOAT2024_TRANSFORM_CI" -> "TNOAT2024_TRANSFORM_CI"
          const parts = key.split('_')
          const scenarioName = parts.slice(2).join('_')
          return scenarioName === scenarioId
        })

        if (matchingScenario) {
          displayNameToDataMap[scenarioId][year] = matchingScenario[1]
        }
      })
    })
  }

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

  const symbols = [
    d3.symbolCircle, d3.symbolCross, d3.symbolDiamond, d3.symbolSquare,
    d3.symbolStar, d3.symbolTriangle, d3.symbolWye
  ]

  const scenarioSymbols = {}
  varianten.forEach((scenario, i) => {
    scenarioSymbols[scenario] = symbols[i % symbols.length]
  })

  if (globalVisibleScenarios === undefined) {
    globalVisibleScenarios = new Set(varianten)
  }

  // Year range filter state
  const allYears = availableYears

  // Check if CBS diagram (variant4) is selected - if so, show all years
  const isCBSDiagram = window.activeDiagramId === 'variant4'

  // Default: show all years for CBS diagram, only 2025+ for other diagrams
  let showAllYears = isCBSDiagram
  let filteredYears = showAllYears ? allYears : allYears.filter(y => y >= 2025)

  // x-scale for years (will be updated when year filter changes)
  const x = d3.scalePoint()
    .domain(filteredYears)
    .range([shiftX, shiftX + graphWidth])

  // y-scale for values
  const y = d3.scaleLinear()
    .domain([0, d3.max(determineMaxValue, ([, v]) => getValue(v))])
    .range([graphBottom, graphTop])

  // line generator
  const line = d3.line()
    .x(d => x(d.year))
    .y(d => y(d.value))

  canvas.selectAll('.domain').remove()

  // Add filter for drop shadow
  const defs = svg.append('defs')

  const filter = defs.append('filter')
    .attr('id', 'tooltip-shadow')
    .attr('x', '-50%').attr('y', '-50%')
    .attr('width', '200%').attr('height', '200%')
  filter.append('feGaussianBlur')
    .attr('in', 'SourceAlpha').attr('stdDeviation', 2).attr('result', 'blur')
  filter.append('feOffset')
    .attr('in', 'blur').attr('dx', 0).attr('dy', 1).attr('result', 'offsetBlur')
  const feMerge = filter.append('feMerge')
  feMerge.append('feMergeNode').attr('in', 'offsetBlur')
  feMerge.append('feMergeNode').attr('in', 'SourceGraphic')

  // Tooltip
  const tooltip = canvas.append('g')
    .attr('class', 'chart-tooltip')
    .style('display', 'none')
    .attr('filter', 'url(#tooltip-shadow)')

  tooltip.append('rect')
    .attr('rx', 5).attr('ry', 5)
    .attr('fill', '#f9f9f9')
    .attr('stroke', '#ccc')

  tooltip.append('path')
    .attr('class', 'tooltip-pointer')

  tooltip.append('text')
    .attr('fill', '#333')
    .style('font-size', '12px')
    .attr('text-anchor', 'middle')

  function updateGraph() {
    canvas.selectAll('.scenario-line').remove()
    canvas.selectAll('.scenario-dot').remove()
    canvas.selectAll('.hover-label').remove()

    varianten.forEach((scenarioName) => {
      if (!globalVisibleScenarios.has(scenarioName)) {
        return
      }

      // Skip scenarios with all zero values (if function is available)
      if (typeof scenariosWithZeroValues !== 'undefined' && scenariosWithZeroValues.has(scenarioName)) {
        console.log(`Skipping ${scenarioName} - all values are zero`)
        return
      }

      const scenarioDataForYears = displayNameToDataMap[scenarioName]

      if (!scenarioDataForYears) {
        console.log(`No data available for ${scenarioName}, skipping`)
        return
      }

      const color = scenarioColors[scenarioName]

      // Create data points only for years that have data (this connects points properly)
      const scenarioData = filteredYears
        .filter(year => scenarioDataForYears[year] !== undefined && scenarioDataForYears[year] !== null)
        .map((year) => ({year: year, value: getValue(scenarioDataForYears[year])}))

      if (scenarioData.length === 0) {
        console.log(`No valid data points for ${scenarioName}, skipping`)
        return
      }

      // Draw line connecting only the points that have data
      canvas.append('path')
        .datum(scenarioData)
        .attr('class', 'scenario-line')
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('d', line)

      const symbolGenerator = d3.symbol().type(scenarioSymbols[scenarioName]).size(64)
      scenarioData.forEach((d, i) => {
        canvas.append('path')
          .attr('d', symbolGenerator())
          .attr('class', 'scenario-dot')
          .attr('transform', `translate(${x(d.year)}, ${y(d.value)})`)
          .attr('fill', color)
          .on('mouseover', function(event) {
            tooltip.raise().style('display', 'block')

            const scenarioTitle = variantTitles[scenarioName] || scenarioName
            const valueText = `${d.year}: ${d3.format('.2f')(d.value)} ${unit}`
            const textEl = tooltip.select('text')

            textEl.selectAll('tspan').remove()

            textEl.append('tspan')
              .attr('x', 0)
              .attr('dy', '1.2em')
              .style('font-weight', 'bold')
              .text(scenarioTitle)

            textEl.append('tspan')
              .attr('x', 0)
              .attr('dy', '1.4em')
              .text(valueText)

            const padding = 10
            const textBBox = textEl.node().getBBox()

            const tooltipWidth = textBBox.width + padding * 2
            const tooltipHeight = textBBox.height + padding * 2

            tooltip.select('rect')
              .attr('x', 0)
              .attr('y', 0)
              .attr('width', tooltipWidth)
              .attr('height', tooltipHeight)

            textEl.attr('transform', `translate(${tooltipWidth / 2}, ${padding - textBBox.y})`)

            const pointerSize = 8
            const xPos = x(d.year)
            const yPos = y(d.value)

            let tooltipX = xPos - (tooltipWidth / 2)
            let tooltipY = yPos - tooltipHeight - pointerSize - 5

            let pointerPath

            if (tooltipY < graphTop) {
              tooltipY = yPos + pointerSize + 10
            }

            if (tooltipX < shiftX) {
              tooltipX = shiftX
            }
            if (tooltipX + tooltipWidth > shiftX + graphWidth) {
              tooltipX = shiftX + graphWidth - tooltipWidth
            }

            const pointerX = xPos - tooltipX

            if (tooltipY > yPos) {
              pointerPath = `M${pointerX - pointerSize},0 L${pointerX},-${pointerSize} L${pointerX + pointerSize},0 Z`
            } else {
              pointerPath = `M${pointerX - pointerSize},${tooltipHeight} L${pointerX},${tooltipHeight + pointerSize} L${pointerX + pointerSize},${tooltipHeight} Z`
            }

            tooltip.select('.tooltip-pointer')
              .attr('d', pointerPath)
              .attr('fill', '#f9f9f9')

            tooltip.attr('transform', `translate(${tooltipX}, ${tooltipY})`)
          })
          .on('mouseout', function() {
            tooltip.style('display', 'none')
          })
      })
    })
  }

  // Add legend
  const legend = canvas.append('g')
    .attr('transform', `translate(${shiftX}, ${graphBottom + 70})`)

  legend.append('text')
    .attr('x', 0)
    .attr('y', -20)
    .style('font-size', '14px')
    .style('font-weight', 'bold')
    .text('Scenarios')

  // Select All button (positioned to the right of "Scenarios" text)
  const selectAllBtn = legend.append('g')
    .attr('transform', 'translate(110, -32)')
    .style('cursor', 'pointer')
    .on('click', function() {
      globalVisibleScenarios = new Set(varianten)
      updateGraph()
      updateLegend()
    })

  selectAllBtn.append('rect')
    .attr('width', 70)
    .attr('height', 22)
    .attr('rx', 3)
    .attr('fill', '#f5f5f5')
    .attr('stroke', '#ccc')
    .attr('stroke-width', 1)
    .on('mouseover', function() { d3.select(this).attr('fill', '#e8e8e8') })
    .on('mouseout', function() { d3.select(this).attr('fill', '#f5f5f5') })

  selectAllBtn.append('text')
    .attr('x', 35)
    .attr('y', 15)
    .attr('text-anchor', 'middle')
    .style('font-size', '11px')
    .style('fill', '#444')
    .style('pointer-events', 'none')
    .text('Select All')

  // Deselect All button
  const deselectAllBtn = legend.append('g')
    .attr('transform', 'translate(188, -32)')
    .style('cursor', 'pointer')
    .on('click', function() {
      globalVisibleScenarios = new Set()
      updateGraph()
      updateLegend()
    })

  deselectAllBtn.append('rect')
    .attr('width', 80)
    .attr('height', 22)
    .attr('rx', 3)
    .attr('fill', '#f5f5f5')
    .attr('stroke', '#ccc')
    .attr('stroke-width', 1)
    .on('mouseover', function() { d3.select(this).attr('fill', '#e8e8e8') })
    .on('mouseout', function() { d3.select(this).attr('fill', '#f5f5f5') })

  deselectAllBtn.append('text')
    .attr('x', 40)
    .attr('y', 15)
    .attr('text-anchor', 'middle')
    .style('font-size', '11px')
    .style('fill', '#444')
    .style('pointer-events', 'none')
    .text('Deselect All')

  // Year range toggle button
  const yearToggleBtn = legend.append('g')
    .attr('transform', 'translate(276, -32)')
    .style('cursor', 'pointer')
    .on('click', function() {
      showAllYears = !showAllYears
      filteredYears = showAllYears ? allYears : allYears.filter(y => y >= 2025)

      // Update x-scale domain
      x.domain(filteredYears)

      // Update button text
      yearToggleBtn.select('text').text(showAllYears ? 'Hide ≤2024' : 'Show All Years')

      // Redraw x-axis
      canvas.selectAll('.x-axis').remove()
      canvas.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0, ${graphBottom})`)
        .call(d3.axisBottom(x).tickFormat(d3.format('d')).tickSize(0).tickPadding(10))
        .style('font-size', '13px')
        .select('.domain').remove()

      // Redraw vertical gridlines
      canvas.selectAll('.grid').remove()
      const verticalGrid = canvas.append('g')
        .attr('class', 'grid')
        .attr('transform', `translate(0, ${graphBottom})`)
        .call(d3.axisBottom(x)
          .tickSize(-graphHeight)
          .tickFormat(''))
      verticalGrid.selectAll('line')
        .style('stroke', '#cccccc')
        .style('stroke-dasharray', '2 2')
      verticalGrid.lower()
      canvas.select('.grid-bands').lower()

      updateGraph()
    })

  yearToggleBtn.append('rect')
    .attr('width', 100)
    .attr('height', 22)
    .attr('rx', 3)
    .attr('fill', '#f5f5f5')
    .attr('stroke', '#ccc')
    .attr('stroke-width', 1)
    .on('mouseover', function() { d3.select(this).attr('fill', '#e8e8e8') })
    .on('mouseout', function() { d3.select(this).attr('fill', '#f5f5f5') })

  yearToggleBtn.append('text')
    .attr('x', 50)
    .attr('y', 15)
    .attr('text-anchor', 'middle')
    .style('font-size', '11px')
    .style('fill', '#444')
    .style('pointer-events', 'none')
    .text(showAllYears ? 'Hide ≤2024' : 'Show All Years')

  function updateLegend() {
    legend.selectAll('.legend-item')
      .each(function(d) {
        const item = d3.select(this)
        const isVisible = globalVisibleScenarios.has(d)
        item.select('.checkmark-box')
          .attr('fill', isVisible ? scenarioColors[d] : '#fff')
        item.select('.checkmark')
          .style('display', isVisible ? 'inline' : 'none')
        item.style('opacity', isVisible ? 1 : 0.6)
      })
  }

  const itemsPerColumn = Math.ceil(varianten.length / 3)
  const columnWidth = 320
  const itemHeight = 25

  const legendItems = legend.selectAll('.legend-item')
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
      if (globalVisibleScenarios.has(d)) {
        globalVisibleScenarios.delete(d)
      } else {
        globalVisibleScenarios.add(d)
      }
      updateGraph()
      updateLegend()
    })

  legendItems.append('rect')
    .attr('class', 'checkmark-box')
    .attr('width', 14)
    .attr('height', 14)
    .attr('rx', 3)
    .attr('ry', 3)
    .attr('fill', '#fff')
    .attr('stroke', d => scenarioColors[d])
    .attr('stroke-width', 1.5)

  legendItems.append('text')
    .attr('class', 'checkmark')
    .attr('x', 2)
    .attr('y', 11)
    .style('font-size', '12px')
    .style('user-select', 'none')
    .style('fill', '#fff')
    .style('pointer-events', 'none')
    .text('✔')

  legendItems.append('path')
    .attr('d', d => d3.symbol().type(scenarioSymbols[d]).size(64)())
    .attr('transform', `translate(28, 7)`)
    .attr('fill', d => scenarioColors[d])
    .style('pointer-events', 'none')

  legendItems.append('text')
    .attr('x', 45)
    .attr('y', 12)
    .style('font-size', '11px')
    .text(d => variantTitles[d] || d)
    .style('pointer-events', 'none')

  updateGraph()
  updateLegend()

  // x-axis
  canvas.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0, ${graphBottom})`)
    .call(d3.axisBottom(x).tickFormat(d3.format('d')).tickSize(0).tickPadding(10))
    .style('font-size', '13px')
    .select('.domain').remove()

  // y-axis
  canvas.append('g')
    .attr('transform', `translate(${shiftX}, 0)`)
    .call(d3.axisLeft(y).ticks(10).tickSize(0).tickPadding(10))
    .style('font-size', '13px')
    .select('.domain').remove()

  // Y-axis title
  canvas.append('text')
    .attr('transform', `translate(${shiftX - 60}, ${(graphBottom + graphTop) / 2}) rotate(-90)`)
    .style('text-anchor', 'middle')
    .style('font-size', '13px')
    .text(data.legend === 'co2flow' ? 'kton CO2/jaar' : (unit === 'TWh' ? 'TWh/jaar' : 'PJ/jaar'))

  // Add horizontal bands
  const yTicks = y.ticks(10)
  const bandGroup = canvas.append('g')
    .attr('class', 'grid-bands')
  bandGroup.selectAll('rect')
    .data(d3.range(0, yTicks.length - 1, 2))
    .enter()
    .append('rect')
    .attr('x', shiftX)
    .attr('y', i => y(yTicks[i + 1]))
    .attr('width', graphWidth)
    .attr('height', i => y(yTicks[i]) - y(yTicks[i + 1]))
    .style('fill', '#f0f0f0')

  // Add vertical gridlines
  const verticalGrid = canvas.append('g')
    .attr('class', 'grid')
    .attr('transform', `translate(0, ${graphBottom})`)
    .call(d3.axisBottom(x)
      .tickSize(-graphHeight)
      .tickFormat(''))
  verticalGrid.selectAll('line')
    .style('stroke', '#cccccc')
    .style('stroke-dasharray', '2 2')
  verticalGrid.lower()
  bandGroup.lower()

  // Add unit toggle
  const unitToggle = canvas.append('g')
    .attr('class', 'unit-toggle-popup')
    .attr('transform', `translate(${popupWidth - 180}, 60) scale(0.9)`)
    .style('cursor', 'pointer')
    .on('click', () => {
      document.getElementById('sankeyUnitToggle').dispatchEvent(new MouseEvent('click'))
    })

  unitToggle.append('rect')
    .attr('width', 50)
    .attr('height', 25)
    .attr('rx', 12.5)
    .attr('ry', 12.5)
    .attr('fill', '#fff')
    .attr('stroke', '#ccc')

  unitToggle.append('circle')
    .attr('cx', currentUnit === 'PJ' ? 13 : 37)
    .attr('cy', 12.5)
    .attr('r', 10)
    .attr('fill', '#444')

  unitToggle.append('text')
    .attr('x', -25)
    .attr('y', 18)
    .attr('fill', '#444')
    .style('font-size', '15px')
    .text('PJ')

  unitToggle.append('text')
    .attr('x', 60)
    .attr('y', 18)
    .attr('fill', '#444')
    .style('font-size', '15px')
    .text('TWh')

  canvas.selectAll('.bar_').remove()
  canvas.selectAll('.value-label_').remove()
  canvas.selectAll('.domain').remove()
}
