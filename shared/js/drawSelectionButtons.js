// Generic Selection Buttons Module
// Loads configuration from viewer-config.json
//
// Button Color System:
// - Default buttons: white background with black text
// - Highlighted/Active buttons: black background with white text
// - Scenario buttons: use colorGroup from config for inactive state
// - All button styling managed through unified helper functions

let globalActiveToepassing = 'alle'
let globalActiveSector = 'alle'
let viewerConfig = null
let scenarioIdLookup = {}
let lookup_ymaxvalues = {}

// Load viewer configuration
async function loadViewerConfig() {
  // Check if viewerConfig is already loaded from jsonData (dataSource='file')
  if (viewerConfig && viewerConfig.viewer) {
    console.log('Viewer configuration already loaded from zip file:', viewerConfig.viewer.name)
    scenarioIdLookup = viewerConfig.scenarioIdLookup || {}
    lookup_ymaxvalues = viewerConfig.ymaxValues || {}
    return viewerConfig
  }

  // Otherwise, fetch from URL (dataSource='url')
  try {
    const response = await fetch('private/viewer-config.json')
    viewerConfig = await response.json()

    // Set up configuration from loaded data
    scenarioIdLookup = viewerConfig.scenarioIdLookup || {}
    lookup_ymaxvalues = viewerConfig.ymaxValues || {}

    console.log('Viewer configuration loaded from URL:', viewerConfig.viewer.name)
    return viewerConfig
  } catch (error) {
    console.error('Error loading viewer configuration:', error)
    return null
  }
}

// Initialize and draw buttons once config is loaded
async function initSelectionButtons(config) {
  if (!viewerConfig) {
    await loadViewerConfig()
  }

  if (!viewerConfig) {
    console.error('Failed to load viewer configuration')
    return
  }

  // Set version labels based on config
  setVersionLabels()

  drawSelectionButtons(config)
}

function setVersionLabels() {
  if (!viewerConfig || !viewerConfig.viewer) {
    return
  }

  const viewer = viewerConfig.viewer

  // Handle left-side version label
  const versionLabel = document.getElementById('versionLabel')
  if (versionLabel) {
    if (viewer.showVersionLabel === false) {
      versionLabel.style.display = 'none'
    } else if (viewer.versionLabel) {
      versionLabel.textContent = viewer.versionLabel
      versionLabel.style.display = 'block'
    }
  }

  // Handle top-right label
  const topRightLabel = document.getElementById('topRightLabel')
  if (topRightLabel) {
    if (viewer.showTopRightLabel === false) {
      topRightLabel.style.display = 'none'
    } else if (viewer.topRightLabel) {
      topRightLabel.textContent = viewer.topRightLabel
      topRightLabel.style.display = 'block'
    }
  }
}

// Make setVersionLabels globally available (and keep old function name for compatibility)
window.setVersionLabels = setVersionLabels
window.setTopRightLabel = setVersionLabels

// UI-specific color defaults (not data colors)
// Data colors (tno, pbl, etc.) come from viewer-config.json
const uiDefaults = {
  highlighted: '#000000',  // Color for active/selected buttons
  default: '#FFFFFF'       // Default button background
}

// Module-level button helper functions (accessible to all functions in this file)
function setButtonHighlighted(button, highlighted = true) {
  const colors = { ...uiDefaults, ...(viewerConfig.colors || {}) }
  if (highlighted) {
    button.classList.add('highlighted')
    button.style.backgroundColor = colors.highlighted
    button.style.color = 'white'
  } else {
    button.classList.remove('highlighted')
    button.style.backgroundColor = ''
    button.style.color = ''
  }
}

function setButtonsInContainer(container, activeButton, getButtonColor = null) {
  const colors = { ...uiDefaults, ...(viewerConfig.colors || {}) }
  const buttons = container.getElementsByTagName('button')
  for (let i = 0; i < buttons.length; i++) {
    const isActive = buttons[i] === activeButton
    if (isActive) {
      setButtonHighlighted(buttons[i], true)
    } else {
      buttons[i].classList.remove('highlighted')
      // Restore original color if provided
      if (getButtonColor) {
        const bgColor = getButtonColor(buttons[i])
        buttons[i].style.backgroundColor = bgColor || colors.default
        buttons[i].style.color = 'black'
      } else {
        buttons[i].style.backgroundColor = colors.default
        buttons[i].style.color = 'black'
      }
    }
  }
}

