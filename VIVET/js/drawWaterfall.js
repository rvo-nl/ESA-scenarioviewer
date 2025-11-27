// ============================================================================
// WATERFALL DIAGRAM BACKDROP AND OVERLAY
// ============================================================================


// let currentScenario = 'nat'
// let currentSector = 'all'
// let currentRoutekaart = 'w'
// let currentYMax = [2300, 1000, 2300]
// let currentTitlesArray = ['Elektriciteit', 'Waterstof', 'Warmte', 'Biomassa', 'Synthetisch', 'Olie, kolen, afval', 'Methaan', 'Aardwarmte', 'Omgevingswarmte']
// let currentColorsArray = ['#E99172', '#F8D377', '#3F88AE', '#DD5471', '#62D3A4', '#aaaaaa', '#666666', '#444']
let sankeyModeActive = false
let currentZichtjaar = '2020'
// let currentUnit = 'PJ'

function drawMainContainerBackdrop (config) {
  let width = 1920
  let height = 1080

  d3.select('#mainContainerBackdropSVG').remove()
  d3.select('#mainContainerOverlaySVG').remove()

  d3.select('#mainContainerBackdrop').append('svg')
    .attr('width', width).attr('height', height)
    // .style('background-color', 'red')
    .style('position', 'absolute')
    .style('top', '0px')
    .attr('id', 'mainContainerBackdropSVG')
    // .style('background-color', 'green')
    // .attr('transform', 'translate(100,0)')

  d3.select('#mainContainerOverlay').append('svg')
    .attr('width', width).attr('height', height)
    // .style('background-color', 'red')
    .style('position', 'absolute')
    .style('top', '0px')
    .attr('id', 'mainContainerOverlaySVG')
    // .attr('transform', 'translate(100,0)')

  let canvasBackdrop = d3.select('#mainContainerBackdropSVG').append('g')
  let canvasOverlay = d3.select('#mainContainerOverlaySVG').append('g')

  let colorsArray = config.colorsArray

  // add domain lines

  canvasBackdrop.append('text')
    .attr('fill', '#111')
    .attr('x', 0) // Start at origin for x
    .attr('y', 0) // Start at origin for y
    .text('Routekaart Energiesysteem')
    .style('font-size', '24px')
    .attr('transform', `translate(${21}, 60)`)

  // BUTTONS SCENARIOS

  // Function to create a text element
  function createText (parent, id, fill, fontSize, x, y, textContent) {
    let textElement = parent.append('text')
      .attr('id', id)
      .attr('fill', fill)
      .style('font-size', fontSize)
      .attr('x', x)
      .attr('y', y)
      .text(textContent)

    return textElement
  }

  // Function to create a button
  function createButton (parent, id, width, height, fillCondition, x, y, onClick) {
    let buttonElement = parent.append('rect')
      .attr('id', id)
      .attr('width', width)
      .attr('height', height)
      .attr('fill', fillCondition)
      .attr('x', x)
      .attr('y', y)
      .style('stroke', '#333')
      .style('stroke-width', 0.5)
      .attr('rx', 17.5)
      .attr('ry', 17.5)
      .style('pointer-events', 'all')
      .on('click', onClick)

    return buttonElement
  }

  // Function to update scenario buttons
  function updateScenarioButtons (scenario) {
    d3.selectAll('.scenario-button').attr('fill', '#FFF')
    d3.selectAll('.scenario-text').attr('fill', '#444')

    d3.select(`#button_rect_scenario_${scenario}`).attr('fill', '#444')
    d3.select(`#button_text_scenario_${scenario}`).attr('fill', '#FFF')
  }

  // Add backdrop text
  canvasBackdrop.append('text')
    .attr('fill', '#333')
    .style('font-weight', 500)
    .attr('x', 70)
    .attr('y', 0)
    .text('Scenario')
    .style('text-anchor', 'end')
    .style('font-size', '17px')
    .attr('transform', `translate(22, 120)`)

  // Scenario NAT Button
  createButton(canvasOverlay, 'button_rect_scenario_nat', 405, 35, () => currentScenario == 'nat' ? '#444' : '#FFF', 280 - 160, 98, () => {
    currentScenario = 'nat'
    updateScenarioButtons('nat')
    switchRoutekaart({ scenario: currentScenario, sector: currentSector, routekaart: currentRoutekaart, yMax: currentYMax, titlesArray: currentTitlesArray, colorsArray: currentColorsArray })
    if (sankeyModeActive) { globalSetScenario(lookupScenarioID());  drawWaterfallBackButton()}
  })
  createText(canvasOverlay, 'button_text_scenario_nat', currentScenario == 'nat' ? '#FFF' : '#444', '14px', 292 - 160, 120, 'Nationale Drijfveren (IP2024), Nationaal Leiderschap (II3050)')

  // Scenario INT Button
  createButton(canvasOverlay, 'button_rect_scenario_int', 410, 35, () => currentScenario == 'int' ? '#333' : '#FFF', 695 - 160, 98, () => {
    currentScenario = 'int'
    updateScenarioButtons('int')
    switchRoutekaart({ scenario: currentScenario, sector: currentSector, routekaart: currentRoutekaart, yMax: currentYMax, titlesArray: currentTitlesArray, colorsArray: currentColorsArray })
    if (sankeyModeActive) { globalSetScenario(lookupScenarioID());  drawWaterfallBackButton()}
  })
  createText(canvasOverlay, 'button_text_scenario_int', currentScenario == 'int' ? '#FFF' : '#333', '14px', 707 - 160, 120, 'Internationale Ambitie (IP2024), Internationale Handel (II3050)')

  // Scenario NPE Button
  createButton(canvasOverlay, 'button_rect_scenario_npe', 150, 35, () => currentScenario == 'npe' ? '#444' : '#DDD', 120 + 800 + 35, 98, () => {
    // currentScenario = 'npe'
    // updateScenarioButtons('npe')
    // switchRoutekaart({ scenario: currentScenario, sector: currentSector, routekaart: currentRoutekaart, yMax: currentYMax, titlesArray: currentTitlesArray, colorsArray: currentColorsArray })
    // if (sankeyModeActive) { globalSetScenario(lookupScenarioID());  drawWaterfallBackButton()}
  })
  createText(canvasOverlay, 'button_text_scenario_npe', currentScenario == 'npe' ? '#fff' : '#aaa', '14px', 995, 120, 'Scenario C')

  // Backdrop text for section
  canvasBackdrop.append('text')
    .attr('fill', '#333')
    .style('font-weight', 500)
    .attr('x', 70)
    .attr('y', 0)
    .text('Toepassing')
    .style('text-anchor', 'end')
    .style('font-size', '17px')
    .attr('transform', `translate(22, 165)`)

  // Heat (Warmte) Button
  createButton(canvasOverlay, 'button_rect_routekaart_warmte', 70, 35, () => currentRoutekaart == 'w' ? '#444' : '#FFF', 120, 143, () => {
    currentRoutekaart = 'w'
    currentSector = 'all'
    currentYMax = [1300, 100, 1300]
    currentTitlesArray = ['Directe elektrificatie (COP~1)', 'Directe elektrificatie (COP>1)', 'Waterstofnet', 'Warmtenet', 'Biobrandstoffen', 'Omgevings-, zonne- en aardwarmte', 'Aardgas, olie, kolen', 'CCS']
    currentColorsArray = ['#E99172', '#F8D377', '#3F88AE', '#DD5471', '#62D3A4', '#aaaaaa', '#666666', '#444']
    switchRoutekaart({ scenario: currentScenario, sector: currentSector, routekaart: currentRoutekaart, yMax: currentYMax, titlesArray: currentTitlesArray, colorsArray: currentColorsArray })
    d3.selectAll('.routekaart-button').attr('fill', '#FFF')
    d3.select('#button_rect_routekaart_warmte').attr('fill', '#444')
    d3.selectAll('.routekaart-text').attr('fill', '#444')
    d3.select('#button_text_routekaart_warmte').attr('fill', '#FFF')
  })
  createText(canvasOverlay, 'button_text_routekaart_warmte', currentRoutekaart == 'w' ? '#FFF' : '#444', '14px', 130, 165, 'Warmte')

  // Other (Overige) Button
  createButton(canvasOverlay, 'button_rect_routekaart_overige', 450, 35, () => currentRoutekaart == 'o' ? '#444' : '#FFF', 285, 143, () => {
    currentRoutekaart = 'o'
    currentSector = 'all'
    currentYMax = [1300, 100, 1300]
    currentTitlesArray = ['Elektriciteit licht, apparaten', 'Elektriciteit koeling', 'Elektriciteit eigen verbruik e.sector', 'Elektriciteit CCS', 'Omgevingskoude', 'Elektriciteit overige', 'Elektriciteit export', 'CCS']
    currentColorsArray = ['#E99172', '#F8D377', '#3F88AE', '#DD5471', '#62D3A4', '#aaaaaa', '#666666', '#444']
    switchRoutekaart({ scenario: currentScenario, sector: currentSector, routekaart: currentRoutekaart, yMax: currentYMax, titlesArray: currentTitlesArray, colorsArray: currentColorsArray })
    d3.selectAll('.routekaart-button').attr('fill', '#FFF')
    d3.select('#button_rect_routekaart_overige').attr('fill', '#444')
    d3.selectAll('.routekaart-text').attr('fill', '#444')
    d3.select('#button_text_routekaart_overige').attr('fill', '#FFF')
  })
  createText(canvasOverlay, 'button_text_routekaart_overige', currentRoutekaart == 'o' ? '#FFF' : '#444', '14px', 297, 165, 'Elektriciteit (licht, koeling, ongespecificeerd finaal verbruik en export)')

  // Mobility (Mobiliteit) Button
  createButton(canvasOverlay, 'button_rect_routekaart_mobiliteit', 75, 35, () => currentRoutekaart == 'm' ? '#444' : '#FFF', 200, 143, () => {
    currentRoutekaart = 'm'
    currentSector = 'all'
    currentYMax = [550, 100, 550]
    currentTitlesArray = ['Elektriciteit', 'Waterstof en ammoniak', 'Biobrandstoffen', 'LNG, CNG, LPG', 'Kerosine', 'Diesel (fossiel), benzine', 'Kolen', 'CCS']
    currentColorsArray = ['#E99172', '#3F88AE', '#62D3A4', '#DD5471', '#F8D377' , '#666666', '#aaaaaa', '#444']
    switchRoutekaart({ scenario: currentScenario, sector: currentSector, routekaart: currentRoutekaart, yMax: currentYMax, titlesArray: currentTitlesArray, colorsArray: currentColorsArray })
    d3.selectAll('.routekaart-button').attr('fill', '#FFF')
    d3.select('#button_rect_routekaart_mobiliteit').attr('fill', '#444')
    d3.selectAll('.routekaart-text').attr('fill', '#444')
    d3.select('#button_text_routekaart_mobiliteit').attr('fill', '#FFF')
  })
  createText(canvasOverlay, 'button_text_routekaart_mobiliteit', currentRoutekaart == 'm' ? '#FFF' : '#444', '14px', 210, 165, 'Mobiliteit')

  // Non-energetic (Non-energetisch) Button
  createButton(canvasOverlay, 'button_rect_routekaart_nonenergetisch', 212, 35, () => currentRoutekaart == 'n' ? '#444' : '#FFF', 745, 143, () => {
    currentRoutekaart = 'n'
    currentSector = 'all'
    currentYMax = [3500, 100, 3500]
    currentTitlesArray = ['Kolen', 'Olie', 'Aardgas', 'Biomassa', 'Waterstof', 'Cokes', 'Ongespecificeerd', 'CCS']
    currentColorsArray = ['#E99172', '#F8D377', '#3F88AE', '#62D3A4', '#DD5471', '#aaaaaa', '#666666', '#444']
    switchRoutekaart({ scenario: currentScenario, sector: currentSector, routekaart: currentRoutekaart, yMax: currentYMax, titlesArray: currentTitlesArray, colorsArray: currentColorsArray })
    d3.selectAll('.routekaart-button').attr('fill', '#FFF')
    d3.select('#button_rect_routekaart_nonenergetisch').attr('fill', '#444')
    d3.selectAll('.routekaart-text').attr('fill', '#444')
    d3.select('#button_text_routekaart_nonenergetisch').attr('fill', '#FFF')
  })
  createText(canvasOverlay, 'button_text_routekaart_nonenergetisch', currentRoutekaart == 'n' ? '#FFF' : '#333', '14px', 755, 165, 'Grondstoffen, non-energetisch')

  // Additional buttons
  canvasOverlay.append('rect')
    .attr('width', 142)
    .attr('height', 35)
    .attr('fill', '#FFF')
    .attr('x', 967)
    .attr('y', 143)
    .style('stroke', '#333')
    .style('stroke-width', 0.5)
    .attr('rx', 17.5)
    .attr('ry', 17.5)
    .attr('id', 'onderdeelSelectie_0')
    .style('pointer-events', 'all')

  createText(canvasOverlay, null, '#999', '14px', 977, 165, 'Bunkerbrandstoffen')

  // BUTTONS SECTOREN

  canvasOverlay
    .append('text')
    .attr('fill', '#333')
    .style('font-size', '17px')
    .style('text-anchor', 'end')
    .style('font-weight', 500)
    .attr('x', 90)
    .attr('y', 210)
    .attr('id', 'sectorLabel')
    .text('Sector')

  switch (currentRoutekaart) {
    case 'w':
      drawSectorButtons()
      d3.select('#sectorLabel').text('Sector')
      break
    case 'm':
      drawModaliteitButtons()
      d3.select('#sectorLabel').text('Modaliteit')
      break
    case 'n':
      drawNonEnergetischButtons()
      d3.select('#sectorLabel').text('Sector')
      break
    case 'o':
      drawOverigeButtons()
      d3.select('#sectorLabel').text('Sector')
      break

    default:
      break
  }

  function drawSectorButtons () {
    d3.selectAll('.sectorButtonItem, .modaliteitButtonItem, .sectorNonButtonItem, .sectorOverigeButton').remove()

    const sectors = [
      { id: 'all', text: 'Alle sectoren', x: 120, width: 100, yMax: [1400, 100, 1400] },
      { id: 'go', text: 'Gebouwde Omgeving', x: 230, width: 158, yMax: [600, 100, 600] },
      { id: 'ind', text: 'Industrie', x: 398, width: 88 - 10, yMax: [800, 100, 800] },
      { id: 'ag', text: 'Landbouw', x: 497 - 10, width: 88, yMax: [200, 10, 200] }
    ]

    sectors.forEach(sector => {
      canvasOverlay.append('rect')
        .attr('id', `button_rect_sector_${sector.id}`)
        .attr('class', 'sectorButtonItem')
        .attr('width', sector.width)
        .attr('height', 35)
        .attr('fill', () => currentSector === sector.id ? '#444' : '#FFF')
        .attr('x', sector.x)
        .attr('y', 188)
        .style('stroke', '#333')
        .style('stroke-width', 0.5)
        .attr('rx', 17.5)
        .attr('ry', 17.5)
        .style('pointer-events', 'all')
        .on('click', () => {
          currentSector = sector.id
          currentYMax = sector.yMax
          switchRoutekaart({
            scenario: currentScenario,
            sector: sector.id,
            routekaart: currentRoutekaart,
            yMax: sector.yMax,
            titlesArray: currentTitlesArray,
            colorsArray: currentColorsArray
          })

          // Update colors for all buttons
          sectors.forEach(s => {
            d3.select(`#button_rect_sector_${s.id}`).attr('fill', currentSector === s.id ? '#444' : '#FFF')
            d3.select(`#button_text_sector_${s.id}`).attr('fill', currentSector === s.id ? '#FFF' : '#444')
          })
        })

      canvasOverlay.append('text')
        .attr('id', `button_text_sector_${sector.id}`)
        .attr('class', 'sectorButtonItem')
        .attr('fill', () => currentSector === sector.id ? '#FFF' : '#444')
        .style('font-size', '14px')
        .attr('x', sector.x + 10)
        .attr('y', 210)
        .text(sector.text)
    })
  }

  function drawModaliteitButtons () {
    d3.selectAll('.sectorButtonItem, .modaliteitButtonItem, .sectorNonButtonItem, .sectorOverigeButton').remove()

    const modaliteiten = [
      { id: 'all', text: 'Alle modaliteiten', x: 120, width: 125, yMax: [550, 100, 550] },
      { id: 'au', text: 'Auto', x: 255, width: 48, yMax: [300, 100, 300] },
      { id: 'bbus', text: 'Bestelbus', x: 313, width: 85, yMax: [100, 100, 100] },
      { id: 'bus', text: 'Bus', x: 408, width: 45, yMax: [20, 100, 20] },
      { id: 'vw', text: 'Vrachtwagen', x: 463, width: 103, yMax: [500, 100, 500] },
      { id: 'schip', text: 'Schip', x: 576, width: 58, yMax: [20, 100, 20] },
      { id: 'vtg', text: 'Vliegtuig', x: 644, width: 76, yMax: [2, 100, 2] },
      { id: 'tp', text: 'Trein passagier', x: 730, width: 118, yMax: [20, 100, 20] },
      { id: 'tv', text: 'Trein vracht', x: 858, width: 98, yMax: [5, 100, 5] },
      { id: 'mf', text: 'Motorfiets', x: 966, width: 82, yMax: [5, 100, 5] },
      { id: 'f', text: 'Fiets', x: 1058, width: 53, yMax: [5, 100, 5] }
    ]

    modaliteiten.forEach(modaliteit => {
      canvasOverlay.append('rect')
        .attr('id', `button_rect_modaliteit_${modaliteit.id}`)
        .attr('class', 'modaliteitButtonItem')
        .attr('width', modaliteit.width)
        .attr('height', 35)
        .attr('fill', () => currentSector === modaliteit.id ? '#444' : '#FFF')
        .attr('x', modaliteit.x)
        .attr('y', 188)
        .style('stroke', '#333')
        .style('stroke-width', 0.5)
        .attr('rx', 17.5)
        .attr('ry', 17.5)
        .style('pointer-events', 'all')
        .on('click', () => {
          currentSector = modaliteit.id
          currentYMax = modaliteit.yMax
          switchRoutekaart({
            scenario: currentScenario,
            sector: modaliteit.id,
            routekaart: currentRoutekaart,
            yMax: modaliteit.yMax,
            titlesArray: currentTitlesArray,
            colorsArray: currentColorsArray
          })

          // Update colors for all buttons
          modaliteiten.forEach(m => {
            d3.select(`#button_rect_modaliteit_${m.id}`).attr('fill', currentSector === m.id ? '#444' : '#FFF')
            d3.select(`#button_text_modaliteit_${m.id}`).attr('fill', currentSector === m.id ? '#FFF' : '#444')
          })
        })

      canvasOverlay.append('text')
        .attr('id', `button_text_modaliteit_${modaliteit.id}`)
        .attr('class', 'modaliteitButtonItem')
        .attr('fill', () => currentSector === modaliteit.id ? '#FFF' : '#444')
        .style('font-size', '14px')
        .attr('x', modaliteit.x + 10)
        .attr('y', 210)
        .text(modaliteit.text)
    })
  }

  function drawOverigeButtons () {
    d3.selectAll('.sectorButtonItem, .modaliteitButtonItem, .sectorNonButtonItem, .sectorOverigeButton').remove()

    const overigeButtons = [
      { id: 'all', text: 'Alle sectoren', x: 120, width: 100, yMax: [1400, 100, 1400] },
      { id: 'go', text: 'Gebouwde Omgeving', x: 230, width: 158, yMax: [600, 100, 600] },
      { id: 'ind', text: 'Industrie', x: 398, width: 78, yMax: [800, 100, 800] },
      { id: 'ag', text: 'Landbouw', x: 487, width: 88, yMax: [300, 10, 300] },
      { id: 'en', text: 'Energie', x: 586, width: 69, yMax: [500, 10, 500] }
    ]

    overigeButtons.forEach(button => {
      canvasOverlay.append('rect')
        .attr('id', `button_rect_sector_${button.id}`)
        .attr('class', 'sectorOverigeButton')
        .attr('width', button.width)
        .attr('height', 35)
        .attr('fill', () => currentSector === button.id ? '#444' : '#FFF')
        .attr('x', button.x)
        .attr('y', 188)
        .style('stroke', '#333')
        .style('stroke-width', 0.5)
        .attr('rx', 17.5)
        .attr('ry', 17.5)
        .style('pointer-events', 'all')
        .on('click', () => {
          currentSector = button.id
          currentYMax = button.yMax
          switchRoutekaart({
            scenario: currentScenario,
            sector: button.id,
            routekaart: currentRoutekaart,
            yMax: button.yMax,
            titlesArray: currentTitlesArray,
            colorsArray: currentColorsArray
          })

          // Update colors for all buttons
          overigeButtons.forEach(b => {
            d3.select(`#button_rect_sector_${b.id}`).attr('fill', currentSector === b.id ? '#444' : '#FFF')
            d3.select(`#button_text_sector_${b.id}`).attr('fill', currentSector === b.id ? '#FFF' : '#444')
          })
        })

      canvasOverlay.append('text')
        .attr('id', `button_text_sector_${button.id}`)
        .attr('class', 'sectorOverigeButton')
        .attr('fill', () => currentSector === button.id ? '#FFF' : '#444')
        .style('font-size', '14px')
        .attr('x', button.x + 10)
        .attr('y', 210)
        .text(button.text)
    })
  }

  function drawNonEnergetischButtons () {
    d3.selectAll('.sectorButtonItem, .modaliteitButtonItem, .sectorNonButtonItem, .sectorOverigeButton').remove()

    const nonEnergetischButtons = [
      { id: 'all', text: 'Alle sectoren', x: 120, width: 100, yMax: [3500, 100, 3500] },
      { id: 'km', text: 'Kunstmest', x: 230, width: 88, yMax: [100, 100, 100] },
      { id: 'ch', text: 'Chemie', x: 328, width: 70, yMax: [500, 100, 500] },
      { id: 'raf', text: 'Raffinaderijen', x: 409, width: 108, yMax: [3000, 10, 3000] },
      { id: 'mo', text: 'Mobiliteit', x: 529, width: 77, yMax: [550, 10, 550] },
      { id: 'on', text: 'Ongespecificeerd', x: 618, width: 131, yMax: [50, 10, 50] }
    ]

    nonEnergetischButtons.forEach(button => {
      canvasOverlay.append('rect')
        .attr('id', `button_rect_sectornon_${button.id}`)
        .attr('class', 'sectorNonButtonItem')
        .attr('width', button.width)
        .attr('height', 35)
        .attr('fill', () => currentSector === button.id ? '#444' : '#FFF')
        .attr('x', button.x)
        .attr('y', 188)
        .style('stroke', '#333')
        .style('stroke-width', 0.5)
        .attr('rx', 17.5)
        .attr('ry', 17.5)
        .style('pointer-events', 'all')
        .on('click', () => {
          currentSector = button.id
          currentYMax = button.yMax
          switchRoutekaart({
            scenario: currentScenario,
            sector: button.id,
            routekaart: currentRoutekaart,
            yMax: button.yMax,
            titlesArray: currentTitlesArray,
            colorsArray: currentColorsArray
          })

          // Update colors for all buttons
          nonEnergetischButtons.forEach(b => {
            d3.select(`#button_rect_sectornon_${b.id}`).attr('fill', currentSector === b.id ? '#444' : '#FFF')
            d3.select(`#button_text_sectornon_${b.id}`).attr('fill', currentSector === b.id ? '#FFF' : '#444')
          })
        })

      canvasOverlay.append('text')
        .attr('id', `button_text_sectornon_${button.id}`)
        .attr('class', 'sectorNonButtonItem')
        .attr('fill', () => currentSector === button.id ? '#FFF' : '#444')
        .style('font-size', '14px')
        .attr('x', button.x + 10)
        .attr('y', 210)
        .text(button.text)
    })
  }

  switch (currentRoutekaart) {
    case 'w':
      drawSectorButtons()
      d3.select('#sectorLabel').text('Sector')
      d3.select('#button_rect_routekaart_warmte').attr('fill', '#444')
      d3.select('#button_text_routekaart_warmte').attr('fill', '#FFF')
      break
    case 'm':
      drawModaliteitButtons()
      d3.select('#sectorLabel').text('Modaliteit')
      d3.select('#button_rect_routekaart_mobiliteit').attr('fill', '#444')
      d3.select('#button_text_routekaart_mobiliteit').attr('fill', '#FFF')
      break
    case 'e':
      // dont draw any sectoral buttons
      d3.select('#sectorLabel').text('')
      d3.select('#button_rect_routekaart_elektriciteitsaanbod').attr('fill', '#444')
      d3.select('#button_text_routekaart_elektriciteitsaanbod').attr('fill', '#FFF')
      break
    case 'o':
      drawOverigeButtons()
      d3.select('#sectorLabel').text('Sector')
      d3.select('#button_rect_routekaart_overige').attr('fill', '#444')
      d3.select('#button_text_routekaart_overige').attr('fill', '#FFF')
      break
    case 'n':
      drawNonEnergetischButtons()
      d3.select('#sectorLabel').text('Sector')
      d3.select('#button_rect_routekaart_nonenergetisch').attr('fill', '#444')
      d3.select('#button_text_routekaart_nonenergetisch').attr('fill', '#FFF')
    default:
      break
  }

  // DOMAIN LINES
  canvasOverlay.append('rect')
    .attr('fill', '#000')
    .style('opacity', 0.2)
    .attr('width', 1208)
    .attr('height', 1)
    .attr('y', 620)
    .attr('x', 150)

  canvasOverlay.append('rect')
    .attr('fill', '#000')
    .style('opacity', 0.2)
    .attr('width', 1208)
    .attr('height', 1)
    .attr('y', 702)
    .attr('x', 150)

  canvasOverlay.append('rect')
    .attr('fill', '#000')
    .style('opacity', 0.2)
    .attr('width', 1208)
    .attr('height', 1)
    .attr('y', 970)
    .attr('x', 150)

  const createRects = (xPositions, width, height, yPosition, step, count) => {
    for (let i = 0; i < count; i++) {
      xPositions.forEach(xBase => {
        canvasBackdrop.append('rect')
          .attr('width', width)
          .attr('height', height)
          .attr('fill', '#FFF')
          .attr('y', yPosition)
          .attr('x', i * step + xBase)
      })
    }
  }

  // Verticale vlakken jaartotalen
  const jaartotalenXPositions = [150]
  const jaartotalenStep = 287.5 + 24.05

  createRects(jaartotalenXPositions, 42, 190+63, 388+0, jaartotalenStep, 5)
  // createRects(jaartotalenXPositions, 42, 97, 613, jaartotalenStep, 5)
  createRects(jaartotalenXPositions, 42, 194+63, 750-62, jaartotalenStep, 5)

  // Verticale vlakken maatregelen
  const maatregelenXPositions = [220, 507.5 + 24.05, 795 + 24.05 + 24.05, 1082.5 + 24.05 + 24.05 + 24.05]
  const maatregelenStep = 24

  createRects(maatregelenXPositions, 22, 190+63, 388, maatregelenStep, 9)
  // createRects(maatregelenXPositions, 22, 97, 613, maatregelenStep, 9)
  createRects(maatregelenXPositions, 22, 194+63, 750-62, maatregelenStep, 9)

  let titlesArray = config.titlesArray
  for (cnt = 0;cnt < 4;cnt++) {
    for (i = 0;i < 9;i++) {
      canvasBackdrop.append('text')
        .attr('fill', '#000')
        .attr('x', 125) // Start at origin for x
        .attr('y', 115) // Start at origin for y
        .text(titlesArray[i])
        .style('font-size', '13px')
        .attr('transform', `translate(${ i * 24+cnt*(24.05+ 287.5)+62}, ${376}) rotate(-45)`)

      canvasBackdrop.append('rect')
        .attr('fill', colorsArray[i])
        .attr('x', i * 24 + cnt * (287.3 + 24.05) + 220)
        .attr('y', 377)
        .attr('width', 22)
        .attr('height', 5)
    }
  }

  let yearsArray = ['2030', '2035', '2040', '2045', '2050']
  for (i = 0;i < 5;i++) {
    canvasBackdrop.append('text')

      // .style('font-weight', 100)
      .attr('fill', '#666')
      .attr('x', 0 + 100) // Start at origin for x
      .attr('y', 110) // Start at origin for y
      .text(yearsArray[i])
      .style('font-size', '24px')
      .attr('transform', `translate(${i*(287+24.05)+20}, ${358}) rotate(-45)`)

      // canvasBackdrop.append('rect')
      //   .attr('id', 'zichtjaar_' + yearsArray[i])
      //   .attr('width', 80)
      //   .attr('height', 25)
      //   .attr('fill', 'white')
      //   .style('stroke', '#333')
      //   .style('stroke-width', 0.5)
      //   .attr('rx', 12.5)
      //   .attr('ry', 12.5)
      //   .attr('transform', `translate(${i*287+198}, ${304}) rotate(-45)`)
      //   .style('pointer-events', 'all')
      //   .on('click', function () {
      //     sankeyModeActive = true
      //     currentZichtjaar = this.id.substring(10)
      //   // drawSankey(this.id.substring(10))
      //   })

  // canvasBackdrop.append('text')
  //   .attr('fill', '#666')
  //   .style('font-weight', 500)
  //   .attr('x', 0 + 100) // Start at origin for x
  //   .attr('y', 110) // Start at origin for y
  //   .text('Toon Sankey')
  //   .style('font-size', '12px')
  //   .attr('transform', `translate(${i*287+66}, ${305}) rotate(-45)`)
  }

  canvasBackdrop.append('text')
    .attr('fill', '#666')
    .attr('x', 0) // Start at origin for x
    .attr('y', 0) // Start at origin for y
    .text('OPBOUW')
    .style('font-size', '22px')
    .attr('transform', `translate(${40}, ${550}) rotate(-90)`)

  canvasBackdrop.append('text')
    .attr('fill', '#666')
    .attr('x', 0) // Start at origin for x
    .attr('y', 0) // Start at origin for y
    .text(function () { if (currentUnit == 'PJ') {return 'CO2-vrij (PJ/jaar)'}else {return 'CO2-vrij (TWh/jaar)'}})
    .style('font-size', '14px')
    .attr('transform', `translate(${80}, ${553}) rotate(-90)`)

  // canvasBackdrop.append('text')
  //   .attr('fill', '#666')
  //   .attr('x', 0) // Start at origin for x
  //   .attr('y', 0) // Start at origin for y
  //   .text('CC(S)')
  //   .style('font-size', '22px')
    // .attr('transform', `translate(${40}, ${708}) rotate(-90)`)

  // canvasBackdrop.append('text')
  //   .attr('fill', '#666')
  //   .attr('x', 0) // Start at origin for x
  //   .attr('y', 0) // Start at origin for y
  //   .text(function () { if (currentUnit == 'PJ') {return '(PJ/jaar)'}else {return '(TWh/jaar)'}})
  //   .style('font-size', '14px')
  //   .attr('transform', `translate(${80}, ${706}) rotate(-90)`)

  canvasBackdrop.append('text')
    .attr('fill', '#666')
    .attr('x', 0) // Start at origin for x
    .attr('y', 0) // Start at origin for y
    .text('AFBOUW')
    .style('font-size', '22px')
    .attr('transform', `translate(${40}, ${888}) rotate(-90)`)

  canvasBackdrop.append('text')
    .attr('fill', '#666')
    .attr('x', 0) // Start at origin for x
    .attr('y', 0) // Start at origin for y
    .text(function () { if (currentUnit == 'PJ') {return 'Fossiel (PJ/jaar)'}else {return 'Fossiel (TWh/jaar)'}})
    .style('font-size', '14px')
    .attr('transform', `translate(${80}, ${893}) rotate(-90)`)

  canvasBackdrop.append('text')
    .attr('fill', '#666')
    .attr('x', 0) // Start at origin for x
    .attr('y', 0) // Start at origin for y
    .text('De grafiek toont het verbruik van primaire energie om aan de finale vraag van de geselecteerde toepassing te voldoen.')
    .style('font-size', '14px')
    .attr('transform', `translate(${110}, ${1010})`)
}

