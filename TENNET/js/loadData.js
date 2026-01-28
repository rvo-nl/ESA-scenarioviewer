// Decryption utility functions
async function base64ToArrayBuffer(base64) {
  // Convert URL-safe base64 to standard base64
  let standardBase64 = base64.replace(/-/g, '+').replace(/_/g, '/');
  
  // Add padding if needed
  while (standardBase64.length % 4) {
    standardBase64 += '=';
  }
  
  const binaryString = atob(standardBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function deriveKey(passphrase, salt, iterations) {
  const encoder = new TextEncoder();
  const passphraseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  const saltBuffer = await base64ToArrayBuffer(salt);
  const keyMaterial = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: iterations,
      hash: 'SHA-256'
    },
    passphraseKey,
    256 // 32 bytes = 256 bits
  );
  
  return await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    'AES-GCM',
    false,
    ['decrypt']
  );
}

async function decryptData(encryptedData, key, iv) {
  const ivBuffer = await base64ToArrayBuffer(iv);
  const cipherBuffer = await base64ToArrayBuffer(encryptedData);
  
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBuffer
    },
    key,
    cipherBuffer
  );
  
  return decrypted;
}

async function decryptZipFile(passphrase) {
  try {
    // Fetch the encrypted file
    const response = await fetch('public/ds28012026tennet.enc.json');
    if (!response.ok) {
      throw new Error(`Failed to fetch encrypted file: ${response.status}`);
    }
    
    const encryptedPayload = await response.json();
    
    // Extract parameters
    const { kdf, wrap, data } = encryptedPayload;
    if (!kdf || !wrap || !data) {
      throw new Error('Invalid encrypted file format');
    }
    
    // Derive KEK from passphrase
    const kek = await deriveKey(passphrase, kdf.salt, kdf.iterations);
    
    // Decrypt the wrapped DEK
    const dekBuffer = await decryptData(wrap.wrappedKey, kek, wrap.iv);
    const dek = await crypto.subtle.importKey(
      'raw',
      dekBuffer,
      'AES-GCM',
      false,
      ['decrypt']
    );
    
    // Decrypt the main data
    const zipBuffer = await decryptData(data.ciphertext, dek, data.iv);
    
    return zipBuffer;
  } catch (error) {
    // Provide more specific error messages
    if (error.name === 'OperationError') {
      throw new Error('Onjuist wachtwoord');
    } else if (error.message.includes('atob')) {
      throw new Error('Data format error (base64 decoding failed)');
    } else if (error.message.includes('fetch')) {
      throw new Error('Kan encrypted bestand niet laden');
    } else {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }
}

let XLSXurl = 'private/data_sankeydiagram_december2025.xlsm'

let sankeyConfigs = []

// Storage for multiple sankey diagram data
let sankeyDataLibraries = {}
let activeDiagramId = null
let diagramConfigs = []

// Function to switch between sankey diagrams
function switchDiagram(diagramId) {
  console.log('Switching to diagram:', diagramId)

  if (!sankeyDataLibraries[diagramId]) {
    console.error('Diagram data not found for:', diagramId)
    return
  }

  activeDiagramId = diagramId
  const rawSankeyData = sankeyDataLibraries[diagramId]

  // Clear existing sankey
  d3.select('#energyflows_sankeySVGPARENT').remove()
  d3.select('#energyflows_backdropSVG').remove()

  // Process the new diagram data (keep selection buttons, don't reset them)
  sankeyConfigs.forEach(element => {
    let configString = JSON.stringify(element)
    let config = JSON.parse(configString)

    var links = rawSankeyData.links[config.sankeyDataID]
    var nodes = rawSankeyData.nodes[config.sankeyDataID]
    var legend = rawSankeyData.legend[config.sankeyDataID]
    var settings = rawSankeyData.settings[config.sankeyDataID]
    var remarks = rawSankeyData.remarks[config.sankeyDataID]
    var rectangles = rawSankeyData.rectangles ? rawSankeyData.rectangles[config.sankeyDataID] : null

    nodesGlobal = nodes

    settings = transformDataGlobal(settings)

    // Update width/height from settings
    element.width = settings[0].diagramWidth || 1600
    element.height = settings[0].diagramHeight || 1200

    // Import rectangles if available, otherwise clear existing rectangles
    if (rectangles && rectangles.length > 0 && typeof importRectanglesFromExcel === 'function') {
      importRectanglesFromExcel(rectangles)
    } else {
      window.backgroundRectangles = []
    }

    processData(links, nodes, legend, settings, remarks, config)
  })

  // Update diagram button highlighting
  updateDiagramButtonHighlight(diagramId)

  // Re-apply the current scenario/year selection to the new diagram
  if (typeof setScenario === 'function') {
    setTimeout(() => {
      setScenario()
    }, 100)
  }
}

// Helper function to update diagram button highlight
function updateDiagramButtonHighlight(activeDiagramId) {
  const buttons = document.querySelectorAll('.diagram-selection-button')
  buttons.forEach(btn => {
    if (btn.dataset.diagramId === activeDiagramId) {
      btn.classList.add('highlighted')
    } else {
      btn.classList.remove('highlighted')
    }
  })
}

// Global transform function for use in switchDiagram
function transformDataGlobal(inputArray) {
  const output = {}
  inputArray.forEach(item => {
    const key = item.setting
    const value = item.waarde
    output[key] = value
  })
  return [output]
}

// Make switchDiagram globally available
window.switchDiagram = switchDiagram

function initTool () {
  sankeyConfigs.push({ sankeyDataID: 'system', sankeyInstanceID: 'energyflows', targetDIV: 'SVGContainer_energyflows', width: null, height: null})
  // sankeyConfigs.push({ sankeyDataID: 'electricity', sankeyInstanceID: 'energyflows', targetDIV: 'SVGContainer_energyflows', width: null, height: null})
  // sankeyConfigs.push({ sankeyDataID: 'hydrogen', sankeyInstanceID: 'energyflows', targetDIV: 'SVGContainer_energyflows', width: null, height: null})
  // sankeyConfigs.push({ sankeyDataID: 'heat', sankeyInstanceID: 'energyflows', targetDIV: 'SVGContainer_energyflows', width: null, height: null})
  // sankeyConfigs.push({ sankeyDataID: 'carbon', sankeyInstanceID: 'energyflows', targetDIV: 'SVGContainer_energyflows', width: null, height: null})

  // console.log(sankeyConfigs)

  if (dataSource == 'url') {
    // Check if viewerConfig has multiple sankey diagrams configured
    if (viewerConfig && viewerConfig.sankeyDiagrams && viewerConfig.sankeyDiagrams.length > 0) {
      diagramConfigs = viewerConfig.sankeyDiagrams
      console.log('Loading multiple sankey diagrams:', diagramConfigs)

      // Load all diagram files
      let loadPromises = diagramConfigs.map(diagramConfig => {
        return new Promise((resolve) => {
          const fileUrl = 'private/' + diagramConfig.file
          console.log('Loading diagram file:', fileUrl)
          readExcelFile(fileUrl, (rawSankeyData) => {
            sankeyDataLibraries[diagramConfig.id] = rawSankeyData
            console.log('Loaded diagram:', diagramConfig.id)
            resolve()
          })
        })
      })

      // Wait for all files to load, then render the default diagram
      Promise.all(loadPromises).then(() => {
        console.log('All diagram files loaded')
        d3.select('#loadFileDialog').style('visibility', 'hidden').style('pointer-events', 'none')
        d3.selectAll('.buttonTitles').style('visibility', 'visible')

        // Find default diagram or use first one
        const defaultDiagram = diagramConfigs.find(d => d.default) || diagramConfigs[0]
        activeDiagramId = defaultDiagram.id

        // Load the default diagram
        const rawSankeyData = sankeyDataLibraries[activeDiagramId]
        loadSankeyDiagram(rawSankeyData)

        // Make diagramConfigs globally available for buttons
        window.diagramConfigs = diagramConfigs
        window.activeDiagramId = activeDiagramId
      })
    } else {
      // Fallback to single file loading (original behavior)
      readExcelFile(XLSXurl, (rawSankeyData) => {
        d3.select('#loadFileDialog').style('visibility', 'hidden').style('pointer-events', 'none')
        d3.selectAll('.buttonTitles').style('visibility', 'visible')
        loadSankeyDiagram(rawSankeyData)
      })
    }
  } else if (dataSource == 'file') {
    console.log('FILE')

    d3.select('#loadFileDialog').style('visibility', 'visible').style('pointer-events', 'auto')
  }
}

// Function to load and render a sankey diagram
function loadSankeyDiagram(rawSankeyData) {
  sankeyConfigs.forEach(element => {
    let configString = JSON.stringify(element)
    let config = JSON.parse(configString)

    var links = rawSankeyData.links[config.sankeyDataID]
    var nodes = rawSankeyData.nodes[config.sankeyDataID]
    var legend = rawSankeyData.legend[config.sankeyDataID]
    var settings = rawSankeyData.settings[config.sankeyDataID]
    var remarks = rawSankeyData.remarks[config.sankeyDataID]
    var rectangles = rawSankeyData.rectangles ? rawSankeyData.rectangles[config.sankeyDataID] : null

    nodesGlobal = nodes

    settings = transformData(settings)

    // Update sankeyConfigs with dynamic width and height from Excel settings
    element.width = settings[0].diagramWidth || 1600
    element.height = settings[0].diagramHeight || 1200

    if (settings[0].projectID != projectID || settings[0].versionID != versionID) {
      return
      console.log('ERROR')
    }

    // Import rectangles if available, otherwise clear existing rectangles
    if (rectangles && rectangles.length > 0 && typeof importRectanglesFromExcel === 'function') {
      importRectanglesFromExcel(rectangles)
    } else {
      window.backgroundRectangles = []
    }

    function transformData (inputArray) {
      const output = {}

      inputArray.forEach(item => {
        const key = item.setting
        const value = item.waarde
        output[key] = value
      })
      // Wrap the resulting object in an array to match the desired structure
      return [output]
    }

    processData(links, nodes, legend, settings, remarks, config)
  })

  // After all data is loaded, check scenario availability
  setTimeout(() => {
    if (typeof updateScenarioAvailability === 'function') {
      // Get the config object from the first sankey config
      const firstConfig = sankeyConfigs.length > 0 ? sankeyConfigs[0] : {}
      updateScenarioAvailability({ scenarios: config.scenarios })
    }
  }, 100)
}

setTimeout(() => {
  sankeyModeActive = true
  initTool()
}, 200)

function readExcelFile (url, callback) {
  // Create a new XMLHttpRequest object
  const xhr = new XMLHttpRequest()
  // Set up a callback for when the XMLHttpRequest finishes loading the file
  xhr.onload = () => {
    // Get the response data from the XMLHttpRequest
    const data = xhr.response
    // Create a new workbook object from the data
    const workbook = XLSX.read(data, {type: 'array'})
    // Define object variables for each sheet

    const result = generateSankeyLibrary(workbook)
    // Call the callback function with the resulting objects
    callback(result)
  }
  // Set up the XMLHttpRequest to load the file from the specified URL
  xhr.open('GET', url, true)
  xhr.responseType = 'arraybuffer'
  xhr.send()
}

function generateSankeyLibrary (workbook) {
  // Read the data from each sheet
  let sankeyDataLibrary = {}
  workbook.SheetNames.forEach(sheetName => {
    const worksheet = workbook.Sheets[sheetName]
    // Skip sheets with 'sparse' in the name to use full data sheets instead
    if (worksheet && sheetName.startsWith('snky_') && !sheetName.includes('sparse')) {
      const [before, after] = sheetName.slice(5).split('_', 2)
      if (after && ['links', 'nodes', 'remarks', 'legend', 'settings', 'rectangles'].includes(after)) {
        // Ensure the top-level object exists
        if (!sankeyDataLibrary[after]) {
          sankeyDataLibrary[after] = {}
        }
        // Store the data in the correct structure
        sankeyDataLibrary[after][before] = XLSX.utils.sheet_to_json(worksheet)
      }
    }
  })
  // console.log(sankeyDataLibrary)
  return sankeyDataLibrary
}


 // Only create modern UI interface when dataSource is 'file'
 if (typeof dataSource !== 'undefined' && dataSource === 'file') {
   // Create modern passphrase input interface
   const passphraseWrapper = document.getElementById('passphraseWrapper');
   const buttonGroup = document.getElementById('buttonGroup');
   const statusMessage = document.getElementById('statusMessage');

   // Create hidden username field for browser password management
   const usernameInput = document.createElement('input');
   usernameInput.type = 'text';
   usernameInput.name = 'username';
   usernameInput.value = 'TENNET';
   usernameInput.autocomplete = 'username';
   usernameInput.style.display = 'none';
   usernameInput.setAttribute('aria-hidden', 'true');

    // Create passphrase input with modern styling
   const passphraseInput = document.createElement('input');
   passphraseInput.type = 'password';
   passphraseInput.placeholder = 'Wachtwoord';
   passphraseInput.className = 'modern-passphrase-input';
   passphraseInput.autocomplete = 'current-password';
   passphraseInput.setAttribute('spellcheck', 'false');
 
 // Create decrypt button with modern styling
 const decryptButton = document.createElement('button');
 decryptButton.innerHTML = `
   
   <span class="button-text">Inloggen</span>
 `;
 decryptButton.className = 'modern-decrypt-button';
 decryptButton.type = 'button';
 
 passphraseWrapper.appendChild(usernameInput);
passphraseWrapper.appendChild(passphraseInput);
 buttonGroup.appendChild(decryptButton);

 // Create small hard reload button in bottom-right corner
 const reloadButton = document.createElement('button');
 reloadButton.innerHTML = `Cache Vernieuwen`;
 reloadButton.type = 'button';
 reloadButton.style.position = 'absolute';
 reloadButton.style.bottom = '20px';
 reloadButton.style.right = '20px';
 reloadButton.style.padding = '8px 12px';
 reloadButton.style.fontSize = '11px';
 reloadButton.style.fontWeight = '400';
 reloadButton.style.backgroundColor = '#999';
 reloadButton.style.color = 'white';
 reloadButton.style.border = 'none';
 reloadButton.style.borderRadius = '6px';
 reloadButton.style.cursor = 'pointer';
 reloadButton.style.transition = 'background-color 0.2s';
 reloadButton.style.textTransform = 'none';
 reloadButton.style.fontFamily = 'inherit';
 reloadButton.style.textAlign = 'center';
 reloadButton.style.display = 'flex';
 reloadButton.style.justifyContent = 'center';
 reloadButton.style.alignItems = 'center';

 reloadButton.addEventListener('mouseover', () => {
   reloadButton.style.backgroundColor = '#777';
 });
 reloadButton.addEventListener('mouseout', () => {
   reloadButton.style.backgroundColor = '#999';
 });

 reloadButton.addEventListener('click', () => {
   // Hard reload: clear cache and reload
   location.reload(true);
 });

 // Append to the welcome-card container (parent of welcome-content)
 const welcomeCard = document.querySelector('.welcome-card');
 if (welcomeCard) {
   welcomeCard.appendChild(reloadButton);
 }

 // Enable Enter key to trigger decryption
 passphraseInput.addEventListener('keypress', (event) => {
   if (event.key === 'Enter') {
     decryptButton.click();
   }
 });

 // Add click event listener to decrypt button
 decryptButton.addEventListener('click', async () => {
   const passphrase = passphraseInput.value.trim();
   if (!passphrase) {
     updateStatusMessage('Voer een toegangscode in.', 'error');
     return;
   }

   try {
     updateStatusMessage('Ontsleutelen van gegevens...', 'loading');
     decryptButton.disabled = true;
     
     // Decrypt the ZIP file
     const zipBuffer = await decryptZipFile(passphrase);
     
     // Load the ZIP content
     const zip = new JSZip();
     const zipContent = await zip.loadAsync(zipBuffer);
     const excelData = {};
     const csvData = {}; // Store CSV data separately
     const jsonData = {}; // Store JSON data separately

     const excelExtensions = /\.(xls[xmb]?|ods|xml)$/i;
     const csvExtensions = /\.(csv|tsv|txt)$/i;
     const jsonExtensions = /\.json$/i;

     for (const fileName of Object.keys(zipContent.files)) {
       const zipFile = zipContent.files[fileName];

       if (!zipFile.dir) {
         if (excelExtensions.test(fileName)) {
           // Handle Excel files
           const fileData = await zipFile.async('arraybuffer');

           try {
             const workbook = XLSX.read(fileData, { type: 'array' });
             const sheets = {};
             workbook.SheetNames.forEach(sheetName => {
               sheets[sheetName] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
             });

             const baseName = fileName.split('/').pop().replace(/\.[^.]+$/, '');
             excelData[baseName] = sheets;
           } catch (err) {
             console.warn(`Failed to parse Excel file "${fileName}":`, err);
           }
         } else if (csvExtensions.test(fileName)) {
           // Handle CSV files
           try {
             const csvText = await zipFile.async('text');
             const baseName = fileName.split('/').pop().replace(/\.[^.]+$/, '');
             csvData[baseName] = csvText;
           } catch (err) {
             console.warn(`Failed to read CSV file "${fileName}":`, err);
           }
         } else if (jsonExtensions.test(fileName)) {
           // Handle JSON files
           try {
             const jsonText = await zipFile.async('text');
             const baseName = fileName.split('/').pop().replace(/\.[^.]+$/, '');
             jsonData[baseName] = JSON.parse(jsonText);
           } catch (err) {
             console.warn(`Failed to parse JSON file "${fileName}":`, err);
           }
         }
       }
     }

     console.log('Extracted Excel Data:', excelData);
     console.log('Extracted CSV Data:', csvData);
     console.log('Extracted JSON Data:', jsonData);
     // Hide the welcome overlay immediately before heavy rendering starts
     (function hideWelcomeOverlay() {
       const welcomeContainer = document.querySelector('.welcome-container');
       if (welcomeContainer) {
         welcomeContainer.style.display = 'none';
       }
       const loadFileDialogEl = document.getElementById('loadFileDialog');
       if (loadFileDialogEl) {
         loadFileDialogEl.style.display = 'none';
       }
     })();

     // Pass CSV data to cijferbasis module if available
     if (csvData['cijferbasis_data'] && typeof window.setCijferBasisZipData === 'function') {
       window.setCijferBasisZipData(csvData);
     }

     // Pass categoryConfig from ZIP if available
     if (jsonData['categoryConfig'] && typeof window.setCategoryConfigFromZip === 'function') {
       window.setCategoryConfigFromZip(jsonData['categoryConfig']);
     }

    // Set viewerConfig from ZIP if available (for drawSelectionButtons.js)
    if (jsonData['viewer-config']) {
      viewerConfig = jsonData['viewer-config'];
      console.log('Viewer configuration loaded from zip file:', viewerConfig.viewer?.name || 'unknown');
      // Initialize the config (sets up scenarioIdLookup and lookup_ymaxvalues)
      if (typeof loadViewerConfig === 'function') {
        loadViewerConfig();
      }
      // Set version labels after config is loaded (with small delay to ensure DOM is ready)
      setTimeout(() => {
        if (typeof setVersionLabels === 'function') {
          setVersionLabels();
        } else if (typeof setTopRightLabel === 'function') {
          setTopRightLabel();
        }
      }, 100);
    }

     // Pass CSV data to capacity visualization module if available
     if ((csvData['processed_capacities'] || csvData['etm_production_parameters_mapping']) && typeof window.setCapacityZipData === 'function') {
       window.setCapacityZipData(csvData);
       // Draw capacity visualization after data is loaded
       if (typeof drawCapacityVisualization === 'function') {
         drawCapacityVisualization();
       }
     }

     dataset_ADAPT = excelData['data_watervaldiagram_A_ADAPT']
     dataset_TRANSFORM_DEFAULT = excelData['data_watervaldiagram_C_TRANSFORM - Default']
     dataset_TRANSFORM_C_EN_I = excelData['data_watervaldiagram_B_TRANSFORM - Competitief en import']
     dataset_TRANSFORM_MC = excelData['data_watervaldiagram_D_TRANSFORM - Minder competitief']
     dataset_TRANSFORM_MC_EN_I = excelData['data_watervaldiagram_E_TRANSFORM - Minder competitief en import']
     dataset_PR40 = excelData['data_watervaldiagram_OP - CO2-opslag 40']
     dataset_SR20 = excelData['data_watervaldiagram_OptimistischSelectiefFossilCarbonPenalty']
     dataset_PB30 = excelData['data_watervaldiagram_PP_CCS_30_in_2050']
    //  dataset_WLO1 = excelData['data_watervaldiagram_WLO1']
    //  dataset_WLO2 = excelData['data_watervaldiagram_WLO2']
    //  dataset_WLO3 = excelData['data_watervaldiagram_WLO3']
    //  dataset_WLO4 = excelData['data_watervaldiagram_WLO4']

     initWaterfallDiagram()

    //  alert('Excel data extracted — check the console!');

     // GENERATE SANKEY
     // Check if multiple sankey diagrams are configured in viewer-config
     if (viewerConfig && viewerConfig.sankeyDiagrams && viewerConfig.sankeyDiagrams.length > 0) {
       diagramConfigs = viewerConfig.sankeyDiagrams

       // Load all configured diagrams from the ZIP
       diagramConfigs.forEach(diagramConfig => {
         // Convert filename to Excel data key (remove extension and path)
         const fileKey = diagramConfig.file.replace(/\.[^.]+$/, '').split('/').pop()

         if (excelData[fileKey]) {
           const rawSankeyData = generateSankeyLibrary(jsonToWorkbook(excelData[fileKey]))
           sankeyDataLibraries[diagramConfig.id] = rawSankeyData
           console.log('Loaded diagram from ZIP:', diagramConfig.id, 'from file key:', fileKey)
         } else {
           console.warn('Sankey diagram file not found in ZIP:', fileKey, 'Available keys:', Object.keys(excelData))
         }
       })

       // Set the active diagram (default or first)
       activeDiagramId = (diagramConfigs.find(d => d.default) || diagramConfigs[0]).id
       const rawSankeyData = sankeyDataLibraries[activeDiagramId]

       if (!rawSankeyData) {
         console.error('No valid sankey data found in ZIP')
         return
       }

       // Make diagramConfigs globally available for buttons
       window.diagramConfigs = diagramConfigs
       window.activeDiagramId = activeDiagramId

       // Process the default diagram
       sankeyConfigs.forEach(element => {
         let configString = JSON.stringify(element)
         let config = JSON.parse(configString)

         var links = rawSankeyData.links[config.sankeyDataID]
         var nodes = rawSankeyData.nodes[config.sankeyDataID]
         var legend = rawSankeyData.legend[config.sankeyDataID]
         var settings = rawSankeyData.settings[config.sankeyDataID]
         var remarks = rawSankeyData.remarks[config.sankeyDataID]
         var rectangles = rawSankeyData.rectangles ? rawSankeyData.rectangles[config.sankeyDataID] : null

         settings = transformData(settings)

         // Update sankeyConfigs with dynamic width and height from Excel settings
         element.width = settings[0].diagramWidth || 1600
         element.height = settings[0].diagramHeight || 1200

         // Import rectangles if available
         if (rectangles && rectangles.length > 0 && typeof importRectanglesFromExcel === 'function') {
           importRectanglesFromExcel(rectangles)
         } else {
           window.backgroundRectangles = []
         }

         if (settings[0].projectID != projectID || settings[0].versionID != versionID || settings[0].productID != productID) {
           console.log('ERROR - ID MISMATCH')
           const loadFileDialog = document.getElementById('loadFileDialog')
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

         function transformData (inputArray) {
           const output = {}
           inputArray.forEach(item => {
             const key = item.setting
             const value = item.waarde
             output[key] = value
           })
           return [output]
         }
         processData(links, nodes, legend, settings, remarks, config)
       })
     } else {
       // Fallback: single diagram mode (original behavior)
       var rawSankeyData = generateSankeyLibrary(jsonToWorkbook(excelData.data_sankeydiagram_december2025))
       sankeyConfigs.forEach(element => {

        let configString = JSON.stringify(element) // stringify in order to prevent code further down the line to transform sankeyConfigs object
        let config = JSON.parse(configString)

        var links = rawSankeyData.links[config.sankeyDataID]
        var nodes = rawSankeyData.nodes[config.sankeyDataID]
        var legend = rawSankeyData.legend[config.sankeyDataID]
        var settings = rawSankeyData.settings[config.sankeyDataID]
        var remarks = rawSankeyData.remarks[config.sankeyDataID]

        settings = transformData(settings)

        // Update sankeyConfigs with dynamic width and height from Excel settings
        element.width = settings[0].diagramWidth || 1600  // Fallback to 1600 if not set
        element.height = settings[0].diagramHeight || 1200  // Fallback to 1200 if not set

      // console.log(settings)

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
        processData(links, nodes, legend, settings, remarks, config)
      })
     }

     updateStatusMessage('Data succesvol geladen!', 'success');
     
     
     

   } catch (err) {
     console.error('Error decrypting or reading ZIP file:', err);
     updateStatusMessage(`${err.message}`, 'error');
     decryptButton.disabled = false;
   }
 });

   // Function to update status messages with modern styling
   function updateStatusMessage(message, type) {
     statusMessage.className = 'status-message';
     statusMessage.innerHTML = '';
     
     if (type === 'loading') {
       statusMessage.innerHTML = `
         <div class="loading-spinner"></div>
         <span>${message}</span>
       `;
       statusMessage.classList.add('status-loading');
     } else if (type === 'success') {
       statusMessage.innerHTML = `
         <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
           <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
         </svg>
         <span>${message}</span>
       `;
       statusMessage.classList.add('status-success');
     } else if (type === 'error') {
       statusMessage.innerHTML = `
         <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
           <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
         </svg>
         <span>${message}</span>
       `;
       statusMessage.classList.add('status-error');
     }
   }
 }




 function jsonToWorkbook(jsonObject) {
  const workbook = XLSX.utils.book_new();

  for (const sheetName in jsonObject) {
    const sheetData = jsonObject[sheetName];
    const worksheet = XLSX.utils.json_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  }

  return workbook;
}

































// extractExcelDataFromZip('/private/scenarioviewer_tvkn_v3_april_2025.zip')
//   .then(data => console.log(data))
//   .catch(err => console.error(err));

//   async function extractExcelDataFromZip(url) {
//     const zip = new JSZip();
  
//     // Fetch the zip file
//     const response = await fetch(url);
//     if (!response.ok) {
//       throw new Error(`Failed to download ZIP: ${response.statusText}`);
//     }
  
//     const blob = await response.blob();
//     const zipContent = await zip.loadAsync(blob);
  
//     const excelData = {};
  
//     const excelExtensions = /\.(xls[xmb]?|ods|csv|tsv|txt|xml)$/i;
  
//     for (const fileName of Object.keys(zipContent.files)) {
//       const file = zipContent.files[fileName];
  
//       if (!file.dir && excelExtensions.test(fileName)) {
//         const fileData = await file.async('arraybuffer');
  
//         try {
//           const workbook = XLSX.read(fileData, { type: 'array' });
  
//           const sheets = {};
//           workbook.SheetNames.forEach(sheetName => {
//             sheets[sheetName] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
//           });
  
//           const baseName = fileName.split('/').pop().replace(/\.[^.]+$/, '');
//           excelData[baseName] = sheets;
//         } catch (err) {
//           console.warn(`Failed to parse Excel file "${fileName}":`, err);
//         }
//       }
//     }
  
//     return excelData;
//   }