function setButtonsInMultipleContainers(containers, activeButton, getButtonColor = null) {
  const colors = { ...uiDefaults, ...(viewerConfig.colors || {}) }
  containers.forEach(container => {
    const buttons = container.getElementsByTagName('button')
    for (let i = 0; i < buttons.length; i++) {
      const isActive = buttons[i] === activeButton
      if (isActive) {
        setButtonHighlighted(buttons[i], true)
      } else {
        buttons[i].classList.remove('highlighted')
        if (getButtonColor) {
          const bgColor = getButtonColor(buttons[i])
          buttons[i].style.backgroundColor = bgColor || colors.default
          buttons[i].style.color = 'black'
        } else {
          buttons[i].style.backgroundColor = colors.default
          buttons[i].style.color = 'black'
        }
      }
    }
  })
}

function drawSelectionButtons(config) {
  // Merge: config colors take precedence, UI defaults as fallback
  const colors = { ...uiDefaults, ...(viewerConfig.colors || {}) }
  const years = viewerConfig.years || []
  const defaults = viewerConfig.defaults || {}

  // SET DEFAULTS
  globalActiveScenario.id = defaults.scenario || 'TNOAT2024_ADAPT'
  globalActiveYear.id = defaults.year || '2030'
  globalActiveEnergyflowsSankey.id = defaults.energyflowsSankey || 'system'
  globalSankeyInstancesActiveDataset = {
    energyflows: {id: defaults.energyflowsSankey || 'system'}
  }
  globalActiveEnergyflowsFilter = defaults.energyflowsFilter || 'system'

  function setScenario(scenario, type) {
    activeScenario = scenarioIdLookup[globalActiveScenario.id]?.[globalActiveYear.id]
    if (activeScenario === undefined) {
      console.warn(`Scenario ${globalActiveScenario.id} is not available for year ${globalActiveYear.id}. Aborting update.`)
      return
    }
    // Use global scenarios from current diagram (updated on diagram switch)
    const currentScenarios = window.currentDiagramScenarios || config.scenarios
    if (!currentScenarios || activeScenario >= currentScenarios.length) {
      console.warn(`Scenario index ${activeScenario} is out of bounds for the loaded data. Scenarios available: ${currentScenarios ? currentScenarios.length : 0}. Aborting update.`)
      return
    }
    currentScenarioID = activeScenario
    currentScenario = globalActiveScenario.id

    // Show/hide the II3050 v3 remarks based on the selected scenario
    const ii3050v3Remarks = document.getElementById('opmerkingen_bij_sankey_ii3050v3')
    if (ii3050v3Remarks) {
      if (globalActiveScenario.id.includes('NBNL') && globalActiveScenario.id.includes('V3')) {
        ii3050v3Remarks.style.display = 'block'
      } else {
        ii3050v3Remarks.style.display = 'none'
      }
    }

    setTimeout(() => {
      drawRemarks()
    }, 500)

    // update all sankeys
    console.log(sankeyInstances)
    sankeyConfigs.forEach(element => {
      config.sankeyDataID = element.sankeyDataID
      tick(config)
    })

    // Update capacity visualization if available
    if (typeof updateCapacityVisualization === 'function') {
      updateCapacityVisualization()
    }

    // Update cijferbasis tables when scenario/year changes
    if (typeof updateCijferBasisTables === 'function') {
      updateCijferBasisTables()
    }

    // Update scenario availability after changing scenario/year
    if (typeof updateScenarioAvailability === 'function') {
      updateScenarioAvailability(config)
    }
  }
  window.setScenario = setScenario

  function updateActiveScenarioIndicator(scenario) {
    let scenarioTitles = {
      IP2024_KA_2025: 'Getoond: SSS',
      DUMMY_2050: 'Getoond: DUMMY - 2050'
    }
    const indicatorScenarios = window.currentDiagramScenarios || config.scenarios
    if (indicatorScenarios && indicatorScenarios[activeScenario]) {
      d3.select('#huidigGetoond').html(scenarioTitles[indicatorScenarios[activeScenario].title])
    }
  }

  // Color lookup function
  function getScenarioColor(colorGroup) {
    return colors[colorGroup] || colors.default
  }

  drawScenarioButtons()
  function drawScenarioButtons() {
    // Build scenarios from config
    const scenarios = (viewerConfig.scenarios || []).map(s => ({
      id: s.id,
      title: s.title,
      color: getScenarioColor(s.colorGroup)
    }))

    let container = document.getElementById('scenarioButtons')
    container.innerHTML = ''

    // Add label
    let label = document.createElement('div')
    label.className = 'menu-label'
    label.textContent = 'Scenario'
    container.appendChild(label)

    const buttonWrapper = document.createElement('div')
    container.appendChild(buttonWrapper)

    // Add buttons
    scenarios.forEach((scenario, index) => {
      let button = document.createElement('button')
      button.textContent = scenario.title
      createButton(button, -1)

      button.style.backgroundColor = scenario.color

      if (index === 0) {
        setButtonHighlighted(button, true)
      }

      button.onclick = function() {
        // Update button states with color restoration
        setButtonsInContainer(buttonWrapper, button, (btn) => {
          const btnScenario = scenarios.find(s => s.title === btn.textContent)
          return btnScenario?.color
        })

        globalActiveScenario = scenario

        const yearButtonsContainer = document.getElementById('yearButtons')
        const yearButtons = yearButtonsContainer.getElementsByTagName('button')

        Array.from(yearButtons).forEach((button, index) => {
          const yearId = years[index]?.id
          if (scenarioIdLookup[globalActiveScenario.id] && scenarioIdLookup[globalActiveScenario.id][yearId] !== undefined) {
            button.disabled = false
            button.style.opacity = '1'
          } else {
            button.disabled = true
            button.style.opacity = '0.5'
          }
        })

        const highlightedButton = yearButtonsContainer.querySelector('.highlighted')
        if (highlightedButton && highlightedButton.disabled) {
          const firstAvailableButton = Array.from(yearButtons).find(btn => !btn.disabled)
          if (firstAvailableButton) {
            firstAvailableButton.click()
          }
        } else {
          setScenario()
        }

        // Show or hide the NBNL overlay
        if (scenario.id.includes('NBNL')) {
          showNbnlOverlay()
        } else if (scenario.id.includes('WLO')) {
          showWloOverlay()
        } else {
          hideNbnlOverlay()
          hideWloOverlay()
        }

        // Set waterfall view to same selection
        if (typeof switchRoutekaart === 'function') {
          try {
            switchRoutekaart({
              scenario: globalActiveScenario.id,
              sector: globalActiveSector,
              routekaart: globalActiveToepassing,
              yMax: getYMax(globalActiveToepassing, globalActiveSector),
              titlesArray: currentTitlesArray,
              colorsArray: currentColorsArray
            })
          } catch (error) {
            console.error('Error in switchRoutekaart:', error)
            const mainSectorButtons = document.getElementById('mainSectorButtons').getElementsByTagName('button')
            const alleSectorenButton = Array.from(mainSectorButtons).find(btn => btn.textContent === 'Alle sectoren')
            if (alleSectorenButton) {
              alleSectorenButton.click()
            }
          }
        }
      }

      buttonWrapper.appendChild(button)
    })
  }

  drawYearButtons()
  function drawYearButtons() {
    let container = document.getElementById('yearButtons')
    container.innerHTML = ''

    // Add label
    let label = document.createElement('div')
    label.className = 'menu-label'
    label.textContent = 'Jaar'
    container.appendChild(label)

    years.forEach((year, index) => {
      let button = document.createElement('button')
      button.textContent = year.title
      createButton(button, -1)

      if (year.id === globalActiveYear.id) {
        setButtonHighlighted(button, true)
      }

      function updateButtonState() {
        const yearId = year.id
        if (scenarioIdLookup[globalActiveScenario.id] && scenarioIdLookup[globalActiveScenario.id][yearId] !== undefined) {
          button.disabled = false
          button.style.opacity = '1'
        } else {
          button.disabled = true
          button.style.opacity = '0.5'
        }
      }

      updateButtonState()

      button.onclick = function() {
        if (button.disabled) return

        setButtonsInContainer(container, button)
        globalActiveYear = year
        setScenario()
      }

      container.appendChild(button)
    })
  }

  drawToepassingButtons()
  function drawToepassingButtons() {
    const toepassing = viewerConfig.toepassingen || [
      {id: 'alle', title: 'Alle toepassingen'},
      {id: 'warmte', title: 'Warmte'},
      {id: 'proces', title: 'Proces'},
      {id: 'transport', title: 'Transport'},
      {id: 'overige', title: 'Overige'}
    ]

    const container = document.getElementById('toepassingenButtons')
    container.innerHTML = ''

    let label = document.createElement('div')
    label.className = 'menu-label'
    label.textContent = 'Toepassing'
    container.appendChild(label)

    toepassing.forEach((toepassing, index) => {
      const button = document.createElement('button')
      button.textContent = toepassing.title
      createButton(button, index)

      button.onclick = function() {
        setButtonsInContainer(container, button)
        globalActiveToepassing = toepassing.id

        updateButtonStates()

        if (typeof switchRoutekaart === 'function') {
          try {
            switchRoutekaart({
              scenario: currentScenario,
              sector: globalActiveSector,
              routekaart: toepassing.id,
              yMax: getYMax(toepassing.id, globalActiveSector),
              titlesArray: currentTitlesArray,
              colorsArray: currentColorsArray
            })
          } catch (error) {
            console.error('Error in switchRoutekaart:', error)
            const mainSectorButtons = document.getElementById('mainSectorButtons').getElementsByTagName('button')
            const alleSectorenButton = Array.from(mainSectorButtons).find(btn => btn.textContent === 'Alle sectoren')
            if (alleSectorenButton) {
              alleSectorenButton.click()
            }
          }
        }
      }

      container.appendChild(button)
    })
  }

  function updateButtonStates() {
    const mainSectorButtons = document.getElementById('mainSectorButtons').getElementsByTagName('button')
    const toepassingButtons = document.getElementById('toepassingenButtons').getElementsByTagName('button')
    const subSectorButtons = document.getElementById('subSectorButtons').getElementsByTagName('button')

    Array.from(mainSectorButtons).forEach(btn => {
      btn.disabled = false
      btn.style.opacity = '1'
    })
    Array.from(toepassingButtons).forEach(btn => {
      btn.disabled = false
      btn.style.opacity = '1'
    })
    Array.from(subSectorButtons).forEach(btn => {
      btn.disabled = false
      btn.style.opacity = '1'
    })

    if (globalActiveToepassing === 'warmte') {
      Array.from(mainSectorButtons).forEach(btn => {
        if (btn.textContent === 'Mobiliteit nationaal' || btn.textContent === 'Mobiliteit internationaal') {
          btn.disabled = true
          btn.style.opacity = '0.5'
        }
      })
    }

    if (globalActiveSector === 'hh' || globalActiveSector === 'ut') {
      Array.from(toepassingButtons).forEach(btn => {
        if (btn.textContent === 'Transport' || btn.textContent === 'Proces') {
          btn.disabled = true
          btn.style.opacity = '0.5'
        }
      })
    }

    if (globalActiveToepassing === 'transport') {
      Array.from(mainSectorButtons).forEach(btn => {
        if (btn.textContent !== 'Mobiliteit nationaal' &&
            btn.textContent !== 'Mobiliteit internationaal' &&
            btn.textContent !== 'Alle sectoren') {
          btn.disabled = true
          btn.style.opacity = '0.5'
        }
      })

      Array.from(subSectorButtons).forEach(btn => {
        btn.disabled = true
        btn.style.opacity = '0.5'
      })
    }
  }

  drawSectorButtons()
  function drawSectorButtons() {
    let mainSectoren = viewerConfig.mainSectoren || [
      {id: 'alle', title: 'Alle sectoren'},
      {id: 'hh', title: 'Huishoudens'},
      {id: 'ut', title: 'Utiliteit'},
      {id: 'lb', title: 'Landbouw'},
      {id: 'mob_nat', title: 'Mobiliteit nationaal'},
      {id: 'mob_int', title: 'Mobiliteit internationaal'},
      {id: 'overige', title: 'Overige'}
    ]

    let subsectoren = viewerConfig.subsectoren || [
      {id: 'ind_alle', title: 'Alle industrie'},
      {id: 'ind_ch', title: 'Chemie'},
      {id: 'ind_km', title: 'Kunstmest'},
      {id: 'ind_fe', title: 'Ferro'},
      {id: 'ind_nf', title: 'Non-ferro'},
      {id: 'ind_fd', title: 'Voedsel'},
      {id: 'ind_ws', title: 'Afval'},
      {id: 'ind_ov', title: 'Industrie Overige'}
    ]

    let mainContainer = document.getElementById('mainSectorButtons')
    let subContainer = document.getElementById('subSectorButtons')

    mainContainer.innerHTML = ''
    subContainer.innerHTML = ''

    let mainLabel = document.createElement('div')
    mainLabel.className = 'menu-label'
    mainLabel.textContent = 'Sector'
    mainContainer.appendChild(mainLabel)

    mainSectoren.forEach((sector, index) => {
      let button = document.createElement('button')
      button.textContent = sector.title
      createButton(button, index)

      button.onclick = function() {
        setButtonsInMultipleContainers([mainContainer, subContainer], button)
        globalActiveSector = sector.id

        updateButtonStates()

        if (typeof switchRoutekaart === 'function') {
          try {
            switchRoutekaart({
              scenario: currentScenario,
              sector: sector.id,
              routekaart: globalActiveToepassing,
              yMax: getYMax(globalActiveToepassing, sector.id),
              titlesArray: currentTitlesArray,
              colorsArray: currentColorsArray
            })
          } catch (error) {
            console.error('Error in switchRoutekaart:', error)
            const alleSectorenButton = Array.from(mainButtons).find(btn => btn.textContent === 'Alle sectoren')
            if (alleSectorenButton) {
              alleSectorenButton.click()
            }
          }
        }
      }

      mainContainer.appendChild(button)
    })

    let subLabel = document.createElement('div')
    subLabel.className = 'menu-label'
    subLabel.textContent = ''
    subContainer.appendChild(subLabel)

    subsectoren.forEach((sector, index) => {
      let button = document.createElement('button')
      button.textContent = sector.title
      createButton(button, -1)

      button.onclick = function() {
        setButtonsInMultipleContainers([mainContainer, subContainer], button)
        globalActiveSector = sector.id

        updateButtonStates()

        try {
          switchRoutekaart({
            scenario: currentScenario,
            sector: sector.id,
            routekaart: globalActiveToepassing,
            yMax: getYMax(globalActiveToepassing, sector.id),
            titlesArray: currentTitlesArray,
            colorsArray: currentColorsArray
          })
        } catch (error) {
          console.error('Error in switchRoutekaart:', error)
          const alleSectorenButton = Array.from(mainButtons).find(btn => btn.textContent === 'Alle sectoren')
          if (alleSectorenButton) {
            alleSectorenButton.click()
          }
        }
      }

      subContainer.appendChild(button)
    })
  }

  drawDiagramButtons()
  function drawDiagramButtons() {
    // Wait for config to be loaded
    if (!viewerConfig) {
      setTimeout(drawDiagramButtons, 100)
      return
    }

    // Check if multiple sankey diagrams are configured
    const diagramConfigs = viewerConfig.sankeyDiagrams
    if (!diagramConfigs || diagramConfigs.length <= 1) {
      // Don't show buttons if only one or no diagrams configured
      return
    }

    // Find or create the diagram buttons container
    let container = document.getElementById('diagramButtons')
    if (!container) {
      // Create container at the top of menuContainer
      const menuContainer = document.getElementById('menuContainer')
      if (!menuContainer) {
        console.warn('menuContainer not found, cannot add diagram buttons')
        return
      }
      container = document.createElement('div')
      container.id = 'diagramButtons'
      container.className = 'menuContainer-part'
      menuContainer.insertBefore(container, menuContainer.firstChild)
    }

    container.innerHTML = ''

    // Add label
    let label = document.createElement('div')
    label.className = 'menu-label'
    label.textContent = 'Diagram'
    container.appendChild(label)

    // Find default/active diagram
    const activeDiagramId = window.activeDiagramId || (diagramConfigs.find(d => d.default) || diagramConfigs[0]).id

    // Add buttons for each diagram
    diagramConfigs.forEach((diagramConfig, index) => {
      let button = document.createElement('button')
      button.textContent = diagramConfig.title
      button.className = 'diagram-selection-button'
      button.dataset.diagramId = diagramConfig.id
      createButton(button, -1)

      // Highlight the active diagram
      if (diagramConfig.id === activeDiagramId) {
        setButtonHighlighted(button, true)
      }

      button.onclick = function() {
        setButtonsInContainer(container, button)

        // Switch to the selected diagram
        if (typeof window.switchDiagram === 'function') {
          window.switchDiagram(diagramConfig.id)
        } else {
          console.error('switchDiagram function not available')
        }
      }

      container.appendChild(button)
    })
  }
}

