// Global error handler for sankey-related errors
window.addEventListener('error', function(event) {
  // Skip errors that are not critical or are known issues
  const message = event.message || (event.error && event.error.message) || ''
  const ignoredErrors = [
    'duration is not defined',
    'transition is not defined'
  ]

  // Check if this is an error we should ignore
  const shouldIgnore = ignoredErrors.some(ignored => message.includes(ignored))
  if (shouldIgnore) {
    return
  }

  // Only handle errors from d3-sankey-diagram.js or related sankey code
  if (event.filename && (event.filename.includes('d3-sankey-diagram') || event.filename.includes('drawSankey'))) {
    event.preventDefault() // Prevent default console error

    if (typeof showErrorPopup === 'function') {
      showErrorPopup({
        title: 'Sankey Rendering Error',
        message: 'An error occurred while rendering the sankey diagram. This is often caused by missing or invalid node references in the data.',
        error: event.error,
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          message: event.message,
          scenario: globalActiveScenario ? globalActiveScenario.id : 'unknown',
          year: globalActiveYear ? globalActiveYear.id : 'unknown',
          filter: globalActiveEnergyflowsFilter || 'unknown'
        },
        stackTrace: event.error ? event.error.stack : null
      })
    }
  }
})

let sankeyInstances = {}
let sankeyDataObjects = {}
// let sankeyLayout
// let sankeyDiagram
let activeScenario = 0
let scaleInit = 1
let nodesGlobal
let globalScaleInit
let globalCO2flowScale
let currentK = 1
let globalActiveScenario = {}
let globalActiveYear = {}
let globalActiveWACC = {}
let globalActiveEnergyflowsSankey = {}
let globalActiveEnergyflowsFilter
let links = {}
let nodes = {}
let legend = {}
let settings = {}
let remarks = {}
let globalSankeyInstancesActiveDataset = {}
let OriginalSankeyDataObject
let currentUnit = 'PJ'

let currentScenarioID = 0

selectionButtonsHaveInitialized = false

// Track scenarios with all zero values
let scenariosWithZeroValues = new Set()

/**
 * Check if all link values are zero for a given scenario across all scopes and years
 * @param {string} scenarioId - The scenario ID to check
 * @param {Object} config - The configuration object with scenarios
 * @returns {boolean} - True if scenario has data columns (for any year) but all values are zero, false otherwise
 */
function checkScenarioHasAllZeroValues(scenarioId, config) {
  // Check if scenario has any years defined in scenarioIdLookup
  const scenarioYears = scenarioIdLookup[scenarioId]

  if (!scenarioYears || Object.keys(scenarioYears).length === 0) {
    return false // Scenario has no years defined - don't grey out
  }

  // Check all sankey data objects (different scopes) for any year's data
  let hasAnyNonZeroValue = false
  let hasAnyDataColumn = false

  // Use for...of loops instead of forEach to enable proper early returns
  for (const scopeKey of Object.keys(sankeyDataObjects)) {
    const sankeyData = sankeyDataObjects[scopeKey]

    if (sankeyData && sankeyData.links) {
      // For each year this scenario has data for
      for (const year of Object.keys(scenarioYears)) {
        const scenarioIndex = scenarioYears[year]

        if (scenarioIndex !== undefined) {
          // Build the full column name: scenario{index}_x{year}x_{scenarioId}
          const scenarioKey = `scenario${scenarioIndex}_x${year}x_${scenarioId}`

          // Check if any link has this scenario as a column and if any value is non-zero
          for (let i = 0; i < sankeyData.links.length; i++) {
            const link = sankeyData.links[i]

            // Check if this link has a column for this scenario
            if (scenarioKey in link) {
              hasAnyDataColumn = true
              const value = link[scenarioKey]

              if (value && Math.abs(value) > 0.001) { // Use small threshold to account for floating point
                hasAnyNonZeroValue = true
                break
              }
            }
          }
        }

        if (hasAnyNonZeroValue) {
          break // Exit year loop
        }
      }
    }

    if (hasAnyNonZeroValue) {
      break // Exit scope loop
    }
  }

  // Return true (grey out) if there are no non-zero values
  // This covers both cases:
  // 1. No data columns exist at all (scenario not in data)
  // 2. Data columns exist but all values are zero
  const result = !hasAnyNonZeroValue
  return result
}

/**
 * Update the scenario availability UI based on which scenarios have all zero values
 * @param {Object} config - The configuration object
 */
function updateScenarioAvailability(config) {
  scenariosWithZeroValues.clear()

  // Check each scenario for zero values
  if (viewerConfig && viewerConfig.scenarios) {
    viewerConfig.scenarios.forEach(scenario => {
      if (checkScenarioHasAllZeroValues(scenario.id, config)) {
        scenariosWithZeroValues.add(scenario.id)
      }
    })
  }

  // Update scenario button states
  const scenarioButtonsContainer = document.getElementById('scenarioButtons')
  if (scenarioButtonsContainer) {
    const buttons = scenarioButtonsContainer.getElementsByTagName('button')

    // Find the scenario title to button mapping
    if (viewerConfig && viewerConfig.scenarios) {
      viewerConfig.scenarios.forEach((scenario, index) => {
        // Find button by matching text content
        for (let i = 0; i < buttons.length; i++) {
          if (buttons[i].textContent === scenario.title) {
            if (scenariosWithZeroValues.has(scenario.id)) {
              // Grey out the button
              buttons[i].style.opacity = '0.4'
              buttons[i].style.pointerEvents = 'none'
              buttons[i].style.cursor = 'not-allowed'
              buttons[i].title = 'Dit scenario is niet beschikbaar voor de gegeven selectie'
            } else {
              // Restore button
              buttons[i].style.opacity = '1'
              buttons[i].style.pointerEvents = 'auto'
              buttons[i].style.cursor = 'pointer'
              buttons[i].title = ''
            }
            break
          }
        }
      })
    }
  }

  // Check if current active scenario is available in the current diagram
  // A scenario is unavailable if:
  // 1. It's not in scenarioIdLookup at all (no data for this diagram), OR
  // 2. It has all zero values
  const currentScenarioId = globalActiveScenario?.id
  let isCurrentScenarioUnavailable = false

  if (currentScenarioId) {
    // Check if scenario exists in scenarioIdLookup
    const scenarioYears = scenarioIdLookup[currentScenarioId]
    const hasNoData = !scenarioYears || Object.keys(scenarioYears).length === 0
    const hasAllZeroValues = scenariosWithZeroValues.has(currentScenarioId)

    isCurrentScenarioUnavailable = hasNoData || hasAllZeroValues
  }

  // Show/hide message on sankey diagram
  showScenarioUnavailableMessage(isCurrentScenarioUnavailable)
}

/**
 * Show or hide the "scenario not available" message on the sankey diagram
 * @param {boolean} show - Whether to show the message
 */
function showScenarioUnavailableMessage(show) {
  const targetDiv = document.getElementById('sankeyContainer') || document.querySelector('[id$="sankeyContainer"]')

  if (!targetDiv) {
    return
  }

  // Find the sankey SVG element and backdrop SVG
  const sankeySvg = targetDiv.querySelector('svg:not([id$="_backdropSVG"])')
  const backdropSvg = targetDiv.querySelector('svg[id$="_backdropSVG"]')

  // Remove existing message if any
  let messageDiv = targetDiv.querySelector('#scenarioUnavailableMessage')

  if (show) {
    // Hide the sankey diagram (main SVG and backdrop SVG)
    if (sankeySvg) {
      sankeySvg.style.display = 'none'
    }
    if (backdropSvg) {
      backdropSvg.style.display = 'none'
    }

    // Show the unavailable message
    if (!messageDiv) {
      messageDiv = document.createElement('div')
      messageDiv.id = 'scenarioUnavailableMessage'
      messageDiv.style.position = 'absolute'
      messageDiv.style.top = '50%'
      messageDiv.style.left = '50%'
      messageDiv.style.transform = 'translate(-50%, -50%)'
      messageDiv.style.backgroundColor = '#FFF3CD'
      messageDiv.style.border = '1px solid #FFC107'
      messageDiv.style.borderRadius = '4px'
      messageDiv.style.padding = '20px 30px'
      messageDiv.style.fontSize = '16px'
      messageDiv.style.fontWeight = '500'
      messageDiv.style.color = '#856404'
      messageDiv.style.zIndex = '1000'
      messageDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)'
      messageDiv.style.textAlign = 'center'
      messageDiv.textContent = 'Scenario is niet beschikbaar voor gegeven selectie'

      targetDiv.appendChild(messageDiv)
    }
    messageDiv.style.display = 'block'
  } else {
    // Show the sankey diagram (main SVG and backdrop SVG)
    if (sankeySvg) {
      sankeySvg.style.display = 'block'
    }
    if (backdropSvg) {
      backdropSvg.style.display = 'block'
    }

    // Hide the unavailable message
    if (messageDiv) {
      messageDiv.style.display = 'none'
    }
  }
}