function switchRoutekaart (config) {
  d3.selectAll('#waterfallSVG').remove()
  let data
  switch (config.scenario) {
    case 'npe':
      data = dataset_c
      break
    case 'nat':
      data = dataset_nat
      break
    case 'int':
      data = dataset_int
      break
    default:
      break
  }
  drawWaterfallDiagram(data,
    {divID: 'opbouw',
      chartID: '.chart_opbouw',
      sheetID: config.routekaart + '_op_' + config.sector,
      yOffsetJaarTotalen: 259+63,
      annualMaxValueCorrect: 0,
      titlesArray: config.titlesArray,
      colorsArray: config.colorsArray,
      yMax: config.yMax[0], marginLeft: -100, marginTop: 25, marginBottom: 30, yTicks: 5, classTag: 'A'
    })
  // drawWaterfallDiagram(data,
  //   {divID: 'ccs',
  //     chartID: '.chart_ccs',
  //     sheetID: config.routekaart + '_cc_' + config.sector,
  //     yOffsetJaarTotalen: 53,
  //     annualMaxValueCorrect: 0,
  //     titlesArray: config.titlesArray,
  //     colorsArray: config.colorsArray,
  //     yMax: config.yMax[1], marginLeft: -100, marginTop: 100,marginBottom: 30, yTicks: 3, classTag: 'B'
  //   })
  drawWaterfallDiagram(data, {
    divID: 'afbouw',chartID: '.chart_afbouw',
    sheetID: config.routekaart + '_af_' + config.sector,
    yOffsetJaarTotalen: 239+62,
    annualMaxValueCorrect: 0,
    titlesArray: config.titlesArray,
    colorsArray: config.colorsArray,
  yMax: config.yMax[2], marginLeft: -100, marginBottom: 50,marginTop: 5, yTicks: 5, classTag: 'C'})
}