drawSankeyEnergiestromenSelectieButtons()
function drawSankeyEnergiestromenSelectieButtons() {
  // Wait for config to be loaded
  if (!viewerConfig) {
    setTimeout(drawSankeyEnergiestromenSelectieButtons, 100)
    return
  }

  let focusOptions = viewerConfig.focusOptions || [
    {id: 'system', title: 'Integraal'},
    {id: 'electricity', title: 'Elektriciteitsketen'},
    {id: 'hydrogen', title: 'Waterstofketen'},
    {id: 'heat', title: 'Warmteketen'},
    {id: 'carbon', title: 'Koolstofketen'}
  ]

  let container = document.getElementById('sankeyEnergiestromenSelectieMenu')
  container.innerHTML = ''

  let label = document.createElement('div')
  label.className = 'menu-label'
  label.textContent = 'Scope'
  container.appendChild(label)

  focusOptions.forEach((focus, index) => {
    let button = document.createElement('button')
    button.textContent = focus.title
    createButton(button, index)

    button.onclick = function() {
      setButtonsInContainer(container, button)

      globalActiveEnergyflowsSankey = focus
      globalActiveEnergyflowsFilter = focus.id

      switch (focus.id) {
        case 'system':
          d3.select('#sankeyTitle').html('Integraal')
          break
        case 'electricity':
          d3.select('#sankeyTitle').html('Elektriciteitsketen')
          break
        case 'hydrogen':
          d3.select('#sankeyTitle').html('Waterstofketen')
          break
        case 'heat':
          d3.select('#sankeyTitle').html('Warmteketen')
          break
        case 'carbon':
          d3.select('#sankeyTitle').html('Koolstofketen')
          break
        default:
          break
      }

      setScenario()
    }

    container.appendChild(button)
  })
}