// Make function globally available
window.checkScenarioHasAllZeroValues = checkScenarioHasAllZeroValues
window.updateScenarioAvailability = updateScenarioAvailability

// function process_xlsx_edit (config, rawSankeyData) {
//   if (dataSource == 'url') {
//   }
//   else if (dataSource == 'file') {
//   }
// }

function processData (links, nodes, legend, settings, remarks, config) {
  // console.log('Links:', links)
  // console.log('Nodes:', nodes)
  // console.log('Legend:', legend)
  // console.log('Settings:', settings)
  // console.log('Remarks:', remarks)

  nodesGlobal = nodes

  config.settings = settings
  config.legend = legend

  // Make config globally accessible for export functions
  window.sankeyExportConfig = config

  globalScaleInit = settings[0].scaleInit
  globalCO2flowScale = settings[0].scaleDataValueCO2flow

  sankeyDataObjects[config.sankeyDataID] = {links: [],nodes: [],order: []}

  let scaleValues = settings[0].scaleDataValue
  let scaleValues_co2flow = settings[0].scaleDataValueCO2flow
  for (i = 0;i < links.length;i++) {
    let co2flow = false
    if (links[i].legend == 'co2flow') {co2flow = true}
    Object.keys(links[i]).forEach(key => {
      if (typeof links[i][key] == 'number') {
        if (co2flow) {
          links[i][key] = links[i][key] / scaleValues_co2flow
        }else { links[i][key] = links[i][key] / scaleValues}
      }
    })
  }

  let maxColumn = 0

  // Generate order object
  nodes.forEach((element) => {
    if (element.column > maxColumn) {
      maxColumn = element.column
    }
  })

  const columnLength = maxColumn + 1
  for (let i = 0; i < columnLength; i++) {
    sankeyDataObjects[config.sankeyDataID].order.push([[]])
  }
  for (let i = 0; i < nodes.length; i++) {
    for (let j = 0; j < sankeyDataObjects[config.sankeyDataID].order.length; j++) {
      if (nodes[i].column === j) {
        if (sankeyDataObjects[config.sankeyDataID].order[j].length === 0) {
          sankeyDataObjects[config.sankeyDataID].order[j].push([])
        }
        for (let k = 0; k < nodes[i].cluster; k++) {
          if (!sankeyDataObjects[config.sankeyDataID].order[j].includes(k)) {
            sankeyDataObjects[config.sankeyDataID].order[j].push([])
          }
        }
        if (
          sankeyDataObjects[config.sankeyDataID].order[j][nodes[i].cluster].length === 0
        ) {
          sankeyDataObjects[config.sankeyDataID].order[j][nodes[i].cluster].push([])
        }
        for (let k = 0; k < nodes[i].row; k++) {
          if (!sankeyDataObjects[config.sankeyDataID].order[j][nodes[i].cluster].includes(k)) {
            sankeyDataObjects[config.sankeyDataID].order[j][nodes[i].cluster].push([])
          }
        }
        sankeyDataObjects[config.sankeyDataID].order[j][nodes[i].cluster][nodes[i].row].push(
          nodes[i].id
        )
      }
    }
  }

  // Generate nodes object
  console.log(remarks)
  for (let i = 0; i < nodes.length; i++) {
    sankeyDataObjects[config.sankeyDataID].nodes.push({
      remark: remarks[i],
      title: nodes[i]['title.system'],
      'title.system': nodes[i]['title.system'],
      'title.electricity': nodes[i]['title.electricity'],
      'title.hydrogen': nodes[i]['title.hydrogen'],
      'title.heat': nodes[i]['title.heat'],
      'title.carbon': nodes[i]['title.carbon'],
      id: nodes[i].id,
      direction: nodes[i].direction,
      index: i,
      dummy: nodes[i].dummy,
      x: nodes[i]['x.system'],
      y: nodes[i]['y.system'],
      'x.system': nodes[i]['x.system'],
      'y.system': nodes[i]['y.system'],
      'x.electricity': nodes[i]['x.electricity'],
      'y.electricity': nodes[i]['y.electricity'],
      'x.hydrogen': nodes[i]['x.hydrogen'],
      'y.hydrogen': nodes[i]['y.hydrogen'],
      'x.heat': nodes[i]['x.heat'],
      'y.heat': nodes[i]['y.heat'],
      'x.carbon': nodes[i]['x.carbon'],
      'y.carbon': nodes[i]['y.carbon'],
      'labelposition.system': nodes[i]['labelposition.system'],
      'labelposition.electricity': nodes[i]['labelposition.electricity'],
      'labelposition.hydrogen': nodes[i]['labelposition.hydrogen'],
      'labelposition.heat': nodes[i]['labelposition.heat'],
      'labelposition.carbon': nodes[i]['labelposition.carbon']
    })
  }

  // Generate scenario object
  const scenarios = []
  let counter = 0
  for (let s = 0; s < Object.keys(links[0]).length; s++) {
    const key = Object.keys(links[0])[s]
    if (key.includes('scenario')) {
      // Extract the title by finding the first underscore and taking everything after "scenario{N}_"
      const firstUnderscoreIndex = key.indexOf('_')
      const title = firstUnderscoreIndex !== -1 ? key.slice(firstUnderscoreIndex + 1) : key

      scenarios.push({
        title: title,
        id: key
      })
      counter++
    }
  }

  config.scenarios = scenarios
  console.log('Total scenarios parsed:', scenarios.length)

  // Make scenarios globally accessible for diagram switching
  window.currentDiagramScenarios = scenarios

  // Generate links object
  for (let i = 0; i < links.length; i++) {
    sankeyDataObjects[config.sankeyDataID].links.push({
      // remark: remarks[i],
      index: i,
      source: links[i]['source.id'],
      target: links[i]['target.id'],
      filter_system: links[i]['filter_system'],
      filter_electricity: links[i]['filter_electricity'],
      filter_hydrogen: links[i]['filter_hydrogen'],
      filter_heat: links[i]['filter_heat'],
      filter_carbon: links[i]['filter_carbon'],
      color: getColor(links[i]['legend'], legend),
      value: links[i].value,
      type: links[i].type,
      legend: links[i]['legend'],
      visibility: 1
    })
    scenarios.forEach((element) => {
      sankeyDataObjects[config.sankeyDataID].links[i][element.id] = links[i][element.id]
    })
  }

  adaptTotalHeight = config.settings[0].adaptTotalHeight

  console.log(config.targetDIV)
  const width = document.getElementById(config.targetDIV).offsetWidth
  const height = document.getElementById(config.targetDIV).offsetHeight

  if (!(config.sankeyInstanceID in sankeyInstances)) {
    sankeyInstances[config.sankeyInstanceID] = {}

    sankeyInstances[config.sankeyInstanceID].sankeyLayout = d3.sankey()
      .nodeWidth(3)  // Set node width smaller (default is 15px)
      .extent([
        [settings[0].horizontalMargin, settings[0].verticalMargin],
        [width - settings[0].horizontalMargin, height - settings[0].verticalMargin]
      ])

    sankeyInstances[config.sankeyInstanceID].sankeyDiagram = d3
      .sankeyDiagram()
      .nodeTitle((d) => {
        if (d.title && d.title.startsWith('.')) {
          return null // Do not draw a title if it starts with '.'
        }
        return d.title
      })
      .linkColor((d) => d.color)
  }

  drawSankey(sankeyDataObjects[config.sankeyDataID], config)
}

function getColor (id, legend) {
  for (let i = 0; i < legend.length; i++) {
    if (legend[i].id === id) {
      return legend[i].color
    }
  }
  console.log('WARNING: DID NOT FIND MATCHING LEGEND ENTRY - "' + id + '"')
  return 'black'
}

