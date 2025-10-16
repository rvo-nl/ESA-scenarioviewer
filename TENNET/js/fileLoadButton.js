// fileLoadButton()
function fileLoadButton () {
  let config = {
    mode: 'xlsx',
    // xlsxURL: sankeyXLSXurl,
    targetDIV: 'scaleableSVGContainer',
    margins: {vertical: 0,horizontal: 200},
    sankeyData: null,
    legend: null,
    settings: null
  }

  console.log('FILE')
  d3.select('#downloadUploadFile').style('visibility', 'visible').style('pointer-events', 'auto')
  // Get the container div with id "loadFileDialog"
  const loadFileDialog = document.getElementById('downloadUploadFile')

  // Create the file input element (Upload functionality)
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = '.xlsx' // Restrict file type to Excel files
  fileInput.style.display = 'none' // Hide the file input element

  const uploadButton = document.createElement('button')
  uploadButton.textContent = 'Importeer aangepast bronbestand' // Set the button text
  uploadButton.addEventListener('click', () => {
    fileInput.click() // Programmatically trigger the file input click event
  })
  fileInput.addEventListener('change', (event) => {
    const selectedFile = event.target.files[0]
    if (selectedFile) {
      console.log(`Selected file: ${selectedFile.name}`)
    // Handle the selected file here
    }
  })

  // Create the download button
  const downloadButton = document.createElement('button')
  downloadButton.textContent = 'Download bronbestand' // Set the button text
  downloadButton.id = 'downloadButton'
  downloadButton.addEventListener('click', () => {
    const fileUrl = 'private/CES3Overview_a_v1_06122024.xlsx' // Replace with your file URL
    const anchor = document.createElement('a')
    anchor.href = fileUrl
    anchor.download = 'CES3Overview_a_v1_06122024.xlsx' // Replace with the desired filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
  })

  // Append the buttons and file input to the "loadFileDialog" div
  if (loadFileDialog) {
    loadFileDialog.appendChild(uploadButton)
    loadFileDialog.appendChild(fileInput) // Keep the input for file selection
    loadFileDialog.appendChild(downloadButton) // Add the download button
  } else {
    console.error('Element with id not found.')
  }

  // Add change event listener to handle the file selection
  fileInput.addEventListener('change', (event) => {
    const selectedFile = event.target.files[0]
    if (selectedFile) {
      console.log(`Selected file: ${selectedFile.name}`)
    // Handle the selected file here
    }
  })

  // Append the button and file input to the "loadFileDialog" div
  if (loadFileDialog) {
    loadFileDialog.appendChild(uploadButton)
    loadFileDialog.appendChild(fileInput) // Keep the input for file selection
  } else {
    console.error('Element with id not found.')
  }

  // Listen for file selection
  fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0] // Get the selected file
    if (!file) {
      console.error('No file selected!')
      return
    }

    // Create a FileReader to read the file
    const reader = new FileReader()

    reader.onload = (e) => {
      d3.select('#sankeyContainer_main').html('')
      d3.select('#downloadButton').remove()
      sankeyData = {links: [],nodes: [],order: []}

      const data = new Uint8Array(e.target.result) // Read the file as a binary array
      const workbook = XLSX.read(data, { type: 'array' }) // Parse the Excel file

      // Extract data from sheets
      links = {}
      nodes = {}
      legend = {}
      settings = {}
      remarks = {}

      workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName]
        switch (sheetName) {
          case 'links':
            links = XLSX.utils.sheet_to_json(worksheet)
            break
          case 'nodes':
            nodes = XLSX.utils.sheet_to_json(worksheet)
            break
          case 'legend':
            legend = XLSX.utils.sheet_to_json(worksheet)
            break
          case 'settings':
            settings = XLSX.utils.sheet_to_json(worksheet)
            break
          case 'remarks':
            remarks = XLSX.utils.sheet_to_json(worksheet)
            break
          default:
            console.log(`Sheet '${sheetName}' ignored.`)
        }
      })

      // Pass the parsed data to your existing callback logic
      console.log(settings)

      settings = transformData(settings)

      console.log(settings)

      if (settings[0].projectID != projectID || settings[0].versionID != versionID || settings[0].productID != productID) {
        console.log('ERROR - ID MISMATCH')
        const loadFileDialog = document.getElementById('loadFileDialog')
        // Set the inner HTML with the desired text and link
        document.getElementById('loadFileDialog').innerHTML = `
                  <div style="max-width: 500px; word-wrap: break-word;line-height: 35px;font-size:15px; ">
                      <strong style="line-height: 40px; font-size:28px;font-weight:300;">Error</strong> <br><br>De identificatienummers van het opgegeven databestand (<strong>${settings[0].projectID}_${settings[0].productID}_${settings[0].versionID}</strong>) en het ingeladen visualisatiescript (<strong>${projectID}_${productID}_${versionID}</strong>) komen niet overeen.<br><br>Gebruik de onderstaande link om naar het script te gaan dat bij het opgegeven bestand hoort en probeer het opnieuw.&nbsp
                      <br><br>
                      <a href="https://rvo-nl.github.io/visualisaties/${settings[0].projectID}/${settings[0].productID}/${settings[0].versionID}" style="color: blue; text-decoration: underline;">
                          https://rvo-nl.github.io/visualisaties/${settings[0].projectID}/${settings[0].productID}/${settings[0].versionID}
                      </a>
                  </div>
              `

        return
      }

      d3.select('#loadFileDialog').style('visibility', 'hidden').style('pointer-events', 'none')
      d3.selectAll('.buttonTitles').style('visibility', 'visible')

      function transformData (inputArray) { // this function converts the new input format for the settings tab to the old input format the rest of the code expects
        const output = {}

        inputArray.forEach(item => {
          const key = item.setting; // Get the key from "horizontalMargin"
          const value = item.waarde; // Get the value from "0"
          output[key] = value // Assign to the output object
        })
        // Wrap the resulting object in an array to match the desired structure
        return [output]
      }

      processData(links, nodes, legend, settings, remarks)
    }

    reader.readAsArrayBuffer(file) // Read the file as a binary array
  })

  // Callback logic for processing the data
  function processData (links, nodes, legend, settings, remarks) {
    console.log('Links:', links)
    console.log('Nodes:', nodes)
    console.log('Legend:', legend)
    console.log('Settings:', settings)
    console.log('Remarks:', remarks)

    nodesGlobal = nodes

    config.settings = settings
    config.legend = legend

    globalScaleInit = settings[0].scaleInit
    globalCO2flowScale = settings[0].scaleDataValueCO2flow

    newData = {links: [],nodes: [],order: []}

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
      newData.order.push([[]])
    }
    for (let i = 0; i < nodes.length; i++) {
      for (let j = 0; j < sankeyData.order.length; j++) {
        if (nodes[i].column === j) {
          if (newData.order[j].length === 0) {
            newData.order[j].push([])
          }
          for (let k = 0; k < nodes[i].cluster; k++) {
            if (!newData.order[j].includes(k)) {
              newData.order[j].push([])
            }
          }
          if (
            newData.order[j][nodes[i].cluster].length === 0
          ) {
            newData.order[j][nodes[i].cluster].push([])
          }
          for (let k = 0; k < nodes[i].row; k++) {
            if (!newData.order[j][nodes[i].cluster].includes(k)) {
              newData.order[j][nodes[i].cluster].push([])
            }
          }
          newData.order[j][nodes[i].cluster][nodes[i].row].push(
            nodes[i].id
          )
        }
      }
    }

    // Generate nodes object
    for (let i = 0; i < nodes.length; i++) {
      newData.nodes.push({
        remark: remarks[i],
        title: nodes[i].title,
        id: nodes[i].id,
        direction: nodes[i].direction,
        index: i,
        dummy: nodes[i].dummy,
        x: nodes[i].x,
        y: nodes[i].y
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
      newData.links.push({
        remark: remarks[i],
        index: i,
        source: links[i]['source.id'],
        target: links[i]['target.id'],
        color: getColor(links[i]['legend'], legend),
        value: links[i].value,
        type: links[i].type,
        legend: links[i]['legend']
      })
      scenarios.forEach((element) => {
        newData.links[i][element.id] = links[i][element.id]
      })
    }

    adaptTotalHeight = config.settings[0].adaptTotalHeight

    const width = document.getElementById(config.targetDIV).offsetWidth
    const height = document.getElementById(config.targetDIV).offsetHeight

    sankeyLayout = d3.sankey().extent([
      [settings[0].horizontalMargin, settings[0].verticalMargin],
      [width - settings[0].horizontalMargin, height - settings[0].verticalMargin]
    ])
    sankeyDiagram = d3
      .sankeyDiagram()
      .nodeTitle((d) => d.title)
      .linkColor((d) => d.color)

    drawSankey(newData)
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
}