// Y-MAX LOOKUP
function getYMax(toepassing, sector) {
  const baseKey = `${toepassing}_${sector}`
  const values = lookup_ymaxvalues[baseKey] ?? [2500, 500, 2500]
  return ['boven', 'midden', 'onder'].map((_, i) => values[i])
}

function showNbnlOverlay() {
  const waterfallContainer = document.getElementById('SVGContainer_waterfalldiagram')
  if (waterfallContainer) {
    waterfallContainer.style.display = 'none'
  }

  const wrapper = document.querySelector('.scaled-wrapper-waterfall')
  if (wrapper) {
    let messageElement = wrapper.querySelector('#nbnl-message')
    if (!messageElement) {
      messageElement = document.createElement('div')
      messageElement.id = 'nbnl-message'
      messageElement.style.textAlign = 'center'
      messageElement.style.padding = '200px 0'
      messageElement.style.fontSize = '13px'
      messageElement.style.color = '#333'
      messageElement.textContent = "Dit diagram is nog niet beschikbaar voor scenario's afkomstig uit het ETM."
      wrapper.appendChild(messageElement)
    }
    messageElement.style.display = 'block'
  }

  const menuContainer2 = document.getElementById('menuContainer2')
  if (menuContainer2) {
    menuContainer2.style.opacity = '0.5'
    const buttons = menuContainer2.getElementsByTagName('button')
    for (const button of buttons) {
      button.disabled = true
    }
  }
}