function drawSankey (sankeyDataInput, config) {
  // console.log(config)
  // console.log(sankeyDataInput)
  sankeyData = sankeyDataInput
  d3.select('#' + config.sankeyInstanceID + '_sankeySVGPARENT').remove()
  d3.select('#' + config.sankeyInstanceID + '_backdropSVG').remove()

  assetslog = {}

  let scrollExtentWidth = config.settings[0].scrollExtentWidth
  let scrollExtentHeight = config.settings[0].scrollExtentHeight

  // Ensure target DIV has position relative for absolute positioning of backdrop
  d3.select('#' + config.targetDIV).style('position', 'relative')

  // Create backdrop SVG (for delineators and other backdrop elements)
  d3.select('#' + config.targetDIV)
    .append('svg')
    .style('position', 'absolute')
    .style('top', '20px')
    .style('left', '20px')
    .attr('id', config.sankeyInstanceID + '_backdropSVG')
    .attr('width', scrollExtentWidth + 'px')
    .attr('height', scrollExtentHeight + 'px')
    .style('pointer-events', 'none')
    .append('g')

  // Create sankey SVG (for sankey diagram content)
  d3.select('#' + config.targetDIV)
    .append('svg')
    .style('position', 'relative')
    .attr('id', config.sankeyInstanceID + '_sankeySVGPARENT')
    .attr('width', scrollExtentWidth + 'px')
    .attr('height', scrollExtentHeight + 'px')
    // .style('pointer-events', 'auto')
    .append('g')

  // Store references to both SVGs
  sankeyInstances[config.sankeyInstanceID].backdropCanvas = d3.select('#' + config.sankeyInstanceID + '_backdropSVG')
  sankeyInstances[config.sankeyInstanceID].sankeyCanvas = d3.select('#' + config.sankeyInstanceID + '_sankeySVGPARENT')
  // buttonsCanvas = d3.select('#' + config.targetDIV + '_buttonsSVG').append('g')
  sankeyInstances[config.sankeyInstanceID].parentCanvas = d3.select('#' + config.sankeyInstanceID + '_sankeySVGPARENT').append('g')

  sankeyCanvas = d3.select('#' + config.sankeyInstanceID + '_sankeySVGPARENT')
  let backdropCanvas = d3.select('#' + config.sankeyInstanceID + '_backdropSVG')

  // Determine which backdrop to use based on settings
  const diagramBackdrop = config.settings && config.settings[0] && config.settings[0].diagramBackdrop
    ? config.settings[0].diagramBackdrop
    : 'defaultSystemDiagram'

  // For custom backdrop, render rectangles from snky_rectangles data after sankey is drawn
  if (diagramBackdrop === 'custom') {
    console.log('Using custom backdrop from snky_rectangles data')
    setTimeout(() => {
      renderBackgroundRectangles(config)
    }, 100)
  } else {
    // Default system diagram: use hardcoded delineators
    // All delineator elements go to the backdrop SVG
    backdropCanvas.append('rect').attr('id', 'delineator_rect_bronnen').attr('width', 300).attr('height', 2).attr('x', 15).attr('y', 70).attr('fill', '#888').attr('rx', 2.5).attr('ry', 2.5)
  backdropCanvas.append('rect').attr('id', 'delineator_rect_conversie').attr('width', 606).attr('height', 2).attr('x', 350).attr('y', 70).attr('fill', '#888').attr('rx', 2.5).attr('ry', 2.5)
  backdropCanvas.append('rect').attr('id', 'delineator_rect_finaal').attr('width', 590).attr('height', 2).attr('x', 990).attr('y', 70).attr('fill', '#888').attr('rx', 2.5).attr('ry', 2.5)
  backdropCanvas.append('rect').attr('id', 'delineator_rect_keteninvoer').attr('width', 230).attr('height', 2).attr('x', 340).attr('y', 70).attr('fill', '#888').attr('rx', 2.5).attr('ry', 2.5).style('opacity', 0)
  backdropCanvas.append('rect').attr('id', 'delineator_rect_ketenuitvoer').attr('width', 250).attr('height', 2).attr('x', 970).attr('y', 70).attr('fill', '#888').attr('rx', 2.5).attr('ry', 2.5).style('opacity', 0)

  backdropCanvas.append('text').attr('id', 'delineator_text_bronnen').attr('x', 20).attr('y', 53).attr('fill', '#666').style('font-weight', 400).style('font-size', '20px').text('BRONNEN')
  backdropCanvas.append('text').attr('id', 'delineator_text_conversie').attr('x', 355).attr('y', 53).attr('fill', '#666').style('font-weight', 400).style('font-size', '20px').text('CONVERSIE')
  backdropCanvas.append('text').attr('id', 'delineator_text_finaal').attr('x', 995).attr('y', 53).attr('fill', '#666').style('font-weight', 400).style('font-size', '20px').text('FINAAL VERBRUIK')
  backdropCanvas.append('text').attr('id', 'delineator_text_keteninvoer').attr('x', 345).attr('y', 53).attr('fill', '#666').style('font-weight', 400).style('font-size', '20px').text('INVOER UIT KETEN').style('opacity', 0)
  backdropCanvas.append('text').attr('id', 'delineator_text_ketenuitvoer').attr('x', 975).attr('y', 53).attr('fill', '#666').style('font-weight', 400).style('font-size', '20px').text('UITVOER NAAR KETEN').style('opacity', 0)

  // UIT / NAAR KETEN DILINEATORS
  backdropCanvas.append('rect').attr('id', 'delineator_rect_koolstofketen_uit').attr('width', 230).attr('height', 250).attr('x', 290).attr('y', 100).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  backdropCanvas.append('text').attr('id', 'delineator_text_koolstofketen_uit').attr('x', 315).attr('y', 138).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('KOOLSTOFKETEN').style('opacity', 0)

  backdropCanvas.append('rect').attr('id', 'delineator_rect_waterstofketen_uit').attr('width', 230).attr('height', 190).attr('x', 290).attr('y', 100).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  backdropCanvas.append('text').attr('id', 'delineator_text_waterstofketen_uit').attr('x', 315).attr('y', 138).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('WATERSTOFKETEN').style('opacity', 0)

  backdropCanvas.append('rect').attr('id', 'delineator_rect_elektriciteitsketen_uit').attr('width', 230).attr('height', 190).attr('x', 290).attr('y', 330).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  backdropCanvas.append('text').attr('id', 'delineator_text_elektriciteitsketen_uit').attr('x', 315).attr('y', 368).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('ELEKTRICITEITSKETEN').style('opacity', 0)

  backdropCanvas.append('rect').attr('id', 'delineator_rect_warmteketen_in').attr('width', 230).attr('height', 140).attr('x', 970).attr('y', 100).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  backdropCanvas.append('text').attr('id', 'delineator_text_warmteketen_in').attr('x', 995).attr('y', 138).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('WARMTEKETEN').style('opacity', 0)

  backdropCanvas.append('rect').attr('id', 'delineator_rect_waterstofketen_in').attr('width', 230).attr('height', 120).attr('x', 970).attr('y', 275).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  backdropCanvas.append('text').attr('id', 'delineator_text_waterstofketen_in').attr('x', 995).attr('y', 313).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('WATERSTOFKETEN').style('opacity', 0)

  backdropCanvas.append('rect').attr('id', 'delineator_rect_elektriciteitsketen_in').attr('width', 230).attr('height', 140).attr('x', 970).attr('y', 95).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  backdropCanvas.append('text').attr('id', 'delineator_text_elektriciteitsketen_in').attr('x', 995).attr('y', 133).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('ELEKTRICITEITSKETEN').style('opacity', 0)

  backdropCanvas.append('rect').attr('id', 'delineator_rect_koolstofketen_in').attr('width', 230).attr('height', 140).attr('x', 970).attr('y', 600).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  backdropCanvas.append('text').attr('id', 'delineator_text_koolstofketen_in').attr('x', 995).attr('y', 638).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('KOOLSTOFKETEN').style('opacity', 0)

  backdropCanvas.append('rect').attr('id', 'delineator_rect_finaal_go').attr('width', 230).attr('height', 140).attr('x', 1350).attr('y', 100).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  backdropCanvas.append('text').attr('id', 'delineator_text_finaal_go').attr('x', 1375).attr('y', 138).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('GEBOUWDE OMGEVING').style('opacity', 0)

  backdropCanvas.append('rect').attr('id', 'delineator_rect_finaal_mobiliteit').attr('width', 230).attr('height', 140).attr('x', 1350).attr('y', 680).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  backdropCanvas.append('text').attr('id', 'delineator_text_finaal_mobiliteit').attr('x', 1375).attr('y', 680 + 30).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('MOBILITEIT').style('opacity', 0)

  backdropCanvas.append('rect').attr('id', 'delineator_rect_finaal_industrie').attr('width', 230).attr('height', 300).attr('x', 1350).attr('y', 370).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  backdropCanvas.append('text').attr('id', 'delineator_text_finaal_industrie').attr('x', 1375).attr('y', 400).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('INDUSTRIE').style('opacity', 0)

  backdropCanvas.append('rect').attr('id', 'delineator_rect_finaal_landbouw').attr('width', 230).attr('height', 110).attr('x', 1352).attr('y', 250).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  backdropCanvas.append('text').attr('id', 'delineator_text_finaal_landbouw').attr('x', 1377).attr('y', 285).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('LANDBOUW').style('opacity', 0)

  backdropCanvas.append('rect').attr('id', 'delineator_rect_finaal_overige').attr('width', 230).attr('height', 200).attr('x', 1352).attr('y', 830).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  backdropCanvas.append('text').attr('id', 'delineator_text_finaal_overige').attr('x', 1377).attr('y', 860).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('OVERIGE').style('opacity', 0)

  backdropCanvas.append('rect').attr('id', 'delineator_rect_vlak_conversie').attr('width', 278).attr('height', 945).attr('x', 600).attr('y', 100).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  backdropCanvas.append('text').attr('id', 'delineator_text_vlak_conversie').attr('x', 625).attr('y', 138).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('CONVERSIE').style('opacity', 0)

  backdropCanvas.append('rect').attr('id', 'delineator_rect_productie').attr('width', 228).attr('height', 945).attr('x', 25).attr('y', 100).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  backdropCanvas.append('text').attr('id', 'delineator_text_productie').attr('x', 50).attr('y', 138).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('IMPORT & PRODUCTIE').style('opacity', 0)

  backdropCanvas.append('rect').attr('id', 'delineator_rect_warmteketen_uit').attr('width', 230).attr('height', 110).attr('x', 290).attr('y', 390).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  backdropCanvas.append('text').attr('id', 'delineator_text_warmteketen_uit').attr('x', 315).attr('y', 528).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('WARMTEKETEN').style('opacity', 0)

  backdropCanvas.append('rect').attr('id', 'delineator_rect_warmteproductie_bij_finaal_verbruik_uit').attr('width', 230).attr('height', 305).attr('x', 290).attr('y', 740).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  backdropCanvas.append('text').attr('id', 'delineator_text_warmteproductie_bij_finaal_verbruik_uit').attr('x', 315).attr('y', 638 + 130).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('LOKAAL').style('opacity', 0)
  } // End of default system diagram backdrop

  // draw scenario buttons
  let spacing = 7
  let cumulativeXpos = 45

  scaleInit = config.settings[0].scaleInit

  // console.log(config)

  // only draw buttons once
  if (!selectionButtonsHaveInitialized) { // 

    drawSelectionButtons(config)
    selectionButtonsHaveInitialized = true
  }

  setTimeout(() => { // TODO: MAKE SEQUENTIAL WITH TOKEN
    setScenario() // init
  }, 1000)

  // Add hover event handlers to links
  sankeyInstances[config.sankeyInstanceID].sankeyDiagram
    .linkTitle((d) => {
      if (d.legend === 'co2flow') {
        return d.legend + ' | ' + parseInt(d.value * globalCO2flowScale) + ' kton CO2'
      } else {
        if (currentUnit === 'TWh') {
          return d.legend + ' | ' + parseInt(d.value / 3.6) + ' TWh'
        } else {
          return d.legend + ' | ' + parseInt(d.value) + ' PJ'
        }
      }
    })
    .on('mouseover', function (event, d) {
      d3.select('#showValueOnHover')
        .style('opacity', 1)
        .html(d.legend + ' | ' + (d.legend === 'co2flow'
            ? parseInt(d.value * globalCO2flowScale) + ' kton CO2'
            : currentUnit === 'TWh'
              ? parseInt(d.value / 3.6) + ' TWh'
              : parseInt(d.value) + ' PJ'))
    })
    .on('mouseout', function () {
      d3.select('#showValueOnHover').style('opacity', 0)
    })

  // Ensure links have pointer events enabled
  d3.select('#' + config.sankeyInstanceID + '_sankeySVGPARENT')
    .selectAll('.link')
    .style('pointer-events', 'auto')
    .style('cursor', 'pointer')
    .on('mouseover', function (event, d) {
      showValueOnHover(d3.select(this))
      d3.select(this).style('opacity', 0.8)
    })
    .on('mouseout', function (d) {
      d3.select(this).style('opacity', 1)
    })
}