// function drawSankey (zichtjaar) {
//   d3.select('#sankeyContainer').style('visibility', 'visible')

//   sankeyfy({
//     mode: 'xlsx',
//     xlsxURL: '/private/sankeydata.xlsx',
//     // xlsxURL: '/gitexclude/analysesheets/ANALYSEBESTAND II3050_NPE_ETM_v10122024.xlsx',

//     targetDIV: 'sankeyContainer_main',
//     margins: {vertical: 0,horizontal: 200},
//     sankeyData: null,
//     legend: null,
//     settings: null
//   })
// }
drawUnitSelectorWaterfall()
function drawUnitSelectorWaterfall () {
  console.log('hello')
  d3.select('#mainContainerOverlay').append('div').attr('id', 'unitSelctorDivWaterfall').style('width', '200px').style('height', '35px').style('position', 'absolute').style('top', '255px').style('left', '0px').append('svg').attr('width', 200).attr('height', 35).attr('id', 'selectorButtonSVG')
  let sCanvas = d3.select('#selectorButtonSVG').append('g')
  sCanvas.append('rect')
    .attr('x', 50)
    .attr('y', 0)
    .attr('width', 50)
    .attr('height', 25)
    .attr('fill', '#FFF')
    .attr('rx', 12.5).attr('ry', 12.5)
    .style('stroke', '#333')
    .style('stroke-width', 0.5)
    .style('pointer-events', 'all')
    .on('click', function () {
      if (currentUnit == 'PJ') {currentUnit = 'TWh'; valueFactorAdjustment = 3.6} else {currentUnit = 'PJ';valueFactorAdjustment = 1}
      d3.selectAll('#selectorStatus').transition().duration(200).attr('cx', function () {if (currentUnit == 'PJ') { return 63} else return 87})
      switchRoutekaart({
        scenario: currentScenario,
        sector: currentSector,
        routekaart: currentRoutekaart,
        yMax: currentYMax,
        titlesArray: currentTitlesArray,
        colorsArray: currentColorsArray
      })
      
      if(globalPopupData){
        d3.select('#nodeInfoPopup').remove()
        drawBarGraph(globalPopupData, globalPopupConfig)
      }

      // Update cijferbasis tables if function exists
      if (typeof updateCijferBasisTables === 'function') {
        updateCijferBasisTables();
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











// ============================================================================
// Data Loading and Parsing
// ============================================================================

// Global states
let currentScenario = 'nat'
let currentSector = 'alle'
let currentRoutekaart = 'alle'
let currentYMax = [2500,1000,2500]
let currentTitlesArray = ['Elektriciteit', 'Waterstof, ammoniak', 'Warmte', 'Biomassa', 'Synthetisch', 'Olie, kolen, foss. methanol', 'Methaan', 'Aardwarmte', 'Omgevingswarmte']
let currentColorsArray = ['#F8D377', '#7555F6', '#DD5471', '#62D3A4', '#E99172', '#444444', '#3F88AE', '#06402B', '#aaa']

// Global datasets
let dataset_PR40;
let dataset_SR20;
let dataset_PB30;
let dataset_WLO1;
let dataset_WLO2;
let dataset_WLO3;
let dataset_WLO4;

const valueFactorAdjustment = 1;

/**
 * Fetches an XLSX file from the given URL and converts it into a JSON object.
 * @param {string} url - The URL of the XLSX file.
 * @returns {Promise<Object>} - A promise that resolves with a JSON representation of the XLSX file.
 */
async function xlsxToJSON(url) {
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });
    const result = {};

    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      result[sheetName] = XLSX.utils.sheet_to_json(worksheet);
    });

    return result;
  } catch (error) {
    console.error('Error converting xlsx to JSON:', error);
    throw error;
  }
}


