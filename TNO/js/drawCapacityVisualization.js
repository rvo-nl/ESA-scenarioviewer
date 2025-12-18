// Global state for capacity data
let capacityData = null;
let processedCapacityData = null;
let capacityEnergyUnit = 'PJ'; // Default to PJ, can be switched to TWh

// Lookup table for nicer category display names with optional footnotes
// Will be loaded from config/categoryConfig.json
// Format: { 'category_key': { name: 'Display Name', footnote: 'Optional footnote text' } }
// Or simple string format: { 'category_key': 'Display Name' } for backward compatibility
let categoryDisplayNames = {};
let capacityMappings = {};

// Function to receive categoryConfig from ZIP file (called by loadData.js)
window.setCategoryConfigFromZip = function(config) {
  if (config) {
    categoryDisplayNames = config.categoryDisplayNames || {};
    capacityMappings = config.capacityMappings || {};
    console.log('Category configuration loaded from ZIP successfully');
    populateMappingContainers();
  }
};

// Load configuration from JSON file (for URL mode)
async function loadCategoryConfig() {
  try {
    const response = await fetch('private/categoryConfig.json');
    const config = await response.json();
    categoryDisplayNames = config.categoryDisplayNames || {};
    capacityMappings = config.capacityMappings || {};
    console.log('Category configuration loaded successfully from URL');

    // Populate mapping containers if they exist
    populateMappingContainers();
  } catch (error) {
    console.error('Error loading category configuration:', error);
    // Fallback to empty objects if loading fails
    categoryDisplayNames = {};
    capacityMappings = {};
  }
}

// Populate the mapping containers in the HTML
function populateMappingContainers() {
  // Populate OPERA mappings
  const operaContainer = document.getElementById('operaMappingContainer');
  if (operaContainer && capacityMappings.OPERA) {
    let html = '';
    Object.keys(capacityMappings.OPERA).forEach(categoryKey => {
      const displayName = getCategoryDisplayName(categoryKey);
      const mapping = capacityMappings.OPERA[categoryKey];
      html += `
        <div style="margin-bottom: 15px;">
          <strong>${categoryKey} (${displayName})</strong><br>
          <span>${mapping}</span>
        </div>
      `;
    });
    operaContainer.innerHTML = html;
  }

  // Populate ETM mappings
  const etmContainer = document.getElementById('etmMappingContainer');
  if (etmContainer && capacityMappings.ETM) {
    let html = '';
    Object.keys(capacityMappings.ETM).forEach(categoryKey => {
      const displayName = getCategoryDisplayName(categoryKey);
      const mapping = capacityMappings.ETM[categoryKey];
      html += `
        <div style="margin-bottom: 15px;">
          <strong>${categoryKey} (${displayName})</strong><br>
          <span>${mapping}</span>
        </div>
      `;
    });
    // Preserve the note at the end
    html += `<p style="font-style: italic; color: #666; margin-top: 20px;">Note: Many ETM technologies are mapped to "ignore" and are not shown here</p>`;
    etmContainer.innerHTML = html;
  }
}

// Initialize config on page load (only in URL mode)
// In file mode, config will be loaded from ZIP via setCategoryConfigFromZip()
if (typeof dataSource === 'undefined' || dataSource === 'url') {
  console.log('Loading category config from URL (dataSource:', typeof dataSource !== 'undefined' ? dataSource : 'undefined', ')');
  loadCategoryConfig();
} else {
  console.log('Skipping category config URL load - in file mode (dataSource:', dataSource, ')');
}

// Category groupings for the 4 charts
const categoryGroups = {
  'Koolstof': [
    'electricity_biomass',
    'electricity_coal',
    'electricity_gaspowerfuelmix',
    'electricity_methane',
    'electricity_oilproducts',
    'electricity_waste'
  ],
  'Koolstof met CCS': [
    'electricity_biomass_ccs',
    'electricity_coal_ccs',
    'electricity_methane_ccs',
    'electricity_waste_ccs'
  ],
  'Hernieuwbaar': [
    'electricity_hydro',
    'electricity_pv_buildings',
    'electricity_pv_central_land',
    'electricity_pv_central_offshore',
    'electricity_pv_households',
    'electricity_solar_csp',
    'electricity_wind_land',
    'electricity_wind_offshore'
  ],
  'Overige': [
    'electricity_nuclear',
    'electricity_hydrogen',
    'electricity_storage'
  ]
};

// Function to set CSV data from loadData.js
window.setCapacityZipData = function(csvData) {
  console.log('setCapacityZipData called', csvData);
  if (csvData['processed_capacities']) {
    console.log('Processing capacity data...');
    capacityData = parseCapacityCSV(csvData['processed_capacities']);
    console.log('Parsed capacity data:', capacityData);
    processedCapacityData = processCapacityDataByGroups(capacityData);
    console.log('Processed capacity data:', processedCapacityData);
  } else {
    console.warn('No processed_capacities found in csvData');
  }
};

// Load CSV files directly from the private folder
async function loadCapacityCSVFiles() {
  try {
    console.log('Loading capacity CSV files from private folder...');

    const capacityResponse = await fetch('private/processed_capacities.csv');
    if (!capacityResponse.ok) {
      throw new Error(`Failed to load processed_capacities.csv: ${capacityResponse.status}`);
    }
    const capacityText = await capacityResponse.text();

    console.log('CSV file loaded, parsing...');
    capacityData = parseCapacityCSV(capacityText);
    console.log('Parsed capacity data:', capacityData);

    processedCapacityData = processCapacityDataByGroups(capacityData);
    console.log('Processed capacity data:', processedCapacityData);

    // Draw the visualization
    drawCapacityVisualization();

  } catch (error) {
    console.error('Error loading capacity CSV files:', error);
  }
}

// Auto-load CSV files when the script loads (only in URL mode)
// In file mode, data will be loaded from ZIP via setCapacityZipData()
setTimeout(() => {
  if (typeof dataSource === 'undefined' || dataSource === 'url') {
    loadCapacityCSVFiles();
  }
}, 500);

// Global function to update capacity visualization when scenario changes
window.updateCapacityVisualization = function() {
  if (processedCapacityData && processedCapacityData.data) {
    console.log('Updating capacity visualization for scenario:', currentScenarioID);
    drawCapacityVisualization();
  }
};