function tick (config) {
  // sankeyData = {links: [],nodes: [],order: []}
  // console.log(sankeyData)
  // document.getElementById('remarksContainer').innerHTML = ''

  switch (globalActiveEnergyflowsFilter) {
    case 'system':
      d3.select('#delineator_rect_keteninvoer').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_rect_ketenuitvoer').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_rect_bronnen').transition().duration(1000).attr('x', 15).attr('width', 300)
      d3.select('#delineator_rect_conversie').transition().duration(1000).attr('x', 350).attr('width', 606)
      d3.select('#delineator_rect_finaal').transition().duration(1000).attr('x', 990).attr('width', 590)

      d3.select('#delineator_text_keteninvoer').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_ketenuitvoer').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_conversie').transition().duration(1000).attr('x', 355)
      d3.select('#delineator_text_finaal').transition().duration(1000).attr('x', 995)

      d3.select('#delineator_rect_elektriciteitsketen_uit').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_rect_elektriciteitsketen_in').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_rect_koolstofketen_uit').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_rect_koolstofketen_in').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_rect_waterstofketen_uit').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_rect_waterstofketen_in').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_rect_warmteketen_in').transition().duration(1000).style('opacity', 0)

      d3.select('#delineator_text_elektriciteitsketen_uit').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_elektriciteitsketen_in').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_koolstofketen_uit').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_koolstofketen_in').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_waterstofketen_uit').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_waterstofketen_in').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_warmteketen_in').transition().duration(1000).style('opacity', 0)

      d3.select('#delineator_rect_finaal_go').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_finaal_go').transition().duration(1000).style('opacity', 0)

      d3.select('#delineator_rect_finaal_mobiliteit').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_finaal_mobiliteit').transition().duration(1000).style('opacity', 0)

      d3.select('#delineator_rect_finaal_industrie').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_finaal_industrie').transition().duration(1000).style('opacity', 0)

      d3.select('#delineator_rect_finaal_landbouw').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_finaal_landbouw').transition().duration(1000).style('opacity', 0)

      d3.select('#delineator_rect_finaal_overige').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_finaal_overige').transition().duration(1000).style('opacity', 0)

      d3.select('#delineator_rect_vlak_conversie').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_vlak_conversie').transition().duration(1000).style('opacity', 0)

      d3.select('#delineator_rect_productie').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_productie').transition().duration(1000).style('opacity', 0)

      d3.select('#delineator_rect_import').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_import').transition().duration(1000).style('opacity', 0)

      d3.select('#delineator_rect_warmteketen_uit').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_warmteketen_uit').transition().duration(1000).style('opacity', 0)

      d3.select('#delineator_rect_warmteproductie_bij_finaal_verbruik_uit').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_warmteproductie_bij_finaal_verbruik_uit').transition().duration(1000).style('opacity', 0)

      break
    case 'electricity':

      d3.select('#delineator_text_elektriciteitsketen_uit').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_rect_elektriciteitsketen_uit').transition().duration(1000).style('opacity', 0)

      d3.select('#delineator_rect_waterstofketen_in').transition().duration(1000).style('opacity', 1).attr('height', 120).attr('y', 275)
      d3.select('#delineator_text_waterstofketen_in').transition().duration(1000).style('opacity', 1).attr('y', 313)

      // d3.select('#delineator_text_koolstofketen_in').transition().duration(1000).style('opacity', 1)
      // d3.select('#delineator_rect_koolstofketen_in').transition().duration(1000).style('opacity', 1)

      d3.select('#delineator_rect_koolstofketen_uit').transition().duration(1000).style('opacity', 1).attr('y', 100).attr('height', 250)
      d3.select('#delineator_text_koolstofketen_uit').transition().duration(1000).style('opacity', 1).attr('y', 138)

      d3.select('#delineator_rect_warmteketen_in').transition().duration(1000).style('opacity', 1).attr('height', 140).attr('y', 100)
      d3.select('#delineator_text_warmteketen_in').transition().duration(1000).style('opacity', 1).attr('y', 138)

      d3.select('#delineator_rect_elektriciteitsketen_in').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_elektriciteitsketen_in').transition().duration(1000).style('opacity', 0)

      d3.select('#delineator_text_waterstofketen_uit').transition().duration(1000).style('opacity', 1).attr('y', 780)
      d3.select('#delineator_rect_waterstofketen_uit').transition().duration(1000).style('opacity', 1).attr('height', 110).attr('y', 742)

      d3.select('#delineator_rect_warmteketen_uit').transition().duration(1000).style('opacity', 1).attr('height', 120).attr('y', 275 + 600)
      d3.select('#delineator_text_warmteketen_uit').transition().duration(1000).style('opacity', 1).attr('y', 313 + 600)

      d3.select('#delineator_rect_vlak_conversie').transition().duration(1000).style('opacity', 1).attr('height', 445).attr('y', 200)
      d3.select('#delineator_text_vlak_conversie').transition().duration(1000).style('opacity', 1).attr('y', 238)

      d3.select('#delineator_rect_koolstofketen_in').transition().duration(1000).style('opacity', 1).attr('height', 180).attr('y', 600)
      d3.select('#delineator_text_koolstofketen_in').transition().duration(1000).style('opacity', 1).attr('y', 638)

      d3.select('#delineator_rect_warmteproductie_bij_finaal_verbruik_uit').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_warmteproductie_bij_finaal_verbruik_uit').transition().duration(1000).style('opacity', 0)

      reposition_ketenview()
      break
    case 'hydrogen':

      d3.select('#delineator_text_elektriciteitsketen_uit').transition().duration(1000).style('opacity', 1).attr('y', 365)
      d3.select('#delineator_rect_elektriciteitsketen_uit').transition().duration(1000).style('opacity', 1).attr('height', 190).attr('y', 330)

      d3.select('#delineator_rect_koolstofketen_uit').transition().duration(1000).style('opacity', 1).attr('height', 170)
      d3.select('#delineator_text_koolstofketen_uit').transition().duration(1000).style('opacity', 1)

      // d3.select('#delineator_rect_koolstofketen_in').transition().duration(1000).style('opacity', 1)
      // d3.select('#delineator_text_koolstofketen_in').transition().duration(1000).style('opacity', 1)

      // d3.select('#delineator_rect_warmteketen_in').transition().duration(1000).style('opacity', 0)
      // d3.select('#delineator_text_warmteketen_in').transition().duration(1000).style('opacity', 0)

      d3.select('#delineator_rect_waterstofketen_in').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_waterstofketen_in').transition().duration(1000).style('opacity', 0)

      d3.select('#delineator_rect_elektriciteitsketen_in').transition().duration(1000).style('opacity', 1)
      d3.select('#delineator_text_elektriciteitsketen_in').transition().duration(1000).style('opacity', 1)

      d3.select('#delineator_rect_waterstofketen_uit').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_waterstofketen_uit').transition().duration(1000).style('opacity', 0)

      d3.select('#delineator_rect_warmteketen_uit').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_warmteketen_uit').transition().duration(1000).style('opacity', 0)

      d3.select('#delineator_rect_vlak_conversie').transition().duration(1000).style('opacity', 1).attr('height', 450).attr('y', 300)
      d3.select('#delineator_text_vlak_conversie').transition().duration(1000).style('opacity', 1).attr('y', 338)

      d3.select('#delineator_rect_warmteproductie_bij_finaal_verbruik_uit').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_warmteproductie_bij_finaal_verbruik_uit').transition().duration(1000).style('opacity', 0)

      d3.select('#delineator_rect_koolstofketen_in').transition().duration(1000).style('opacity', 1).attr('height', 140).attr('y', 245)
      d3.select('#delineator_text_koolstofketen_in').transition().duration(1000).style('opacity', 1).attr('y', 283)

      d3.select('#delineator_rect_warmteketen_in').transition().duration(1000).style('opacity', 1).attr('height', 140).attr('y', 750)
      d3.select('#delineator_text_warmteketen_in').transition().duration(1000).style('opacity', 1).attr('y', 788)

      reposition_ketenview()
      break
    case 'heat':
      d3.select('#delineator_text_elektriciteitsketen_uit').transition().duration(1000).style('opacity', 1).attr('y', 395 + 70)
      d3.select('#delineator_rect_elektriciteitsketen_uit').transition().duration(1000).style('opacity', 1).attr('height', 150).attr('y', 365 + 70)

      d3.select('#delineator_rect_warmteketen_in').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_warmteketen_in').transition().duration(1000).style('opacity', 0)

      d3.select('#delineator_rect_elektriciteitsketen_in').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_elektriciteitsketen_in').transition().duration(1000).style('opacity', 0)

      d3.select('#delineator_text_waterstofketen_uit').transition().duration(1000).style('opacity', 1).attr('y', 280 + 60)
      d3.select('#delineator_rect_waterstofketen_uit').transition().duration(1000).style('opacity', 1).attr('height', 110).attr('y', 242 + 60)

      d3.select('#delineator_rect_warmteketen_uit').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_warmteketen_uit').transition().duration(1000).style('opacity', 0)

      d3.select('#delineator_rect_vlak_conversie').transition().duration(1000).style('opacity', 1).attr('height', 345).attr('y', 300)
      d3.select('#delineator_text_vlak_conversie').transition().duration(1000).style('opacity', 1).attr('y', 338)

      d3.select('#delineator_rect_koolstofketen_uit').transition().duration(1000).style('opacity', 1).attr('y', 100).attr('height', 130 + 50)
      d3.select('#delineator_text_koolstofketen_uit').transition().duration(1000).style('opacity', 1).attr('y', 138)

      d3.select('#delineator_rect_waterstofketen_in').transition().duration(1000).style('opacity', 0).attr('height', 120).attr('y', 95)
      d3.select('#delineator_text_waterstofketen_in').transition().duration(1000).style('opacity', 0).attr('y', 133)

      d3.select('#delineator_rect_warmteproductie_bij_finaal_verbruik_uit').transition().duration(1000).style('opacity', 1)
      d3.select('#delineator_text_warmteproductie_bij_finaal_verbruik_uit').transition().duration(1000).style('opacity', 1)

      d3.select('#delineator_rect_koolstofketen_in').transition().duration(1000).style('opacity', 1).attr('height', 130).attr('y', 95)
      d3.select('#delineator_text_koolstofketen_in').transition().duration(1000).style('opacity', 1).attr('y', 133)

      d3.select('#delineator_rect_vlak_conversie').transition().duration(1000).style('opacity', 1).attr('height', 275).attr('y', 350)
      d3.select('#delineator_text_vlak_conversie').transition().duration(1000).style('opacity', 1).attr('y', 388)

      reposition_ketenview()
      break
    case 'carbon':

      d3.select('#delineator_text_elektriciteitsketen_uit').transition().duration(1000).style('opacity', 1).attr('y', 135)
      d3.select('#delineator_rect_elektriciteitsketen_uit').transition().duration(1000).style('opacity', 1).attr('height', 110).attr('y', 97)

      d3.select('#delineator_rect_elektriciteitsketen_in').transition().duration(1000).style('opacity', 1)
      d3.select('#delineator_text_elektriciteitsketen_in').transition().duration(1000).style('opacity', 1)

      d3.select('#delineator_rect_koolstofketen_in').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_koolstofketen_in').transition().duration(1000).style('opacity', 0)

      d3.select('#delineator_rect_koolstofketen_uit').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_koolstofketen_uit').transition().duration(1000).style('opacity', 0)

      d3.select('#delineator_rect_waterstofketen_in').transition().duration(1000).style('opacity', 1).attr('height', 110).attr('y', 250)
      d3.select('#delineator_text_waterstofketen_in').transition().duration(1000).style('opacity', 1).attr('y', 288)

      d3.select('#delineator_rect_warmteketen_in').transition().duration(1000).style('opacity', 1).attr('height', 120).attr('y', 375)
      d3.select('#delineator_text_warmteketen_in').transition().duration(1000).style('opacity', 1).attr('y', 413)

      d3.select('#delineator_text_waterstofketen_uit').transition().duration(1000).style('opacity', 1).attr('y', 260 + 200 - 65)
      d3.select('#delineator_rect_waterstofketen_uit').transition().duration(1000).style('opacity', 1).attr('height', 110).attr('y', 222 + 200 - 65)

      d3.select('#delineator_rect_warmteketen_uit').transition().duration(1000).style('opacity', 1).attr('y', 347 - 120)
      d3.select('#delineator_text_warmteketen_uit').transition().duration(1000).style('opacity', 1).attr('y', 379 - 120)

      d3.select('#delineator_rect_vlak_conversie').transition().duration(1000).style('opacity', 1).attr('height', 425 + 80).attr('y', 550)
      d3.select('#delineator_text_vlak_conversie').transition().duration(1000).style('opacity', 1).attr('y', 588)

      d3.select('#delineator_rect_warmteproductie_bij_finaal_verbruik_uit').transition().duration(1000).style('opacity', 0)
      d3.select('#delineator_text_warmteproductie_bij_finaal_verbruik_uit').transition().duration(1000).style('opacity', 0)

      reposition_ketenview()

      break

    default:
      break
  }

  function reposition_ketenview () {
    // d3.select('#delineator_rect_koolstofketen_uit').transition().duration(1000).style('opacity', 1)
    // d3.select('#delineator_rect_koolstofketen_in').transition().duration(1000).style('opacity', 1)
    // d3.select('#delineator_rect_waterstofketen_uit').transition().duration(1000).style('opacity', 1)
    // d3.select('#delineator_rect_waterstofketen_in').transition().duration(1000).style('opacity', 1)

    // d3.select('#delineator_text_koolstofketen_uit').transition().duration(1000).style('opacity', 1)
    // d3.select('#delineator_text_koolstofketen_in').transition().duration(1000).style('opacity', 1)
    // d3.select('#delineator_text_waterstofketen_uit').transition().duration(1000).style('opacity', 1)
    // d3.select('#delineator_text_waterstofketen_in').transition().duration(1000).style('opacity', 1)
    // d3.select('#delineator_text_warmteketen_in').transition().duration(1000).style('opacity', 1)

    d3.select('#delineator_rect_finaal_go').transition().duration(1000).style('opacity', 1)
    d3.select('#delineator_text_finaal_go').transition().duration(1000).style('opacity', 1)

    d3.select('#delineator_rect_finaal_mobiliteit').transition().duration(1000).style('opacity', 1)
    d3.select('#delineator_text_finaal_mobiliteit').transition().duration(1000).style('opacity', 1)

    d3.select('#delineator_rect_finaal_industrie').transition().duration(1000).style('opacity', 1)
    d3.select('#delineator_text_finaal_industrie').transition().duration(1000).style('opacity', 1)

    d3.select('#delineator_rect_finaal_landbouw').transition().duration(1000).style('opacity', 1)
    d3.select('#delineator_text_finaal_landbouw').transition().duration(1000).style('opacity', 1)

    d3.select('#delineator_rect_finaal_overige').transition().duration(1000).style('opacity', 1)
    d3.select('#delineator_text_finaal_overige').transition().duration(1000).style('opacity', 1)

    // d3.select('#delineator_rect_vlak_conversie').transition().duration(1000).style('opacity', 1)
    // d3.select('#delineator_text_vlak_conversie').transition().duration(1000).style('opacity', 1)

    d3.select('#delineator_rect_productie').transition().duration(1000).style('opacity', 1)
    d3.select('#delineator_text_productie').transition().duration(1000).style('opacity', 1)

    d3.select('#delineator_rect_import').transition().duration(1000).style('opacity', 1)
    d3.select('#delineator_text_import').transition().duration(1000).style('opacity', 1)

    d3.select('#delineator_rect_keteninvoer').transition().duration(1000).attr('x', 290).style('opacity', 1)
    d3.select('#delineator_rect_ketenuitvoer').transition().duration(1000).attr('width', 230).style('opacity', 1)

    d3.select('#delineator_text_keteninvoer').transition().duration(1000).attr('x', 290).style('opacity', 1)
    d3.select('#delineator_text_ketenuitvoer').transition().duration(1000).style('opacity', 1)

    d3.select('#delineator_text_conversie').transition().duration(1000).attr('x', 600)
    d3.select('#delineator_text_finaal').transition().duration(1000).attr('x', 1350)

    d3.select('#delineator_rect_bronnen').transition().duration(1000).attr('x', 15).attr('width', 240)
    d3.select('#delineator_rect_conversie').transition().duration(1000).attr('x', 595).attr('width', 285)
    d3.select('#delineator_rect_finaal').transition().duration(1000).attr('x', 1350).attr('width', 330).attr('width', 230)
  }

  // d3.select('#delineator_rect_bronnen')
  // d3.select('#delineator_rect_conversie')
  // d3.select('#delineator_rect_finaal')
  // d3.select('#delineator_rect_keteninvoer')
  // d3.select('#delineator_rect_ketenuitvoer')

  // d3.select('#delineator_text_bronnen')
  // d3.select('#delineator_text_conversie')
  // d3.select('#delineator_text_finaal')
  // d3.select('#delineator_text_keteninvoer')
  // d3.select('#delineator_text_ketenuitvoer')

  Object.keys(sankeyInstances).forEach(key => {
    try {
      // console.log(globalActiveEnergyflowsSankey.id)

      var sankeyData = sankeyDataObjects[globalSankeyInstancesActiveDataset[key].id]

      if (!sankeyData) {
        throw new Error(`Sankey data not found for dataset: ${globalSankeyInstancesActiveDataset[key].id}`)
      }

      if (!sankeyData.links || !sankeyData.nodes) {
        throw new Error(`Invalid sankey data structure - missing links or nodes for dataset: ${globalSankeyInstancesActiveDataset[key].id}`)
      }

      sankeyData.links.forEach(item => {
        item.visibility = item['filter_' + globalActiveEnergyflowsFilter] === 'x' ? 1 : 0;})
        // console.log(sankeyData)

      for (i = 0; i < sankeyData.links.length; i++) {
        // console.log(sankeyData.links[i].visibility)
        if (sankeyData.links[i]['filter_' + globalActiveEnergyflowsFilter] == 'x') {
          // Use global scenarios from current diagram (updated on diagram switch)
          const currentScenarios = window.currentDiagramScenarios || config.scenarios
          const scenarioId = currentScenarios[activeScenario].id
          if (sankeyData.links[i][scenarioId] === undefined) {
            console.warn(`Missing scenario data for link ${i}, scenario: ${scenarioId}`)
            sankeyData.links[i].value = 0
          } else {
            sankeyData.links[i].value = Math.round(sankeyData.links[i][scenarioId])
          }
        } else {sankeyData.links[i].value = 0}
      }

      for (i = 0; i < sankeyData.nodes.length; i++) {
        sankeyData.nodes[i].x = sankeyData.nodes[i]['x.' + globalActiveEnergyflowsFilter]
        sankeyData.nodes[i].y = sankeyData.nodes[i]['y.' + globalActiveEnergyflowsFilter]
        sankeyData.nodes[i].title = sankeyData.nodes[i]['title.' + globalActiveEnergyflowsFilter]
      }
    } catch (e) {
      if (typeof showErrorPopup === 'function') {
        const errorScenarios = window.currentDiagramScenarios || config.scenarios
        showErrorPopup({
          title: 'Sankey Data Processing Error',
          message: 'Failed to process sankey data. This may be due to missing node/link data or invalid scenario configuration.',
          error: e,
          context: {
            function: 'tick',
            sankeyInstance: key,
            datasetId: globalSankeyInstancesActiveDataset[key] ? globalSankeyInstancesActiveDataset[key].id : 'unknown',
            scenario: errorScenarios && errorScenarios[activeScenario] ? errorScenarios[activeScenario].id : 'unknown',
            filter: globalActiveEnergyflowsFilter || 'unknown',
            activeScenarioIndex: activeScenario
          }
        })
      }
      console.error('Error processing sankey data:', e)
      return // Skip this instance
    }

    // console.log(sankeyData.links.filter(item => item['filter_heat'] !== 'x'))
    // console.log(globalActiveEnergyflowsFilter)

    // sankeyData.links = sankeyData.links.filter(item => item['filter_' + globalActiveEnergyflowsFilter] == 'x')

    // sankeyData.links = sankeyData.links.filter(item => item.hasOwnProperty('filter_heat'))

    d3.selectAll('#' + config.sankeyInstanceID + '.node-remark-number').remove()
    d3.selectAll('#' + config.sankeyInstanceID + '.node-remarks').remove()

    let sankeyCanvas = d3.select('#' + config.sankeyInstanceID + '_sankeySVGPARENT').append('g')
    for (i = 0; i < sankeyData.nodes.length; i++) {
      // sankeyData.links[i].value = Math.round(sankeyData.links[i][config.scenarios[activeScenario].id])
      // console.log(sankeyData.nodes[i])
      let posx = sankeyData.nodes[i].x + 21
      let posy = sankeyData.nodes[i].y + 15
    /* Static remark drawing code - disabled
    sankeyCanvas.append('path') // EDIT TIJS  - add
      .attr('d', 'M152-160q-23 0-35-20.5t1-40.5l328-525q12-19 34-19t34 19l328 525q13 20 1 40.5T808-160H152Z')
      .attr('class', 'node-remarks')
      .style('pointer-events', 'all')
      .attr('height', 20)
      .attr('dy', sankeyData.nodes[i].y)
      .attr('dx', sankeyData.nodes[i].x)
      .attr('rx', 3).attr('ry', 3)
      .attr('fill', 'black')
      .attr('transform', 'translate(' + posx + ',' + posy + ')scale(0.040)rotate(180)')
      .attr('remarksData', function () {
        return JSON.stringify(sankeyData.nodes[i].remark)
      })
      .attr('fill', function (d) {
        function containsAanname (inputString) {
          // Create a new DOMParser to parse the input string as HTML
          const parser = new DOMParser()
          const parsedHTML = parser.parseFromString(inputString, 'text/html')
          // Check if there are any <info> or <aanname> elements in the parsed HTML
          const infoItems = parsedHTML.querySelectorAll('info')
          const aannameItems = parsedHTML.querySelectorAll('aanname')
          // Return TRUE if at least one <info> or <aanname> item is present, otherwise return FALSE
          return aannameItems.length > 0
        }

        if (containsAanname(sankeyData.nodes[i].remark[currentScenarioID + 1])) {return '#c1121f'} else {return '#495057'} // if only 'info', then 'orange', if 'aanname', then 'red' 
      }).attr('opacity', function (d) { // only show marker if there's info or aanname applicable. Note: used opacity instead of 'visibility' attribute, because visibility attribute is used elsewhere  
        function containsInfoOrAanname (inputString) {
          // Create a new DOMParser to parse the input string as HTML
          const parser = new DOMParser()
          const parsedHTML = parser.parseFromString(inputString, 'text/html')
          // Check if there are any <info> or <aanname> elements in the parsed HTML
          const infoItems = parsedHTML.querySelectorAll('info')
          const aannameItems = parsedHTML.querySelectorAll('aanname')
          const bronItems = parsedHTML.querySelectorAll('bron')
          // Return TRUE if at least one <info> or <aanname> item is present, otherwise return FALSE
          return infoItems.length > 0 || aannameItems.length > 0 || bronItems.length > 0
        }

        if (containsInfoOrAanname(sankeyData.nodes[i].remark[currentScenarioID + 1])) {return 1} else {return 0}
      })

    sankeyCanvas.append('text')
      .attr('class', 'node-remark-number')
      .attr('fill', '#FFF')
      .style('font-weight', 800)
      .style('font-size', '10px')
      .attr('text-anchor', 'middle')
      .attr('dx', -19)
      .attr('dy', 18)
      .attr('transform', 'translate(' + posx + ',' + posy + ')')
      .style('pointer-events', 'none')
      .attr('opacity', function (d) { // only show marker if there's info or aanname applicable. Note: used opacity instead of 'visibility' attribute, because visibility attribute is used elsewhere  
        function containsInfoOrAanname (inputString) {
          // Create a new DOMParser to parse the input string as HTML
          const parser = new DOMParser()
          const parsedHTML = parser.parseFromString(inputString, 'text/html')
          // Check if there are any <info> or <aanname> elements in the parsed HTML
          const infoItems = parsedHTML.querySelectorAll('info')
          const aannameItems = parsedHTML.querySelectorAll('aanname')
          const bronItems = parsedHTML.querySelectorAll('bron')
          // Return TRUE if at least one <info> or <aanname> item is present, otherwise return FALSE
          return infoItems.length > 0 || aannameItems.length > 0 || bronItems.length > 0
        }

        if (containsInfoOrAanname(sankeyData.nodes[i].remark[currentScenarioID + 1])) {return 1} else {return 0}
      })
      .text(function (d) {
        // console.log(d)
        return sankeyData.nodes[i].index + 1}) // start counting at 1 instead of zero
    */
    }

    updateSankey(JSON.stringify(sankeyData), config.settings[0].offsetX, config.settings[0].offsetY, config.settings[0].fontSize, config.settings[0].font, config)
    d3.selectAll('#' + config.sankeyInstanceID + ' .node-title').style('font-size', '11px')
  })
}

