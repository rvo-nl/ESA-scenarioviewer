let globalVisibleScenarios
var globalPopupData = null
var globalPopupConfig = null

function closePopup () {
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

function drawBarGraph (data, config) {
  globalPopupData = data
  globalPopupConfig = config
  console.log(config, data)

  /* ----------  POP‑UP SHELL  ---------- */
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
    .style('width', '1100px')
    .style('height', '720px')
    .style('background-color', '#f9f9f9')

  const svg = popup.append('svg')
    .style('position', 'absolute')
    .style('width', '100%')
    .style('height', '100%')
    .attr('id', 'flowAnalysisSVG_main')

  const canvas = svg.append('g')

  /* ----------  HEADER & FRAME  ---------- */
  // Find source and target nodes, with fallback text if undefined
  const sourceNode = nodesGlobal.find(n => n.id === data.source) || {title: 'Unknown source'}
  const targetNode = nodesGlobal.find(n => n.id === data.target) || {title: 'Unknown target'}
  canvas.append('text')
    .attr('x', 100)
    .attr('y', 50)
    .style('font-size', '14px')
    .style('font-weight', 500)
    .text(`Flow '${sourceNode['title.system']} → ${targetNode['title.system']}' (${data.legend === 'co2flow' ? 'kton CO2' : (currentUnit === 'TWh' ? 'TWh' : 'PJ')})`)

  canvas.append('text')
    .attr('x', 100)
    .attr('y', 70)
    .style('font-size', '12px')
    .style('fill', '#666')
    .html(null) // clear any text
    .append('tspan')
    .style('font-weight', '300')
    .text('source node: ')
    .append('tspan')
    .style('font-weight', '400')
    .text(data.source)
    .append('tspan')
    .style('font-weight', '300')
    .text(' | ')
    .append('tspan')
    .style('font-weight', '300')
    .text('target node: ')
    .append('tspan')
    .style('font-weight', '400')
    .text(data.target)

  canvas.append('text')
    .attr('x', 100)
    .attr('y', 90)
    .style('font-size', '12px')
    .style('fill', '#666')
    .html(null)
    .append('tspan')
    .style('font-weight', '300')
    .text('type: ')
    .append('tspan')
    .style('font-weight', '400')
    .text(data.legend)

  // canvas.append('rect')
    //   .attr('x', 30)
    //   .attr('y', 60)
    //   .attr('width', 940)
    //   .attr('height', 410)
    //   .attr('fill', '#fff')

  /* ----------  CLOSE BUTTON  ---------- */
  const CLOSE_SIZE = 30; // rectangle is 30×30
  const CLOSE_X = 1100 - 50 // your original offsets
  const CLOSE_Y = 30

  const closeGroup = canvas.append('g')
    .attr('class', 'close-btn')
    .attr('transform', `translate(${CLOSE_X}, ${CLOSE_Y})`)
    .style('cursor', 'pointer')
    .on('click', closePopup)

  /* button background */
  closeGroup.append('rect')
    .attr('width', CLOSE_SIZE)
    .attr('height', CLOSE_SIZE)
    .attr('rx', 4)
    .attr('fill', '#fff')
    .on('mouseover', function () { d3.select(this).attr('fill', '#999'); })
    .on('mouseout', function () { d3.select(this).attr('fill', '#fff'); })

  /* "X" icon (Material-icon path, 960 × 960 units)        *
   * 1️⃣ translate(-480,-480)  → move centre of icon to (0,0)
   * 2️⃣ scale(0.03125)        → 960 × 0.03125 = 30 px wide
   * 3️⃣ translate(15,15)      → centre of our 30 × 30 button */
  const ICON_PATH = 'm249 849-42-42 231-231-231-231 42-42 231 231 231-231 42 42-231 231 231 231-42 42-231-231-231 231Z'

  closeGroup.append('path')
    .attr('d', ICON_PATH)
    .attr('transform', 'translate(15,15) scale(0.03125) translate(-480,-480)')
    .attr('fill', '#666')
    .style('pointer-events', 'none') // rectangle handles the clicks

  /* ----------  CONSTANTS  ---------- */
  const graphWidth = 900
  const graphHeight = 350
  const shiftX = 100
  const graphTop = 130
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

  // Use the config.scenarios array to get the proper scenario titles and their indices
  if (config && config.scenarios) {
    config.scenarios.forEach((scenarioConfig, scenarioIndex) => {
      const scenarioTitle = scenarioConfig.title
      scenarioDataMap[scenarioTitle] = {}

      availableYears.forEach(year => {
        const yearScenarios = yearData(year)
        // Find the scenario in yearScenarios by matching the title/name, not by index
        const matchingScenario = yearScenarios.find(([key, value]) => key.includes(scenarioTitle)
        )

        if (matchingScenario) {
          scenarioDataMap[scenarioTitle][year] = matchingScenario[1]
        }
      })
    })
  }

  /* ----------  DRAW LINE GRAPH  ---------- */
  const years = availableYears

  // Keep the original hardcoded scenario names for display and color mapping
  const varianten = [
    'ADAPT', 'TRANSFORM',
    'TRANSFORM-C&Import', 'TRANSFORM-MC',
    'TRANSFORM-MC&Import', 'TVKN-PR40',
    'TVKN-SR20', 'TVKN-PB30', 'NBNL-V3KM',
    'NBNL-V3EM', 'NBNL-V3GB', 'NBNL-V3HA',
    'NBNL-V2NA', 'NBNL-V2IA', 'WLO_1', 'WLO_2', 'WLO_3', 'WLO_4'
  ]

  // Create displayNameToDataMap by collecting data from multiple year-specific entries
  const displayNameToDataMap = {}

  // First, identify all unique scenario types and their available years
  const scenarioTypes = {}

  config.scenarios.forEach((scenarioConfig, index) => {
    const dataColumnName = scenarioConfig.title.toLowerCase()

    // Extract year and scenario type
    const yearMatch = scenarioConfig.title.match(/x(\d{4})x_(.+)/)
    if (!yearMatch) return

    const year = parseInt(yearMatch[1])
    const scenarioType = yearMatch[2]

    // Determine display name for this scenario type
    let displayName = null
    if (scenarioType.includes('adapt')) displayName = 'ADAPT'
    else if (scenarioType.includes('transform_competitief_en_import')) displayName = 'TRANSFORM-C&Import'
    else if (scenarioType.includes('transform_minder_competitief_en_import')) displayName = 'TRANSFORM-MC&Import'
    else if (scenarioType.includes('transform_minder_competitief')) displayName = 'TRANSFORM-MC'
    else if (scenarioType.includes('transform')) displayName = 'TRANSFORM'
    else if (scenarioType.includes('tvkn_pr40')) displayName = 'TVKN-PR40'
    else if (scenarioType.includes('tvkn_sr20')) displayName = 'TVKN-SR20'
    else if (scenarioType.includes('tvkn_pb30')) displayName = 'TVKN-PB30'
    else if (scenarioType.includes('ii3050_v3_koersvaste_middenweg')) displayName = 'NBNL-V3KM'
    else if (scenarioType.includes('ii3050_v3_eigen_vermogen')) displayName = 'NBNL-V3EM'
    else if (scenarioType.includes('ii3050_v3_gezamenlijke_balans')) displayName = 'NBNL-V3GB'
    else if (scenarioType.includes('ii3050_v3_horizon_aanvoer')) displayName = 'NBNL-V3HA'
    else if (scenarioType.includes('ii3050_v2_nationale_drijfveren')) displayName = 'NBNL-V2NA'
    else if (scenarioType.includes('ii3050_v2_internationale_ambitie')) displayName = 'NBNL-V2IA'
    else if (scenarioType === 'WLO_1') displayName = 'WLO_1'
    else if (scenarioType === 'WLO_2') displayName = 'WLO_2'
    else if (scenarioType === 'WLO_3') displayName = 'WLO_3'
    else if (scenarioType === 'WLO_4') displayName = 'WLO_4'

    if (displayName) {
      // Initialize the display name if it doesn't exist
      if (!displayNameToDataMap[displayName]) {
        displayNameToDataMap[displayName] = {}
      }

      // Try to find the actual data key - handle case mismatches
      let actualKey = scenarioConfig.title
      let scenarioData = scenarioDataMap[actualKey]

      // If not found, try different case variations
      if (!scenarioData || Object.keys(scenarioData).length === 0) {
        // Try uppercase version for WLO scenarios
        if (scenarioConfig.title.includes('wlo_')) {
          actualKey = scenarioConfig.title.replace(/wlo_(\d+)/, 'WLO_$1')
          scenarioData = scenarioDataMap[actualKey]
        }

        // Try other case variations if still not found
        if (!scenarioData || Object.keys(scenarioData).length === 0) {
          // Look for a key that matches the pattern but with different case
          const basePattern = scenarioConfig.title.toLowerCase()
          const matchingKey = Object.keys(scenarioDataMap).find(key => key.toLowerCase() === basePattern
          )
          if (matchingKey) {
            actualKey = matchingKey
            scenarioData = scenarioDataMap[matchingKey]
          }
        }
      }

      if (scenarioData && Object.keys(scenarioData).length > 0) {
        // For this year-specific entry, get the value for this year
        // The data structure should have the year as a key
        const yearValue = scenarioData[year]
        if (yearValue !== undefined && yearValue !== null) {
          displayNameToDataMap[displayName][year] = yearValue
        }
      }
    }
  })

  const variantTitles = {
    ADAPT: 'TNO-2024 | ADAPT',
    TRANSFORM: 'TNO-2024 | TRANSFORM',
    'TRANSFORM-C&Import': 'TNO-2024 | TRANSFORM | Competitief & Import',
    'TRANSFORM-MC': 'TNO-2024 | TRANSFORM | Competitief',
    'TRANSFORM-MC&Import': 'TNO-2024 | TRANSFORM | Minder Competitief & Import',
    'TVKN-PR40': 'PBL-2024 | TVKN | Pragmatisch Ruim 40',
    'TVKN-SR20': 'PBL-2024 | TVKN | Specifiek Ruim 20',
    'TVKN-PB30': 'PBL-2024 | TVKN | Pragmatisch Beperkt 30',
    'NBNL-V3KM': 'NBNL-2025 | II3050 v3 | Koersvaste Middenweg',
    'NBNL-V3EM': 'NBNL-2025 | II3050 v3 | Eigen Vermogen',
    'NBNL-V3GB': 'NBNL-2025 | II3050 v3 | Gezamenlijke Balans',
    'NBNL-V3HA': 'NBNL-2025 | II3050 v3 | Horizon Aanvoer',
    'NBNL-V2NA': 'NBNL-2023 | II3050 v2 | Nationale Drijfveren',
    'NBNL-V2IA': 'NBNL-2023 | II3050 v2 | Internationale Ambitie',
    'WLO_1': 'PBL-2025 | WLO | Hoog Snel',
    'WLO_2': 'PBL-2025 | WLO | Laag Snel',
    'WLO_3': 'PBL-2025 | WLO | Hoog Vertraagd',
    'WLO_4': 'PBL-2025 | WLO | Laag Vertraagd'
  }

  const categoryInfo = {
    'ADAPT/TRANSFORM': {
      baseColor: '#1f78b4', // blue
      scenarios: ['ADAPT', 'TRANSFORM', 'TRANSFORM-C&Import', 'TRANSFORM-MC', 'TRANSFORM-MC&Import']
    },
    TVKN: {
      baseColor: '#33a02c', // green
      scenarios: ['TVKN-PR40', 'TVKN-SR20', 'TVKN-PB30']
    },
    NBNL: {
      baseColor: '#ff7f00', // orange
      scenarios: ['NBNL-V3KM', 'NBNL-V3EM', 'NBNL-V3GB', 'NBNL-V3HA', 'NBNL-V2NA', 'NBNL-V2IA']
    },
    WLO: {
      baseColor: '#e31a1c', // red
      scenarios: ['WLO_1', 'WLO_2', 'WLO_3', 'WLO_4']
    }
  }

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
    globalVisibleScenarios = new Set(varianten) // All scenarios visible by default
  }

  // x-scale for years
  const x = d3.scalePoint()
    .domain(years)
    .range([shiftX, shiftX + graphWidth])

  // y-scale for values
  const y = d3.scaleLinear()
    .domain([0, d3.max(determineMaxValue, ([, v]) => getValue(v))])
    .range([graphBottom, graphTop])

  // line generator
  const line = d3.line()
    .x(d => x(d.year))
    .y(d => y(d.value))

  /* remove axis domain strokes */
  canvas.selectAll('.domain').remove()

  // Add a filter for the drop shadow
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

  function updateGraph () {
    // Clear existing lines and dots
    canvas.selectAll('.scenario-line').remove()
    canvas.selectAll('.scenario-dot').remove()
    canvas.selectAll('.hover-label').remove()

    // draw lines and dots for each scenario
    varianten.forEach((scenarioName) => {

      if (!globalVisibleScenarios.has(scenarioName)) {
        return
      }

      const scenarioDataForYears = displayNameToDataMap[scenarioName]

      const color = scenarioColors[scenarioName]

      // Build data points for this scenario across all available years
      const scenarioData = years.map((year) => {
        const yearValue = scenarioDataForYears[year]
        if (yearValue !== undefined && yearValue !== null) {
          return {year: year, value: yearValue, original: {year: year, value: yearValue}}
        }
        return null
      }).filter(d => d !== null) // Only include points with valid data

      if (scenarioData.length === 0) {
        console.log(`No valid data points for ${scenarioName}, skipping`)
        return // Skip scenarios with no data
      }

      // Draw line
      canvas.append('path')
        .datum(scenarioData)
        .attr('class', 'scenario-line')
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('d', line)

      // Draw dots
      const symbolGenerator = d3.symbol().type(scenarioSymbols[scenarioName]).size(64)
      scenarioData.forEach((d, i) => {
        canvas.append('path')
          .attr('d', symbolGenerator())
          .attr('class', 'scenario-dot')
          .attr('transform', `translate(${x(d.year)}, ${y(d.value)})`)
          .attr('fill', color)
          .on('mouseover', function (event) { // d is from closure
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

            // Vertically and horizontally center the text block
            textEl.attr('transform', `translate(${tooltipWidth / 2}, ${padding - textBBox.y})`)

            const pointerSize = 8
            const xPos = x(d.year)
            const yPos = y(d.value)

            let tooltipX = xPos - (tooltipWidth / 2)
            let tooltipY = yPos - tooltipHeight - pointerSize - 5; // 5px margin from point, above by default

            let pointerPath

            // Check top overflow
            if (tooltipY < graphTop) {
              tooltipY = yPos + pointerSize + 10 // position below point
            }

            // Check side overflows
            if (tooltipX < shiftX) {
              tooltipX = shiftX
            }
            if (tooltipX + tooltipWidth > shiftX + graphWidth) {
              tooltipX = shiftX + graphWidth - tooltipWidth
            }

            const pointerX = xPos - tooltipX; // pointer's x relative to tooltip's origin

            if (tooltipY > yPos) { // tooltip is below point, pointer points up
              pointerPath = `M${pointerX - pointerSize},0 L${pointerX},-${pointerSize} L${pointerX + pointerSize},0 Z`
            } else { // tooltip is above point, pointer points down
              pointerPath = `M${pointerX - pointerSize},${tooltipHeight} L${pointerX},${tooltipHeight + pointerSize} L${pointerX + pointerSize},${tooltipHeight} Z`
            }

            tooltip.select('.tooltip-pointer')
              .attr('d', pointerPath)
              .attr('fill', '#f9f9f9')

            tooltip.attr('transform', `translate(${tooltipX}, ${tooltipY})`)
          })
          .on('mouseout', function () {
            tooltip.style('display', 'none')
          })
      })
    })
  }

  // Add legend
  const legend = canvas.append('g')
    .attr('transform', `translate(${shiftX}, ${graphBottom + 70})`) // Position under the graph

  legend.append('text')
    .attr('x', 0)
    .attr('y', -20)
    .style('font-size', '14px')
    .style('font-weight', 'bold')
    .text('Scenarios')

  function updateLegend () {
    legend.selectAll('.legend-item')
      .each(function (d) {
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
  const columnWidth = 320 // Adjust as needed
  const itemHeight = 25

  // Add legend items
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
    .on('click', function (event, d) {
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

  // Add symbol
  legendItems.append('path')
    .attr('d', d => d3.symbol().type(scenarioSymbols[d]).size(64)())
    .attr('transform', `translate(28, 7)`)
    .attr('fill', d => scenarioColors[d])
    .style('pointer-events', 'none')

  // Add text label
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

  // Add Y-axis title
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

  // Add a unit toggle inside the popup
  const unitToggle = canvas.append('g')
    .attr('class', 'unit-toggle-popup')
    .attr('transform', `translate(${1100 - 180}, 40) scale(0.9)`)
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

  // remove old bar elements
  canvas.selectAll('.bar_').remove()
  canvas.selectAll('.value-label_').remove()
  canvas.selectAll('.domain').remove()
}