function hideNbnlOverlay() {
  const waterfallContainer = document.getElementById('SVGContainer_waterfalldiagram')
  if (waterfallContainer) {
    waterfallContainer.style.display = 'block'
  }

  const wrapper = document.querySelector('.scaled-wrapper-waterfall')
  if (wrapper) {
    const messageElement = wrapper.querySelector('#nbnl-message')
    if (messageElement) {
      messageElement.style.display = 'none'
    }
  }

  const menuContainer2 = document.getElementById('menuContainer2')
  if (menuContainer2) {
    menuContainer2.style.opacity = '1'
    const buttons = menuContainer2.getElementsByTagName('button')
    for (const button of buttons) {
      button.disabled = false
    }
  }
}

function showWloOverlay() {
  const waterfallContainer = document.getElementById('SVGContainer_waterfalldiagram')
  if (waterfallContainer) {
    waterfallContainer.style.display = 'none'
  }

  const wrapper = document.querySelector('.scaled-wrapper-waterfall')
  if (wrapper) {
    let messageElement = wrapper.querySelector('#wlo-message')
    if (!messageElement) {
      messageElement = document.createElement('div')
      messageElement.id = 'wlo-message'
      messageElement.style.textAlign = 'center'
      messageElement.style.padding = '200px 0'
      messageElement.style.fontSize = '13px'
      messageElement.style.color = '#333'
      messageElement.textContent = "Dit diagram is niet beschikbaar voor het geslecteerde scenario."
      wrapper.appendChild(messageElement)
    }
    messageElement.style.display = 'block'
  }

  const menuContainer2 = document.getElementById('menuContainer2')
  if (menuContainer2) {
    menuContainer2.style.opacity = '0.5'
    const buttons = menuContainer2.getElementsByTagName('button')
    for (const button of buttons) {
      button.disabled = true
    }
  }
}