function updateSankey (json, offsetX, offsetY, fontSize, fontFamily, config) {
  try {
    var json = JSON.parse(json)
    d3.select('#error').text('')
  } catch (e) {
    d3.select('#error').text(e)
    if (typeof showErrorPopup === 'function') {
      showErrorPopup({
        title: 'JSON Parse Error',
        message: 'Failed to parse sankey data JSON',
        error: e,
        context: {
          function: 'updateSankey',
          sankeyInstanceID: config.sankeyInstanceID,
          jsonLength: json ? json.length : 'null'
        }
      })
    }
    return
  }

  let duration = 1000

  try {
    sankeyInstances[config.sankeyInstanceID].sankeyLayout.nodePosition(function (node) {
      return [node.x, node.y]
    })

    d3.select('#' + config.sankeyInstanceID + '_sankeySVGPARENT').datum(sankeyInstances[config.sankeyInstanceID].sankeyLayout.scale(scaleInit)(json)).transition().duration(duration).ease(d3.easeCubicInOut).call(sankeyInstances[config.sankeyInstanceID].sankeyDiagram)
  } catch (e) {
    if (typeof showErrorPopup === 'function') {
      showErrorPopup({
        title: 'Sankey Diagram Error',
        message: 'Failed to update sankey diagram. This usually happens when there is a missing node reference in the data.',
        error: e,
        context: {
          function: 'updateSankey',
          sankeyInstanceID: config.sankeyInstanceID,
          scenario: globalActiveScenario ? globalActiveScenario.id : 'unknown',
          year: globalActiveYear ? globalActiveYear.id : 'unknown',
          filter: globalActiveEnergyflowsFilter || 'unknown',
          numberOfNodes: json.nodes ? json.nodes.length : 0,
          numberOfLinks: json.links ? json.links.length : 0,
          visibleLinks: json.links ? json.links.filter(l => l.visibility === 1).length : 0
        }
      })
    }
    console.error('Sankey update error:', e)
    return
  }
  d3.select('#' + config.sankeyInstanceID + ' .sankey').attr('transform', 'translate(' + offsetX + ',' + offsetY + ')')
  d3.selectAll('#' + config.sankeyInstanceID + ' .node-title').style('font-size', fontSize + 'tepx')

  // Update link styles and events
  d3.select('#' + config.sankeyInstanceID + '_sankeySVGPARENT')
    .selectAll('.link')
    .style('pointer-events', 'auto')
    .style('cursor', 'pointer')
    .style('opacity', function (d) { return d.visibility === 0 ? 0 : 0.9 })
    .on('mouseover', function (event, d) {
      if (d.visibility !== 0) {
        showValueOnHover(d3.select(this))
        d3.select(this).style('opacity', 0.8)
      }
    })
    .on('mouseout', function (d) {
      if (d.visibility !== 0) {
        d3.select(this).style('opacity', 0.9)
      }
    })
    .on('click', function (event, d) {
      if (d.visibility !== 0) {
        console.log('click registered')
        // drawBarGraph(sankeyDataObjects[globalActiveEnergyflowsSankey.id].links[d.index], config)
        drawBarGraph(sankeyDataObjects['system'].links[d.index], config) // TODO: remove separation of instances
      }
    })

  // Use the correct SVG parent selector
  const svgSelector = '#' + config.sankeyInstanceID + '_sankeySVGPARENT'

  d3.selectAll(svgSelector + ' .node').style('pointer-events', 'auto')
  d3.selectAll(svgSelector + ' .node-backdrop-title').style('pointer-events', 'none')

  // Helper function to handle node click - needs to be attached after transition
  const setupNodeClickHandlers = function() {
    console.log('Setting up node click handlers for:', svgSelector)

    // Helper function to handle node click
    const handleNodeClick = function(d) {
      console.log('Node clicked, d =', d)
      // All scopes (system, heat, electricity, etc.) use the same underlying data stored in 'system'
      // The globalActiveEnergyflowsSankey.id represents the filter/view, not the data source
      // So we always use 'system' as the data source key
      const sankeyDataId = 'system'
      console.log('Using sankeyDataId:', sankeyDataId)
      const sankeyData = sankeyDataObjects[sankeyDataId]
      console.log('sankeyData:', sankeyData)
      if (sankeyData && sankeyData.nodes) {
        const nodeIndex = typeof d === 'object' ? d.index : d
        console.log('nodeIndex:', nodeIndex)
        const node = sankeyData.nodes[nodeIndex]
        console.log('node:', node)
        if (node && typeof nodeVisualisatieSingular === 'function') {
          const nodeScenarios = window.currentDiagramScenarios || config.scenarios
          nodeVisualisatieSingular(config, node, sankeyData, nodeScenarios, config.targetDIV)
        } else {
          console.error('nodeVisualisatieSingular not available or node is undefined')
        }
      } else {
        console.error('sankeyData or sankeyData.nodes not available')
      }
    }

    // Check how many elements we're selecting
    const nodeClickTargets = d3.selectAll(svgSelector + ' .node-click-target')
    console.log('Found node-click-target elements:', nodeClickTargets.size())

    nodeClickTargets
      .style('fill', '#555')
      .style('stroke-width', 0)
      .style('opacity', 0)  // Hide the click target rectangles
      .style('display', 'none')  // Completely hide and remove from layout
      .attr('width', 10)
      .attr('rx', 0)
      .attr('ry', 0)
      .attr('transform', 'translate(-4,0)scale(1.005)')
      .attr('id', function (d, i) { return 'nodeindex_' + d.index })
      .style('cursor', 'pointer')
      .style('pointer-events', 'none')  // Disable pointer events
      .on('click', function (event, d) {
        event.stopPropagation()
        handleNodeClick(d)
      })

    // Make node titles clickable
    d3.selectAll(svgSelector + ' .node-title')
      .style('pointer-events', 'all')
      .style('cursor', 'pointer')
      .on('click', function (event, d) {
        event.stopPropagation()
        handleNodeClick(d)
      })

    // Make node values clickable
    d3.selectAll(svgSelector + ' .node-value')
      .style('pointer-events', 'all')
      .style('cursor', 'pointer')
      .on('click', function (event, d) {
        event.stopPropagation()
        handleNodeClick(d)
      })

    // Make node body (main rectangle) clickable
    d3.selectAll(svgSelector + ' .node-body')
      .style('pointer-events', 'all')
      .style('cursor', 'pointer')
      .on('click', function (event, d) {
        event.stopPropagation()
        handleNodeClick(d)
      })

    // Make backdrop rects clickable too
    d3.selectAll(svgSelector + ' .node-backdrop-title')
      .style('pointer-events', 'all')
      .style('cursor', 'pointer')
      .on('click', function (event, d) {
        event.stopPropagation()
        handleNodeClick(d)
      })

    d3.selectAll(svgSelector + ' .node-backdrop-value')
      .style('pointer-events', 'all')
      .style('cursor', 'pointer')
      .on('click', function (event, d) {
        event.stopPropagation()
        handleNodeClick(d)
      })
  }

  // Attach click handlers immediately and also after transition completes
  setupNodeClickHandlers()
  setTimeout(setupNodeClickHandlers, duration + 100)
}

