// Global variables for cijferbasis data
let cijferBasisData = null;
let ketenStates = {}; // Store expanded/collapsed state of keten sections
let zipFileData = null; // Store ZIP file data when dataSource = 'file'

// Configuration object for unit label colors
// You can customize these colors by changing the values below
// The key should match the unit text (case-insensitive)
// Format options:
// 1. Simple string: 'red' or '#FF0000' (uses white text by default)
// 2. Object: { bg: '#FF0000', text: '#000000' } (custom background and text colors)
const unitLabelColors = {
  'ammoniak': 'grey',
  'biomassa': '#459473',
  'kolen': 'grey',
  'elektriciteit': { bg: '#F8D377', text: '#000000' },  // Yellow background with black text
  'aardwarmte': { bg: '#62D3A4', text: '#000' },
  'warmte': '#DD5471',
  'waterstof': '#7555F6',
  'methanol (fossiel)': 'purple',
  'methaan': '#3F88AE',
  'afval': 'grey',
  'olie': '#777',
  'recyclaat': { bg: '#666', text: '#FFFFFF' },  // Dark background with white text
  'zon': { bg: '#62D3A4', text: '#000' },
  'wind': { bg: '#62D3A4', text: '#000' },
  'hernieuwbaar':{ bg: '#62D3A4', text: '#000' },
  'synthetisch': '#E99172',
  'kern': { bg: '#6CD4FF', text: '#000000' },  // Light blue background with black text
  'verlies': { bg: '#ccc', text: '#FFF' },  // Light gray background with black text
  'koolstof': 'diagonal-stripes-#666-#459473', // Diagonally striped #666 and #459473
  'default': '#666666'          // Default dark gray (fallback for unmatched units)
};

// Helper function to create styled unit label
function createUnitLabel(unitText) {
  if (!unitText) return '';
  
  const colorConfig = unitLabelColors[unitText.toLowerCase()] || unitLabelColors['default'];
  
  // Handle different color configurations
  let backgroundColor, textColor, additionalClasses = '';
  
  if (typeof colorConfig === 'string') {
    // Check if it's a diagonal stripes pattern
    if (colorConfig.startsWith('diagonal-stripes-')) {
      // Parse diagonal-stripes-#666-#459473 format
      // Use regex to extract hex colors including the # symbol
      const hexPattern = /#[0-9A-Fa-f]{3,6}/g;
      const colors = colorConfig.match(hexPattern);
      
      if (colors && colors.length >= 2) {
        const color1 = colors[0];  // First hex color (e.g., #666)
        const color2 = colors[1];  // Second hex color (e.g., #459473)
        
        additionalClasses = 'diagonal-stripes';
        backgroundColor = 'transparent';
        textColor = 'white';
        
        // Create inline CSS for the specific stripe colors with larger stripes for visibility
        const stripeStyle = `
          background: repeating-linear-gradient(
            135deg,
            ${color1} 0px,
            ${color1} 6px,
            ${color2} 6px,
            ${color2} 12px
          ) !important;
        `;
        
        return `<span class="unit-label ${additionalClasses}" style="${stripeStyle} color: ${textColor} !important;">${unitText}</span>`;
      }
    }
    
    backgroundColor = colorConfig;
    textColor = 'white';  // Default text color for string configs
  } else if (typeof colorConfig === 'object' && colorConfig.bg) {
    backgroundColor = colorConfig.bg;
    textColor = colorConfig.text || 'white';  // Use specified text color or default to white
  } else {
    backgroundColor = '#666666';
    textColor = 'white';
  }
  
  return `<span class="unit-label ${additionalClasses}" style="background-color: ${backgroundColor}; color: ${textColor};">${unitText}</span>`;
}

// Load CSV data on initialization
async function loadCijferBasisData() {
  try {
    let csvText;
    
    // Check data source and load accordingly
    if (typeof dataSource !== 'undefined' && dataSource === 'file') {
      // Load from ZIP file data if available
      if (zipFileData && zipFileData['cijferbasis_data']) {
        // If CSV data is already extracted from ZIP, use it
        csvText = zipFileData['cijferbasis_data'];
      } else {
        console.warn('ZIP file data not available yet for cijferbasis_data.csv');
        return;
      }
    } else {
      // Load from URL (default behavior)
      const response = await fetch('private/cijferbasis_data.csv');
      csvText = await response.text();
    }
    
    // Parse CSV manually to handle the structure
    const lines = csvText.split('\n');
    
    // First line contains scenario names, second line contains year headers
    const scenarioLine = lines[0].split(',');
    const yearHeaders = lines[1].split(',');
    // CSV parsing debug logs removed - parsing works correctly
    
    const data = [];
    for (let i = 2; i < lines.length; i++) {
      if (lines[i].trim()) {
        const values = lines[i].split(',');
        const row = {};
        
        // First 7 columns are metadata
        row.tabel = values[0] || '';
        row.keten = values[1] || '';
        row.title = values[2] || '';
        row.topcat = values[3] || '';
        row.subcat = values[4] || '';
        row.notes = values[5] || '';
        row.unit = values[6] || '';
        
        // Data columns start from index 7
        for (let j = 7; j < values.length && j < scenarioLine.length; j++) {
          const scenario = scenarioLine[j] ? scenarioLine[j].trim() : '';
          const year = yearHeaders[j] ? yearHeaders[j].trim() : '';
          
          if (scenario && year) {
            const key = scenario === 'reference' ? year : `${scenario}_${year}`;
            row[key] = values[j] ? values[j].trim() : '';
            // CSV parsing works correctly - debug logs removed
          }
        }
        
        data.push(row);
      }
    }
    
    cijferBasisData = data;
    console.log('Cijferbasis data loaded:', data.length, 'rows');
    
    // Initial draw
    drawCijferBasisTables();
  } catch (error) {
    console.error('Error loading cijferbasis data:', error);
  }
}

// Function to save current keten states
function saveKetenStates() {
  const ketenToggleButtons = document.querySelectorAll('#cijferbasis_container .collapse-toggle');
  ketenToggleButtons.forEach(button => {
    const ketenName = button.querySelector('span:last-child').textContent.trim();
    const isExpanded = button.getAttribute('aria-expanded') === 'true';
    ketenStates[ketenName] = isExpanded;
  });
}

// Function to restore keten states
function restoreKetenStates() {
  setTimeout(() => {
    const ketenToggleButtons = document.querySelectorAll('#cijferbasis_container .collapse-toggle');
    ketenToggleButtons.forEach(button => {
      const ketenName = button.querySelector('span:last-child').textContent.trim();
      const shouldBeExpanded = ketenStates[ketenName] || false;
      
      if (shouldBeExpanded) {
        // Expand this keten
        button.setAttribute('aria-expanded', 'true');
        const icon = button.querySelector('.toggle-icon');
        icon.textContent = '−';
        
        // Show the collapse content
        const targetId = button.getAttribute('data-bs-target').substring(1);
        const collapseElement = document.getElementById(targetId);
        if (collapseElement) {
          collapseElement.classList.add('show');
        }
      }
    });
  }, 150);
}

// Check if tables already exist
function tablesExist() {
  return document.querySelectorAll('#cijferbasis_container .cijferbasis-table').length > 0;
}