function hideWloOverlay() {
  const waterfallContainer = document.getElementById('SVGContainer_waterfalldiagram')
  if (waterfallContainer) {
    waterfallContainer.style.display = 'block'
  }

  const wrapper = document.querySelector('.scaled-wrapper-waterfall')
  if (wrapper) {
    const messageElement = wrapper.querySelector('#wlo-message')
    if (messageElement) {
      messageElement.style.display = 'none'
    }
  }

  const menuContainer2 = document.getElementById('menuContainer2')
  if (menuContainer2) {
    menuContainer2.style.opacity = '1'
    const buttons = menuContainer2.getElementsByTagName('button')
    for (const button of buttons) {
      button.disabled = false
    }
  }
}

function createButton(button, index) {
  // Base button styles - consistent across all button types
  const baseStyles = {
    className: 'button-black button-outline',
    textTransform: 'lowercase',
    display: 'inline-block',
    margin: '3px',
    fontWeight: '300',
    border: '0px solid black',
    color: 'black',
    backgroundColor: 'white',
    padding: '4px 8px',
    lineHeight: '1.2',
    fontSize: '12px',
    textAlign: 'center',
    height: '26px',
    width: 'auto',
    minWidth: 'auto',
    maxWidth: 'none',
    borderRadius: '3px',
    transition: 'all 0.2s ease',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  }

  button.className = baseStyles.className
  Object.keys(baseStyles).forEach(key => {
    if (key !== 'className') {
      button.style[key] = baseStyles[key]
    }
  })

  if (index === 0) {
    button.classList.add('highlighted')
  }
}

// Auto-load config when script loads (only for URL mode, not for file mode)
// When dataSource='file', the config will be loaded from the zip file by loadData.js
if (typeof dataSource === 'undefined' || dataSource === 'url') {
  loadViewerConfig().then(() => {
    // Apply version labels immediately after config loads
    setVersionLabels()
  })
}