//  dataSource = 'file';


// Load waterfalldiagram datasets
if (dataSource == 'url') {
  xlsxToJSON('private/data_watervaldiagram_OP - CO2-opslag 40.xlsx')
  .then(data => { dataset_PR40 = data; })
  .catch(error => { console.error('Error loading data_watervaldiagram_OP - CO2-opslag 40.xlsx:', error); });

  xlsxToJSON('private/data_watervaldiagram_OptimistischSelectiefFossilCarbonPenalty.xlsx')
  .then(data => { dataset_SR20 = data; })
  .catch(error => { console.error('Error loading data_watervaldiagram_OptimistischSelectiefFossilCarbonPenalty.xlsx:', error); });

  xlsxToJSON('private/data_watervaldiagram_PP_CCS_30_in_2050.xlsx')
  .then(data => {
    dataset_PB30 = data;
    initWaterfallDiagram()
  })
  .catch(error => { console.error('Error loading data_watervaldiagram_PP_CCS_30_in_2050.xlsx:', error); });
}


  function initWaterfallDiagram () {
    // Draw waterfall diagrams with the national dataset using different configurations
    drawWaterfallDiagram(dataset_PR40, {
      divID: 'opbouw',
      chartID: '.chart_opbouw',
      sheetID: 'alle_boven_alle',
      yOffsetJaarTotalen: 216+63,
      annualMaxValueCorrect: 0,
      titlesArray: currentTitlesArray,
      colorsArray: ['#F8D377', '#7555F6', '#DD5471', '#62D3A4', '#E99172', '#444444', '#3F88AE', '#06402B', '#aaa'],
      yMax: 2500,
      marginLeft: -100,
      marginTop: 43,
      marginBottom: 33,
      yTicks: 5,
      classTag: 'A'
    });

    // drawWaterfallDiagram(dataset_PR40, {
    //   divID: 'ccs',
    //   chartID: '.chart_ccs',
    //   sheetID: 'alle_midden_alle',
    //   yOffsetJaarTotalen: 98,
    //   annualMaxValueCorrect: 0,
    //   titlesArray: currentTitlesArray,
    //   colorsArray: ['#F8D377', '#7555F6', '#DD5471', '#62D3A4', '#E99172', '#444444', '#3F88AE', '#06402B', '#aaa'],
    //   yMax: 1000,
    //   marginLeft: -100,
    //   marginTop: 27,
    //   marginBottom: 27,
    //   yTicks: 2,
    //   classTag: 'B'
    // });

    drawWaterfallDiagram(dataset_PR40, {
      divID: 'afbouw',
      chartID: '.chart_afbouw',
      sheetID: 'alle_onder_alle',
      yOffsetJaarTotalen:  207+62,
      annualMaxValueCorrect: 0,
      titlesArray: currentTitlesArray,
      colorsArray: ['#F8D377', '#7555F6', '#DD5471', '#62D3A4', '#E99172', '#444444', '#3F88AE', '#06402B', '#aaa'],
      yMax: 2500,
      marginLeft: -100,
      marginTop: 33,
      marginBottom: 43,
      yTicks: 5,
      classTag: 'C'
    });

    // Set initial selection display
    updateWaterfallSelectionDisplay(currentRoutekaart, currentSector);
    
    // Directly set text for initial view in case the DOM isn't ready
    const displayElement = document.getElementById('waterval-selection-display');
    if (displayElement) {
      displayElement.textContent = 'Alle toepassingen | Alle sectoren';
    }
  }

