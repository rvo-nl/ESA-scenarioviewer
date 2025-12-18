let globalActiveToepassing = 'alle'
let globalActiveSector = 'alle'

function drawSelectionButtons (config) {
  let scenarioIdLookup = {
     'TNOAT2024_ADAPT': {
      2030: 0,
      2035: 1,
      2040: 2,
      2045: 3,
      2050: 4,
    },
    'TNOAT2024_TRANSFORM': {
      2030: 5,
      2035: 6,
      2040: 7,
      2045: 8,
      2050: 9
    },
    'TNOAT2024_TRANSFORM_CI': {
      2030: 10,
      2035: 11,
      2040: 12,
      2045: 13,
      2050: 14
    },
    'TNOAT2024_TRANSFORM_MC': {
      2030: 15,
      2035: 16,
      2040: 17,
      2045: 18,
      2050: 19
    },
    'TNOAT2024_TRANSFORM_MCI': {
      2030: 20,
      2035: 21,
      2040: 22,
      2045: 23,
      2050: 24
    },
    'PBLTVKN2024_OP_CO2_opslag_40': {
      2030: 25,
      2035: 26,
      2040: 27,
      2045: 28,
      2050: 29
    },
    'PBLTVKN2024_OptimistischSelectiefFossilCarbonPenalty': {
      2030: 30,
      2035: 31,
      2040: 32,
      2045: 33,
      2050: 34
    },
    'PBLTVKN2024_PP_CCS_30_in_2050': {
      2030: 35,
      2035: 36,
      2040: 37,
      2045: 38,
      2050: 39
    },
    'NBNL2025_koersvaste_middenweg': {
      2025: 40,
      2030: 41,
      2035: 42,
      2040: 43,
      2050: 44
    },
    'NBNL2025_eigen_vermogen': {
      2030: 45,
      2035: 46,
      2040: 47,
      2050: 48    },
    'NBNL2025_gezamenlijke_balans': {
      2030: 49,
      2035: 50,
      2040: 51,
      2050: 52
    },
    'NBNL2025_horizon_aanvoer': {
      2030: 53,
      2035: 54,
      2040: 55,
      2050: 56
    },
    'NBNL2023_nationale_drijfveren': {
      2025: 57,
      2030: 58,
      2035: 59,
      2040: 60,
      2050: 61
    },
    'NBNL2023_internationale_ambitie': {
      2025: 62,
      2030: 63,
      2035: 64,
      2040: 65,
      2050: 66
    },
    'PBLWLO2025_HOOGSNEL': {
      2040: 67,
      2050: 68,
      2060: 69,
    },
    'PBLWLO2025_LAAGSNEL': {
      2040: 70,
      2050: 71,
      2060: 72,
    },
    'PBLWLO2025_HOOGVERTRAAGD': {
      2040: 73,
      2050: 74,
      2060: 75,
    },
    'BLWLO2025_LAAGVERTRAAGD': {
      2040: 76,
      2050: 77,
      2060: 78,
    },
  }
  const years = [
    {id: '2025', title: '2025'},
    {id: '2030', title: '2030'},
    {id: '2035', title: '2035'},
    {id: '2040', title: '2040'},
    {id: '2045', title: '2045'},
    {id: '2050', title: '2050'},
    {id: '2055', title: '2055'},
    {id: '2060', title: '2060'},
  ]
  // SET DEFAULTS
  globalActiveScenario.id = 'TNOAT2024_ADAPT'
  globalActiveYear.id = '2030'
  globalActiveEnergyflowsSankey.id = 'system'
  globalSankeyInstancesActiveDataset = {
    energyflows: {id: 'system'}
  }
  globalActiveEnergyflowsFilter = 'system'
  // globalActiveWACC.id = 'WACC_standaard'

  // console.log(scenarioIdLookup)

  function setScenario (scenario, type) {

    // d3.select('#remarksContainer').html('')
    // d3.selectAll('.buttonRect_' + config.targetDIV).attr('fill', '#fff')
    // d3.selectAll('.buttonText_' + config.targetDIV).attr('fill', '#333')
    // d3.select('#scenariobutton_' + scenario + '_rect').attr('fill', '#333')
    // d3.select('#scenariobutton_' + scenario + '_text').attr('fill', '#fff')
    activeScenario = scenario

    activeScenario = scenarioIdLookup[globalActiveScenario.id][globalActiveYear.id]
    if (activeScenario === undefined) {
      console.warn(`Scenario ${globalActiveScenario.id} is not available for year ${globalActiveYear.id}. Aborting update.`)
      return; // Do not proceed to update the chart
    }
    // Check if the activeScenario index is valid for the currently loaded data
    if (!config.scenarios || activeScenario >= config.scenarios.length) {
      console.warn(`Scenario index ${activeScenario} is out of bounds for the loaded data. Scenarios available: ${config.scenarios.length}. Aborting update.`);
      return;
    }
    currentScenarioID = activeScenario // neaten
    currentScenario = globalActiveScenario.id
    // console.log(globalActiveScenario.id)
    // console.log(config)
    // 
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
      updateCapacityVisualization();
    }

    // Update cijferbasis tables when scenario/year changes
    if (typeof updateCijferBasisTables === 'function') {
      updateCijferBasisTables();
    }
  }
  window.setScenario = setScenario // make setScenario available globally

  function updateActiveScenarioIndicator (scenario) {
  
    let scenarioTitles = {
      IP2024_KA_2025: 'Getoond: SSS',
      DUMMY_2050: 'Getoond: DUMMY - 2050'
    }
    d3.select('#huidigGetoond').html(scenarioTitles[config.scenarios[activeScenario].title])
  }

  const colorTNO = '#B3E9FE'
  const colorPBL = '#A7E6CB'
  const colorNBNLv2 = '#F2D8CD'
  const colorNBNLv3 = '#FDEFCE'

  drawScenarioButtons()
  function drawScenarioButtons () {
    let scenarios = [

      {id: 'TNOAT2024_ADAPT', title: 'TNO | ADAPT', color: colorTNO},
      {id: 'TNOAT2024_TRANSFORM', title: 'TNO | TRANSFORM', color: colorTNO},
      {id: 'TNOAT2024_TRANSFORM_CI', title: 'TNO | TRANSFORM | Competitief & Import', color: colorTNO},
      {id: 'TNOAT2024_TRANSFORM_MC', title: 'TNO | TRANSFORM | Minder Competitief', color: colorTNO},
      {id: 'TNOAT2024_TRANSFORM_MCI', title: 'TNO | TRANSFORM | Minder Competitief & Import', color: colorTNO},
      {id: 'PBLTVKN2024_OP_CO2_opslag_40', title: 'PBL | TVKN | Pragmatisch Ruim 40', color: colorPBL},
      {id: 'PBLTVKN2024_OptimistischSelectiefFossilCarbonPenalty', title: 'PBL | TVKN | Specifiek Ruim 20', color: colorPBL},
      {id: 'PBLTVKN2024_PP_CCS_30_in_2050', title: 'PBL | TVKN | Pragmatisch Beperkt 30', color: colorPBL},
      {id: 'PBLWLO2025_HOOGSNEL', title: 'PBL | WLO | Hoog Snel', color: colorPBL},
      {id: 'PBLWLO2025_LAAGSNEL', title: 'PBL | WLO | Laag Snel', color: colorPBL},
      {id: 'PBLWLO2025_HOOGVERTRAAGD', title: 'PBL | WLO | Hoog Vertraagd', color: colorPBL},
      {id: 'PBLWLO2025_LAAGVERTRAAGD', title: 'PBL | WLO | Laag Vertraagd', color: colorPBL},
      {id: 'NBNL2025_koersvaste_middenweg', title: 'NBNL | 2025 | Koersvaste Middenweg', color: colorNBNLv3},
      {id: 'NBNL2025_eigen_vermogen', title: 'NBNL | 2025 | Eigen Vermogen', color: colorNBNLv3},
      {id: 'NBNL2025_gezamenlijke_balans', title: 'NBNL | 2025 | Gezamenlijke Balans', color: colorNBNLv3},
      {id: 'NBNL2025_horizon_aanvoer', title: 'NBNL | 2025 | Horizon Aanvoer', color: colorNBNLv3},
      {id: 'NBNL2023_nationale_drijfveren', title: 'NBNL | II3050 v2 | Nationale Drijfveren', color: colorNBNLv2},
      {id: 'NBNL2023_internationale_ambitie', title: 'NBNL | II3050 v2 | Internationale Ambitie', color: colorNBNLv2},
     
      // {id: 'SRMPA', title: 'Specifiek Ruim - Minder plastic afval'},

    ]

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
      createButton(button, -1) // Pass -1 to prevent default highlighting

      if (scenario.color) {
        button.style.backgroundColor = scenario.color
      }

      if (index === 0) {
        button.classList.add('highlighted')
        button.style.backgroundColor = 'black'
        button.style.color = 'white'
      }

      button.onclick = function () {
        let buttons = buttonWrapper.getElementsByTagName('button')
        for (let i = 0; i < buttons.length; i++) {
          buttons[i].classList.remove('highlighted')
          // find scenario for button to restore color
          const btnScenario = scenarios.find(s => s.title === buttons[i].textContent)
          if (btnScenario && btnScenario.color) {
            buttons[i].style.backgroundColor = btnScenario.color
            buttons[i].style.color = 'black'
          } else {
            buttons[i].style.backgroundColor = 'white'
            buttons[i].style.color = 'black'
          }
        }
        button.classList.add('highlighted')
        button.style.backgroundColor = 'black'
        button.style.color = 'white'

        globalActiveScenario = scenario
        
        const yearButtonsContainer = document.getElementById('yearButtons');
        const yearButtons = yearButtonsContainer.getElementsByTagName('button');

        Array.from(yearButtons).forEach((button, index) => {
          const yearId = years[index].id;
          if (scenarioIdLookup[globalActiveScenario.id] && scenarioIdLookup[globalActiveScenario.id][yearId] !== undefined) {
            button.disabled = false;
            button.style.opacity = '1';
          } else {
            button.disabled = true;
            button.style.opacity = '0.5';
          }
        });

        const highlightedButton = yearButtonsContainer.querySelector('.highlighted');
        if (highlightedButton && highlightedButton.disabled) {
          const firstAvailableButton = Array.from(yearButtons).find(btn => !btn.disabled);
          if (firstAvailableButton) {
            firstAvailableButton.click();
          }
        } else {
          setScenario()
        }
        
        // Show or hide the NBNL overlay
        if (scenario.id.includes('NBNL')) {
          showNbnlOverlay();
        } else if (scenario.id.includes('WLO')) {
          showWloOverlay();
        } else {
          hideNbnlOverlay();
          hideWloOverlay();
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
            // Fallback to 'alle sectoren' if an error occurs
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
  function drawYearButtons () {
    let years = [
      {id: '2025', title: '2025'},
      {id: '2030', title: '2030'},
      {id: '2035', title: '2035'},
      {id: '2040', title: '2040'},
      {id: '2045', title: '2045'},
      {id: '2050', title: '2050'},
      {id: '2055', title: '2055'},
      {id: '2060', title: '2060'},
    ]

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
      createButton(button, -1) // Pass -1 to prevent default highlighting

      if (year.id === globalActiveYear.id) {
        button.classList.add('highlighted')
      }

      // Function to update button states
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

      // Initial state
      updateButtonState()

      button.onclick = function () {
        if (button.disabled) return // Don't allow clicking disabled buttons
        
        let buttons = container.getElementsByTagName('button')
        for (let i = 0; i < buttons.length; i++) {
          buttons[i].classList.remove('highlighted')
        }
        button.classList.add('highlighted')
        globalActiveYear = year
        setScenario()
      }

      container.appendChild(button)
    })

    // Add event listener to update year button states when scenario changes
    // const scenarioButtons = document.getElementById('scenarioButtons')
    // scenarioButtons.addEventListener('click', function() {
    //   setTimeout(() => {
    //     const yearButtons = container.getElementsByTagName('button')
    //     const yearsData = [
    //       {id: '2025', title: '2025'}, {id: '2030', title: '2030'}, {id: '2035', title: '2035'}, 
    //       {id: '2040', title: '2040'}, {id: '2045', title: '2045'}, {id: '2050', title: '2050'}
    //     ];

    //     Array.from(yearButtons).forEach((button, index) => {
    //       const yearId = yearsData[index].id;
    //       if (scenarioIdLookup[globalActiveScenario.id] && scenarioIdLookup[globalActiveScenario.id][yearId] !== undefined) {
    //         button.disabled = false
    //         button.style.opacity = '1'
    //       } else {
    //         button.disabled = true
    //         button.style.opacity = '0.5'
    //       }
    //     })

    //     // Check if the currently selected year is now disabled. If so, select the first available year.
    //     const highlightedButton = container.querySelector('.highlighted')
    //     if (highlightedButton && highlightedButton.disabled) {
    //       const firstAvailableButton = Array.from(yearButtons).find(btn => !btn.disabled)
    //       if (firstAvailableButton) {
    //         firstAvailableButton.click()
    //       }
    //     }
    //   }, 0)
    // })
  }

  drawToepassingButtons()

function drawToepassingButtons () {
  const toepassing = [
    {id: 'alle', title: 'Alle toepassingen'},
    {id: 'warmte', title: 'Warmte'},
    {id: 'proces', title: 'Proces'},
    {id: 'transport', title: 'Transport'},
    {id: 'overige', title: 'Overige'}
  ]

  const container = document.getElementById('toepassingenButtons')
  container.innerHTML = ''

  // Add label
  let label = document.createElement('div')
  label.className = 'menu-label'
  label.textContent = 'Toepassing'
  container.appendChild(label)

  toepassing.forEach((toepassing, index) => {
    const button = document.createElement('button')
    button.textContent = toepassing.title
    createButton(button, index)

    button.onclick = function () {
      Array.from(container.getElementsByTagName('button')).forEach(btn => {
        btn.classList.remove('highlighted')
      })
      button.classList.add('highlighted')
      globalActiveToepassing = toepassing.id
      
      // Update button states based on selection
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
          // Switch to 'alle sectoren' if an error occurs
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
  // Get all sector buttons
  const mainSectorButtons = document.getElementById('mainSectorButtons').getElementsByTagName('button')
  const toepassingButtons = document.getElementById('toepassingenButtons').getElementsByTagName('button')
  const subSectorButtons = document.getElementById('subSectorButtons').getElementsByTagName('button')
  
  // Reset all buttons to enabled state
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
  
  // If 'warmte' is selected, disable mobility sectors
  if (globalActiveToepassing === 'warmte') {
    Array.from(mainSectorButtons).forEach(btn => {
      if (btn.textContent === 'Mobiliteit nationaal' || btn.textContent === 'Mobiliteit internationaal') {
        btn.disabled = true
        btn.style.opacity = '0.5'
      }
    })
  }
  
  // If 'huishoudens' or 'utiliteit' is selected, disable transport and proces
  if (globalActiveSector === 'hh' || globalActiveSector === 'ut') {
    Array.from(toepassingButtons).forEach(btn => {
      if (btn.textContent === 'Transport' || btn.textContent === 'Proces') {
        btn.disabled = true
        btn.style.opacity = '0.5'
      }
    })
  }

  // If 'transport' is selected, disable non-mobility sectors
  if (globalActiveToepassing === 'transport') {
    // Disable main sector buttons
    Array.from(mainSectorButtons).forEach(btn => {
      if (btn.textContent !== 'Mobiliteit nationaal' && 
          btn.textContent !== 'Mobiliteit internationaal' && 
          btn.textContent !== 'Alle sectoren') {
        btn.disabled = true
        btn.style.opacity = '0.5'
      }
    })
    
    // Disable all subsector buttons
    Array.from(subSectorButtons).forEach(btn => {
      btn.disabled = true
      btn.style.opacity = '0.5'
    })
  }
}



  drawSectorButtons()
  function drawSectorButtons () {
    let mainSectoren = [
      {id: 'alle', title: 'Alle sectoren'},
      {id: 'hh', title: 'Huishoudens'},
      {id: 'ut', title: 'Utiliteit'},
      {id: 'lb', title: 'Landbouw'},
      {id: 'mob_nat', title: 'Mobiliteit nationaal'},
      {id: 'mob_int', title: 'Mobiliteit internationaal'},
      {id: 'overige', title: 'Overige'}
    ]

    let subsectoren = [
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

    // Add main sector label
    let mainLabel = document.createElement('div')
    mainLabel.className = 'menu-label'
    mainLabel.textContent = 'Sector'
    mainContainer.appendChild(mainLabel)

    // Create main sectors buttons
    mainSectoren.forEach((sector, index) => {
      let button = document.createElement('button')
      button.textContent = sector.title
      createButton(button, index)

      button.onclick = function () {
        // Remove highlight from all buttons in both containers
        let mainButtons = mainContainer.getElementsByTagName('button')
        let subButtons = subContainer.getElementsByTagName('button')
        
        for (let i = 0; i < mainButtons.length; i++) {
          mainButtons[i].classList.remove('highlighted')
        }
        for (let i = 0; i < subButtons.length; i++) {
          subButtons[i].classList.remove('highlighted')
        }
        
        button.classList.add('highlighted')
        globalActiveSector = sector.id

        // Update button states based on selection
        updateButtonStates()

        // Set waterfall view to same selection
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
            // Fallback to 'alle sectoren' if an error occurs
            const alleSectorenButton = Array.from(mainButtons).find(btn => btn.textContent === 'Alle sectoren')
            if (alleSectorenButton) {
              alleSectorenButton.click()
            }
          }
        }
      }

      mainContainer.appendChild(button)
    })

    // Add subsector label
    let subLabel = document.createElement('div')
    subLabel.className = 'menu-label'
    subLabel.textContent = ''
    subContainer.appendChild(subLabel)

    // Create subsector buttons
    subsectoren.forEach((sector, index) => {
      let button = document.createElement('button')
      button.textContent = sector.title
      createButton(button, -1) // Pass -1 to prevent default highlighting

      button.onclick = function () {
        // Remove highlight from all buttons in both containers
        let mainButtons = mainContainer.getElementsByTagName('button')
        let subButtons = subContainer.getElementsByTagName('button')
        
        for (let i = 0; i < mainButtons.length; i++) {
          mainButtons[i].classList.remove('highlighted')
        }
        for (let i = 0; i < subButtons.length; i++) {
          subButtons[i].classList.remove('highlighted')
        }
        
        button.classList.add('highlighted')
        globalActiveSector = sector.id

        // Update button states based on selection
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
          // Switch to 'alle sectoren' if an error occurs
          const alleSectorenButton = Array.from(mainButtons).find(btn => btn.textContent === 'Alle sectoren')
          if (alleSectorenButton) {
            alleSectorenButton.click()
          }
        }
      }

      subContainer.appendChild(button)
    })
  }
  // init

// updateActiveScenarioIndicator(activeScenario)
}

drawSankeyEnergiestromenSelectieButtons()
function drawSankeyEnergiestromenSelectieButtons () {
  let focusOptions = [
    {id: 'system', title: 'Energiesysteem'},
    {id: 'electricity', title: 'Elektriciteitsketen'},
    {id: 'hydrogen', title: 'Waterstofketen'},
    {id: 'heat', title: 'Warmteketen'},
    {id: 'carbon', title: 'Koolstofketen'}
  ]

  let container = document.getElementById('sankeyEnergiestromenSelectieMenu')

  // Clear existing content in case the function is called multiple times
  container.innerHTML = ''

  // Add label
  let label = document.createElement('div')
  label.className = 'menu-label'
  label.textContent = 'Scope'
  container.appendChild(label)

  focusOptions.forEach((focus, index) => {
    let button = document.createElement('button')
    button.textContent = focus.title
    createButton(button, index)

    button.onclick = function () {
      // Remove 'highlighted' class from all buttons
      let buttons = container.getElementsByTagName('button')
      for (let i = 0; i < buttons.length; i++) {
        buttons[i].classList.remove('highlighted')
      }
      // Add 'highlighted' class to the clicked button
      button.classList.add('highlighted')

      globalActiveEnergyflowsSankey = focus
      globalActiveEnergyflowsFilter = focus.id

      switch (focus.id) {
        case 'system':
          d3.select('#sankeyTitle').html('Energiesysteem')
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




// LOOKUP YVALUES


function getYMax(toepassing, sector) {
  const baseKey = `${toepassing}_${sector}`;
  const values = lookup_ymaxvalues[baseKey] ?? [2500, 500, 2500];
  return ['boven', 'midden', 'onder'].map((_, i) => values[i]);
}

// Define only one set of values per toepassing+sector combo
const lookup_ymaxvalues = {
  "alle_alle": [2500, 1000, 2500],
  "warmte_hh": [400, 1000, 400],
  "overige_hh": [100, 1000, 100],
  "warmte_ut": [150, 1000, 150],
  "overige_ut": [200, 1000, 200],
  "warmte_lb": [60, 1000, 60],
  "overige_lb": [50, 1000, 50],
  "proces_lb": [100, 1000, 100],
  "warmte_ind_ch": [200, 1000, 200],
  "overige_ind_ch": [100, 1000, 100],
  "proces_ind_ch": [500, 1000, 500],
  "warmte_ind_km": [20, 1000, 20],
  "overige_ind_km": [2500, 1000, 2500],
  "proceschart_opbouw_ind_km": [100, 1000, 100],
  "warmte_ind_fe": [20, 1000, 20],
  "overige_ind_fe": [10, 1000, 10],
  "proces_ind_fe": [100, 1000, 100],
  "warmte_ind_nf": [5, 1000, 5],
  "overige_ind_nf": [10, 1000, 10],
  "proces_ind_nf": [10, 1000, 10],
  "warmte_ind_fd": [50, 1000, 50],
  "overige_ind_fd": [100, 1000, 100],
  "proces_ind_fd": [50, 1000, 50],
  "warmte_ind_ws": [20, 1000, 20],
  "overige_ind_ws": [10, 1000, 10],
  "proces_ind_ws": [20, 1000, 20],
  "warmte_ind_ov": [100, 1000, 100],
  "overige_ind_ov": [50, 1000, 50],
  "proces_ind_ov": [2500, 1000, 2500],
  "transport_mob_nat": [400, 1000, 400],
  "overige_mob_nat": [2500, 1000, 2500],
  "transport_mob_int": [600, 1000, 600],
  "overige_mob_int": [2500, 1000, 2500],
  "warmte_overige": [100, 1000, 100],
  "overige_overige": [75, 1000, 75],
  "proces_overige": [2500, 1000, 2500],
  "warmte_alle": [800, 1000, 800],
  "overige_alle": [700, 1000, 700],
  "proces_alle": [850, 1000, 850],
  "transport_alle": [1000, 1000, 1000],
  "warmte_ind_alle": [300, 1000, 300],
  "overige_ind_alle": [225, 1000, 225],
  "proces_ind_alle": [700, 1000, 700],
  "alle_ind_alle": [1200, 1200, 1200],
  "alle_ind_ch": [650, 1000, 650],
  "alle_ind_km": [130, 1000, 130],
  "alle_ind_fe": [130, 1000, 130],
  "alle_ind_nf": [30, 1000, 30],
  "alle_ind_fd": [200, 1000, 200],
  "alle_ind_ws": [50, 1000, 50],
  "alle_ind_ov": [300, 1000, 300],
  "alle_hh": [450, 1000, 450],
  "alle_ut": [300, 1000, 300],
  "alle_lb": [100, 1000, 100],
  "alle_mob_nat": [400, 1000, 400],
  "alle_mob_int": [600, 1000, 600],
  "alle_overige": [100, 1000, 100]
};

function showNbnlOverlay() {
  const waterfallContainer = document.getElementById('SVGContainer_waterfalldiagram');
  if (waterfallContainer) {
    waterfallContainer.style.display = 'none';
  }

  const wrapper = document.querySelector('.scaled-wrapper-waterfall');
  if (wrapper) {
    let messageElement = wrapper.querySelector('#nbnl-message');
    if (!messageElement) {
      messageElement = document.createElement('div');
      messageElement.id = 'nbnl-message';
      messageElement.style.textAlign = 'center';
      messageElement.style.padding = '200px 0';
      messageElement.style.fontSize = '13px';
      messageElement.style.color = '#333';
      messageElement.textContent = "Dit diagram is nog niet beschikbaar voor scenario's afkomstig uit het ETM.";
      wrapper.appendChild(messageElement);
    }
    messageElement.style.display = 'block';
  }

  const menuContainer2 = document.getElementById('menuContainer2');
  if (menuContainer2) {
    menuContainer2.style.opacity = '0.5';
    const buttons = menuContainer2.getElementsByTagName('button');
    for (const button of buttons) {
      button.disabled = true;
    }
  }
}

function hideNbnlOverlay() {
  const waterfallContainer = document.getElementById('SVGContainer_waterfalldiagram');
  if (waterfallContainer) {
    waterfallContainer.style.display = 'block';
  }

  const wrapper = document.querySelector('.scaled-wrapper-waterfall');
  if (wrapper) {
    const messageElement = wrapper.querySelector('#nbnl-message');
    if (messageElement) {
      messageElement.style.display = 'none';
    }
  }

  const menuContainer2 = document.getElementById('menuContainer2');
  if (menuContainer2) {
    menuContainer2.style.opacity = '1';
    const buttons = menuContainer2.getElementsByTagName('button');
    for (const button of buttons) {
      button.disabled = false;
    }
  }
}

function showWloOverlay() {
  const waterfallContainer = document.getElementById('SVGContainer_waterfalldiagram');
  if (waterfallContainer) {
    waterfallContainer.style.display = 'none';
  }

  const wrapper = document.querySelector('.scaled-wrapper-waterfall');
  if (wrapper) {
    let messageElement = wrapper.querySelector('#wlo-message');
    if (!messageElement) {
      messageElement = document.createElement('div');
      messageElement.id = 'wlo-message';
      messageElement.style.textAlign = 'center';
      messageElement.style.padding = '200px 0';
      messageElement.style.fontSize = '13px';
      messageElement.style.color = '#333';
      messageElement.textContent = "Dit diagram is niet beschikbaar voor het geslecteerde scenario.";
      wrapper.appendChild(messageElement);
    }
    messageElement.style.display = 'block';
  }

  const menuContainer2 = document.getElementById('menuContainer2');
  if (menuContainer2) {
    menuContainer2.style.opacity = '0.5';
    const buttons = menuContainer2.getElementsByTagName('button');
    for (const button of buttons) {
      button.disabled = true;
    }
  }
}

function hideWloOverlay() {
  const waterfallContainer = document.getElementById('SVGContainer_waterfalldiagram');
  if (waterfallContainer) {
    waterfallContainer.style.display = 'block';
  }

  const wrapper = document.querySelector('.scaled-wrapper-waterfall');
  if (wrapper) {
    const messageElement = wrapper.querySelector('#wlo-message');
    if (messageElement) {
      messageElement.style.display = 'none';
    }
  }

  const menuContainer2 = document.getElementById('menuContainer2');
  if (menuContainer2) {
    menuContainer2.style.opacity = '1';
    const buttons = menuContainer2.getElementsByTagName('button');
    for (const button of buttons) {
      button.disabled = false;
    }
  }
}

function createButton(button, index) {
  button.className = 'button-black button-outline'
  button.style.textTransform = 'lowercase'
  button.style.display = 'inline-block'
  button.style.margin = '3px'
  button.style.fontWeight = 300
  button.style.border = '0px solid black'
  button.style.color = 'black'
  button.style.backgroundColor = 'white'
  button.style.padding = '4px 8px'
  button.style.lineHeight = '1.2'
  button.style.fontSize = '12px'
  button.style.textAlign = 'center'
  button.style.height = '26px'
  button.style.width = 'auto'
  button.style.minWidth = 'auto'
  button.style.maxWidth = 'none'
  button.style.borderRadius = '3px'
  button.style.transition = 'all 0.2s ease'
  button.style.overflow = 'hidden'
  button.style.textOverflow = 'ellipsis'
  button.style.whiteSpace = 'nowrap'

  if (index === 0) {
    button.classList.add('highlighted')
  }
}