// Parse capacity CSV with {capacity, volume} format
function parseCapacityCSV(csvText) {
  const lines = csvText.trim().split('\n');

  // Parse metadata rows
  const metadata = {
    index: [],
    name: [],
    type: [],
    year: [],
    id: []
  };

  // Use a more robust CSV parsing approach to handle quoted values
  function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    let quoteCount = 0;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        quoteCount++;
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
        quoteCount = 0;
      } else {
        current += char;
      }
    }
    result.push(current); // Add the last field

    return result;
  }

  // Parse metadata
  metadata.index = parseCsvLine(lines[1]);
  metadata.name = parseCsvLine(lines[2]);
  metadata.type = parseCsvLine(lines[3]);
  metadata.year = parseCsvLine(lines[4]);
  metadata.id = parseCsvLine(lines[5]);

  const data = {};

  // Parse each technology row (starting from line 6)
  for (let i = 6; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = parseCsvLine(line);
    const techKey = parts[0];
    if (!techKey) continue;

    data[techKey] = {};

    // Parse each scenario column
    for (let j = 1; j < parts.length; j++) {
      const scenarioId = `scenario${j-1}`;
      let valueStr = parts[j];

      // Parse {capacity, volume} format
      // Remove triple quotes and curly braces
      valueStr = valueStr.replace(/"""/g, '').replace(/"/g, '').replace(/{/g, '').replace(/}/g, '');

      if (valueStr) {
        const values = valueStr.split(',').map(v => parseFloat(v.trim()));
        if (values.length === 2 && !isNaN(values[0]) && !isNaN(values[1])) {
          const capacity = values[0]; // MW
          const volume = values[1]; // MJ

          // Calculate full load hours: volume (MJ) / capacity (MW) / 3600 (seconds per hour)
          let fullLoadHours = 0;
          if (capacity > 0 && volume > 0) {
            fullLoadHours = volume / (capacity * 3600);
          }

          data[techKey][scenarioId] = {
            capacity: capacity,
            volume: volume,
            fullLoadHours: fullLoadHours,
            year: metadata.year[j],
            scenarioName: metadata.name[j]
          };
        }
      }
    }
  }

  return { data, metadata };
}

// Process capacity data by predefined category groups
function processCapacityDataByGroups(capacityData) {
  // No additional processing needed - data is already organized by technology categories
  // We'll just use the categoryGroups to filter and organize
  return capacityData;
}

// Draw unit selector for capacity section
function drawCapacityUnitSelector() {
  // Check if selector already exists
  if (d3.select('#capacityUnitSelectorDiv').empty()) {
    // Get the parent section instead of the container
    const parentSection = d3.select('#capacityVisualizationContainer').node().parentElement;

    const selectorDiv = d3.select(parentSection).insert('div', '#capacityVisualizationContainer')
      .attr('id', 'capacityUnitSelectorDiv')
      .style('width', '200px')
      .style('height', '35px')
      .style('position', 'absolute')
      .style('top', '20px')
      .style('right', '20px')
      .style('z-index', '10');
    
    const svg = selectorDiv.append('svg')
      .attr('width', 200)
      .attr('height', 35)
      .attr('id', 'capacityUnitSelectorSVG')
      .attr('transform', 'scale(0.8)');
    
    let sCanvas = svg.append('g');
    
    sCanvas.append('rect')
      .attr('id', 'capacityUnitToggle')
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
        capacityEnergyUnit = (capacityEnergyUnit === 'PJ') ? 'TWh' : 'PJ';
        d3.select('#capacityUnitStatus')
          .transition()
          .duration(200)
          .attr('cx', capacityEnergyUnit === 'PJ' ? 63 : 87);
        
        // Redraw the visualization with new unit
        createCapacityBarCharts();
      });
    
    sCanvas.append('circle')
      .attr('id', 'capacityUnitStatus')
      .style('pointer-events', 'none')
      .attr('cx', capacityEnergyUnit === 'PJ' ? 63 : 87)
      .attr('cy', 12.5)
      .attr('r', 10)
      .attr('fill', '#444');
    
    sCanvas.append('text')
      .attr('x', 19.5)
      .attr('y', 18.5)
      .attr('fill', '#444')
      .style('font-size', '15px')
      .style('font-weight', 400)
      .text('PJ');
    
    sCanvas.append('text')
      .attr('x', 113.5)
      .attr('y', 18.5)
      .attr('fill', '#444')
      .style('font-size', '15px')
      .style('font-weight', 400)
      .text('TWh');
  }
}

// Main drawing function
function drawCapacityVisualization() {
  console.log('drawCapacityVisualization called');
  console.log('processedCapacityData:', processedCapacityData);

  if (!processedCapacityData || !processedCapacityData.data) {
    console.warn('Capacity data not loaded yet', processedCapacityData);
    return;
  }

  console.log('Creating capacity bar charts...');
  
  // Draw unit selector first
  drawCapacityUnitSelector();
  
  // Create the visualization for 4 main categories
  createCapacityBarCharts();
}

function createCapacityBarCharts() {
  const container = d3.select('#capacityVisualizationContainer');

  // Get the currently selected scenario
  const currentScenarioIdString = `scenario${typeof currentScenarioID !== 'undefined' ? currentScenarioID : 0}`;

  // Calculate global maximum capacity across all categories AND all scenarios for consistent y-axis scaling
  let globalMaxCapacity = 0;

  // Collect all valid categories across all groups
  let allBarData = [];
  let groupInfo = [];

  Object.keys(categoryGroups).forEach((groupName) => {
    const categories = categoryGroups[groupName];
    const validCategories = categories.filter(cat => processedCapacityData.data[cat]);

    if (validCategories.length > 0) {
      groupInfo.push({
        name: groupName,
        startIndex: allBarData.length,
        count: validCategories.length
      });

      validCategories.forEach(cat => {
        const data = processedCapacityData.data[cat]?.[currentScenarioIdString];
        const capacity = data ? data.capacity : 0;
        const fullLoadHours = data ? data.fullLoadHours : 0;
        const volume = data ? data.volume : 0;
        
        allBarData.push({
          category: cat,
          groupName: groupName,
          capacity: capacity,
          fullLoadHours: fullLoadHours,
          volume: volume,
          year: data?.year || '',
          scenarioName: data?.scenarioName || ''
        });

        // Check all scenarios for global max
        Object.keys(processedCapacityData.data[cat] || {}).forEach(scenarioId => {
          const scenarioData = processedCapacityData.data[cat][scenarioId];
          if (scenarioData && scenarioData.capacity > 0) {
            globalMaxCapacity = Math.max(globalMaxCapacity, scenarioData.capacity);
          }
        });
      });
    }
  });

  // Check if container exists, if not create it
  let chartContainer = container.select('.single-chart-container');
  if (chartContainer.empty()) {
    // First time - clear and create container
    container.html('');
    createCombinedBarChart(allBarData, groupInfo, globalMaxCapacity, container);
  } else {
    // Update existing chart
    updateCombinedBarChart(allBarData, groupInfo, globalMaxCapacity, container);
  }
}

function createCombinedBarChart(allBarData, groupInfo, globalMaxCapacity, container) {
  // Collect footnotes before creating chart
  const { footnotes, footnoteMap } = collectFootnotes(allBarData);

  // Create a div for this chart with white background and rounded edges
  const chartDiv = container.append('div')
    .attr('class', 'single-chart-container')
    .style('width', '100%')
    .style('margin-bottom', '40px')
    .style('background-color', 'white')
    .style('border-radius', '10px')
    .style('padding', '20px')
    .style('box-shadow', '0 2px 4px rgba(0,0,0,0.1)');

  // Get current scenario info for subtitle
  if (allBarData.length > 0 && allBarData[0].scenarioName) {
    chartDiv.append('p')
      .style('font-size', '12px')
      .style('color', '#333')
      .style('margin-bottom', '10px')
      .style('text-align', 'left')
      .text(`Getoond scenario: ${allBarData[0].scenarioName} - Jaar: ${allBarData[0].year}`);
  }

  // Chart dimensions
  const margin = {
    top: 70,
    right: 200,
    bottom: 130,
    left: 100
  };

  const containerWidth = container.node().getBoundingClientRect().width;
  const width = containerWidth - margin.left - margin.right;
  const height = 500 - margin.top - margin.bottom;

  // Create SVG
  const svg = chartDiv.append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // Create x scale - equal width for all bars
  const barPadding = 0.3;
  const x = d3.scaleBand()
    .domain(allBarData.map((d, i) => i))
    .range([0, width])
    .padding(barPadding);

  // Create y scale
  const y = d3.scaleLinear()
    .domain([0, globalMaxCapacity * 1.25]) // Add 25% headroom for labels
    .range([height, 0]);

  // Add grid lines FIRST (so bars will be drawn on top)
  // Custom grid implementation to exclude the top line
  const yTicks = y.ticks(8);
  const gridGroup = svg.append('g')
    .attr('class', 'grid');

  // Draw grid lines for all ticks except the maximum value (top line)
  yTicks.forEach(tick => {
    if (tick < y.domain()[1]) {  // Skip the top line
      gridGroup.append('line')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', y(tick))
        .attr('y2', y(tick))
        .style('stroke', '#e0e0e0')
        .style('stroke-width', 0.5)
        .style('opacity', 0.5);
    }
  });

  // Color scale by group - matching app color scheme
  const groupColorScale = d3.scaleOrdinal()
    .domain(Object.keys(categoryGroups))
    .range(['#E99172', '#3F88AE', '#62D3A4', '#7555F6']);

  // Create tooltip
  let tooltip = d3.select('body').select('.capacity-tooltip');
  if (tooltip.empty()) {
    tooltip = d3.select('body').append('div')
      .attr('class', 'capacity-tooltip')
      .style('position', 'absolute')
      .style('visibility', 'hidden')
      .style('background-color', 'rgba(0, 0, 0, 0.85)')
      .style('color', 'white')
      .style('padding', '10px')
      .style('border-radius', '5px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('z-index', '10000')
      .style('box-shadow', '0 2px 4px rgba(0,0,0,0.2)');
  }

  // Draw bars with animation
  const bars = svg.selectAll('.bar')
    .data(allBarData, (d, i) => `${d.category}-${i}`);

  bars.enter()
    .append('rect')
    .attr('class', 'bar')
    .attr('x', (d, i) => x(i))
    .attr('y', height)
    .attr('width', x.bandwidth())
    .attr('height', 0)
    .attr('fill', d => groupColorScale(d.groupName))
    .style('stroke', '#fff')
    .style('stroke-width', 1)
    .style('cursor', 'pointer')
    .on('click', function(event, d) {
      // Show popup with comparison across scenarios
      showCapacityPopup({
        category: d.category,
        groupName: d.groupName,
        year: d.year,
        color: groupColorScale(d.groupName)
      });
    })
    .on('mouseover', function(event, d) {
      if (d.capacity > 0 || d.volume > 0) {
        d3.select(this).style('opacity', 0.7);
        const capacityText = d.capacity > 999
          ? `${(d.capacity / 1000).toFixed(1)} GW`
          : `${Math.round(d.capacity)} MW`;
        const capacityFactor = (d.fullLoadHours / 8760) * 100;
        
        // Format volume
        let volumeText;
        if (capacityEnergyUnit === 'PJ') {
          const volumePJ = d.volume / 1000000000;
          volumeText = `${volumePJ.toFixed(1)} PJ`;
        } else {
          const volumeTWh = d.volume / 3600000000;
          volumeText = `${volumeTWh.toFixed(1)} TWh`;
        }
        
        tooltip
          .style('visibility', 'visible')
          .html(`
            <strong>${getCategoryDisplayName(d.category)}</strong><br/>
            Group: ${d.groupName}<br/>
            Capacity: ${capacityText}<br/>
            Volume: ${volumeText}<br/>
            Full Load Hours: ${Math.round(d.fullLoadHours)} h<br/>
            Capacity Factor: ${capacityFactor.toFixed(1)}%
          `);
      }
    })
    .on('mousemove', function(event) {
      tooltip
        .style('top', (event.pageY - 10) + 'px')
        .style('left', (event.pageX + 10) + 'px');
    })
    .on('mouseout', function() {
      d3.select(this).style('opacity', 1);
      tooltip.style('visibility', 'hidden');
    })
    .transition()
    .duration(500)
    .ease(d3.easeCubicInOut)
    .attr('y', d => y(d.capacity))
    .attr('height', d => height - y(d.capacity));

  // Add data labels on top of bars
  const labels = svg.selectAll('.bar-label')
    .data(allBarData, (d, i) => `${d.category}-${i}`);

  labels.enter()
    .append('text')
    .attr('class', 'bar-label')
    .attr('x', (d, i) => x(i) + x.bandwidth() / 2)
    .attr('y', height)
    .attr('text-anchor', 'middle')
    .style('font-size', '9px')
    .style('font-weight', 'bold')
    .style('fill', '#333')
    .each(function(d, i) {
      const textElement = d3.select(this);
      
      if (d.capacity > 0 || d.volume > 0) {
        // Format capacity value
        let capacityText;
        if (d.capacity > 999) {
          capacityText = `${(d.capacity / 1000).toFixed(1)} GW`;
        } else {
          capacityText = `${Math.round(d.capacity)} MW`;
        }

        // Format volume value (convert from MJ, rounded to 0 digits)
        let volumeText;
        if (capacityEnergyUnit === 'PJ') {
          const volumePJ = d.volume / 1000000000; // MJ to PJ
          volumeText = `${Math.round(volumePJ)} PJ`;
        } else {
          const volumeTWh = d.volume / 3600000000; // MJ to TWh
          volumeText = `${Math.round(volumeTWh)} TWh`;
        }

        // Calculate capacity factor and full load hours
        const capacityFactor = ((d.fullLoadHours / 8760) * 100).toFixed(0);
        const fullLoadHours = Math.round(capacityFactor * 8760 / 100);

        // Determine if values exceed maximum (color red if invalid)
        const isInvalid = fullLoadHours > 8760 || capacityFactor > 100;
        const valueColor = isInvalid ? '#ff0000' : '#666';

        // Add capacity value as first tspan
        textElement.append('tspan')
          .attr('x', x(i) + x.bandwidth() / 2)
          .attr('dy', 0)
          .text(capacityText);

        // Add volume as second tspan
        textElement.append('tspan')
          .attr('x', x(i) + x.bandwidth() / 2)
          .attr('dy', '1.4em')
          .style('font-size', '8px')
          .style('fill', '#666')
          .text(volumeText);

        // Add FLH as third tspan
        textElement.append('tspan')
          .attr('x', x(i) + x.bandwidth() / 2)
          .attr('dy', '1.4em')
          .style('font-size', '8px')
          .style('fill', valueColor)
          .text(`FLH: ${fullLoadHours}`);

        // Add capacity factor as fourth tspan
        textElement.append('tspan')
          .attr('x', x(i) + x.bandwidth() / 2)
          .attr('dy', '1.4em')
          .style('font-size', '8px')
          .style('fill', valueColor)
          .text(`${capacityFactor}%`);
      }
    })
    .style('opacity', 0)
    .transition()
    .duration(500)
    .delay(300)
    .attr('y', d => y(d.capacity) - 45)
    .style('opacity', 1);

  // Add x-axis with category names (without footnote markers in text)
  const xAxis = svg.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).tickFormat((d, i) => {
      const category = allBarData[i].category;
      // Return just the display name without footnote marker
      return getCategoryDisplayName(category);
    }));

  xAxis.selectAll('text')
    .style('text-anchor', 'end')
    .attr('dx', '-.8em')
    .attr('dy', '1.5em')
    .attr('transform', 'rotate(-45)')
    .style('font-size', '9px');

  // Add footnote circles for categories with footnotes
  xAxis.selectAll('.footnote-circle')
    .data(allBarData.filter((d, i) => footnoteMap.has(d.category)))
    .enter()
    .append('g')
    .attr('class', 'footnote-circle')
    .attr('transform', (d, i) => {
      const barIndex = allBarData.findIndex(item => item.category === d.category);
      return `translate(${x(barIndex) + x.bandwidth() / 2}, 28)`;
    })
    .each(function(d) {
      const group = d3.select(this);
      const footnoteIndex = footnoteMap.get(d.category);

      // Add circle
      group.append('circle')
        .attr('r', 8)
        .attr('fill', '#FBC02D')
        .attr('stroke', 'white')
        .attr('stroke-width', 1);

      // Add number
      group.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .style('font-size', '10px')
        .style('font-weight', 'bold')
        .style('fill', 'white')
        .style('pointer-events', 'none')
        .text(footnoteIndex);
    });

  // Add y-axis
  svg.append('g')
    .attr('class', 'y-axis')
    .call(d3.axisLeft(y).ticks(8).tickFormat(d => {
      if (d > 999) {
        return `${(d / 1000).toFixed(1)} GW`;
      }
      return `${d} MW`;
    }))
    .style('font-size', '11px');

  // Add y-axis label
  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('y', -margin.left + 20)
    .attr('x', -height / 2)
    .attr('text-anchor', 'middle')
    .style('font-size', '12px')
    .style('font-weight', 'bold')
    .text('Opgesteld vermogen');

  // Add group separators and labels
  groupInfo.forEach((group, idx) => {
    // Calculate group totals
    const groupData = allBarData.slice(group.startIndex, group.startIndex + group.count);
    const totalCapacity = groupData.reduce((sum, d) => sum + d.capacity, 0);
    const totalVolume = groupData.reduce((sum, d) => sum + d.volume, 0);

    // Calculate weighted-average capacity factor
    let weightedAvgCapacityFactor = 0;
    if (totalCapacity > 0) {
      const totalFullLoadHours = groupData.reduce((sum, d) => sum + (d.capacity * d.fullLoadHours), 0) / totalCapacity;
      weightedAvgCapacityFactor = (totalFullLoadHours / 8760) * 100;
    }

    // Add group label at the top - properly centered
    const firstBarX = x(group.startIndex);
    const lastBarX = x(group.startIndex + group.count - 1);
    const groupCenterX = (firstBarX + lastBarX) / 2 + x.bandwidth() / 2;
    const groupWidth = lastBarX - firstBarX + x.bandwidth();

    svg.append('text')
      .attr('class', 'group-label')
      .attr('x', groupCenterX)
      .attr('y', -50)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .style('font-weight', 'bold')
      .style('fill', groupColorScale(group.name))
      .text(group.name);

    // Add horizontal separator line under the label
    svg.append('line')
      .attr('class', 'group-separator')
      .attr('x1', firstBarX)
      .attr('x2', lastBarX + x.bandwidth())
      .attr('y1', -40)
      .attr('y2', -40)
      .style('stroke', groupColorScale(group.name))
      .style('stroke-width', 2);

    // Format totals (rounded to whole numbers)
    const capacityText = totalCapacity > 999
      ? `${Math.round(totalCapacity / 1000)} GW`
      : `${Math.round(totalCapacity)} MW`;

    let volumeText;
    if (capacityEnergyUnit === 'PJ') {
      const volumePJ = totalVolume / 1000000000;
      volumeText = `${Math.round(volumePJ)} PJ`;
    } else {
      const volumeTWh = totalVolume / 3600000000;
      volumeText = `${Math.round(volumeTWh)} TWh`;
    }

    // Add totals below the separator line
    svg.append('text')
      .attr('class', 'group-totals')
      .attr('x', groupCenterX)
      .attr('y', -20)
      .attr('text-anchor', 'middle')
      .style('font-size', '11px')
      .style('font-weight', 'bold')
      .style('fill', groupColorScale(group.name))
      .text(`${capacityText} | ${volumeText} | ${Math.round(weightedAvgCapacityFactor)}%`);
  });

  // Add footnotes section below the chart if there are any footnotes
  if (footnotes.length > 0) {
    const footnotesDiv = chartDiv.append('div')
      .attr('class', 'footnotes-container')
      .style('margin-top', '20px')
      .style('padding-top', '15px')
      .style('border-top', '1px solid #ddd')
      .style('font-size', '11px')
      .style('color', '#666');

    footnotesDiv.append('div')
      .style('font-weight', 'bold')
      .style('margin-bottom', '8px')
      .text('Notes and issues:');

    footnotes.forEach(fn => {
      const footnoteItem = footnotesDiv.append('div')
        .style('margin-bottom', '8px')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('gap', '8px');

      // Add SVG with circled number
      const svg = footnoteItem.append('svg')
        .attr('width', 18)
        .attr('height', 18)
        .style('flex-shrink', '0');

      svg.append('circle')
        .attr('cx', 9)
        .attr('cy', 9)
        .attr('r', 8)
        .attr('fill', '#FBC02D')
        .attr('stroke', 'white')
        .attr('stroke-width', 1);

      svg.append('text')
        .attr('x', 9)
        .attr('y', 9)
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .style('font-size', '10px')
        .style('font-weight', 'bold')
        .style('fill', 'white')
        .text(fn.index);

      // Add footnote text
      footnoteItem.append('span')
        .html(`<strong>${fn.displayName}:</strong> ${fn.footnote}`);
    });
  }
}

// Update existing bar chart with new scenario data
function updateCombinedBarChart(allBarData, groupInfo, globalMaxCapacity, container) {
  // Collect footnotes before updating chart
  const { footnotes, footnoteMap } = collectFootnotes(allBarData);

  // Get the chart div
  const chartDiv = container.select('.single-chart-container');

  // Update scenario info subtitle
  if (allBarData.length > 0 && allBarData[0].scenarioName) {
    chartDiv.select('p')
      .text(`Getoond scenario: ${allBarData[0].scenarioName} - Jaar: ${allBarData[0].year}`);
  }

  // Chart dimensions - match margins from createCombinedBarChart
  const margin = {
    top: 70,
    right: 100,
    bottom: 130,
    left: 100
  };

  const containerWidth = container.node().getBoundingClientRect().width;
  const width = containerWidth - margin.left - margin.right;
  const height = 500 - margin.top - margin.bottom;

  // Get the SVG group
  const svg = chartDiv.select('svg g');

  // Create scales
  const barPadding = 0.3;
  const x = d3.scaleBand()
    .domain(allBarData.map((d, i) => i))
    .range([0, width])
    .padding(barPadding);

  const y = d3.scaleLinear()
    .domain([0, globalMaxCapacity * 1.2])
    .range([height, 0]);

  // Remove old grid lines
  svg.selectAll('.grid').remove();

  // Add grid lines FIRST (so bars will be drawn on top)
  // Custom grid implementation to exclude the top line
  const yTicks = y.ticks(8);
  const gridGroup = svg.insert('g', ':first-child')
    .attr('class', 'grid');

  // Draw grid lines for all ticks except the maximum value (top line)
  yTicks.forEach(tick => {
    if (tick < y.domain()[1]) {  // Skip the top line
      gridGroup.append('line')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', y(tick))
        .attr('y2', y(tick))
        .style('stroke', '#e0e0e0')
        .style('stroke-width', 1)
        .style('opacity', 0.7);
    }
  });

  // Color scale by group - matching app color scheme
  const groupColorScale = d3.scaleOrdinal()
    .domain(Object.keys(categoryGroups))
    .range(['#E99172', '#3F88AE', '#62D3A4', '#7555F6']);

  // Get tooltip
  let tooltip = d3.select('body').select('.capacity-tooltip');

  // Update bars with smooth transition
  const bars = svg.selectAll('.bar')
    .data(allBarData, (d, i) => `${d.category}-${i}`);

  bars.transition()
    .duration(500)
    .ease(d3.easeCubicInOut)
    .attr('x', (d, i) => x(i))
    .attr('y', d => y(d.capacity))
    .attr('width', x.bandwidth())
    .attr('height', d => height - y(d.capacity))
    .attr('fill', d => groupColorScale(d.groupName));

  // Update event handlers
  bars
    .on('click', function(event, d) {
      // Show popup with comparison across scenarios
      const groupColorScale = d3.scaleOrdinal()
        .domain(Object.keys(categoryGroups))
        .range(['#E99172', '#3F88AE', '#62D3A4', '#7555F6']);

      showCapacityPopup({
        category: d.category,
        groupName: d.groupName,
        year: d.year,
        color: groupColorScale(d.groupName)
      });
    })
    .on('mouseover', function(event, d) {
      if (d.capacity > 0 || d.volume > 0) {
        d3.select(this).style('opacity', 0.7);
        const capacityText = d.capacity > 999
          ? `${(d.capacity / 1000).toFixed(1)} GW`
          : `${Math.round(d.capacity)} MW`;
        const capacityFactor = (d.fullLoadHours / 8760) * 100;

        // Format volume
        let volumeText;
        if (capacityEnergyUnit === 'PJ') {
          const volumePJ = d.volume / 1000000000;
          volumeText = `${volumePJ.toFixed(1)} PJ`;
        } else {
          const volumeTWh = d.volume / 3600000000;
          volumeText = `${volumeTWh.toFixed(1)} TWh`;
        }

        tooltip
          .style('visibility', 'visible')
          .html(`
            <strong>${getCategoryDisplayName(d.category)}</strong><br/>
            Group: ${d.groupName}<br/>
            Capacity: ${capacityText}<br/>
            Volume: ${volumeText}<br/>
            Full Load Hours: ${Math.round(d.fullLoadHours)} h<br/>
            Capacity Factor: ${capacityFactor.toFixed(1)}%
          `);
      }
    })
    .on('mousemove', function(event) {
      tooltip
        .style('top', (event.pageY - 10) + 'px')
        .style('left', (event.pageX + 10) + 'px');
    })
    .on('mouseout', function() {
      d3.select(this).style('opacity', 1);
      tooltip.style('visibility', 'hidden');
    });

  // Update data labels
  const labels = svg.selectAll('.bar-label')
    .data(allBarData, (d, i) => `${d.category}-${i}`);

  // Remove all tspans first
  labels.selectAll('tspan').remove();

  labels.each(function(d, i) {
    const textElement = d3.select(this);
    
    if (d.capacity > 0 || d.volume > 0) {
      // Format capacity value
      let capacityText;
      if (d.capacity > 999) {
        capacityText = `${(d.capacity / 1000).toFixed(1)} GW`;
      } else {
        capacityText = `${Math.round(d.capacity)} MW`;
      }

      // Format volume value (convert from MJ, rounded to 0 digits)
      let volumeText;
      if (capacityEnergyUnit === 'PJ') {
        const volumePJ = d.volume / 1000000000; // MJ to PJ
        volumeText = `${Math.round(volumePJ)} PJ`;
      } else {
        const volumeTWh = d.volume / 3600000000; // MJ to TWh
        volumeText = `${Math.round(volumeTWh)} TWh`;
      }

      // Calculate capacity factor and full load hours
      const capacityFactor = ((d.fullLoadHours / 8760) * 100).toFixed(0);
      const fullLoadHours = Math.round(capacityFactor * 8760 / 100);

      // Determine if values exceed maximum (color red if invalid)
      const isInvalid = fullLoadHours > 8760 || capacityFactor > 100;
      const valueColor = isInvalid ? '#ff0000' : '#666';

      // Add capacity value as first tspan
      textElement.append('tspan')
        .attr('x', x(i) + x.bandwidth() / 2)
        .attr('dy', 0)
        .text(capacityText);

      // Add volume as second tspan
      textElement.append('tspan')
        .attr('x', x(i) + x.bandwidth() / 2)
        .attr('dy', '1.4em')
        .style('font-size', '8px')
        .style('fill', '#666')
        .text(volumeText);

      // Add FLH as third tspan
      textElement.append('tspan')
        .attr('x', x(i) + x.bandwidth() / 2)
        .attr('dy', '1.4em')
        .style('font-size', '8px')
        .style('fill', valueColor)
        .text(`FLH: ${fullLoadHours}`);

      // Add capacity factor as fourth tspan
      textElement.append('tspan')
        .attr('x', x(i) + x.bandwidth() / 2)
        .attr('dy', '1.4em')
        .style('font-size', '8px')
        .style('fill', valueColor)
        .text(`${capacityFactor}%`);
    }
  });

  labels.transition()
    .duration(500)
    .attr('x', (d, i) => x(i) + x.bandwidth() / 2)
    .attr('y', d => y(d.capacity) - 45);

  // Update x-axis
  const xAxis = svg.select('.x-axis');

  xAxis.call(d3.axisBottom(x).tickFormat((d, i) => {
      const category = allBarData[i].category;
      return getCategoryDisplayName(category);
    }))
    .selectAll('text')
    .style('text-anchor', 'end')
    .attr('dx', '-2em')
    .attr('dy', '2.5em')
    .attr('transform', 'rotate(-45)')
    .style('font-size', '9px');

  // Remove old footnote circles and add new ones
  xAxis.selectAll('.footnote-circle').remove();

  xAxis.selectAll('.footnote-circle')
    .data(allBarData.filter(d => footnoteMap.has(d.category)))
    .enter()
    .append('g')
    .attr('class', 'footnote-circle')
    .attr('transform', d => {
      const barIndex = allBarData.findIndex(item => item.category === d.category);
      return `translate(${x(barIndex) + x.bandwidth() / 2}, 18)`;
    })
    .each(function(d) {
      const group = d3.select(this);
      const footnoteIndex = footnoteMap.get(d.category);

      // Add circle
      group.append('circle')
        .attr('r', 8)
        .attr('fill', '#FBC02D')
        .attr('stroke', 'white')
        .attr('stroke-width', 1);

      // Add number
      group.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .style('font-size', '10px')
        .style('font-weight', 'bold')
        .style('fill', 'white')
        .style('pointer-events', 'none')
        .text(footnoteIndex);
    });

  // Update y-axis
  svg.select('.y-axis')
    .call(d3.axisLeft(y).ticks(8).tickFormat(d => {
      if (d > 999) {
        return `${(d / 1000).toFixed(1)} GW`;
      }
      return `${d} MW`;
    }));

  // Update group separators and labels
  svg.selectAll('.group-separator').remove();
  svg.selectAll('.group-label').remove();
  svg.selectAll('.group-totals').remove();

  groupInfo.forEach((group, idx) => {
    // Calculate group totals
    const groupData = allBarData.slice(group.startIndex, group.startIndex + group.count);
    const totalCapacity = groupData.reduce((sum, d) => sum + d.capacity, 0);
    const totalVolume = groupData.reduce((sum, d) => sum + d.volume, 0);
    
    // Calculate weighted-average capacity factor
    let weightedAvgCapacityFactor = 0;
    if (totalCapacity > 0) {
      const totalFullLoadHours = groupData.reduce((sum, d) => sum + (d.capacity * d.fullLoadHours), 0) / totalCapacity;
      weightedAvgCapacityFactor = (totalFullLoadHours / 8760) * 100;
    }

    // Add group label at the top - properly centered
    const firstBarX = x(group.startIndex);
    const lastBarX = x(group.startIndex + group.count - 1);
    const groupCenterX = (firstBarX + lastBarX) / 2 + x.bandwidth() / 2;
    const groupWidth = lastBarX - firstBarX + x.bandwidth();
    
    svg.append('text')
      .attr('class', 'group-label')
      .attr('x', groupCenterX)
      .attr('y', -50)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .style('font-weight', 'bold')
      .style('fill', groupColorScale(group.name))
      .text(group.name);
    
    // Add horizontal separator line under the label
    svg.append('line')
      .attr('class', 'group-separator')
      .attr('x1', firstBarX)
      .attr('x2', lastBarX + x.bandwidth())
      .attr('y1', -40)
      .attr('y2', -40)
      .style('stroke', groupColorScale(group.name))
      .style('stroke-width', 2);
    
    // Format totals (rounded to whole numbers)
    const capacityText = totalCapacity > 999
      ? `${Math.round(totalCapacity / 1000)} GW`
      : `${Math.round(totalCapacity)} MW`;

    let volumeText;
    if (capacityEnergyUnit === 'PJ') {
      const volumePJ = totalVolume / 1000000000;
      volumeText = `${Math.round(volumePJ)} PJ`;
    } else {
      const volumeTWh = totalVolume / 3600000000;
      volumeText = `${Math.round(volumeTWh)} TWh`;
    }

    // Add totals below the separator line
    svg.append('text')
      .attr('class', 'group-totals')
      .attr('x', groupCenterX)
      .attr('y', -20)
      .attr('text-anchor', 'middle')
      .style('font-size', '11px')
      .style('font-weight', 'bold')
      .style('fill', groupColorScale(group.name))
      .text(`${capacityText} | ${volumeText} | ${Math.round(weightedAvgCapacityFactor)}%`);
  });

  // Update footnotes section
  chartDiv.selectAll('.footnotes-container').remove();

  if (footnotes.length > 0) {
    const footnotesDiv = chartDiv.append('div')
      .attr('class', 'footnotes-container')
      .style('margin-top', '20px')
      .style('padding-top', '15px')
      .style('border-top', '1px solid #ddd')
      .style('font-size', '11px')
      .style('color', '#666');

    footnotesDiv.append('div')
      .style('font-weight', 'bold')
      .style('margin-bottom', '8px')
      .text('Notes and issues:');

    footnotes.forEach(fn => {
      const footnoteItem = footnotesDiv.append('div')
        .style('margin-bottom', '8px')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('gap', '8px');

      // Add SVG with circled number
      const svg = footnoteItem.append('svg')
        .attr('width', 18)
        .attr('height', 18)
        .style('flex-shrink', '0');

      svg.append('circle')
        .attr('cx', 9)
        .attr('cy', 9)
        .attr('r', 8)
        .attr('fill', '#FBC02D')
        .attr('stroke', 'white')
        .attr('stroke-width', 1);

      svg.append('text')
        .attr('x', 9)
        .attr('y', 9)
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .style('font-size', '10px')
        .style('font-weight', 'bold')
        .style('fill', 'white')
        .text(fn.index);

      // Add footnote text
      footnoteItem.append('span')
        .html(`<strong>${fn.displayName}:</strong> ${fn.footnote}`);
    });
  }
}

// Helper function to format category names using lookup table
// Returns an object: { displayName: string, footnote: string|null }
function formatCategoryName(name) {
  let displayName = name;
  let footnote = null;

  // Use lookup table if available
  if (categoryDisplayNames[name]) {
    const entry = categoryDisplayNames[name];

    // Support both string format and object format
    if (typeof entry === 'string') {
      displayName = entry;
    } else if (typeof entry === 'object' && entry.name) {
      displayName = entry.name;
      footnote = entry.footnote || null;
    }
  } else {
    // Fallback formatting
    displayName = name
      .replace(/electricity_/g, '')
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  return { displayName, footnote };
}

// Helper to get just the display name without footnote marker (for backward compatibility)
function getCategoryDisplayName(name) {
  return formatCategoryName(name).displayName;
}

// Helper to collect footnotes from allBarData
function collectFootnotes(allBarData) {
  const footnotes = [];
  const footnoteMap = new Map(); // Track which categories have which footnote index

  allBarData.forEach(d => {
    const entry = categoryDisplayNames[d.category];
    if (entry && typeof entry === 'object' && entry.footnote) {
      // Only add if not already in the map
      if (!footnoteMap.has(d.category)) {
        footnotes.push({
          category: d.category,
          displayName: entry.name,
          footnote: entry.footnote,
          index: footnotes.length + 1
        });
        footnoteMap.set(d.category, footnotes.length);
      }
    }
  });

  return { footnotes, footnoteMap };
}

// Function to close capacity popup
function closeCapacityPopup() {
  d3.select('#capacityPopup').remove();
  const container = d3.select('#popupContainer');
  container.on('click', null);
  container
    .style('background-color', 'rgba(0,0,0,0)')
    .style('pointer-events', 'none');
  document.body.style.overflow = 'auto';
}

// Function to show popup with bar chart comparing category across all scenarios
function showCapacityPopup(categoryData) {
  // Prevent body scrolling when popup is open
  document.body.style.overflow = 'hidden';

  // Setup popup container
  d3.select('#popupContainer')
    .style('background-color', 'rgba(0,0,0,0.3)')
    .style('pointer-events', 'auto')
    .on('click', closeCapacityPopup);

  const popup = d3.select('#popupContainer')
    .append('div')
    .attr('id', 'capacityPopup')
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
    .attr('id', 'capacityAnalysisPopup')
    .style('position', 'absolute')
    .style('box-shadow', '0 4px 10px rgba(0,0,0,0.2)')
    .style('border-radius', '10px')
    .style('width', '1100px')
    .style('height', '600px')
    .style('background-color', '#f9f9f9');

  const svg = popup.append('svg')
    .style('position', 'absolute')
    .style('width', '100%')
    .style('height', '100%')
    .attr('id', 'capacityAnalysisSVG');

  const canvas = svg.append('g');

  // Header
  canvas.append('text')
    .attr('x', 100)
    .attr('y', 50)
    .style('font-size', '16px')
    .style('font-weight', 500)
    .text(`${getCategoryDisplayName(categoryData.category)} - ${categoryData.year}`);

  canvas.append('text')
    .attr('x', 100)
    .attr('y', 75)
    .style('font-size', '12px')
    .style('fill', '#666')
    .text(`Category: ${categoryData.category} | Group: ${categoryData.groupName}`);

  // Add footnote if available (under the subtitle)
  const categoryFormatted = formatCategoryName(categoryData.category);
  if (categoryFormatted.footnote) {
    const footnoteGroup = canvas.append('g')
      .attr('transform', 'translate(100, 90)');

    // Add circle with exclamation mark
    const circleGroup = footnoteGroup.append('g')
      .attr('transform', 'translate(8, 2)');

    circleGroup.append('circle')
      .attr('r', 8)
      .attr('fill', '#FBC02D')
      .attr('stroke', 'white')
      .attr('stroke-width', 1);

    circleGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .style('font-size', '10px')
      .style('font-weight', 'bold')
      .style('fill', 'white')
      .text('!');

    // Add footnote text with wrapping
    const footnoteText = categoryFormatted.footnote;
    const maxTextWidth = 900;
    const words = footnoteText.split(' ');
    let line = '';
    let lineNumber = 0;
    const lineHeight = 13;
    const textX = 20;
    const textY = 6;

    words.forEach((word, i) => {
      const testLine = line + word + ' ';
      const testText = footnoteGroup.append('text')
        .attr('x', textX)
        .attr('y', textY)
        .style('font-size', '10px')
        .style('fill', '#666')
        .text(testLine);

      const testWidth = testText.node().getComputedTextLength();
      testText.remove();

      if (testWidth > maxTextWidth && i > 0) {
        footnoteGroup.append('text')
          .attr('x', textX)
          .attr('y', textY + lineNumber * lineHeight)
          .style('font-size', '10px')
          .style('fill', '#666')
          .text(line);
        line = word + ' ';
        lineNumber++;
      } else {
        line = testLine;
      }
    });

    // Add the last line
    footnoteGroup.append('text')
      .attr('x', textX)
      .attr('y', textY + lineNumber * lineHeight)
      .style('font-size', '10px')
      .style('fill', '#666')
      .text(line);
  }

  // Close button
  const CLOSE_SIZE = 30;
  const CLOSE_X = 1100 - 50;
  const CLOSE_Y = 30;

  const closeGroup = canvas.append('g')
    .attr('class', 'close-btn')
    .attr('transform', `translate(${CLOSE_X}, ${CLOSE_Y})`)
    .style('cursor', 'pointer')
    .on('click', closeCapacityPopup);

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

  // Prepare data for all scenarios for this category and year
  const categoryKey = categoryData.category;
  const currentYear = categoryData.year;
  const scenarioComparisons = [];

  if (processedCapacityData && processedCapacityData.data && processedCapacityData.data[categoryKey]) {
    const categoryDataAll = processedCapacityData.data[categoryKey];

    // Get all scenarios for this category, excluding WLO scenarios
    Object.keys(categoryDataAll).forEach(scenarioId => {
      const scenarioData = categoryDataAll[scenarioId];
      if (scenarioData && scenarioData.year === currentYear) {
        // Filter out WLO scenarios
        const scenarioName = scenarioData.scenarioName || scenarioId;
        if (!scenarioName.includes('WLO')) {
          scenarioComparisons.push({
            scenarioId: scenarioId,
            scenarioName: scenarioName,
            capacity: scenarioData.capacity || 0,
            volume: scenarioData.volume || 0,
            fullLoadHours: scenarioData.fullLoadHours || 0
          });
        }
      }
    });
  }

  // Sort by scenario name
  scenarioComparisons.sort((a, b) => a.scenarioName.localeCompare(b.scenarioName));

  // Chart dimensions - increased bottom margin to prevent label cutoff
  const margin = { top: 120, right: 60, bottom: 160, left: 150 };
  const width = 1100 - margin.left - margin.right;
  const height = 500 - margin.top - margin.bottom;

  const chartGroup = canvas.append('g')
    .attr('transform', `translate(${margin.left}, ${margin.top})`);

  // Create scales
  const x = d3.scaleBand()
    .domain(scenarioComparisons.map((d, i) => i))
    .range([0, width])
    .padding(0.3);

  const maxCapacity = d3.max(scenarioComparisons, d => d.capacity) || 100;
  const y = d3.scaleLinear()
    .domain([0, maxCapacity * 1.3])
    .range([height, 0]);

  // Add grid lines FIRST (so bars will be drawn on top)
  // Custom grid implementation to exclude the top line
  const yTicks = y.ticks(8);
  const gridGroup = chartGroup.append('g')
    .attr('class', 'grid');

  // Draw grid lines for all ticks except the maximum value (top line)
  yTicks.forEach(tick => {
    if (tick < y.domain()[1]) {  // Skip the top line
      gridGroup.append('line')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', y(tick))
        .attr('y2', y(tick))
        .style('stroke', '#e0e0e0')
        .style('stroke-width', 0.5)
        .style('opacity', 0.5);
    }
  });

  // Draw bars on top of gridlines
  chartGroup.selectAll('.popup-bar')
    .data(scenarioComparisons)
    .enter()
    .append('rect')
    .attr('class', 'popup-bar')
    .attr('x', (d, i) => x(i))
    .attr('y', d => y(d.capacity))
    .attr('width', x.bandwidth())
    .attr('height', d => height - y(d.capacity))
    .attr('fill', categoryData.color || '#3F88AE')
    .style('stroke', '#fff')
    .style('stroke-width', 1)
    .style('cursor', 'pointer')
    .on('mouseover', function(event, d) {
      d3.select(this).style('opacity', 0.7);
    })
    .on('mouseout', function() {
      d3.select(this).style('opacity', 1);
    });

  // Add value labels on bars
  chartGroup.selectAll('.popup-bar-label')
    .data(scenarioComparisons)
    .enter()
    .append('text')
    .attr('class', 'popup-bar-label')
    .attr('x', (d, i) => x(i) + x.bandwidth() / 2)
    .attr('y', d => y(d.capacity) - 50)
    .attr('text-anchor', 'middle')
    .style('font-size', '10px')
    .style('font-weight', 'bold')
    .style('fill', '#333')
    .each(function(d, i) {
      const textElement = d3.select(this);

      // Format capacity value
      let capacityText;
      if (d.capacity > 999) {
        capacityText = `${(d.capacity / 1000).toFixed(1)} GW`;
      } else {
        capacityText = `${Math.round(d.capacity)} MW`;
      }

      // Format volume value (convert from MJ, rounded to 0 digits)
      let volumeText;
      if (capacityEnergyUnit === 'PJ') {
        const volumePJ = d.volume / 1000000000;
        volumeText = `${Math.round(volumePJ)} PJ`;
      } else {
        const volumeTWh = d.volume / 3600000000;
        volumeText = `${Math.round(volumeTWh)} TWh`;
      }

      // Calculate capacity factor and full load hours
      const capacityFactor = ((d.fullLoadHours / 8760) * 100).toFixed(0);
      const fullLoadHours = Math.round(capacityFactor * 8760 / 100);

      // Determine if values exceed maximum (color red if invalid)
      const isInvalid = fullLoadHours > 8760 || capacityFactor > 100;
      const valueColor = isInvalid ? '#ff0000' : '#666';

      // Add capacity value as first tspan
      textElement.append('tspan')
        .attr('x', x(i) + x.bandwidth() / 2)
        .attr('dy', 0)
        .text(capacityText);

      // Add volume as second tspan
      textElement.append('tspan')
        .attr('x', x(i) + x.bandwidth() / 2)
        .attr('dy', '1.4em')
        .style('font-size', '9px')
        .style('fill', '#666')
        .text(volumeText);

      // Add FLH as third tspan
      textElement.append('tspan')
        .attr('x', x(i) + x.bandwidth() / 2)
        .attr('dy', '1.4em')
        .style('font-size', '9px')
        .style('fill', valueColor)
        .text(`FLH: ${fullLoadHours}`);

      // Add capacity factor as fourth tspan
      textElement.append('tspan')
        .attr('x', x(i) + x.bandwidth() / 2)
        .attr('dy', '1.4em')
        .style('font-size', '9px')
        .style('fill', valueColor)
        .text(`${capacityFactor}%`);
    });

  // Add x-axis with scenario names
  chartGroup.append('g')
    .attr('transform', `translate(0, ${height})`)
    .call(d3.axisBottom(x).tickFormat((d, i) => {
      const name = scenarioComparisons[i].scenarioName;
      // Return the full scenario name as is
      return name;
    }))
    .selectAll('text')
    .style('text-anchor', 'end')
    .attr('dx', '-.8em')
    .attr('dy', '.15em')
    .attr('transform', 'rotate(-45)')
    .style('font-size', '10px');

  // Add y-axis
  chartGroup.append('g')
    .call(d3.axisLeft(y).ticks(8).tickFormat(d => {
      if (d > 999) {
        return `${(d / 1000).toFixed(1)} GW`;
      }
      return `${d} MW`;
    }))
    .style('font-size', '11px');

  // Add y-axis label
  chartGroup.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('y', -margin.left + 50)
    .attr('x', -height / 2)
    .attr('text-anchor', 'middle')
    .style('font-size', '12px')
    .style('font-weight', 'bold')
    .text('Opgesteld vermogen');
}

