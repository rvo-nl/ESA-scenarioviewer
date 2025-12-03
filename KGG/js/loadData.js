// let currentScenario = 'nat'
// let currentSector = 'all'
// let currentRoutekaart = 'w'
// let currentYMax = [1400, 100, 1400]
// let currentTitlesArray = ['Directe elektrificatie (COP~1)', 'Directe elektrificatie (COP>1)', 'Waterstofnet', 'Warmtenet', 'Biobrandstoffen', 'Omgevings-, zonne- en aardwarmte', 'Aardgas, olie, kolen', 'CCS']
// let currentColorsArray = ['#E99172', '#F8D377', '#3F88AE', '#DD5471', '#62D3A4', '#aaaaaa', '#666666', '#444']
// let sankeyModeActive = false
// let currentZichtjaar = '2030'
// let currentUnit = 'PJ'

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
    const response = await fetch('public/ds03122025kgg.enc.json');
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

let XLSXurl = 'private/data_sankeydiagram_ESA_v5_14082025.xlsm'

let sankeyConfigs = []

function initTool () {
  sankeyConfigs.push({ sankeyDataID: 'system', sankeyInstanceID: 'energyflows', targetDIV: 'SVGContainer_energyflows', width: 1600, height: 1200})
  // sankeyConfigs.push({ sankeyDataID: 'electricity', sankeyInstanceID: 'energyflows', targetDIV: 'SVGContainer_energyflows', width: 1600, height: 1050})
  // sankeyConfigs.push({ sankeyDataID: 'hydrogen', sankeyInstanceID: 'energyflows', targetDIV: 'SVGContainer_energyflows', width: 1600, height: 1050})
  // sankeyConfigs.push({ sankeyDataID: 'heat', sankeyInstanceID: 'energyflows', targetDIV: 'SVGContainer_energyflows', width: 1600, height: 1050})
  // sankeyConfigs.push({ sankeyDataID: 'carbon', sankeyInstanceID: 'energyflows', targetDIV: 'SVGContainer_energyflows', width: 1600, height: 1050})

  // console.log(sankeyConfigs)

  if (dataSource == 'url') {
    readExcelFile(XLSXurl, (rawSankeyData) => {

      d3.select('#loadFileDialog').style('visibility', 'hidden').style('pointer-events', 'none')
      d3.selectAll('.buttonTitles').style('visibility', 'visible')

      // console.log(rawSankeyData)

      sankeyConfigs.forEach(element => {

        let configString = JSON.stringify(element) // stringify in order to prevent code further down the line to transform sankeyConfigs object
        let config = JSON.parse(configString)

        var links = rawSankeyData.links[config.sankeyDataID]
        var nodes = rawSankeyData.nodes[config.sankeyDataID]
        var legend = rawSankeyData.legend[config.sankeyDataID]
        var settings = rawSankeyData.settings[config.sankeyDataID]
        var remarks = rawSankeyData.remarks[config.sankeyDataID]


        // console.log('Links:', links)
        // console.log('Nodes:', nodes)
        // console.log('Legend:', legend)
        // console.log('Settings:', settings)
        // console.log('Remarks:', remarks)

        nodesGlobal = nodes

        settings = transformData(settings)

        if (settings[0].projectID != projectID || settings[0].versionID != versionID) {
          return
          console.log('ERROR')
        }

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
    })
  } else if (dataSource == 'file') {
    console.log('FILE')

    d3.select('#loadFileDialog').style('visibility', 'visible').style('pointer-events', 'auto')
    // // Get the container div with id "loadFileDialog"
    // const loadFileDialog = document.getElementById('loadFileDialog')

    // // Create the file input element
    // const fileInput = document.createElement('input')
    // fileInput.type = 'file'
    // fileInput.accept = '.xlsx' // Restrict file type to Excel files

    // // Append the file input element to the "loadFileDialog" div
    // if (loadFileDialog) {
    //   loadFileDialog.appendChild(fileInput)
    // } else {
    //   console.error('Element with id not found.')
    // }

    // // Listen for file selection
    // fileInput.addEventListener('change', (event) => {
    //   const file = event.target.files[0] // Get the selected file
    //   if (!file) {
    //     console.error('No file selected!')
    //     return
    //   }

    //   // Create a FileReader to read the file
    //   const reader = new FileReader()

    //   reader.onload = (e) => {
    //     const data = new Uint8Array(e.target.result) // Read the file as a binary array
    //     const workbook = XLSX.read(data, { type: 'array' }) // Parse the Excel file

    //     const rawSankeyData = generateSankeyLibrary(workbook)

    //     sankeyConfigs.forEach(element => {

    //       let configString = JSON.stringify(element) // stringify in order to prevent code further down the line to transform sankeyConfigs object
    //       let config = JSON.parse(configString)

    //       var links = rawSankeyData.links[config.sankeyDataID]
    //       var nodes = rawSankeyData.nodes[config.sankeyDataID]
    //       var legend = rawSankeyData.legend[config.sankeyDataID]
    //       var settings = rawSankeyData.settings[config.sankeyDataID]
    //       var remarks = rawSankeyData.remarks[config.sankeyDataID]

    //       settings = transformData(settings)

    //       // console.log(settings)

    //       if (settings[0].projectID != projectID || settings[0].versionID != versionID || settings[0].productID != productID) {
    //         console.log('ERROR - ID MISMATCH')
    //         const loadFileDialog = document.getElementById('loadFileDialog')
    //         // Set the inner HTML with the desired text and link
    //         document.getElementById('loadFileDialog').innerHTML = `
    //           <div style="max-width: 500px; word-wrap: break-word;line-height: 35px;font-size:15px; ">
    //               <strong style="line-height: 40px; font-size:28px;font-weight:300;">Error</strong> <br><br>De identificatienummers van het opgegeven databestand (<strong>${settings[0].projectID}_${settings[0].productID}_${settings[0].versionID}</strong>) en het ingeladen visualisatiescript (<strong>${projectID}_${productID}_${versionID}</strong>) komen niet overeen.<br><br>Gebruik de onderstaande link om naar het script te gaan dat bij het opgegeven bestand hoort en probeer het opnieuw.&nbsp
    //               <br><br>
    //               <a href="https://rvo-nl.github.io/visualisaties/${settings[0].projectID}/${settings[0].productID}/${settings[0].versionID}" style="color: blue; text-decoration: underline;">
    //                   https://rvo-nl.github.io/visualisaties/${settings[0].projectID}/${settings[0].productID}/${settings[0].versionID}
    //               </a>
    //           </div>
    //       `

    //         return
    //       }

    //       d3.select('#loadFileDialog').style('visibility', 'hidden').style('pointer-events', 'none')
    //       d3.selectAll('.buttonTitles').style('visibility', 'visible')

    //       function transformData (inputArray) { // this function converts the new input format for the settings tab to the old input format the rest of the code expects
    //         const output = {}

    //         inputArray.forEach(item => {
    //           const key = item.setting; // Get the key from "horizontalMargin"
    //           const value = item.waarde; // Get the value from "0"
    //           output[key] = value // Assign to the output object
    //         })
    //         // Wrap the resulting object in an array to match the desired structure
    //         return [output]
    //       }
    //       processData(links, nodes, legend, settings, remarks, config)
    //     })
    //   }

    //   reader.readAsArrayBuffer(file) // Read the file as a binary array
    // })
  }
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
      if (after && ['links', 'nodes', 'remarks', 'legend', 'settings'].includes(after)) {
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

// setTimeout(() => { // TODO: MAKE SEQUENTIAL WITH TOKEN
//   setScenario() // init
// }, 1000)







 // Only create modern UI interface when dataSource is 'file'
 if (typeof dataSource !== 'undefined' && dataSource === 'file') {
   // Create modern passphrase input interface
   const passphraseWrapper = document.getElementById('passphraseWrapper');
   const buttonGroup = document.getElementById('buttonGroup');
   const statusMessage = document.getElementById('statusMessage');
 
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
 
 passphraseWrapper.appendChild(passphraseInput);
 buttonGroup.appendChild(decryptButton);
 
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

     const excelExtensions = /\.(xls[xmb]?|ods|xml)$/i;
     const csvExtensions = /\.(csv|tsv|txt)$/i;

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
         }
       }
     }

     console.log('Extracted Excel Data:', excelData);
     console.log('Extracted CSV Data:', csvData);
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
     var rawSankeyData = generateSankeyLibrary(jsonToWorkbook(excelData.data_sankeydiagram_ESA_v5_14082025))
     sankeyConfigs.forEach(element => {

      let configString = JSON.stringify(element) // stringify in order to prevent code further down the line to transform sankeyConfigs object
      let config = JSON.parse(configString)

      var links = rawSankeyData.links[config.sankeyDataID]
      var nodes = rawSankeyData.nodes[config.sankeyDataID]
      var legend = rawSankeyData.legend[config.sankeyDataID]
      var settings = rawSankeyData.settings[config.sankeyDataID]
      var remarks = rawSankeyData.remarks[config.sankeyDataID]

      settings = transformData(settings)

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