setTimeout(() => {
  drawUnitSelector()
}, 500)
function drawUnitSelector () {
  d3.select('#unitSelector').append('div').attr('id', 'unitSelectorDiv').style('width', '200px').style('height', '35px').style('position', 'absolute').style('top', '0px').style('right', '0px').append('svg').attr('width', 200).attr('height', 35).attr('id', 'selectorButtonSVGSankey').attr('transform', 'scale(0.8)')
  let sCanvas = d3.select('#selectorButtonSVGSankey').append('g')
  sCanvas.append('rect')
    .attr('id', 'sankeyUnitToggle')
    .attr('x', 50)
    .attr('y', 0)
    .attr('width', 50)
    .attr('height', 25)
    .attr('fill', '#FFF')
    .attr('rx', 12.5).attr('ry', 12.5)
    .style('stroke', '#333')
    .style('stroke-width', 0.5)
    .style('pointer-events', 'auto')
    .on('click', function () {
      if (currentUnit == 'PJ') {currentUnit = 'TWh'} else currentUnit = 'PJ'
      d3.selectAll('#selectorStatus').transition().duration(200).attr('cx', function () {if (currentUnit == 'PJ') { return 63} else return 87})
      setScenario()

      // redraw popup if open
      if (globalPopupData) {
        d3.select('#nodeInfoPopup').remove()
        drawBarGraph(globalPopupData, globalPopupConfig)
      }

      // Update cijferbasis tables if function exists
      if (typeof updateCijferBasisTables === 'function') {
        updateCijferBasisTables()
      }
    })
  sCanvas.append('circle')
    .attr('id', 'selectorStatus')
    .style('pointer-events', 'none')
    .attr('cx', function () {if (currentUnit == 'PJ') { return 63} else return 87})
    .attr('cy', 12.5)
    .attr('r', 10)
    .attr('fill', '#444')
  sCanvas.append('text')
    .attr('x', 12.5 + 7)
    .attr('y', 12.5 + 6)
    .attr('fill', '#444')
    .style('font-size', '15px')
    .style('font-weight', 400)
    .text('PJ')
  sCanvas.append('text')
    .attr('x', 12.5 + 100 + 14 - 13)
    .attr('y', 12.5 + 6)
    .attr('fill', '#444')
    .style('font-size', '15px')
    .style('font-weight', 400)
    .text('TWh')
}