// Function to update existing tables with new scenario data
function updateExistingTables(currentYear, selectedScenarioName, selectedScenarioTitle) {
  // Update all table headers with new scenario information
  const tables = document.querySelectorAll('#cijferbasis_container .cijferbasis-table');
  
  tables.forEach(table => {
    // Update unit column header (2nd column - first .column-header)
    const unitHeader = table.querySelector('.column-header:nth-child(2)');
    if (unitHeader) {
      unitHeader.textContent = `Eenheid (${currentUnit})`;
    }
    
    // Update reference header (3rd column - second .column-header)
    const referenceHeader = table.querySelector('.column-header:nth-child(3)');
    if (referenceHeader) {
      referenceHeader.textContent = `NPE2023 cijferbasis ${currentYear}`;
    }
    
    // Update scenario column header (4th column - third .column-header)
    const scenarioHeader = table.querySelector('.column-header:nth-child(4)');
    if (scenarioHeader) {
      scenarioHeader.textContent = `${selectedScenarioTitle} ${currentYear}`;
    }
    
    // Update data values in table rows
    const tableId = table.id;
    const tableName = tableId.replace(/^table_/, '').replace(/_[^_]+$/, '');
    
    // Find the data for this table
    const tableData = cijferBasisData.filter(row => row.tabel === tableName);
    if (tableData.length === 0) return;
    
    // Group data by topcat for this table
    const dataByTopcat = d3.group(tableData, d => d.topcat);
    
    // Update each topcat section
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    
    const topcatRows = tbody.querySelectorAll('.topcat-row');
    let topcatIndex = 0;
    
    dataByTopcat.forEach((topcatData, topcatName) => {
      if (!topcatName || topcatName === '') return;
      
      // Calculate new subtotals
      let referenceTotal = 0;
      let scenarioTotal = 0;
      
      topcatData.forEach(row => {
        if (!row.subcat || row.subcat === '') return;
        
        const referenceValue = getValueForYearAndScenario(row, currentYear, 'reference');
        const scenarioValue = getValueForYearAndScenario(row, currentYear, selectedScenarioName);
        
        referenceTotal += referenceValue;
        scenarioTotal += scenarioValue;
      });
      
      const subtotalDifference = scenarioTotal - referenceTotal;
      
      // Update topcat row values
      if (topcatRows[topcatIndex]) {
        const cells = topcatRows[topcatIndex].querySelectorAll('td');
        if (cells.length >= 6) {
          // cells[1] is the unit column - keep empty for topcat rows
          cells[2].textContent = formatNumber(referenceTotal);
          cells[3].textContent = formatNumber(scenarioTotal);
          cells[4].textContent = formatNumber(subtotalDifference, true);
          cells[4].className = subtotalDifference >= 0 ? 'positive-value' : (subtotalDifference < 0 ? 'negative-value' : 'neutral-value');
          // cells[5] is the notes column - keep empty for topcat rows
        }
      }
      
      // Update subcat rows
      let subcatIndex = 0;
      const subcatRows = tbody.querySelectorAll('.subcat-row');
      let currentSubcatRowIndex = 0;
      
      // Skip to subcat rows for this topcat
      for (let i = 0; i <= topcatIndex; i++) {
        if (i < topcatIndex) {
          // Count subcat rows for previous topcats
          const prevTopcatData = Array.from(dataByTopcat.values())[i];
          currentSubcatRowIndex += prevTopcatData.filter(row => row.subcat && row.subcat !== '').length;
        }
      }
      
      topcatData.forEach(row => {
        if (!row.subcat || row.subcat === '') return;
        
        const referenceValue = getValueForYearAndScenario(row, currentYear, 'reference');
        const scenarioValue = getValueForYearAndScenario(row, currentYear, selectedScenarioName);
        const difference = scenarioValue - referenceValue;
        
        // Table calculation complete
        
        if (subcatRows[currentSubcatRowIndex]) {
          const cells = subcatRows[currentSubcatRowIndex].querySelectorAll('td');
          if (cells.length >= 6) {
            cells[1].innerHTML = createUnitLabel(row.unit); // Update unit column with styled label
            cells[2].textContent = formatNumber(referenceValue);
            cells[3].textContent = formatNumber(scenarioValue);
            // Calculate percentage difference
            const percentageDifference = referenceValue !== 0 ? ((difference / referenceValue) * 100) : 0;
            const differenceText = formatNumber(difference, true) + 
              (referenceValue !== 0 ? ` (${percentageDifference >= 0 ? '+' : ''}${percentageDifference.toFixed(0)}%)` : '');
            
            cells[4].textContent = differenceText;
            cells[4].className = difference >= 0 ? 'positive-value' : (difference < 0 ? 'negative-value' : 'neutral-value');
            // cells[5] is the notes column - it should already contain the notes
          }
        }
        
        currentSubcatRowIndex++;
      });
      
      topcatIndex++;
    });
  });
}

// Main function to draw the tables
function drawCijferBasisTables() {
  if (!cijferBasisData) {
    console.warn('Cijferbasis data not loaded yet');
    return;
  }
  
  // Draw unit toggle on first load
  drawCijferBasisUnitToggle();
  
  // Get current selections from global variables
  const currentYear = globalActiveYear?.id || '2030';
  const currentScenario = globalActiveScenario?.id || 'TNO.ADAPT';
  
  console.log('Drawing tables for:', currentYear, currentScenario);
  
  // Map current scenario to CSV scenario names and display titles
  const scenarioInfo = {
    'TNO.ADAPT': { csvName: 'A_ADAPT', title: 'TNO | ADAPT' },
    'TNO.TRANSFORM': { csvName: 'C_TRANSFORM', title: 'TNO | TRANSFORM' },
    'TNO.TRANSFORM.C.EN.I': { csvName: 'B_TRANSFORM - Competitief en import', title: 'TNO | TRANSFORM | Competitief & Import' },
    'TNO.TRANSFORM.MC': { csvName: 'D_TRANSFORM - Minder competitief', title: 'TNO | TRANSFORM | Minder Competitief' },
    'TNO.TRANSFORM.MC.EN.I': { csvName: 'E_TRANSFORM - Minder competitief en import', title: 'TNO | TRANSFORM | Minder Competitief & Import' },
    'PBL.PR40': { csvName: 'OP - CO2-opslag 40', title: 'PBL | TVKN | Pragmatisch Ruim 40' },
    'PBL.SR20': { csvName: 'OptimistischSelectiefFossilCarbonPenalty', title: 'PBL | TVKN | Specifiek Ruim 20' },
    'PBL.PB30': { csvName: 'PP_CCS_30_in_2050', title: 'PBL | TVKN | Pragmatisch Beperkt 30' },
    'PBL.WLO1': { csvName: 'WLO1', title: 'PBL | WLO | Hoog Snel' },
    'PBL.WLO2': { csvName: 'WLO2', title: 'PBL | WLO | Laag Snel' },
    'PBL.WLO3': { csvName: 'WLO3', title: 'PBL | WLO | Hoog Vertraagd' },
    'PBL.WLO4': { csvName: 'WLO4', title: 'PBL | WLO | Laag Vertraagd' },
    'NBNL.V3KM': { csvName: 'ii3050_v3_koersvaste_middenweg', title: 'NBNL | II3050 v3 | Koersvaste Middenweg' },
    'NBNL.V3EM': { csvName: 'ii3050_v3_eigen_vermogen', title: 'NBNL | II3050 v3 | Eigen Vermogen' },
    'NBNL.V3GB': { csvName: 'ii3050_v3_gezamenlijke_balans', title: 'NBNL | II3050 v3 | Gezamenlijke Balans' },
    'NBNL.V3HA': { csvName: 'ii3050_v3_horizon_aanvoer', title: 'NBNL | II3050 v3 | Horizon Aanvoer' },
    'NBNL.V2NA': { csvName: 'ii3050_v2_nationale_drijfveren', title: 'NBNL | II3050 v2 | Nationale Drijfveren' },
    'NBNL.V2IA': { csvName: 'ii3050_v2_internationale_ambitie', title: 'NBNL | II3050 v2 | Internationale Ambitie' }
  };
  
  const currentScenarioInfo = scenarioInfo[currentScenario] || { csvName: 'reference', title: 'Reference' };
  const selectedScenarioName = currentScenarioInfo.csvName;
  const selectedScenarioTitle = currentScenarioInfo.title;
  
  // If tables already exist, just update the data
  if (tablesExist()) {
    updateExistingTables(currentYear, selectedScenarioName, selectedScenarioTitle);
    return;
  }
  
  // Otherwise, build tables from scratch (first time only)
  const container = d3.select('#cijferbasis_container');
  
  // Group data by keten (chain)
  const dataByKeten = d3.group(cijferBasisData, d => d.keten);
  
  // Create tables for each keten
  let ketenIndex = 0;
  dataByKeten.forEach((ketenData, ketenName) => {
    if (!ketenName || ketenName === '') return;
    
    // Create unique ID for this keten
    const ketenId = `keten_${ketenName}_${ketenIndex}`;
    const collapseId = `${ketenId}Collapse`;
    
    // Create blockquote wrapper (same as existing collapsibles)
    const blockquote = container.append('blockquote')
      .style('background-color', 'none')
      .style('border-left', '0.5rem solid #999')
      .style('margin-bottom', '30px');
    
    // Create collapse toggle header
    const collapseToggle = blockquote.append('div')
      .attr('class', 'collapse-toggle')
      .attr('data-bs-toggle', 'collapse')
      .attr('data-bs-target', `#${collapseId}`)
      .attr('aria-expanded', 'false')
      .attr('aria-controls', collapseId);
    
    collapseToggle.append('span')
      .attr('class', 'toggle-icon')
      .text('+');
    
    collapseToggle.append('span')
      .style('margin-left', '30px')
      .style('text-transform', 'capitalize')
      .text(ketenName);
    
    // Create collapsible content area
    const collapseDiv = blockquote.append('div')
      .attr('class', 'collapse mt-2')
      .attr('id', collapseId);
    
    const cardBody = collapseDiv.append('div')
      .attr('class', 'card card-body')
      .style('border', 'none')
      .style('background-color', 'transparent')
      .style('padding-top', '20px');
    
    // Group by table within this keten
    const dataByTable = d3.group(ketenData, d => d.tabel);
    
    let tableIndex = 0;
    dataByTable.forEach((tableData, tableName) => {
      if (!tableName || tableName === '') return;
      
      const isFirstTable = tableIndex === 0;
      createTable(cardBody, tableData, tableName, currentYear, selectedScenarioName, selectedScenarioTitle, isFirstTable);
      tableIndex++;
    });
    
    ketenIndex++;
  });
  
  // Add event listeners for keten collapsibles using Bootstrap events
  setTimeout(() => {
    const collapseElements = document.querySelectorAll('#cijferbasis_container .collapse');
    collapseElements.forEach(collapseElement => {
      // Listen for Bootstrap collapse events
      collapseElement.addEventListener('shown.bs.collapse', function () {
        // Element is now expanded, show minus
        const toggleButton = document.querySelector(`[data-bs-target="#${this.id}"]`);
        if (toggleButton) {
          const icon = toggleButton.querySelector('.toggle-icon');
          if (icon) icon.textContent = '−';
        }
      });
      
      collapseElement.addEventListener('hidden.bs.collapse', function () {
        // Element is now collapsed, show plus
        const toggleButton = document.querySelector(`[data-bs-target="#${this.id}"]`);
        if (toggleButton) {
          const icon = toggleButton.querySelector('.toggle-icon');
          if (icon) icon.textContent = '+';
        }
      });
    });
    
    // Note: No need to restore states since DOM is preserved
  }, 100);
}