// Setup a MutationObserver to watch for changes to the waterfall selection display
document.addEventListener('DOMContentLoaded', function() {
  const displayElement = document.getElementById('waterval-selection-display');
  if (displayElement) {
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.type === 'characterData' || mutation.type === 'childList') {
          console.log('Waterfall selection display changed to:', displayElement.textContent);
        }
      });
    });
    
    observer.observe(displayElement, { 
      characterData: true,
      childList: true,
      subtree: true
    });
  }
});



// ============================================================================
// Waterfall Diagram Drawing Functions
// ============================================================================

/**
 * Draws the waterfall diagram using the given dataset and configuration.
 * @param {Object} result - The JSON data from the XLSX file.
 * @param {Object} config - Configuration options for drawing the chart.
 */
function drawWaterfallDiagram(result, config) {
  // Setup container (assumes drawMainContainerBackdrop is defined elsewhere)
  drawMainContainerBackdrop(config);

  const totalWidth = 2000;
  const margin = {
    top: config.marginTop,
    right: 30,
    bottom: config.marginBottom,
    left: config.marginLeft
  };
  const width = 1500;
  const containerHeight = document.getElementById(config.divID).offsetHeight - margin.top - margin.bottom;
  const padding = 0.3;

  // Create the base SVG element for the chart
  d3.select(config.chartID)
    .attr("width", totalWidth)
    .attr("height", containerHeight + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Extract years from the sheet (excluding the 'name' column)
  // console.log(config.sheetID)
  const years = Object.keys(result[config.sheetID][0]).filter(key => key !== 'name');
  const chartWidth = (width + margin.left + margin.right) / years.length;

  // Iterate through each year and draw a chart segment
  years.forEach((year, yearIndex) => {
    // Prepare the year-specific data
    const yearData = result[config.sheetID].map(d => ({
      name: d.name,
      value: +d[year] / valueFactorAdjustment
    }));

    // ------------------------------------------------------------------------
    // Calculate cumulative values, bar widths, and positions for the bars
    // ------------------------------------------------------------------------
    let cumulativePeriod = 0;
    let cumulativeGO = 0;
    let cumulativeIND = 0;
    let cumulativeAG = 0;
    let referenceSubtotalSector = 0;

    const barWidths = [];
    const barXPositions = [];
    let barXPositionCumulative = 0;

    // Define helper constants to replace magic numbers
    const BAR_WIDTH_CURRENT = 23;
    const BAR_WIDTH_SUBTOTAL = 329.5 + 24.05;
    const BAR_WIDTH_INTERMEDIATES = 22;
    const BAR_POSITION_INCREASE_INTERMEDIATES = 24.05;
    const BAR_POSITION_INCREASE_SUBTOTALS = 0;
    const BAR_POSITION_INCREASE_START = 70;
    const SUBTOTAL_SHIFT_LEFT = 262.5;

    // Arrays to hold extra color and class information
    const colorsArray = [];
    const classesArray = [];

    // Process each data point for the year
    yearData.forEach((d, index) => {
      if (index === 0) {
        // Starting point
        d.start = cumulativePeriod;
        cumulativePeriod += d.value;
        d.end = cumulativePeriod;
        d.class = d.value >= 0 ? 'positive' : 'negative';
        referenceSubtotalSector += d.value;
        barWidths.push(BAR_WIDTH_CURRENT);
        barXPositions.push(barXPositionCumulative);
        barXPositionCumulative += BAR_POSITION_INCREASE_START;
        colorsArray.push('none');
        classesArray.push('start');
        // Append intermediate colors/classes from the configuration
        colorsArray.push(...config.colorsArray);
        classesArray.push(...Array(9).fill('intermediate'));
      } else if (index > 0 && index < 10) {
        // Intermediate data points for the first segment
        d.start = cumulativePeriod;
        cumulativePeriod += d.value;
        d.end = cumulativePeriod;
        d.class = d.value >= 0 ? 'positive' : 'negative';
        cumulativeGO += d.value;
        barWidths.push(BAR_WIDTH_INTERMEDIATES);
        barXPositions.push(barXPositionCumulative);
        barXPositionCumulative += BAR_POSITION_INCREASE_INTERMEDIATES;
      } else if (index === 10) {
        // First subtotal
        d.start = referenceSubtotalSector;
        d.end = cumulativePeriod;
        referenceSubtotalSector += cumulativeGO;
        d.class = d.value >= 0 ? 'positive' : 'negative';
        barWidths.push(BAR_WIDTH_SUBTOTAL);
        barXPositions.push(barXPositionCumulative);
        barXPositionCumulative += BAR_POSITION_INCREASE_SUBTOTALS;
        colorsArray.push('rgba(100,100,100,0.1)');
        classesArray.push('subtotal');
        colorsArray.push(...config.colorsArray);
        classesArray.push(...Array(9).fill('intermediate'));
      } else if (index > 10 && index < 19) {
        // Intermediate data for second segment
        d.start = cumulativePeriod;
        cumulativePeriod += d.value;
        d.end = cumulativePeriod;
        d.class = d.value >= 0 ? 'positive' : 'negative';
        barWidths.push(BAR_WIDTH_INTERMEDIATES);
        barXPositions.push(barXPositionCumulative);
        barXPositionCumulative += BAR_POSITION_INCREASE_INTERMEDIATES;
        cumulativeIND += d.value;
      } else if (index === 19) {
        // Second subtotal
        d.start = referenceSubtotalSector;
        d.end = cumulativePeriod;
        d.class = d.value >= 0 ? 'positive' : 'negative';
        referenceSubtotalSector += cumulativeIND;
        barXPositions.push(barXPositionCumulative);
        barXPositionCumulative += BAR_POSITION_INCREASE_SUBTOTALS;
        barWidths.push(BAR_WIDTH_SUBTOTAL);
        colorsArray.push('rgba(100,100,100,0.0)');
        classesArray.push('subtotal');
        colorsArray.push(...config.colorsArray);
        classesArray.push(...Array(9).fill('intermediate'));
      } else if (index > 19 && index < 28) {
        // Intermediate data for third segment
        d.start = cumulativePeriod;
        cumulativePeriod += d.value;
        d.end = cumulativePeriod;
        d.class = d.value >= 0 ? 'positive' : 'negative';
        cumulativeAG += d.value;
        barWidths.push(BAR_WIDTH_INTERMEDIATES);
        barXPositions.push(barXPositionCumulative);
        barXPositionCumulative += BAR_POSITION_INCREASE_INTERMEDIATES;
      } else if (index === 28) {
        // Third subtotal
        d.start = referenceSubtotalSector;
        d.end = cumulativePeriod;
        d.class = d.value >= 0 ? 'positive' : 'negative';
        referenceSubtotalSector += cumulativeAG;
        barWidths.push(BAR_WIDTH_SUBTOTAL);
        barXPositions.push(barXPositionCumulative);
        barXPositionCumulative += BAR_POSITION_INCREASE_SUBTOTALS;
        colorsArray.push('rgba(100,100,100,0.0)');
      }
    });

    // Append total as the final bar
    yearData.push({
      name: 'Total',
      start: 0,
      end: cumulativePeriod,
      class: 'total'
    });

    // ------------------------------------------------------------------------
    // Create scales and axes
    // ------------------------------------------------------------------------
    const xScale = d3.scaleBand()
      .domain(yearData.map(d => d.name))
      .range([0, chartWidth])
      .padding(padding);

    const yScale = d3.scaleLinear()
      .domain([0, config.yMax / valueFactorAdjustment])
      .range([containerHeight, 0]);

    const xAxis = d3.axisBottom(xScale).tickSize(0);
    const yAxis = d3.axisLeft(yScale).ticks(config.yTicks)
      .tickSize(-width);

    const shiftRight = 150;

    // Create an SVG group for the current year's chart segment
    const chart = d3.select(config.chartID)
      .append("svg")
      .attr('id', 'waterfallSVG')
      .attr("class", "chart-svg")
      .attr('width', totalWidth)
      .attr("height", containerHeight + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${yearIndex * (BAR_POSITION_INCREASE_INTERMEDIATES + chartWidth + margin.left + margin.right) + shiftRight},${margin.top})`);

    // Append the x-axis and rotate labels for clarity
    const xAxisGroup = chart.append("g")
      .attr("class", "x axis")
      .attr("transform", `translate(0,${containerHeight})`)
      .call(xAxis);

    xAxisGroup.selectAll("text")
      .style("text-anchor", "end")
      .attr("dx", "-.8em")
      .attr("dy", "-0.6em")
      .attr('fill', 'none')
      .attr("transform", "rotate(-90)");

    // Only for the first year: Append y-axis grid lines
    if (yearIndex === 0) {
      const yAxisGroup = chart.append("g")
        .attr('id', 'yGridLines')
        .attr("class", "y axis")
        .style("stroke-opacity", 1)
        .style("shape-rendering", "crispEdges")
        .call(yAxis);

      yAxisGroup.selectAll("text")
        .attr("dx", "-.8em")
        .style('font-size', '13px')
        .attr('fill', '#666');

      d3.selectAll('#yGridLines line')
        .style('stroke', '#E8F0F4')
        .style('stroke-width', 2);
    }

    // ------------------------------------------------------------------------
    // Draw Bars, Labels, and Track Lines
    // ------------------------------------------------------------------------
    const barGroup = chart.selectAll(".bar")
      .data(yearData)
      .enter()
      .append("g")
      .attr('fill', (d, i) => colorsArray[i])
      .attr('class', (d, i) => `${classesArray[i]}Bar_${config.classTag}_${year}`)
      .attr('transform', (d, i) => {
        const posX = classesArray[i] === 'subtotal'
          ? barXPositions[i] - SUBTOTAL_SHIFT_LEFT - BAR_POSITION_INCREASE_INTERMEDIATES
          : barXPositions[i];
        return `translate(${posX},0)`;
      });

    // Adjust layering for specific subtotal elements
    moveBack(d3.select(`.subtotalBar_${config.classTag}_2030naar2035`), 2);
    moveBack(d3.select(`.subtotalBar_${config.classTag}_2035naar2040`), 3);
    moveBack(d3.select(`.subtotalBar_${config.classTag}_2040naar2045`), 4);
    moveBack(d3.select(`.subtotalBar_${config.classTag}_2045naar2050`), 5);

    // Append rectangle bars
    barGroup.append("rect")
      .style('opacity', 1)
      .attr("y", d => {
        const posY = yScale(Math.max(d.start, d.end));
        return !isNaN(posY + 0.5) ? posY + 0.5 : 0;
      })
      .attr("height", d => {
        const heightValue = Math.abs(yScale(d.start) - yScale(d.end)) - 1;
        return heightValue > 0 ? heightValue : 0;
      })
      .attr("width", (d, i) => barWidths[i]);

    // Append text labels on the bars
    barGroup.append("text")
      .attr("x", xScale.bandwidth() / 2)
      .attr("y", d => !isNaN(yScale(d.end) + 5) ? yScale(d.end) + 5 : 0)
      .style('text-anchor', d => d.class === 'negative' ? 'end' : 'start')
      .style('font-size', '16px')
      .style('font-weight', 'bold')
      .text(d => d.end - d.start > 0
        ? `+ ${parseInt(d.end - d.start)}`
        : `- ${Math.abs(parseInt(d.end - d.start))}`)
      .attr("transform", d => {
        const rotationX = d.class === 'negative' ? xScale.bandwidth() / 2 + 2 : xScale.bandwidth() / 2 - 2;
        const rotationY = d.class === 'negative' ? yScale(d.end) + 3 : yScale(d.end) - 2;
        return `rotate(-90 ${rotationX},${rotationY})`;
      })
      .style('visibility', d => (parseInt(d.value) > 0 || parseInt(d.value)) ? 'visible' : 'hidden');

    // Append track lines (for non-total bars)
    barGroup.filter(d => d.class !== "total")
      .append("line")
      .attr('id', 'trackLine')
      .style('stroke', '#666')
      .attr("x1", xScale.bandwidth() - 22)
      .attr("y1", d => yScale(d.end))
      .attr("x2", d => {
        if (d.name === 'mt_omgevingswarmte') {
          return xScale.bandwidth() / (1 - padding) + 75;
        } else if (d.name === 'Totaal start periode') {
          return xScale.bandwidth() / (1 - padding) + 27 + 6 + 20 + 7;
        } else if (d.name !== 'null') {
          return xScale.bandwidth() / (1 - padding) + 9 + 6 + 2 - 2;
        }
      })
      .attr("y2", d => yScale(d.end))
      .style('visibility', d => (d.name === 'Totaal start periode' || d.name === 'mt_omgevingswarmte')
        ? 'visible'
        : 'visible');
  });

  // ------------------------------------------------------------------------
  // Adjust Domain Lines and Plot Stacked Bar Graphs
  // ------------------------------------------------------------------------
  d3.selectAll('.domain').remove();

  const yCoordinateScale = d3.scaleLinear()
    .domain([0, config.yMax])
    .range([containerHeight, 0]);

  const yearsList = ['2030', '2035', '2040', '2045', '2050'];
  const annualMaxValues = [];
  const annualMaxValuesAbsolute = [];

  yearsList.forEach(year => {
    // console.log(year)
    let count = 0;
    // console.log(config.sheetID)
    // console.log(result)
    result[`${config.sheetID}`+'_tot'].forEach(row => { //result[`${config.sheetID}+'_tot`].forEach(row => {
      count += row[year];
    });
    annualMaxValues.push(containerHeight - yCoordinateScale(count) - config.annualMaxValueCorrect);
    annualMaxValuesAbsolute.push(count);
  });

  // Plot the stacked bar graphs for each year
  for (let i = 0; i < yearsList.length; i++) {
    const valuesArray = [];
    for (let j = 0; j < 9; j++) {
      valuesArray.push(result[`${config.sheetID}`+'_tot'][j][yearsList[i]]); //valuesArray.push(result[`${config.sheetID}+'_tot`][j][yearsList[i]]);
    }
    plotStackedBarGraph(
      config,
      valuesArray,
      annualMaxValues[i],
      i * (287.5 + 24) + 60,
      config.yOffsetJaarTotalen,
      config.chartID,
      i,
      annualMaxValues,
      config.annualMaxValueCorrect,
      annualMaxValuesAbsolute
    );
  }
  d3.select(config.chartID).selectAll("rect[fill='rgba(238, 245, 250, 0.7)']").remove();
  // Add transparent overlay for middle graph if not 'alle_alle' - moved to the end
  if (config.divID === 'ccs' && config.sheetID !== 'alle_midden_alle') {
    d3.select(config.chartID)
      .append("rect")
      .attr("width", totalWidth)
      .attr("height", containerHeight + margin.top + margin.bottom + 20) // Increased height
      .attr("fill", "rgba(238, 245, 250, 0.7)")
      .style("pointer-events", "none")
      .style("z-index", "1000"); // Add z-index to ensure it stays on top

      d3.select(config.chartID)
      .append("text")
      .attr('id','CCgreyOutText')
      .attr('x',230)
      .attr('y', 50-20)
      .attr('fill', '#999')
      .style('pointer-events', 'none')
      .style('z-index', '1000')
      .style('font-weight', 400)
      .style('text-anchor','start')
      .style('font-size', '15px')
      .text('Voor subselecties van toepassingen en sectoren is geen uitsplitsing naar CC(S) gemaakt')

      d3.select(config.chartID)
      .append("text")
      .attr('id','CCgreyOutText')
      .attr('x',230)
      .attr('y', 70-15)
      .attr('fill', '#999')
      .style('pointer-events', 'none')
      .style('z-index', '1000')
      .style('font-weight', 300)
      .style('text-anchor','start')
      .style('font-size', '14px')
      .text('Finaal verbruik waarvoor CC(S) op fossiel wordt ingezet, is ondergebracht onder \'afbouw\'.')

      d3.select(config.chartID)
      .append("text")
      .attr('id','CCgreyOutText')
      .attr('x',230)
      .attr('y', 90-5-5)
      .attr('fill', '#999')
      .style('pointer-events', 'none')
      .style('z-index', '1000')
      .style('font-weight', 300)
      .style('text-anchor','start')
      .style('font-size', '14px')
      .text('Finaal verbruik waarvoor CC(S) op biogeen wordt ingezet, is ondergebracht onder \'opbouw\'.')


  } else if (config.divID === 'ccs') {
    // Remove any existing overlay when 'alle_alle' is selected
    d3.select(config.chartID).selectAll("rect[fill='rgba(238, 245, 250, 0.5)']").remove();
    d3.selectAll('#CCgreyOutText').remove();
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Moves a D3 selection back by a specified number of levels in the DOM.
 * @param {d3.selection} selection - The D3 selection to move.
 * @param {number} levels - The number of levels to move back.
 */
function moveBack(selection, levels) {
  selection.each(function() {
    const node = this;
    const parent = node.parentNode;
    if (parent) {
      const childNodes = parent.childNodes;
      const currentIndex = Array.prototype.indexOf.call(childNodes, node);
      const newIndex = Math.max(currentIndex - levels, 0);
      if (newIndex < currentIndex) {
        parent.insertBefore(node, childNodes[newIndex]);
      }
    }
  });
}

let previousTotal = 0;

/**
 * Plots a stacked bar graph within the waterfall diagram.
 * @param {Object} config - The configuration object.
 * @param {number[]} data - Array of numeric data for the segments.
 * @param {number} refHeight - The reference height for normalization.
 * @param {number} xPos - The x-axis position where the graph begins.
 * @param {number} yPos - The y-axis base position.
 * @param {string} svgSelector - The selector for the target SVG element.
 * @param {number} index - The index of the current year (for labeling).
 * @param {number[]} annualMaxValues - Array of computed maximum values for each year.
 * @param {number} annualMaxValueCorrect - A correction value for the maximum value.
 * @param {number[]} annualMaxValuesAbsolute - Array of the absolute annual values.
 */
function plotStackedBarGraph(config, data, refHeight, xPos, yPos, svgSelector, index, annualMaxValues, annualMaxValueCorrect, annualMaxValuesAbsolute) {
  const totalSum = data.reduce((acc, value) => acc + value, 0);
  const normalizedHeights = data.map(value => (value / totalSum) * refHeight);
  let currentY = yPos;

  const svg = d3.select(svgSelector);
  const barGroup = svg.append('g')
    .attr('transform', `translate(${xPos},0)`);

  const colorsArray = config.colorsArray;
  const namesArray = config.namesArray || data.map((_, i) => `Segment ${i + 1}`); // fallback names

  // Tooltip div
  let tooltip = d3.select("body").select("#tooltip");
  if (tooltip.empty()) {
    tooltip = d3.select("body").append("div")
      .attr("id", "tooltip")
      .style("position", "absolute")
      .style("visibility", "hidden")
      .style("background", "#fff")
      .style("border", "1px solid #ccc")
      .style("padding", "8px")
      .style("border-radius", "4px")
      .style("font-size", "12px")
      .style("pointer-events", "none")
      .style("box-shadow", "0 2px 6px rgba(0,0,0,0.2)");
  }

  svg.append('g')
    .append('text')
    .attr('fill', '#666')
    .attr('id', 'waterfallSVG')
    .style('text-anchor', 'middle')
    .style('font-size', '13px')
    .text(Math.round(parseInt(totalSum) / valueFactorAdjustment))
    .attr('transform', `translate(${117 + xPos - 6}, ${yPos - refHeight - 20 + 10})`);

  if (index > 0) {
    svg.append('line')
      .attr('id', 'waterfallSVG')
      .style('stroke-dasharray', 3)
      .attr('x1', xPos + 76)
      .attr('x2', xPos + 76)
      .attr('y1', yPos - refHeight)
      .attr('y2', yPos - previousTotal)
      .style('stroke', '#666');

    if (annualMaxValues[index - 1] - annualMaxValues[index] < 0) {
      svg.append('path')
        .attr('id', 'waterfallSVG')
        .attr('d', 'M10,10 L20,10 L15,0 Z')
        .attr('fill', '#aaa')
        .attr('transform', `translate(${xPos + 61}, ${yPos - refHeight + 4 - 4})`);
      svg.append('text')
        .attr('id', 'waterfallSVG')
        .attr('fill', '#aaa')
        .style('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 500)
        .text('+ ' + Math.round(parseInt(annualMaxValuesAbsolute[index] - annualMaxValuesAbsolute[index - 1]) / valueFactorAdjustment))
        .attr('transform', `translate(${xPos + 80}, ${yPos - refHeight - 25}) rotate(-90)`);
    } else {
      svg.append('path')
        .attr('id', 'waterfallSVG')
        .attr('d', 'M10,5 L20,5 L15,15 Z')
        .attr('fill', '#aaa')
        .attr('transform', `translate(${xPos + 61}, ${yPos - refHeight - 10 - 9 + 4})`);
      svg.append('text')
        .attr('id', 'waterfallSVG')
        .attr('fill', '#aaa')
        .style('text-anchor', 'end')
        .style('font-size', '14px')
        .style('font-weight', 500)
        .text('- ' + Math.round(parseInt(annualMaxValuesAbsolute[index - 1] - annualMaxValuesAbsolute[index]) / valueFactorAdjustment))
        .attr('transform', `translate(${xPos + 61 + 32 - 14}, ${yPos - refHeight + 10}) rotate(-90)`);
    }
  }

  previousTotal = refHeight;

  // Append each segment of the stacked bar with tooltip interaction
  normalizedHeights.forEach((segmentHeight, idx) => {
    barGroup.append('rect')
      .attr('id', 'waterfallSVG')
      .attr('x', 90)
      .attr('y', () => !isNaN(currentY - segmentHeight + 0.5) ? currentY - segmentHeight + 0.5 : currentY)
      .attr('width', 42)
      .attr('height', isNaN(segmentHeight) ? 0 : segmentHeight)
      .attr('fill', colorsArray[idx])
      .on('mouseover', function () {
        tooltip.style("visibility", "visible")
          .html(`<strong>${config.titlesArray[idx] || `Segment ${idx + 1}`}</strong><br/>${Math.round(data[idx])} `+ currentUnit);
      })
      .on('mousemove', function (event) {
        tooltip.style("top", (event.pageY - 10) + "px")
          .style("left", (event.pageX + 10) + "px");
      })
      .on('mouseout', function () {
        tooltip.style("visibility", "hidden");
      });

    currentY -= segmentHeight;
  });
}




// Variable to track if waterfall needs updating when it becomes visible
let waterfallNeedsUpdate = false;
let pendingWaterfallConfig = null;

// Function to check if waterfall container is visible on screen
function isWaterfallVisible() {
  const container = document.getElementById('SVGContainer_waterfalldiagram');
  if (!container) return false;
  
  const rect = container.getBoundingClientRect();
  const windowHeight = window.innerHeight || document.documentElement.clientHeight;
  const windowWidth = window.innerWidth || document.documentElement.clientWidth;
  
  // Check if the container is at least partially visible
  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < windowHeight &&
    rect.left < windowWidth
  );
}

// Main function with visibility check
function switchRoutekaart (config) {
  // Only update if the waterfall section is visible on screen
  if (!isWaterfallVisible()) {
    console.log('Waterfall section not visible, marking for update when visible');
    waterfallNeedsUpdate = true;
    pendingWaterfallConfig = config;
    return;
  }
  
  switchRoutekaartForced(config);
  waterfallNeedsUpdate = false;
  pendingWaterfallConfig = null;
}

// Internal function to draw waterfall without visibility check (for initial load and forced updates)
function switchRoutekaartForced (config) {
  console.log('Switch')
  d3.selectAll('#waterfallSVG').remove()
  
  // Update global state variables
  currentRoutekaart = config.routekaart;
  currentSector = config.sector;
  
  let data
  switch (config.scenario) {
    case 'PBL.PR40':
      data = dataset_PR40
      break
    case 'PBL.SR20':
      data = dataset_SR20
      break
    case 'PBL.PB30':
      data = dataset_PB30
      break
    case 'PBL.WLO1':
      data = dataset_WLO1
      break
    case 'PBL.WLO2':
      data = dataset_WLO2
      break
    case 'PBL.WLO3':
      data = dataset_WLO3
      break
    case 'PBL.WLO4':
      data = dataset_WLO4
      break
    default:
      break
  }
  
  // Update the selection display text
  updateWaterfallSelectionDisplay(config.routekaart, config.sector);
  
  drawWaterfallDiagram(data,
    {divID: 'opbouw',
      chartID: '.chart_opbouw',
      sheetID: config.routekaart + '_boven_' + config.sector,
      yOffsetJaarTotalen: 216+63,
      annualMaxValueCorrect: 0,
      titlesArray: config.titlesArray,
      colorsArray: config.colorsArray,
      yMax: config.yMax[0], marginLeft: -100, marginTop: 43, marginBottom: 33, yTicks: 5, classTag: 'A'
    })
  // drawWaterfallDiagram(data,
  //   {divID: 'ccs',
  //     chartID: '.chart_ccs',
  //     sheetID: config.routekaart + '_midden_' + config.sector,
  //     yOffsetJaarTotalen: 98,
  //     annualMaxValueCorrect: 0,
  //     titlesArray: config.titlesArray,
  //     colorsArray: config.colorsArray,
  //     yMax: config.yMax[1], marginLeft: -100, marginTop: 27,marginBottom: 27, yTicks: 2, classTag: 'B'
    // })
  drawWaterfallDiagram(data, {
    divID: 'afbouw',chartID: '.chart_afbouw',
    sheetID: config.routekaart + '_onder_' + config.sector,
    yOffsetJaarTotalen: 207+62,
    annualMaxValueCorrect: 0,
    titlesArray: config.titlesArray,
    colorsArray: config.colorsArray,
  yMax: config.yMax[2], marginLeft: -100, marginTop: 33,marginBottom: 43, yTicks: 5, classTag: 'C'})
}

// Function to update the waterfall selection display text
function updateWaterfallSelectionDisplay(routekaart, sector) {
  // Map routekaart codes to display names based on what's in the UI
  const routekaartMapping = {
    'w': 'Warmte',
    'm': 'Mobiliteit',
    'o': 'Elektriciteit',
    'n': 'Grondstoffen, non-energetisch',
    'alle': 'Alle toepassingen'
  };
  
  // Map sector codes to display names based on what's in the UI
  const sectorMappings = {
    // Regular sectors
    'all': 'Alle sectoren',
    'go': 'Gebouwde Omgeving',
    'ind': 'Industrie',
    'ind_km': 'Industrie Km',
    'ind_hw': 'Industrie Hw',
    'ind_fo': 'Industrie Fo',
    'hh': 'Huishoudens',
    'ag': 'Landbouw',
    'en': 'Energie',
    
    // Mobility sectors
    'au': 'Auto',
    'bbus': 'Bestelbus',
    'bus': 'Bus',
    'vw': 'Vrachtwagen',
    'schip': 'Schip',
    'vtg': 'Vliegtuig',
    'tp': 'Trein passagier',
    'tv': 'Trein vracht',
    'mf': 'Motorfiets',
    'f': 'Fiets',
    'weg': 'Wegvervoer',
    'lucht': 'Luchtvaart',
    'scheep': 'Scheepvaart',
    'spoor': 'Railvervoer',
    
    // Non-energetic sectors
    'km': 'Kunstmest',
    'ch': 'Chemie',
    'raf': 'Raffinaderijen', 
    'mo': 'Mobiliteit',
    'on': 'Ongespecificeerd',
    
    // Aliases
    'alle': 'Alle sectoren'
  };
  
  // Get the display names from the mappings, defaulting to the codes if not found
  const routekaartText = routekaartMapping[routekaart] || routekaart || 'Alle toepassingen';
  const sectorText = sectorMappings[sector] || sector || 'Alle sectoren';
  
  // Update the display element
  const displayElement = document.getElementById('waterval-selection-display');
  if (displayElement) {
    displayElement.textContent = `${routekaartText} | ${sectorText}`;
    console.log(`Updating waterfall display: ${routekaartText} | ${sectorText} (codes: ${routekaart}, ${sector})`);
  }
}

// Setup intersection observer to monitor waterfall visibility
function setupWaterfallVisibilityObserver() {
  const container = document.getElementById('SVGContainer_waterfalldiagram');
  if (!container) return;
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Section is now visible
        console.log('Waterfall section became visible');
        
        // If waterfall needs updating and we have pending config, update it
        if (waterfallNeedsUpdate && pendingWaterfallConfig) {
          console.log('Updating waterfall after becoming visible');
          switchRoutekaartForced(pendingWaterfallConfig);
          waterfallNeedsUpdate = false;
          pendingWaterfallConfig = null;
        }
      }
    });
  }, {
    threshold: 0.1, // Trigger when 10% of the element is visible
    rootMargin: '50px' // Start loading slightly before the element comes into view
  });
  
  observer.observe(container);
}

// Initialize waterfall visibility observer when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Setup visibility observer after a short delay to ensure DOM is ready
  setTimeout(setupWaterfallVisibilityObserver, 100);
});

// setTimeout(() => {
//   switchRoutekaart({
//     scenario: currentScenario,
//     sector: 'ind_km',
//     routekaart: 'proces',
//     yMax: [100,0,100 ],
//     titlesArray: currentTitlesArray,
//     colorsArray: currentColorsArray
//   })
// }, 3000);