function showValueOnHover (value) {
  const formatMillions = (d) => {
    const scaled = d / 1e6 // Scale the number to millions
    return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(scaled); // Format with '.' as thousands separator
  }
  d3.select('#showValueOnHover').html(function (d) {
    if (value._groups[0][0].__data__.legend == 'co2flow') {
      return value._groups[0][0].__data__.legend + ' | ' + parseInt(value._groups[0][0].__data__.value) * globalCO2flowScale + ' kton CO2'
    } else {
      if (currentUnit == 'TWh') {
        return value._groups[0][0].__data__.legend + ' | ' + parseInt(value._groups[0][0].__data__.value / 3.6) + ' TWh'
      } else { return value._groups[0][0].__data__.legend + ' | ' + parseInt(value._groups[0][0].__data__.value) + ' PJ'}
    }
  } // note

  )
    .style('background-color', value._groups[0][0].__data__.color).interrupt().style('opacity', 1)
  d3.select('#showValueOnHover').transition().duration(4000).style('opacity', 0)
  if (value._groups[0][0].__data__.color == '#F8D377' || value._groups[0][0].__data__.color == '#62D3A4') {d3.select('#showValueOnHover').style('color', 'black')} else {d3.select('#showValueOnHover').style('color', 'white')}
}

// ============================================================
// Custom Backdrop Rectangle Functions
// ============================================================