// Function to create individual table
function createTable(container, data, tableName, currentYear, scenarioName, scenarioTitle, isExpanded = false) {
  const tableSection = container.append('div')
    .attr('class', 'table-section');
  
  // Get table title from first row
  const title = data[0]?.title || tableName;
  
  // Create unique ID for this table
  const tableId = `table_${tableName}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Create table element
  const table = tableSection.append('table')
    .attr('class', 'cijferbasis-table')
    .attr('id', tableId);
  
  // Create header
  const thead = table.append('thead');
  const headerRow = thead.append('tr')
    .attr('class', 'collapsible-header')
    .style('cursor', 'pointer');
  
  // Add collapse/expand indicator and title
  const titleCell = headerRow.append('th')
    .attr('class', 'table-title-header')
    .attr('colspan', isExpanded ? '1' : '6')
    .on('click', () => toggleTable(tableId));
  
  titleCell.append('span')
    .attr('class', 'collapse-indicator')
    .text(isExpanded ? '−' : '+')
    .style('margin-right', '8px')
    .style('font-weight', 'bold')
    .style('color', '#666');
  
  titleCell.append('span')
    .text(title);
  
  // Only show other column headers when expanded
  if (isExpanded) {
    headerRow.append('th')
      .attr('class', 'column-header unit-header')
      .text(`Eenheid (${currentUnit})`)
      .on('click', () => toggleTable(tableId));
    
    headerRow.append('th')
      .attr('class', 'column-header')
      .text(`NPE Cijferbasis 2023 ${currentYear}`)
      .on('click', () => toggleTable(tableId));
    
    headerRow.append('th')
      .attr('class', 'column-header')
      .text(`${scenarioTitle} ${currentYear}`)
      .on('click', () => toggleTable(tableId));
    
    headerRow.append('th')
      .attr('class', 'column-header')
      .text('Verschil')
      .on('click', () => toggleTable(tableId));
    
    headerRow.append('th')
      .attr('class', 'column-header notes-header')
      .text('Opmerkingen')
      .on('click', () => toggleTable(tableId));
  }
  
  // Group data by topcat
  const dataByTopcat = d3.group(data, d => d.topcat);
  const tbody = table.append('tbody')
    .attr('class', 'table-body')
    .style('display', isExpanded ? 'table-row-group' : 'none');
  
  let isEvenRow = false;
  
  dataByTopcat.forEach((topcatData, topcatName) => {
    if (!topcatName || topcatName === '') return;
    
    // Calculate subtotal for this topcat first
    let referenceTotal = 0;
    let scenarioTotal = 0;
    
    topcatData.forEach(row => {
      if (!row.subcat || row.subcat === '') return;
      
      const referenceValue = getValueForYearAndScenario(row, currentYear, 'reference');
      const scenarioValue = getValueForYearAndScenario(row, currentYear, scenarioName);
      
      referenceTotal += referenceValue;
      scenarioTotal += scenarioValue;
    });
    
    const subtotalDifference = scenarioTotal - referenceTotal;
    
    // Add topcat header row with subtotals
    const topcatRow = tbody.append('tr')
      .attr('class', 'topcat-row')
      .style('cursor', 'pointer')
      .on('click', function() {
        showCijferBasisTopcatGraph(topcatName, topcatData, title);
      });
    
    topcatRow.append('td')
      .text(topcatName);
    
    topcatRow.append('td')
      .attr('class', 'unit-cell')
      .text(''); // Empty unit cell for topcat row
    
    topcatRow.append('td')
      .text(formatNumber(referenceTotal));
    
    topcatRow.append('td')
      .text(formatNumber(scenarioTotal));
    
    topcatRow.append('td')
      .attr('class', subtotalDifference >= 0 ? 'positive-value' : (subtotalDifference < 0 ? 'negative-value' : 'neutral-value'))
      .text(formatNumber(subtotalDifference, true));
    
    topcatRow.append('td')
      .attr('class', 'notes-cell')
      .text(''); // Empty notes cell for topcat row
    
    // Add subcat rows
    topcatData.forEach(row => {
      if (!row.subcat || row.subcat === '') return;
      
      const referenceValue = getValueForYearAndScenario(row, currentYear, 'reference');
      const scenarioValue = getValueForYearAndScenario(row, currentYear, scenarioName);
      const difference = scenarioValue - referenceValue;
      
      const dataRow = tbody.append('tr')
        .attr('class', 'subcat-row')
        .style('cursor', 'pointer')
        .on('click', function() {
          showCijferBasisRowGraph(row, title);
        });
      
      dataRow.append('td')
        .text(row.subcat);
      
      dataRow.append('td')
        .attr('class', 'unit-cell')
        .style('font-size', '10px')
        .style('color', '#666')
        .html(createUnitLabel(row.unit));
      
      dataRow.append('td')
        .text(formatNumber(referenceValue));
      
      dataRow.append('td')
        .text(formatNumber(scenarioValue));
      
      // Calculate percentage difference
      const percentageDifference = referenceValue !== 0 ? ((difference / referenceValue) * 100) : 0;
      const differenceText = formatNumber(difference, true) + 
        (referenceValue !== 0 ? ` (${percentageDifference >= 0 ? '+' : ''}${percentageDifference.toFixed(0)}%)` : '');
      
      dataRow.append('td')
        .attr('class', difference >= 0 ? 'positive-value' : (difference < 0 ? 'negative-value' : 'neutral-value'))
        .text(differenceText);
      
      dataRow.append('td')
        .attr('class', 'notes-cell')
        .style('font-size', '10px')
        .style('color', '#666')
        .text(row.notes || '');
      
      isEvenRow = !isEvenRow;
    });
  });
}

// Helper function to get value for specific year and scenario
function getValueForYearAndScenario(row, year, scenario) {
  let columnKey;
  
  // For reference scenario, use the year directly
  if (scenario === 'reference') {
    columnKey = year;
  } else {
    // For other scenarios, construct the column key
    columnKey = `${scenario}_${year}`;
  }
  
  const value = parseFloat(row[columnKey]);
  return isNaN(value) ? 0 : value;
}

// Helper function to format numbers
function formatNumber(value, showSign = false) {
  if (value === 0) return '0';
  
  // Convert PJ to TWh if needed (1 PJ = 1/3.6 TWh)
  const convertedValue = (typeof currentUnit !== 'undefined' && currentUnit === 'TWh') ? value / 3.6 : value;
  
  // Round to whole numbers
  const roundedValue = Math.round(convertedValue);
  
  // Add thousands separator (dot)
  const formatted = Math.abs(roundedValue).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  if (showSign && roundedValue > 0) {
    return `+${formatted}`;
  } else if (showSign && roundedValue < 0) {
    return `−${formatted}`;
  }
  
  return roundedValue < 0 ? `−${formatted}` : formatted;
}

// Function to update tables when scenario/year changes
function updateCijferBasisTables() {
  drawCijferBasisTables();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  loadCijferBasisData();
});

// Function to toggle table visibility
function toggleTable(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;
  
  const tbody = table.querySelector('.table-body');
  const indicator = table.querySelector('.collapse-indicator');
  const titleCell = table.querySelector('.table-title-header');
  const headerRow = table.querySelector('.collapsible-header');
  
  if (!tbody || !indicator || !titleCell || !headerRow) return;
  
  const isCurrentlyVisible = tbody.style.display === 'table-row-group';
  
  if (isCurrentlyVisible) {
    // Collapse
    tbody.style.display = 'none';
    indicator.textContent = '+';
    titleCell.setAttribute('colspan', '6');
    
    // Remove other column headers
    const columnHeaders = table.querySelectorAll('.column-header');
    columnHeaders.forEach(header => header.remove());
    
  } else {
    // Expand
    tbody.style.display = 'table-row-group';
    indicator.textContent = '−';
    titleCell.setAttribute('colspan', '1');
    
    // Re-add other column headers
    const currentYear = globalActiveYear?.id || '2030';
    const currentScenario = globalActiveScenario?.id || 'TNO.ADAPT';
    const scenarioInfo = {
      'TNO.ADAPT': { title: 'TNO | ADAPT' },
      'TNO.TRANSFORM': { title: 'TNO | TRANSFORM' },
      'TNO.TRANSFORM.C.EN.I': { title: 'TNO | TRANSFORM | Competitief & Import' },
      'TNO.TRANSFORM.MC': { title: 'TNO | TRANSFORM | Minder Competitief' },
      'TNO.TRANSFORM.MC.EN.I': { title: 'TNO | TRANSFORM | Minder Competitief & Import' },
      'PBL.PR40': { title: 'PBL | TVKN | Pragmatisch Ruim 40' },
      'PBL.SR20': { title: 'PBL | TVKN | Specifiek Ruim 20' },
      'PBL.PB30': { title: 'PBL | TVKN | Pragmatisch Beperkt 30' },
      'PBL.WLO1': { title: 'PBL | WLO | Hoog Snel' },
      'PBL.WLO2': { title: 'PBL | WLO | Laag Snel' },
      'PBL.WLO3': { title: 'PBL | WLO | Hoog Vertraagd' },
      'PBL.WLO4': { title: 'PBL | WLO | Laag Vertraagd' },
      'NBNL.V3KM': { title: 'NBNL | II3050 v3 | Koersvaste Middenweg' },
      'NBNL.V3EM': { title: 'NBNL | II3050 v3 | Eigen Vermogen' },
      'NBNL.V3GB': { title: 'NBNL | II3050 v3 | Gezamenlijke Balans' },
      'NBNL.V3HA': { title: 'NBNL | II3050 v3 | Horizon Aanvoer' },
      'NBNL.V2NA': { title: 'NBNL | II3050 v2 | Nationale Drijfveren' },
      'NBNL.V2IA': { title: 'NBNL | II3050 v2 | Internationale Ambitie' }
    };
    const scenarioTitle = scenarioInfo[currentScenario]?.title || 'Reference';
    
    // Create column headers using D3
    const headerSelection = d3.select(headerRow);
    
    headerSelection.append('th')
      .attr('class', 'column-header unit-header')
      .text(`Eenheid (${currentUnit})`)
      .on('click', () => toggleTable(tableId));
    
    headerSelection.append('th')
      .attr('class', 'column-header')
      .text(`NPE2023 Cijferbasis${currentYear}`)
      .on('click', () => toggleTable(tableId));
    
    headerSelection.append('th')
      .attr('class', 'column-header')
      .text(`${scenarioTitle} ${currentYear}`)
      .on('click', () => toggleTable(tableId));
    
    headerSelection.append('th')
      .attr('class', 'column-header')
      .text('Verschil')
      .on('click', () => toggleTable(tableId));
    
    headerSelection.append('th')
      .attr('class', 'column-header notes-header')
      .text('Opmerkingen')
      .on('click', () => toggleTable(tableId));
  }
}

// Function to show line graph popup for a clicked row
function showCijferBasisRowGraph(rowData, tableTitle) {
  // Close any existing popup
  closeCijferBasisPopup();
  
  // Get all data for this specific subcat across all scenarios and years
  const subcatName = rowData.subcat;
  const ketenName = rowData.keten;
  const topcatName = rowData.topcat;
  
  // Find all rows with the same subcat, keten, topcat, tabel combination
  const relatedRows = cijferBasisData.filter(row => 
    row.subcat === subcatName && 
    row.keten === ketenName && 
    row.topcat === topcatName &&
    row.tabel === rowData.tabel
  );
  
  if (relatedRows.length === 0) {
    console.warn('No related data found for:', subcatName);
    return;
  }
  
  // Use the first row as representative (they should all have the same structure)
  const representativeRow = relatedRows[0];
  console.log('Representative row data:', representativeRow);
  console.log('Available keys in representative row:', Object.keys(representativeRow));
  
  // Extract all available years and scenarios from the data
  const availableYears = ['2030', '2035', '2040', '2050'];
  const scenarios = [
    { id: 'reference', name: 'reference', title: 'NPE2023 Cijferbasis' },
    { id: 'OP - CO2-opslag 40', name: 'OP - CO2-opslag 40', title: 'PBL | TVKN | Pragmatisch Ruim 40' },
    { id: 'OptimistischSelectiefFossilCarbonPenalty', name: 'OptimistischSelectiefFossilCarbonPenalty', title: 'PBL | TVKN | Specifiek Ruim 20' },
    { id: 'PP_CCS_30_in_2050', name: 'PP_CCS_30_in_2050', title: 'PBL | TVKN | Pragmatisch Beperkt 30' },
    { id: 'A_ADAPT', name: 'A_ADAPT', title: 'TNO | ADAPT' },
    { id: 'C_TRANSFORM', name: 'C_TRANSFORM', title: 'TNO | TRANSFORM' },
    { id: 'B_TRANSFORM - Competitief en import', name: 'B_TRANSFORM - Competitief en import', title: 'TNO | TRANSFORM | Competitief & Import' },
    { id: 'D_TRANSFORM - Minder competitief', name: 'D_TRANSFORM - Minder competitief', title: 'TNO | TRANSFORM | Minder Competitief' },
    { id: 'E_TRANSFORM - Minder competitief en import', name: 'E_TRANSFORM - Minder competitief en import', title: 'TNO | TRANSFORM | Minder Competitief & Import' },
    { id: 'WLO1', name: 'WLO1', title: 'PBL | WLO | Hoog Snel' },
    { id: 'WLO2', name: 'WLO2', title: 'PBL | WLO | Laag Snel' },
    { id: 'WLO3', name: 'WLO3', title: 'PBL | WLO | Hoog Vertraagd' },
    { id: 'WLO4', name: 'WLO4', title: 'PBL | WLO | Laag Vertraagd' },
    { id: 'ii3050_v3_koersvaste_middenweg', name: 'ii3050_v3_koersvaste_middenweg', title: 'NBNL | II3050 v3 | Koersvaste Middenweg' },
    { id: 'ii3050_v3_eigen_vermogen', name: 'ii3050_v3_eigen_vermogen', title: 'NBNL | II3050 v3 | Eigen Vermogen' },
    { id: 'ii3050_v3_gezamenlijke_balans', name: 'ii3050_v3_gezamenlijke_balans', title: 'NBNL | II3050 v3 | Gezamenlijke Balans' },
    { id: 'ii3050_v3_horizon_aanvoer', name: 'ii3050_v3_horizon_aanvoer', title: 'NBNL | II3050 v3 | Horizon Aanvoer' },
    { id: 'ii3050_v2_nationale_drijfveren', name: 'ii3050_v2_nationale_drijfveren', title: 'NBNL | II3050 v2 | Nationale Drijfveren' },
    { id: 'ii3050_v2_internationale_ambitie', name: 'ii3050_v2_internationale_ambitie', title: 'NBNL | II3050 v2 | Internationale Ambitie' }
  ];
  
  // Prepare data for the graph
  const graphData = {};
  scenarios.forEach(scenario => {
    graphData[scenario.id] = {};
    availableYears.forEach(year => {
      const key = scenario.id === 'reference' ? year : `${scenario.id}_${year}`;
      const value = representativeRow[key];
      // Data retrieval for popup complete
      if (value !== undefined && value !== null && value !== '') {
        const numValue = parseFloat(value) || 0;
        // Convert PJ to TWh if needed (1 PJ = 1/3.6 TWh)
        const convertedValue = (typeof currentUnit !== 'undefined' && currentUnit === 'TWh') ? numValue / 3.6 : numValue;
        graphData[scenario.id][year] = convertedValue;
      }
    });
  });
  
  // Create popup with original row data for unit recalculation
  const originalData = {
    type: 'row',
    representativeRow: representativeRow
  };
  createCijferBasisPopup(graphData, scenarios, availableYears, subcatName, ketenName, topcatName, tableTitle, originalData);
}

// Function to close the popup
function closeCijferBasisPopup() {
  d3.select('#cijferBasisPopup').remove();
  const container = d3.select('#popupContainer');
  container.on('click', null);
  container
    .style('background-color', 'rgba(0,0,0,0)')
    .style('pointer-events', 'none');
  document.body.style.overflow = 'auto';
}

// Function to create the popup structure
function createCijferBasisPopup(graphData, scenarios, availableYears, subcatName, ketenName, topcatName, tableTitle, originalData = null) {
  // Create popup container
  d3.select('#popupContainer')
    .style('background-color', 'rgba(0,0,0,0.3)')
    .style('pointer-events', 'auto')
    .on('click', closeCijferBasisPopup);

  const popup = d3.select('#popupContainer')
    .append('div')
    .attr('id', 'cijferBasisPopup')
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
    .attr('id', 'cijferBasisPopupContent')
    .style('position', 'absolute')
    .style('box-shadow', '0 4px 10px rgba(0,0,0,0.2)')
    .style('border-radius', '10px')
    .style('width', '1100px')
    .style('height', '750px')
    .style('background-color', '#f9f9f9');

  const svg = popup.append('svg')
    .style('position', 'absolute')
    .style('width', '100%')
    .style('height', '100%')
    .attr('id', 'cijferBasisSVG');

  const canvas = svg.append('g');

  // Add header
  canvas.append('text')
    .attr('x', 100)
    .attr('y', 40)
    .style('font-size', '16px')
    .style('font-weight', '600')
    .text(`${subcatName} - ${tableTitle}`);

  canvas.append('text')
    .attr('x', 100)
    .attr('y', 65)
    .style('font-size', '12px')
    .style('fill', '#666')
    .text(`Keten: ${ketenName} | Categorie: ${topcatName}`);

  // Add close button
  const CLOSE_SIZE = 30;
  const CLOSE_X = 1100 - 50;
  const CLOSE_Y = 30;

  const closeGroup = canvas.append('g')
    .attr('class', 'close-btn')
    .attr('transform', `translate(${CLOSE_X}, ${CLOSE_Y})`)
    .style('cursor', 'pointer')
    .on('click', closeCijferBasisPopup);

  closeGroup.append('rect')
    .attr('width', CLOSE_SIZE)
    .attr('height', CLOSE_SIZE)
    .attr('rx', 4)
    .attr('fill', '#fff')
    .on('mouseover', function () { d3.select(this).attr('fill', '#999'); })
    .on('mouseout', function () { d3.select(this).attr('fill', '#fff'); });

  const ICON_PATH = 'm249 849-42-42 231-231-231-231 42-42 231 231 231-231 42 42-231 231 231 231-42 42-231-231-231 231Z';
  closeGroup.append('path')
    .attr('d', ICON_PATH)
    .attr('transform', 'translate(15,15) scale(0.03125) translate(-480,-480)')
    .attr('fill', '#666')
    .style('pointer-events', 'none');

  // Add unit toggle in top right (left of close button)
  const TOGGLE_X = CLOSE_X - 145; // Position left of close button (adjusted for wider label spacing)
  const TOGGLE_Y = CLOSE_Y + 5;   // Align with close button
  
  const popupToggleGroup = canvas.append('g')
    .attr('class', 'popup-unit-toggle')
    .attr('transform', `translate(${TOGGLE_X}, ${TOGGLE_Y})`);
  
  // Toggle background
  popupToggleGroup.append('rect')
    .attr('id', 'popupUnitToggleBg')
    .attr('x', 25)
    .attr('y', 0)
    .attr('width', 50)
    .attr('height', 25)
    .attr('fill', '#FFF')
    .attr('rx', 12.5)
    .attr('ry', 12.5)
    .style('stroke', '#333')
    .style('stroke-width', 0.5)
    .style('pointer-events', 'auto')
    .style('cursor', 'pointer')
    .on('click', function () {
      // Toggle unit (same logic as other toggles)
      if (currentUnit == 'PJ') {
        currentUnit = 'TWh';
      } else {
        currentUnit = 'PJ';
      }
      
      // Update all toggle positions (including other sections)
      d3.selectAll('#selectorStatus')
        .transition()
        .duration(200)
        .attr('cx', function () {if (currentUnit == 'PJ') { return 63} else return 87});
      
      // Update popup toggle position
      d3.select('#popupUnitToggleStatus')
        .transition()
        .duration(200)
        .attr('cx', currentUnit == 'PJ' ? 38 : 62);
      
      // Recalculate graph data with new unit and redraw
      canvas.selectAll('.line-graph-content').remove(); // Remove existing graph content
      
      // Recalculate graphData with current unit
      const recalculatedGraphData = {};
      if (originalData && originalData.type === 'row') {
        // For row data
        scenarios.forEach(scenario => {
          recalculatedGraphData[scenario.id] = {};
          availableYears.forEach(year => {
            const key = scenario.id === 'reference' ? year : `${scenario.id}_${year}`;
            const value = originalData.representativeRow[key];
            if (value !== undefined && value !== null && value !== '') {
              const numValue = parseFloat(value) || 0;
              const convertedValue = (typeof currentUnit !== 'undefined' && currentUnit === 'TWh') ? numValue / 3.6 : numValue;
              recalculatedGraphData[scenario.id][year] = convertedValue;
            }
          });
        });
      } else if (originalData && originalData.type === 'topcat') {
        // For topcat data
        scenarios.forEach(scenario => {
          recalculatedGraphData[scenario.id] = {};
          availableYears.forEach(year => {
            let totalValue = 0;
            originalData.topcatData.forEach(row => {
              if (!row.subcat || row.subcat === '') return;
              const key = scenario.id === 'reference' ? year : `${scenario.id}_${year}`;
              const value = row[key];
              if (value !== undefined && value !== null && value !== '') {
                totalValue += parseFloat(value) || 0;
              }
            });
            const convertedValue = (typeof currentUnit !== 'undefined' && currentUnit === 'TWh') ? totalValue / 3.6 : totalValue;
            recalculatedGraphData[scenario.id][year] = convertedValue;
          });
        });
      } else {
        // Fallback: use existing graphData (shouldn't happen with proper originalData)
        recalculatedGraphData = graphData;
      }
      
      drawCijferBasisLineGraph(canvas, recalculatedGraphData, scenarios, availableYears);
      
      // Update cijferbasis tables if they exist
      if (typeof updateCijferBasisTables === 'function') {
        updateCijferBasisTables();
      }
    });
  
  // Toggle circle indicator
  popupToggleGroup.append('circle')
    .attr('id', 'popupUnitToggleStatus')
    .style('pointer-events', 'none')
    .attr('cx', (typeof currentUnit !== 'undefined' && currentUnit === 'TWh') ? 62 : 38)
    .attr('cy', 12.5)
    .attr('r', 10)
    .attr('fill', '#444');
  
  // PJ label (left of toggle with spacing)
  popupToggleGroup.append('text')
    .attr('x', 12)
    .attr('y', 18)
    .attr('fill', '#444')
    .style('font-size', '12px')
    .style('font-weight', 400)
    .style('text-anchor', 'middle')
    .text('PJ');
  
  // TWh label (right of toggle with more spacing)
  popupToggleGroup.append('text')
    .attr('x', 92)
    .attr('y', 18)
    .attr('fill', '#444')
    .style('font-size', '12px')
    .style('font-weight', 400)
    .style('text-anchor', 'middle')
    .text('TWh');

  // Draw the line graph
  drawCijferBasisLineGraph(canvas, graphData, scenarios, availableYears);
}

// Global variable to track visible scenarios in the popup
let globalVisibleCijferBasisScenarios = null;

// Function to draw the line graph
function drawCijferBasisLineGraph(canvas, graphData, scenarios, availableYears) {
  // Initialize visible scenarios if not set
  if (globalVisibleCijferBasisScenarios === null) {
    globalVisibleCijferBasisScenarios = new Set(scenarios.map(s => s.id));
  }

  // Create a group for all graph content that can be removed/redrawn
  const graphGroup = canvas.append('g').attr('class', 'line-graph-content');

  // Graph dimensions and positioning
  const graphWidth = 900;
  const graphHeight = 280;
  const shiftX = 100;
  const graphTop = 110;
  const graphBottom = graphTop + graphHeight;

  // Define colors for each scenario based on drawLineGraphFlowClick.js categories
  const scenarioColors = {};
  
  // Reference scenario - black and thick
  scenarioColors['reference'] = '#000000';
  
  // ADAPT/TRANSFORM category - blue base color
  const adaptTransformColor = '#1f78b4';
  const adaptTransformScale = d3.scaleLinear()
    .domain([0, 4])
    .range([d3.color(adaptTransformColor).brighter(1.5), d3.color(adaptTransformColor).darker(1.5)]);
  scenarioColors['A_ADAPT'] = adaptTransformScale(0);
  scenarioColors['C_TRANSFORM'] = adaptTransformScale(1);
  scenarioColors['B_TRANSFORM - Competitief en import'] = adaptTransformScale(2);
  scenarioColors['D_TRANSFORM - Minder competitief'] = adaptTransformScale(4);
  scenarioColors['E_TRANSFORM - Minder competitief en import'] = adaptTransformScale(3);
  
  // TVKN category - green base color
  const tvknColor = '#33a02c';
  const tvknScale = d3.scaleLinear()
    .domain([0, 2])
    .range([d3.color(tvknColor).brighter(1.5), d3.color(tvknColor).darker(1.5)]);
  scenarioColors['OP - CO2-opslag 40'] = tvknScale(0);
  scenarioColors['OptimistischSelectiefFossilCarbonPenalty'] = tvknScale(1);
  scenarioColors['PP_CCS_30_in_2050'] = tvknScale(2);
  
  // NBNL category - orange base color
  const nbnlColor = '#ff7f00';
  const nbnlScale = d3.scaleLinear()
    .domain([0, 5])
    .range([d3.color(nbnlColor).brighter(1.5), d3.color(nbnlColor).darker(1.5)]);
  scenarioColors['ii3050_v3_koersvaste_middenweg'] = nbnlScale(0);
  scenarioColors['ii3050_v3_eigen_vermogen'] = nbnlScale(1);
  scenarioColors['ii3050_v3_gezamenlijke_balans'] = nbnlScale(2);
  scenarioColors['ii3050_v3_horizon_aanvoer'] = nbnlScale(3);
  scenarioColors['ii3050_v2_nationale_drijfveren'] = nbnlScale(4);
  scenarioColors['ii3050_v2_internationale_ambitie'] = nbnlScale(5);
  
  // WLO category - red base color
  const wloColor = '#e31a1c';
  const wloScale = d3.scaleLinear()
    .domain([0, 3])
    .range([d3.color(wloColor).brighter(1.5), d3.color(wloColor).darker(1.5)]);
  scenarioColors['WLO1'] = wloScale(0);
  scenarioColors['WLO2'] = wloScale(1);
  scenarioColors['WLO3'] = wloScale(2);
  scenarioColors['WLO4'] = wloScale(3);

  // Define symbols for each scenario
  const symbols = [d3.symbolCircle, d3.symbolSquare, d3.symbolDiamond, d3.symbolTriangle];
  const scenarioSymbols = {};
  scenarios.forEach((scenario, i) => {
    scenarioSymbols[scenario.id] = symbols[i % symbols.length];
  });

  // Create scales
  const x = d3.scalePoint()
    .domain(availableYears)
    .range([shiftX, shiftX + graphWidth]);

  // Calculate max value for y-scale
  const allValues = [];
  scenarios.forEach(scenario => {
    availableYears.forEach(year => {
      const value = graphData[scenario.id][year];
      if (value !== undefined && !isNaN(value)) {
        allValues.push(value);
      }
    });
  });
  const maxValue = d3.max(allValues) || 100;

  const y = d3.scaleLinear()
    .domain([0, maxValue])
    .range([graphBottom, graphTop]);

  // Line generator
  const line = d3.line()
    .x(d => x(d.year))
    .y(d => y(d.value))
    .defined(d => !isNaN(d.value));

  // Add shadow filter
  const defs = canvas.select('svg').append('defs');
  const filter = defs.append('filter')
    .attr('id', 'cijfer-tooltip-shadow')
    .attr('x', '-50%').attr('y', '-50%')
    .attr('width', '200%').attr('height', '200%');
  filter.append('feGaussianBlur')
    .attr('in', 'SourceAlpha').attr('stdDeviation', 2).attr('result', 'blur');
  filter.append('feOffset')
    .attr('in', 'blur').attr('dx', 0).attr('dy', 1).attr('result', 'offsetBlur');
  const feMerge = filter.append('feMerge');
  feMerge.append('feMergeNode').attr('in', 'offsetBlur');
  feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

  // Create tooltip
  const tooltip = graphGroup.append('g')
    .attr('class', 'cijfer-chart-tooltip')
    .style('display', 'none')
    .attr('filter', 'url(#cijfer-tooltip-shadow)');

  tooltip.append('rect')
    .attr('rx', 5).attr('ry', 5)
    .attr('fill', '#f9f9f9')
    .attr('stroke', '#ccc');

  tooltip.append('path')
    .attr('class', 'tooltip-pointer');

  tooltip.append('text')
    .attr('fill', '#333')
    .style('font-size', '12px')
    .attr('text-anchor', 'middle');

  // Function to update the graph
  function updateCijferBasisGraph() {
    // Clear existing elements
    canvas.selectAll('.cijfer-scenario-line').remove();
    canvas.selectAll('.cijfer-scenario-dot').remove();

    // Draw lines and dots for each visible scenario
    scenarios.forEach(scenario => {
      if (!globalVisibleCijferBasisScenarios.has(scenario.id)) {
        return;
      }

      const scenarioData = availableYears.map(year => {
        const value = graphData[scenario.id][year];
        return {
          year: year,
          value: value !== undefined && !isNaN(value) ? value : null
        };
      }).filter(d => d.value !== null);

      if (scenarioData.length === 0) return;

      const color = scenarioColors[scenario.id];

      // Draw line
      graphGroup.append('path')
        .datum(scenarioData)
        .attr('class', 'cijfer-scenario-line')
        .attr('fill', 'none')
        .attr('stroke', color)
        .style('stroke-dasharray', scenario.id === 'reference' ? '4,4' : '0')
        .attr('stroke-width', scenario.id === 'reference' ? 4 : 1)
        .attr('d', line);

      // Draw dots
      const symbolGenerator = d3.symbol().type(scenarioSymbols[scenario.id]).size(64);
      scenarioData.forEach(d => {
        graphGroup.append('path')
          .attr('d', symbolGenerator())
          .attr('class', 'cijfer-scenario-dot')
          .attr('transform', `translate(${x(d.year)}, ${y(d.value)})`)
          .attr('fill', color)
          .style('cursor', 'pointer')
          .on('mouseover', function(event) {
            tooltip.raise().style('display', 'block');

            const valueText = `${d.year}: ${d3.format('.2f')(d.value)}`;
            const textEl = tooltip.select('text');

            textEl.selectAll('tspan').remove();

            textEl.append('tspan')
              .attr('x', 0)
              .attr('dy', '1.2em')
              .style('font-weight', 'bold')
              .text(scenario.title);

            textEl.append('tspan')
              .attr('x', 0)
              .attr('dy', '1.4em')
              .text(valueText);

            const padding = 10;
            const textBBox = textEl.node().getBBox();
            const tooltipWidth = textBBox.width + padding * 2;
            const tooltipHeight = textBBox.height + padding * 2;

            tooltip.select('rect')
              .attr('x', 0)
              .attr('y', 0)
              .attr('width', tooltipWidth)
              .attr('height', tooltipHeight);

            textEl.attr('transform', `translate(${tooltipWidth / 2}, ${padding - textBBox.y})`);

            const pointerSize = 8;
            const xPos = x(d.year);
            const yPos = y(d.value);

            let tooltipX = xPos - (tooltipWidth / 2);
            let tooltipY = yPos - tooltipHeight - pointerSize - 5;

            // Adjust position if tooltip goes outside bounds
            if (tooltipY < graphTop) {
              tooltipY = yPos + pointerSize + 10;
            }
            if (tooltipX < shiftX) {
              tooltipX = shiftX;
            }
            if (tooltipX + tooltipWidth > shiftX + graphWidth) {
              tooltipX = shiftX + graphWidth - tooltipWidth;
            }

            const pointerX = xPos - tooltipX;
            let pointerPath;
            if (tooltipY > yPos) {
              pointerPath = `M${pointerX - pointerSize},0 L${pointerX},-${pointerSize} L${pointerX + pointerSize},0 Z`;
            } else {
              pointerPath = `M${pointerX - pointerSize},${tooltipHeight} L${pointerX},${tooltipHeight + pointerSize} L${pointerX + pointerSize},${tooltipHeight} Z`;
            }

            tooltip.select('.tooltip-pointer')
              .attr('d', pointerPath)
              .attr('fill', '#f9f9f9');

            tooltip.attr('transform', `translate(${tooltipX}, ${tooltipY})`);
          })
          .on('mouseout', function() {
            tooltip.style('display', 'none');
          });
      });
    });
  }

  // Add axes
  graphGroup.append('g')
    .attr('transform', `translate(0, ${graphBottom})`)
    .call(d3.axisBottom(x).tickFormat(d3.format('d')).tickSize(0).tickPadding(10))
    .style('font-size', '13px')
    .select('.domain').remove();

  graphGroup.append('g')
    .attr('transform', `translate(${shiftX}, 0)`)
    .call(d3.axisLeft(y).ticks(10).tickSize(0).tickPadding(10))
    .style('font-size', '13px')
    .select('.domain').remove();

  // Add Y-axis title
  const unit = (typeof currentUnit !== 'undefined' && currentUnit === 'TWh') ? 'TWh' : 'PJ';
  graphGroup.append('text')
    .attr('transform', `translate(${shiftX - 60}, ${(graphBottom + graphTop) / 2}) rotate(-90)`)
    .style('text-anchor', 'middle')
    .style('font-size', '13px')
    .text(`Waarde (${unit})`);

  // Add background bands
  const yTicks = y.ticks(10);
  const bandGroup = graphGroup.append('g').attr('class', 'grid-bands');
  bandGroup.selectAll('rect')
    .data(d3.range(0, yTicks.length - 1, 2))
    .enter()
    .append('rect')
    .attr('x', shiftX)
    .attr('y', i => y(yTicks[i + 1]))
    .attr('width', graphWidth)
    .attr('height', i => y(yTicks[i]) - y(yTicks[i + 1]))
    .style('fill', '#f0f0f0');

  // Add vertical gridlines
  const verticalGrid = graphGroup.append('g')
    .attr('class', 'grid')
    .attr('transform', `translate(0, ${graphBottom})`)
    .call(d3.axisBottom(x).tickSize(-graphHeight).tickFormat(''));
  verticalGrid.selectAll('line')
    .style('stroke', '#cccccc')
    .style('stroke-dasharray', '2 2');
  verticalGrid.lower();
  bandGroup.lower();

  // Add legend with checkboxes
  drawCijferBasisLegend(graphGroup, scenarios, scenarioColors, scenarioSymbols, updateCijferBasisGraph, graphBottom);

  // Initial graph draw
  updateCijferBasisGraph();
}

// Function to draw the legend with checkboxes
function drawCijferBasisLegend(graphGroup, scenarios, scenarioColors, scenarioSymbols, updateGraphFunction, graphBottom) {
  const legend = graphGroup.append('g')
    .attr('transform', `translate(100, ${graphBottom + 50})`);

  // legend.append('text')
  //   .attr('x', 0)
  //   .attr('y', -20)
  //   .style('font-size', '14px')
  //   .style('font-weight', 'bold')
  //   .text('Scenarios');

  // Function to update legend appearance
  function updateLegendAppearance() {
    legend.selectAll('.cijfer-legend-item')
      .each(function(d) {
        const item = d3.select(this);
        const isVisible = globalVisibleCijferBasisScenarios.has(d.id);
        item.select('.cijfer-checkmark-box')
          .attr('fill', isVisible ? scenarioColors[d.id] : '#fff');
        item.select('.cijfer-checkmark')
          .style('display', isVisible ? 'inline' : 'none');
        item.style('opacity', isVisible ? 1 : 0.6);
      });
  }

  // Calculate layout
  const itemsPerColumn = Math.ceil(scenarios.length / 2);
  const columnWidth = 400;
  const itemHeight = 25;

  // Add legend items
  const legendItems = legend.selectAll('.cijfer-legend-item')
    .data(scenarios)
    .enter()
    .append('g')
    .attr('class', 'cijfer-legend-item')
    .attr('transform', (d, i) => {
      const col = Math.floor(i / itemsPerColumn);
      const row = i % itemsPerColumn;
      return `translate(${col * columnWidth}, ${row * itemHeight})`;
    })
    .style('cursor', 'pointer')
    .on('click', function(event, d) {
      if (globalVisibleCijferBasisScenarios.has(d.id)) {
        globalVisibleCijferBasisScenarios.delete(d.id);
      } else {
        globalVisibleCijferBasisScenarios.add(d.id);
      }
      updateGraphFunction();
      updateLegendAppearance();
    });

  // Add checkbox
  legendItems.append('rect')
    .attr('class', 'cijfer-checkmark-box')
    .attr('width', 14)
    .attr('height', 14)
    .attr('rx', 3)
    .attr('ry', 3)
    .attr('fill', '#fff')
    .attr('stroke', d => scenarioColors[d.id])
    .attr('stroke-width', 1.5);

  // Add checkmark
  legendItems.append('text')
    .attr('class', 'cijfer-checkmark')
    .attr('x', 2)
    .attr('y', 11)
    .style('font-size', '12px')
    .style('user-select', 'none')
    .style('fill', '#fff')
    .style('pointer-events', 'none')
    .text('✔');

  // Add symbol
  legendItems.append('path')
    .attr('d', d => d3.symbol().type(scenarioSymbols[d.id]).size(64)())
    .attr('transform', 'translate(28, 7)')
    .attr('fill', d => scenarioColors[d.id])
    .style('pointer-events', 'none');

  // Add text label
  legendItems.append('text')
    .attr('x', 45)
    .attr('y', 12)
    .style('font-size', '11px')
    .text(d => d.title)
    .style('pointer-events', 'none');

  // Initial legend update
  updateLegendAppearance();
}

// Function to show line graph popup for a clicked topcat row (subtotal row)
function showCijferBasisTopcatGraph(topcatName, topcatData, tableTitle) {
  // Close any existing popup
  closeCijferBasisPopup();
  
  // Get the keten name from the first row in topcatData
  const ketenName = topcatData.length > 0 ? topcatData[0].keten : '';
  
  // Extract all available years and scenarios from the data
  const availableYears = ['2030', '2035', '2040', '2050'];
  const scenarios = [
    { id: 'reference', name: 'reference', title: 'Cijferbasis NPE2023' },
    { id: 'OP - CO2-opslag 40', name: 'OP - CO2-opslag 40', title: 'PBL | TVKN | Pragmatisch Ruim 40' },
    { id: 'OptimistischSelectiefFossilCarbonPenalty', name: 'OptimistischSelectiefFossilCarbonPenalty', title: 'PBL | TVKN | Specifiek Ruim 20' },
    { id: 'PP_CCS_30_in_2050', name: 'PP_CCS_30_in_2050', title: 'PBL | TVKN | Pragmatisch Beperkt 30' },
    { id: 'A_ADAPT', name: 'A_ADAPT', title: 'TNO | ADAPT' },
    { id: 'C_TRANSFORM', name: 'C_TRANSFORM', title: 'TNO | TRANSFORM' },
    { id: 'B_TRANSFORM - Competitief en import', name: 'B_TRANSFORM - Competitief en import', title: 'TNO | TRANSFORM | Competitief & Import' },
    { id: 'D_TRANSFORM - Minder competitief', name: 'D_TRANSFORM - Minder competitief', title: 'TNO | TRANSFORM | Minder Competitief' },
    { id: 'E_TRANSFORM - Minder competitief en import', name: 'E_TRANSFORM - Minder competitief en import', title: 'TNO | TRANSFORM | Minder Competitief & Import' },
    { id: 'WLO1', name: 'WLO1', title: 'PBL | WLO | Hoog Snel' },
    { id: 'WLO2', name: 'WLO2', title: 'PBL | WLO | Laag Snel' },
    { id: 'WLO3', name: 'WLO3', title: 'PBL | WLO | Hoog Vertraagd' },
    { id: 'WLO4', name: 'WLO4', title: 'PBL | WLO | Laag Vertraagd' },
    { id: 'ii3050_v3_koersvaste_middenweg', name: 'ii3050_v3_koersvaste_middenweg', title: 'NBNL | II3050 v3 | Koersvaste Middenweg' },
    { id: 'ii3050_v3_eigen_vermogen', name: 'ii3050_v3_eigen_vermogen', title: 'NBNL | II3050 v3 | Eigen Vermogen' },
    { id: 'ii3050_v3_gezamenlijke_balans', name: 'ii3050_v3_gezamenlijke_balans', title: 'NBNL | II3050 v3 | Gezamenlijke Balans' },
    { id: 'ii3050_v3_horizon_aanvoer', name: 'ii3050_v3_horizon_aanvoer', title: 'NBNL | II3050 v3 | Horizon Aanvoer' },
    { id: 'ii3050_v2_nationale_drijfveren', name: 'ii3050_v2_nationale_drijfveren', title: 'NBNL | II3050 v2 | Nationale Drijfveren' },
    { id: 'ii3050_v2_internationale_ambitie', name: 'ii3050_v2_internationale_ambitie', title: 'NBNL | II3050 v2 | Internationale Ambitie' }
  ];
  
  // Aggregate data across all subcats for this topcat
  const graphData = {};
  scenarios.forEach(scenario => {
    graphData[scenario.id] = {};
    availableYears.forEach(year => {
      let totalValue = 0;
      
      // Sum up all subcat values for this scenario and year
      topcatData.forEach(row => {
        if (!row.subcat || row.subcat === '') return; // Skip empty subcats
        
        const key = scenario.id === 'reference' ? year : `${scenario.id}_${year}`;
        const value = row[key];
        if (value !== undefined && value !== null && value !== '') {
          totalValue += parseFloat(value) || 0;
        }
      });
      
      // Convert PJ to TWh if needed (1 PJ = 1/3.6 TWh)
      const convertedValue = (typeof currentUnit !== 'undefined' && currentUnit === 'TWh') ? totalValue / 3.6 : totalValue;
      graphData[scenario.id][year] = convertedValue;
    });
  });
  
  // Create popup with aggregated data and original topcat data for unit recalculation
  const originalData = {
    type: 'topcat',
    topcatData: topcatData
  };
  createCijferBasisPopup(graphData, scenarios, availableYears, topcatName, ketenName, 'Subtotaal', tableTitle, originalData);
}

// Load data on page initialization
if (typeof loadCijferBasisData === 'function') {
  loadCijferBasisData();
}

// Function to draw unit toggle button
function drawCijferBasisUnitToggle() {
  // Check if toggle already exists
  if (d3.select('#cijferbasisUnitToggleDiv').node()) {
    return; // Already exists, don't create again
  }
  
  // Create toggle container
  const container = d3.select('#cijferbasis_container');
  const toggleDiv = container.insert('div', ':first-child')
    .attr('id', 'cijferbasisUnitToggleDiv')
    .style('width', '200px')
    .style('height', '35px')
    .style('position', 'relative')
    .style('margin-bottom', '20px')
    .style('float', 'right');
  
  const toggleSvg = toggleDiv.append('svg')
    .attr('width', 200)
    .attr('height', 35)
    .attr('id', 'cijferbasisUnitToggleSVG');
  
  const toggleGroup = toggleSvg.append('g');
  
  // Toggle background
  toggleGroup.append('rect')
    .attr('id', 'cijferbasisUnitToggleBg')
    .attr('x', 50)
    .attr('y', 0)
    .attr('width', 50)
    .attr('height', 25)
    .attr('fill', '#FFF')
    .attr('rx', 12.5)
    .attr('ry', 12.5)
    .style('stroke', '#333')
    .style('stroke-width', 0.5)
    .style('pointer-events', 'auto')
    .on('click', function () {
      // Toggle unit (same logic as other toggles)
      if (currentUnit == 'PJ') {
        currentUnit = 'TWh';
      } else {
        currentUnit = 'PJ';
      }
      
      // Update all toggle positions (including other sections)
      d3.selectAll('#selectorStatus')
        .transition()
        .duration(200)
        .attr('cx', function () {if (currentUnit == 'PJ') { return 63} else return 87});
      
      // Refresh tables with new unit
      if (tablesExist()) {
        const currentYear = globalActiveYear?.id || '2030';
        const currentScenario = globalActiveScenario?.id || 'TNO.ADAPT';
        const scenarioInfo = {
          'TNO.ADAPT': { csvName: 'A_ADAPT', title: 'TNO | ADAPT' },
          'TNO.TRANSFORM': { csvName: 'C_TRANSFORM', title: 'TNO | TRANSFORM' },
          'TNO.TRANSFORM.C.EN.I': { csvName: 'B_TRANSFORM - Competitief en import', title: 'TNO | TRANSFORM | Competitief & Import' },
          'TNO.TRANSFORM.MC': { csvName: 'D_TRANSFORM - Minder competitief', title: 'TNO | TRANSFORM | Minder Competitief' },
          'TNO.TRANSFORM.MC.EN.I': { csvName: 'E_TRANSFORM - Minder competitief en import', title: 'TNO | TRANSFORM | Minder Competitief & Import' },
          'PBL.PR40': { csvName: 'OP - CO2-opslag 40', title: 'PBL | TVKN | Pragmatisch Ruim 40' },
          'PBL.SR20': { csvName: 'OptimistischSelectiefFossilCarbonPenalty', title: 'PBL | TVKN | Specifiek Ruim 20' },
          'PBL.PB30': { csvName: 'PP_CCS_30_in_2050', title: 'PBL | TVKN | Pragmatisch Beperkt 30' },
          'PBL.WLO1': { csvName: 'WLO1', title: 'PBL | WLO | Hoog Snel' },
          'PBL.WLO2': { csvName: 'WLO2', title: 'PBL | WLO | Laag Snel' },
          'PBL.WLO3': { csvName: 'WLO3', title: 'PBL | WLO | Hoog Vertraagd' },
          'PBL.WLO4': { csvName: 'WLO4', title: 'PBL | WLO | Laag Vertraagd' },
          'NBNL.V3KM': { csvName: 'ii3050_v3_koersvaste_middenweg', title: 'NBNL | II3050 v3 | Koersvaste Middenweg' },
          'NBNL.V3EM': { csvName: 'ii3050_v3_eigen_vermogen', title: 'NBNL | II3050 v3 | Eigen Vermogen' },
          'NBNL.V3GB': { csvName: 'ii3050_v3_gezamenlijke_balans', title: 'NBNL | II3050 v3 | Gezamenlijke Balans' },
          'NBNL.V3HA': { csvName: 'ii3050_v3_horizon_aanvoer', title: 'NBNL | II3050 v3 | Horizon Aanvoer' },
          'NBNL.V2NA': { csvName: 'ii3050_v2_nationale_drijfveren', title: 'NBNL | II3050 v2 | Nationale Drijfveren' },
          'NBNL.V2IA': { csvName: 'ii3050_v2_internationale_ambitie', title: 'NBNL | II3050 v2 | Internationale Ambitie' }
        };
        const currentScenarioInfo = scenarioInfo[currentScenario] || { csvName: 'reference', title: 'Reference' };
        updateExistingTables(currentYear, currentScenarioInfo.csvName, currentScenarioInfo.title);
      } else {
        drawCijferBasisTables();
      }
      
      // Update any open popups
      if (document.querySelector('.cijferbasis-popup-overlay')) {
        // Close and reopen popup with new unit
        closeCijferBasisPopup();
      }
    });
  
  // Toggle circle indicator  
  toggleGroup.append('circle')
    .attr('id', 'selectorStatus')
    .style('pointer-events', 'none')
    .attr('cx', (typeof currentUnit !== 'undefined' && currentUnit === 'TWh') ? 87 : 63)
    .attr('cy', 12.5)
    .attr('r', 10)
    .attr('fill', '#444');
  
  // PJ label
  toggleGroup.append('text')
    .attr('x', 12.5 + 7)
    .attr('y', 12.5 + 6)
    .attr('fill', '#444')
    .style('font-size', '15px')
    .style('font-weight', 400)
    .text('PJ');
  
  // TWh label
  toggleGroup.append('text')
    .attr('x', 12.5 + 100 + 14 - 13)
    .attr('y', 12.5 + 6)
    .attr('fill', '#444')
    .style('font-size', '15px')
    .style('font-weight', 400)
    .text('TWh');
}

// Function to set ZIP file data (called from loadData.js)
function setCijferBasisZipData(zipData) {
  zipFileData = zipData;
  // Reload cijferbasis data with new ZIP data
  loadCijferBasisData();
}

// Export functions for external use
if (typeof window !== 'undefined') {
  window.updateCijferBasisTables = updateCijferBasisTables;
  window.drawCijferBasisTables = drawCijferBasisTables;
  window.toggleTable = toggleTable;
  window.reloadCijferBasisData = loadCijferBasisData; // For debugging
  window.setCijferBasisZipData = setCijferBasisZipData; // For ZIP file loading
}