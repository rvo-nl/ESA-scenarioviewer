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
    if (Object.keys(links[0])[s].includes('scenario')) {
      if (counter < 10) {
        scenarios.push({
          title: Object.keys(links[0])[s].slice(10),
          id: Object.keys(links[0])[s]
        })
      } else {
        scenarios.push({
          title: Object.keys(links[0])[s].slice(11),
          id: Object.keys(links[0])[s]
        })
      }
      counter++
    }
  }

  config.scenarios = scenarios

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

    sankeyInstances[config.sankeyInstanceID].sankeyLayout = d3.sankey().extent([
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

  assetslog = {}

  let scrollExtentWidth = config.settings[0].scrollExtentWidth
  let scrollExtentHeight = config.settings[0].scrollExtentHeight

  d3.select('#' + config.targetDIV)
    .append('svg')
    .style('position', 'relative')
    .attr('id', config.sankeyInstanceID + '_sankeySVGPARENT')
    .attr('width', scrollExtentWidth + 'px')
    .attr('height', scrollExtentHeight + 'px')
    // .style('pointer-events', 'auto')
    .append('g')

  // backdropCanvas = d3.select('#sankeySVGbackdrop')
  sankeyInstances[config.sankeyInstanceID].sankeyCanvas = d3.select('#' + config.sankeyInstanceID + '_sankeySVGPARENT')
  // buttonsCanvas = d3.select('#' + config.targetDIV + '_buttonsSVG').append('g')
  sankeyInstances[config.sankeyInstanceID].parentCanvas = d3.select('#' + config.sankeyInstanceID + '_sankeySVGPARENT').append('g')

  sankeyCanvas = d3.select('#' + config.sankeyInstanceID + '_sankeySVGPARENT')

  sankeyCanvas.append('rect').attr('id', 'delineator_rect_bronnen').attr('width', 300).attr('height', 2).attr('x', 15).attr('y', 70).attr('fill', '#888').attr('rx', 2.5).attr('ry', 2.5)
  sankeyCanvas.append('rect').attr('id', 'delineator_rect_conversie').attr('width', 606).attr('height', 2).attr('x', 350).attr('y', 70).attr('fill', '#888').attr('rx', 2.5).attr('ry', 2.5)
  sankeyCanvas.append('rect').attr('id', 'delineator_rect_finaal').attr('width', 590).attr('height', 2).attr('x', 990).attr('y', 70).attr('fill', '#888').attr('rx', 2.5).attr('ry', 2.5)
  sankeyCanvas.append('rect').attr('id', 'delineator_rect_keteninvoer').attr('width', 230).attr('height', 2).attr('x', 340).attr('y', 70).attr('fill', '#888').attr('rx', 2.5).attr('ry', 2.5).style('opacity', 0)
  sankeyCanvas.append('rect').attr('id', 'delineator_rect_ketenuitvoer').attr('width', 250).attr('height', 2).attr('x', 970).attr('y', 70).attr('fill', '#888').attr('rx', 2.5).attr('ry', 2.5).style('opacity', 0)

  sankeyCanvas.append('text').attr('id', 'delineator_text_bronnen').attr('x', 20).attr('y', 53).attr('fill', '#666').style('font-weight', 400).style('font-size', '20px').text('BRONNEN')
  sankeyCanvas.append('text').attr('id', 'delineator_text_conversie').attr('x', 355).attr('y', 53).attr('fill', '#666').style('font-weight', 400).style('font-size', '20px').text('CONVERSIE')
  sankeyCanvas.append('text').attr('id', 'delineator_text_finaal').attr('x', 995).attr('y', 53).attr('fill', '#666').style('font-weight', 400).style('font-size', '20px').text('FINAAL VERBRUIK')
  sankeyCanvas.append('text').attr('id', 'delineator_text_keteninvoer').attr('x', 345).attr('y', 53).attr('fill', '#666').style('font-weight', 400).style('font-size', '20px').text('INVOER UIT KETEN').style('opacity', 0)
  sankeyCanvas.append('text').attr('id', 'delineator_text_ketenuitvoer').attr('x', 975).attr('y', 53).attr('fill', '#666').style('font-weight', 400).style('font-size', '20px').text('UITVOER NAAR KETEN').style('opacity', 0)

  // UIT / NAAR KETEN DILINEATORS
  sankeyCanvas.append('rect').attr('id', 'delineator_rect_koolstofketen_uit').attr('width', 230).attr('height', 250).attr('x', 290).attr('y', 100).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  sankeyCanvas.append('text').attr('id', 'delineator_text_koolstofketen_uit').attr('x', 315).attr('y', 138).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('KOOLSTOFKETEN').style('opacity', 0)

  sankeyCanvas.append('rect').attr('id', 'delineator_rect_waterstofketen_uit').attr('width', 230).attr('height', 190).attr('x', 290).attr('y', 100).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  sankeyCanvas.append('text').attr('id', 'delineator_text_waterstofketen_uit').attr('x', 315).attr('y', 138).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('WATERSTOFKETEN').style('opacity', 0)

  sankeyCanvas.append('rect').attr('id', 'delineator_rect_elektriciteitsketen_uit').attr('width', 230).attr('height', 190).attr('x', 290).attr('y', 330).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  sankeyCanvas.append('text').attr('id', 'delineator_text_elektriciteitsketen_uit').attr('x', 315).attr('y', 368).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('ELEKTRICITEITSKETEN').style('opacity', 0)

  sankeyCanvas.append('rect').attr('id', 'delineator_rect_warmteketen_in').attr('width', 230).attr('height', 140).attr('x', 970).attr('y', 100).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  sankeyCanvas.append('text').attr('id', 'delineator_text_warmteketen_in').attr('x', 995).attr('y', 138).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('WARMTEKETEN').style('opacity', 0)

  sankeyCanvas.append('rect').attr('id', 'delineator_rect_waterstofketen_in').attr('width', 230).attr('height', 120).attr('x', 970).attr('y', 275).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  sankeyCanvas.append('text').attr('id', 'delineator_text_waterstofketen_in').attr('x', 995).attr('y', 313).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('WATERSTOFKETEN').style('opacity', 0)

  sankeyCanvas.append('rect').attr('id', 'delineator_rect_elektriciteitsketen_in').attr('width', 230).attr('height', 140).attr('x', 970).attr('y', 95).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  sankeyCanvas.append('text').attr('id', 'delineator_text_elektriciteitsketen_in').attr('x', 995).attr('y', 133).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('ELEKTRICITEITSKETEN').style('opacity', 0)

  sankeyCanvas.append('rect').attr('id', 'delineator_rect_koolstofketen_in').attr('width', 230).attr('height', 140).attr('x', 970).attr('y', 600).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  sankeyCanvas.append('text').attr('id', 'delineator_text_koolstofketen_in').attr('x', 995).attr('y', 638).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('KOOLSTOFKETEN').style('opacity', 0)

  sankeyCanvas.append('rect').attr('id', 'delineator_rect_finaal_go').attr('width', 230).attr('height', 140).attr('x', 1350).attr('y', 100).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  sankeyCanvas.append('text').attr('id', 'delineator_text_finaal_go').attr('x', 1375).attr('y', 138).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('GEBOUWDE OMGEVING').style('opacity', 0)

  sankeyCanvas.append('rect').attr('id', 'delineator_rect_finaal_mobiliteit').attr('width', 230).attr('height', 140).attr('x', 1350).attr('y', 680).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  sankeyCanvas.append('text').attr('id', 'delineator_text_finaal_mobiliteit').attr('x', 1375).attr('y', 680 + 30).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('MOBILITEIT').style('opacity', 0)

  sankeyCanvas.append('rect').attr('id', 'delineator_rect_finaal_industrie').attr('width', 230).attr('height', 300).attr('x', 1350).attr('y', 370).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  sankeyCanvas.append('text').attr('id', 'delineator_text_finaal_industrie').attr('x', 1375).attr('y', 400).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('INDUSTRIE').style('opacity', 0)

  sankeyCanvas.append('rect').attr('id', 'delineator_rect_finaal_landbouw').attr('width', 230).attr('height', 110).attr('x', 1352).attr('y', 250).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  sankeyCanvas.append('text').attr('id', 'delineator_text_finaal_landbouw').attr('x', 1377).attr('y', 285).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('LANDBOUW').style('opacity', 0)

  sankeyCanvas.append('rect').attr('id', 'delineator_rect_finaal_overige').attr('width', 230).attr('height', 200).attr('x', 1352).attr('y', 830).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  sankeyCanvas.append('text').attr('id', 'delineator_text_finaal_overige').attr('x', 1377).attr('y', 860).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('OVERIGE').style('opacity', 0)

  sankeyCanvas.append('rect').attr('id', 'delineator_rect_vlak_conversie').attr('width', 278).attr('height', 945).attr('x', 600).attr('y', 100).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  sankeyCanvas.append('text').attr('id', 'delineator_text_vlak_conversie').attr('x', 625).attr('y', 138).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('CONVERSIE').style('opacity', 0)

  sankeyCanvas.append('rect').attr('id', 'delineator_rect_productie').attr('width', 228).attr('height', 945).attr('x', 25).attr('y', 100).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  sankeyCanvas.append('text').attr('id', 'delineator_text_productie').attr('x', 50).attr('y', 138).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('IMPORT & PRODUCTIE').style('opacity', 0)

  sankeyCanvas.append('rect').attr('id', 'delineator_rect_warmteketen_uit').attr('width', 230).attr('height', 110).attr('x', 290).attr('y', 390).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  sankeyCanvas.append('text').attr('id', 'delineator_text_warmteketen_uit').attr('x', 315).attr('y', 528).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('WARMTEKETEN').style('opacity', 0)

  sankeyCanvas.append('rect').attr('id', 'delineator_rect_warmteproductie_bij_finaal_verbruik_uit').attr('width', 230).attr('height', 305).attr('x', 290).attr('y', 740).attr('fill', '#DCE6EF').attr('rx', 10).attr('ry', 10).style('stroke', '#BBB').style('stroke-width', '0px').style('opacity', 0)
  sankeyCanvas.append('text').attr('id', 'delineator_text_warmteproductie_bij_finaal_verbruik_uit').attr('x', 315).attr('y', 638 + 130).attr('fill', '#666').style('font-weight', 400).style('font-size', '16px').text('LOKAAL').style('opacity', 0)

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
    // console.log(globalActiveEnergyflowsSankey.id)

    var sankeyData = sankeyDataObjects[globalSankeyInstancesActiveDataset[key].id]

    sankeyData.links.forEach(item => {
      item.visibility = item['filter_' + globalActiveEnergyflowsFilter] === 'x' ? 1 : 0;})
      // console.log(sankeyData)

    for (i = 0; i < sankeyData.links.length; i++) {
      // console.log(sankeyData.links[i].visibility)
      if (sankeyData.links[i]['filter_' + globalActiveEnergyflowsFilter] == 'x') {
        sankeyData.links[i].value = Math.round(sankeyData.links[i][config.scenarios[activeScenario].id])
      } else {sankeyData.links[i].value = 0}
    }

    for (i = 0; i < sankeyData.nodes.length; i++) {
      sankeyData.nodes[i].x = sankeyData.nodes[i]['x.' + globalActiveEnergyflowsFilter]
      sankeyData.nodes[i].y = sankeyData.nodes[i]['y.' + globalActiveEnergyflowsFilter]
      sankeyData.nodes[i].title = sankeyData.nodes[i]['title.' + globalActiveEnergyflowsFilter]
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
  } catch (e) { d3.select('#error').text(e); return; }

  sankeyInstances[config.sankeyInstanceID].sankeyLayout.nodePosition(function (node) {
    return [node.x, node.y]
  })

  let duration = 1000

  d3.select('#' + config.sankeyInstanceID + '_sankeySVGPARENT').datum(sankeyInstances[config.sankeyInstanceID].sankeyLayout.scale(scaleInit)(json)).transition().duration(duration).ease(d3.easeCubicInOut).call(sankeyInstances[config.sankeyInstanceID].sankeyDiagram)
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

  d3.selectAll('#' + config.sankeyInstanceID + ' .node').style('pointer-events', 'auto')
  d3.selectAll('#' + config.sankeyInstanceID + ' .node-backdrop-title').style('pointer-events', 'none')
  d3.selectAll('#' + config.sankeyInstanceID + ' .node-click-target')
    .style('fill', '#555')
    .style('stroke-width', 0)
    .attr('width', 10)
    .attr('rx', 0)
    .attr('ry', 0)
    .attr('transform', 'translate(-4,0)scale(1.005)')
    .attr('id', function (d, i) { return 'nodeindex_' + d.index })
    .on('click', function () {
      nodeVisualisatieSingular(config, sankeyDataObjects[globalActiveEnergyflowsSankey.id].nodes[this.id.slice(10)], sankeyDataObjects[globalActiveEnergyflowsSankey.id], config.scenarios, config.targetDIV)
    })
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