// Global storage for background rectangles
window.backgroundRectangles = window.backgroundRectangles || []

// Helper function to convert hex color + opacity to rgba
function hexToRgba(hex, opacity) {
  if (!hex) return 'rgba(0, 0, 0, 0)'

  // Remove # if present
  hex = hex.replace('#', '')

  // Parse hex values
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)

  // Convert opacity from 0-100 to 0-1
  const alpha = (opacity || 100) / 100

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Import rectangles data from Excel snky_rectangles sheet
function importRectanglesFromExcel(rectanglesData) {
  console.log('importRectanglesFromExcel() called with data:', rectanglesData)

  if (!rectanglesData || rectanglesData.length === 0) {
    console.log('No rectangles data to import')
    window.backgroundRectangles = []
    return
  }

  window.backgroundRectangles = rectanglesData.map(rect => ({
    id: rect.id || 'rect_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    x: parseFloat(rect.x) || 0,
    y: parseFloat(rect.y) || 0,
    width: parseFloat(rect.width) || 300,
    height: parseFloat(rect.height) || 200,
    title: rect.title || '',
    titlePosition: rect.titlePosition || 'top-left',
    titleFontSize: parseFloat(rect.titleFontSize) || 14,
    titleFontWeight: rect.titleFontWeight || 'normal',
    titleColor: rect.titleColor || '#666666',
    fill: rect.fill || '#dee6ee',
    fillOpacity: parseFloat(rect.fillOpacity) || 100,
    stroke: rect.stroke || '#ffffff',
    strokeOpacity: parseFloat(rect.strokeOpacity) || 100,
    strokeWidth: parseFloat(rect.strokeWidth) || 0,
    cornerRadius: parseFloat(rect.cornerRadius) || 10,
    shadowEnabled: rect.shadowEnabled === true || rect.shadowEnabled === 'true' || rect.shadowEnabled === 1
  }))

  console.log(`Imported ${window.backgroundRectangles.length} rectangles:`, window.backgroundRectangles)
}

// Render background rectangles on the sankey canvas
function renderBackgroundRectangles(config) {
  const sankeyInstanceID = config ? config.sankeyInstanceID : 'energyflows'
  const svgElement = document.querySelector('#' + sankeyInstanceID + '_sankeySVGPARENT')

  if (!svgElement) {
    console.warn('SVG element not found for rendering rectangles:', sankeyInstanceID)
    return
  }

  const svg = d3.select(svgElement)

  // Remove existing rectangles group
  svg.select('.background-rectangles-group').remove()

  if (!window.backgroundRectangles || window.backgroundRectangles.length === 0) {
    console.log('No background rectangles to render')
    return
  }

  // Create new group for rectangles (at the beginning so it's behind everything)
  const rectsGroup = svg.insert('g', ':first-child')
    .attr('class', 'background-rectangles-group')

  // Draw each rectangle
  window.backgroundRectangles.forEach(rect => {
    const rectGroup = rectsGroup.append('g')
      .attr('class', 'background-rectangle')
      .attr('data-rect-id', rect.id)

    // Convert colors with opacity
    const fillColor = hexToRgba(rect.fill, rect.fillOpacity)
    const strokeColor = hexToRgba(rect.stroke, rect.strokeOpacity)

    // Draw the rectangle with rounded corners
    const rectangleElement = rectGroup.append('rect')
      .attr('x', rect.x)
      .attr('y', rect.y)
      .attr('width', rect.width)
      .attr('height', rect.height)
      .attr('rx', rect.cornerRadius)
      .attr('ry', rect.cornerRadius)
      .attr('fill', fillColor)
      .attr('stroke', strokeColor)
      .attr('stroke-width', rect.strokeWidth)
      .style('pointer-events', 'none')

    // Apply subtle shadow if enabled
    if (rect.shadowEnabled) {
      rectangleElement.style('filter', 'drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.15))')
    }

    // Add title text if present
    if (rect.title) {
      const padding = 10
      let titleX, titleY
      let textAnchor = 'start'

      switch (rect.titlePosition) {
        case 'top-left':
          titleX = rect.x + padding
          titleY = rect.y + padding + rect.titleFontSize
          textAnchor = 'start'
          break
        case 'top-center':
          titleX = rect.x + rect.width / 2
          titleY = rect.y + padding + rect.titleFontSize
          textAnchor = 'middle'
          break
        case 'top-right':
          titleX = rect.x + rect.width - padding
          titleY = rect.y + padding + rect.titleFontSize
          textAnchor = 'end'
          break
        case 'center':
          titleX = rect.x + rect.width / 2
          titleY = rect.y + rect.height / 2 + rect.titleFontSize / 2
          textAnchor = 'middle'
          break
        case 'bottom-left':
          titleX = rect.x + padding
          titleY = rect.y + rect.height - padding
          textAnchor = 'start'
          break
        case 'bottom-center':
          titleX = rect.x + rect.width / 2
          titleY = rect.y + rect.height - padding
          textAnchor = 'middle'
          break
        case 'bottom-right':
          titleX = rect.x + rect.width - padding
          titleY = rect.y + rect.height - padding
          textAnchor = 'end'
          break
        default:
          titleX = rect.x + padding
          titleY = rect.y + padding + rect.titleFontSize
          textAnchor = 'start'
      }

      rectGroup.append('text')
        .attr('x', titleX)
        .attr('y', titleY)
        .attr('text-anchor', textAnchor)
        .style('font-size', rect.titleFontSize + 'px')
        .style('font-weight', rect.titleFontWeight)
        .style('fill', rect.titleColor)
        .style('pointer-events', 'none')
        .text(rect.title)
    }
  })

  console.log(`Rendered ${window.backgroundRectangles.length} background rectangles`)
}

// Clear background rectangles
function clearBackgroundRectangles(config) {
  const sankeyInstanceID = config ? config.sankeyInstanceID : 'energyflows'
  const svgElement = document.querySelector('#' + sankeyInstanceID + '_sankeySVGPARENT')

  if (svgElement) {
    d3.select(svgElement).select('.background-rectangles-group').remove()
  }

  window.backgroundRectangles = []
}
