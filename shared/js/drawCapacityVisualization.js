// Generic Capacity Visualization Module
// Loads configuration from viewer-config.json

// Global state for capacity data
let capacityData = null;
let processedCapacityData = null;
let capacityEnergyUnit = 'PJ'; // Default to PJ, can be switched to TWh

// Lookup table for nicer category display names with optional footnotes
let categoryDisplayNames = {};
let capacityMappings = {};

// Category groups - will be loaded from config
let categoryGroups = {};

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
    populateMappingContainers();
  } catch (error) {
    console.error('Error loading category configuration:', error);
    categoryDisplayNames = {};
    capacityMappings = {};
  }
}

// Load category groups from viewer config
function loadCategoryGroupsFromConfig() {
  if (viewerConfig && viewerConfig.capacityVisualization && viewerConfig.capacityVisualization.categoryGroups) {
    categoryGroups = viewerConfig.capacityVisualization.categoryGroups;
    console.log('Category groups loaded from viewer config');
  } else {
    // Default category groups
    categoryGroups = {
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
  }
}

// Populate the mapping containers in the HTML
function populateMappingContainers() {
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
    html += `<p style="font-style: italic; color: #666; margin-top: 20px;">Note: Many ETM technologies are mapped to "ignore" and are not shown here</p>`;
    etmContainer.innerHTML = html;
  }
}

// Initialize config on page load
setTimeout(() => {
  if (typeof dataSource === 'undefined' || dataSource === 'development') {
    console.log('Loading category config from URL');
    loadCategoryConfig();
  }
  // Load category groups from viewer config
  if (typeof viewerConfig !== 'undefined') {
    loadCategoryGroupsFromConfig();
  } else {
    // Wait for viewerConfig to be loaded
    const checkConfig = setInterval(() => {
      if (typeof viewerConfig !== 'undefined') {
        loadCategoryGroupsFromConfig();
        clearInterval(checkConfig);
      }
    }, 100);
  }
}, 100);

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

    drawCapacityVisualization();

  } catch (error) {
    console.error('Error loading capacity CSV files:', error);
  }
}

// Auto-load CSV files when the script loads (only in development mode)
setTimeout(() => {
  if (typeof dataSource === 'undefined' || dataSource === 'development') {
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

  const metadata = {
    index: [],
    name: [],
    type: [],
    year: [],
    id: []
  };

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
    result.push(current);

    return result;
  }

  metadata.index = parseCsvLine(lines[1]);
  metadata.name = parseCsvLine(lines[2]);
  metadata.type = parseCsvLine(lines[3]);
  metadata.year = parseCsvLine(lines[4]);
  metadata.id = parseCsvLine(lines[5]);

  const data = {};

  for (let i = 6; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = parseCsvLine(line);
    const techKey = parts[0];
    if (!techKey) continue;

    data[techKey] = {};

    for (let j = 1; j < parts.length; j++) {
      const scenarioId = metadata.id[j] || `scenario${j-1}`;
      let valueStr = parts[j];

      valueStr = valueStr.replace(/"""/g, '').replace(/"/g, '').replace(/{/g, '').replace(/}/g, '');

      if (valueStr) {
        const values = valueStr.split(',').map(v => parseFloat(v.trim()));
        if (values.length === 2 && !isNaN(values[0]) && !isNaN(values[1])) {
          const capacity = values[0];
          const volume = values[1];

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

function processCapacityDataByGroups(capacityData) {
  return capacityData;
}

function drawCapacityUnitSelector() {
  if (d3.select('#capacityUnitSelectorDiv').empty()) {
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
      .on('click', function() {
        capacityEnergyUnit = (capacityEnergyUnit === 'PJ') ? 'TWh' : 'PJ';
        d3.select('#capacityUnitStatus')
          .transition()
          .duration(200)
          .attr('cx', capacityEnergyUnit === 'PJ' ? 63 : 87);

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

function drawCapacityVisualization() {
  console.log('drawCapacityVisualization called');
  console.log('processedCapacityData:', processedCapacityData);

  // Ensure category groups are loaded
  if (Object.keys(categoryGroups).length === 0) {
    loadCategoryGroupsFromConfig();
  }

  if (!processedCapacityData || !processedCapacityData.data) {
    console.warn('Capacity data not loaded yet', processedCapacityData);
    return;
  }

  console.log('Creating capacity bar charts...');

  drawCapacityUnitSelector();
  createCapacityBarCharts();
}

function createCapacityBarCharts() {
  const container = d3.select('#capacityVisualizationContainer');

  const currentYear = typeof globalActiveYear !== 'undefined' ? globalActiveYear.id : '2030';
  const currentScenarioName = typeof globalActiveScenario !== 'undefined' ? globalActiveScenario.id : 'TNOAT2024_ADAPT';
  const currentScenarioIdString = `${currentYear}_${currentScenarioName}`;

  let globalMaxCapacity = 0;
  let allBarData = [];
  let groupInfo = [];

  // Get color scale from config
  const colorScale = viewerConfig?.capacityVisualization?.colorScale || ['#E99172', '#3F88AE', '#62D3A4', '#7555F6'];

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

        Object.keys(processedCapacityData.data[cat] || {}).forEach(scenarioId => {
          const scenarioData = processedCapacityData.data[cat][scenarioId];
          if (scenarioData && scenarioData.capacity > 0) {
            globalMaxCapacity = Math.max(globalMaxCapacity, scenarioData.capacity);
          }
        });
      });
    }
  });

  let chartContainer = container.select('.single-chart-container');
  if (chartContainer.empty()) {
    container.html('');
    createCombinedBarChart(allBarData, groupInfo, globalMaxCapacity, container, colorScale);
  } else {
    updateCombinedBarChart(allBarData, groupInfo, globalMaxCapacity, container, colorScale);
  }
}

function createCombinedBarChart(allBarData, groupInfo, globalMaxCapacity, container, colorScale) {
  const { footnotes, footnoteMap } = collectFootnotes(allBarData);

  const chartDiv = container.append('div')
    .attr('class', 'single-chart-container')
    .style('width', '100%')
    .style('margin-bottom', '40px')
    .style('background-color', 'white')
    .style('border-radius', '10px')
    .style('padding', '20px')
    .style('box-shadow', '0 2px 4px rgba(0,0,0,0.1)');

  if (allBarData.length > 0 && allBarData[0].scenarioName) {
    chartDiv.append('p')
      .style('font-size', '12px')
      .style('color', '#333')
      .style('margin-bottom', '10px')
      .style('text-align', 'left')
      .text(`Getoond scenario: ${allBarData[0].scenarioName} - Jaar: ${allBarData[0].year}`);
  }

  const margin = { top: 70, right: 200, bottom: 130, left: 100 };
  const containerWidth = container.node().getBoundingClientRect().width;
  const width = containerWidth - margin.left - margin.right;
  const height = 500 - margin.top - margin.bottom;

  const svg = chartDiv.append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const barPadding = 0.3;
  const x = d3.scaleBand()
    .domain(allBarData.map((d, i) => i))
    .range([0, width])
    .padding(barPadding);

  const y = d3.scaleLinear()
    .domain([0, globalMaxCapacity * 1.25])
    .range([height, 0]);

  const yTicks = y.ticks(8);
  const gridGroup = svg.append('g').attr('class', 'grid');

  yTicks.forEach(tick => {
    if (tick < y.domain()[1]) {
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

  const groupColorScale = d3.scaleOrdinal()
    .domain(Object.keys(categoryGroups))
    .range(colorScale);

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

  // Add labels
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
        let capacityText = d.capacity > 999
          ? `${(d.capacity / 1000).toFixed(1)} GW`
          : `${Math.round(d.capacity)} MW`;

        let volumeText;
        if (capacityEnergyUnit === 'PJ') {
          const volumePJ = d.volume / 1000000000;
          volumeText = `${Math.round(volumePJ)} PJ`;
        } else {
          const volumeTWh = d.volume / 3600000000;
          volumeText = `${Math.round(volumeTWh)} TWh`;
        }

        const capacityFactor = ((d.fullLoadHours / 8760) * 100).toFixed(0);
        const fullLoadHours = Math.round(capacityFactor * 8760 / 100);
        const isInvalid = fullLoadHours > 8760 || capacityFactor > 100;
        const valueColor = isInvalid ? '#ff0000' : '#666';

        textElement.append('tspan')
          .attr('x', x(i) + x.bandwidth() / 2)
          .attr('dy', 0)
          .text(capacityText);

        textElement.append('tspan')
          .attr('x', x(i) + x.bandwidth() / 2)
          .attr('dy', '1.4em')
          .style('font-size', '8px')
          .style('fill', '#666')
          .text(volumeText);

        textElement.append('tspan')
          .attr('x', x(i) + x.bandwidth() / 2)
          .attr('dy', '1.4em')
          .style('font-size', '8px')
          .style('fill', valueColor)
          .text(`FLH: ${fullLoadHours}`);

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

  // X-axis
  const xAxis = svg.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).tickFormat((d, i) => getCategoryDisplayName(allBarData[i].category)));

  xAxis.selectAll('text')
    .style('text-anchor', 'end')
    .attr('dx', '-1.5em')
    .attr('dy', '2.8em')
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
      return `translate(${x(barIndex) + x.bandwidth() / 2}, 18)`;
    })
    .each(function(d) {
      const group = d3.select(this);
      const footnoteIndex = footnoteMap.get(d.category);

      group.append('circle')
        .attr('r', 8)
        .attr('fill', '#FBC02D')
        .attr('stroke', 'white')
        .attr('stroke-width', 1);

      group.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .style('font-size', '10px')
        .style('font-weight', 'bold')
        .style('fill', 'white')
        .style('pointer-events', 'none')
        .text(footnoteIndex);
    });

  // Y-axis
  svg.append('g')
    .attr('class', 'y-axis')
    .call(d3.axisLeft(y).ticks(8).tickFormat(d => d > 999 ? `${(d / 1000).toFixed(1)} GW` : `${d} MW`))
    .style('font-size', '11px');

  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('y', -margin.left + 20)
    .attr('x', -height / 2)
    .attr('text-anchor', 'middle')
    .style('font-size', '12px')
    .style('font-weight', 'bold')
    .text('Opgesteld vermogen');

  // Group separators
  groupInfo.forEach((group) => {
    const groupData = allBarData.slice(group.startIndex, group.startIndex + group.count);
    const totalCapacity = groupData.reduce((sum, d) => sum + d.capacity, 0);
    const totalVolume = groupData.reduce((sum, d) => sum + d.volume, 0);

    let weightedAvgCapacityFactor = 0;
    if (totalCapacity > 0) {
      const totalFullLoadHours = groupData.reduce((sum, d) => sum + (d.capacity * d.fullLoadHours), 0) / totalCapacity;
      weightedAvgCapacityFactor = (totalFullLoadHours / 8760) * 100;
    }

    const firstBarX = x(group.startIndex);
    const lastBarX = x(group.startIndex + group.count - 1);
    const groupCenterX = (firstBarX + lastBarX) / 2 + x.bandwidth() / 2;

    svg.append('text')
      .attr('class', 'group-label')
      .attr('x', groupCenterX)
      .attr('y', -50)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .style('font-weight', 'bold')
      .style('fill', groupColorScale(group.name))
      .text(group.name);

    svg.append('line')
      .attr('class', 'group-separator')
      .attr('x1', firstBarX)
      .attr('x2', lastBarX + x.bandwidth())
      .attr('y1', -40)
      .attr('y2', -40)
      .style('stroke', groupColorScale(group.name))
      .style('stroke-width', 2);

    const capacityText = totalCapacity > 999
      ? `${Math.round(totalCapacity / 1000)} GW`
      : `${Math.round(totalCapacity)} MW`;

    let volumeText;
    if (capacityEnergyUnit === 'PJ') {
      volumeText = `${Math.round(totalVolume / 1000000000)} PJ`;
    } else {
      volumeText = `${Math.round(totalVolume / 3600000000)} TWh`;
    }

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

  // Footnotes (collapsible, collapsed by default)
  if (footnotes.length > 0) {
    const footnotesWrapper = chartDiv.append('div')
      .style('margin-top', '20px')
      .style('border-top', '1px solid #ddd')
      .style('padding-top', '10px');

    const toggleRow = footnotesWrapper.append('div')
      .style('display', 'flex')
      .style('align-items', 'center')
      .style('gap', '8px')
      .style('cursor', 'pointer')
      .style('user-select', 'none')
      .style('font-size', '12px')
      .style('color', '#555');

    const toggleIcon = toggleRow.append('span')
      .style('font-size', '10px')
      .style('transition', 'transform 0.2s ease')
      .style('display', 'inline-block')
      .text('▶');

    toggleRow.append('span')
      .style('font-weight', 'bold')
      .text('Notes and issues');

    toggleRow.append('span')
      .style('color', '#999')
      .style('font-size', '11px')
      .text(`(${footnotes.length})`);

    const footnotesContent = footnotesWrapper.append('div')
      .attr('class', 'footnotes-container')
      .style('display', 'none')
      .style('margin-top', '10px')
      .style('font-size', '11px')
      .style('color', '#666');

    toggleRow.on('click', function() {
      const isVisible = footnotesContent.style('display') !== 'none';
      footnotesContent.style('display', isVisible ? 'none' : 'block');
      toggleIcon.style('transform', isVisible ? 'rotate(0deg)' : 'rotate(90deg)');
    });

    footnotes.forEach(fn => {
      const footnoteItem = footnotesContent.append('div')
        .style('margin-bottom', '8px')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('gap', '8px');

      const svgEl = footnoteItem.append('svg')
        .attr('width', 18)
        .attr('height', 18)
        .style('flex-shrink', '0');

      svgEl.append('circle')
        .attr('cx', 9)
        .attr('cy', 9)
        .attr('r', 8)
        .attr('fill', '#FBC02D')
        .attr('stroke', 'white')
        .attr('stroke-width', 1);

      svgEl.append('text')
        .attr('x', 9)
        .attr('y', 9)
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .style('font-size', '10px')
        .style('font-weight', 'bold')
        .style('fill', 'white')
        .text(fn.index);

      footnoteItem.append('span')
        .html(`<strong>${fn.displayName}:</strong> ${fn.footnote}`);
    });
  }
}

function updateCombinedBarChart(allBarData, groupInfo, globalMaxCapacity, container, colorScale) {
  // Simplified update - just recreate the chart
  container.select('.single-chart-container').remove();
  createCombinedBarChart(allBarData, groupInfo, globalMaxCapacity, container, colorScale);
}

function formatCategoryName(name) {
  let displayName = name;
  let footnote = null;

  if (categoryDisplayNames[name]) {
    const entry = categoryDisplayNames[name];
    if (typeof entry === 'string') {
      displayName = entry;
    } else if (typeof entry === 'object' && entry.name) {
      displayName = entry.name;
      footnote = entry.footnote || null;
    }
  } else {
    displayName = name
      .replace(/electricity_/g, '')
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  return { displayName, footnote };
}

function getCategoryDisplayName(name) {
  return formatCategoryName(name).displayName;
}

function collectFootnotes(allBarData) {
  const footnotes = [];
  const footnoteMap = new Map();

  allBarData.forEach(d => {
    const entry = categoryDisplayNames[d.category];
    if (entry && typeof entry === 'object' && entry.footnote) {
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

function closeCapacityPopup() {
  d3.select('#capacityPopup').remove();
  const container = d3.select('#popupContainer');
  container.on('click', null);
  container
    .style('background-color', 'rgba(0,0,0,0)')
    .style('pointer-events', 'none');
  document.body.style.overflow = 'auto';
}

function showCapacityPopup(categoryData) {
  document.body.style.overflow = 'hidden';

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

  // Close button
  const CLOSE_SIZE = 30;
  const closeGroup = canvas.append('g')
    .attr('class', 'close-btn')
    .attr('transform', `translate(${1100 - 50}, 30)`)
    .style('cursor', 'pointer')
    .on('click', closeCapacityPopup);

  closeGroup.append('rect')
    .attr('width', CLOSE_SIZE)
    .attr('height', CLOSE_SIZE)
    .attr('rx', 4)
    .attr('fill', '#fff')
    .on('mouseover', function() { d3.select(this).attr('fill', '#999'); })
    .on('mouseout', function() { d3.select(this).attr('fill', '#fff'); });

  const ICON_PATH = 'm249 849-42-42 231-231-231-231 42-42 231 231 231-231 42 42-231 231 231 231-42 42-231-231-231 231Z';
  closeGroup.append('path')
    .attr('d', ICON_PATH)
    .attr('transform', 'translate(15,15) scale(0.03125) translate(-480,-480)')
    .attr('fill', '#666')
    .style('pointer-events', 'none');

  // Build comparison data
  const categoryKey = categoryData.category;
  const currentYear = categoryData.year;
  const scenarioComparisons = [];

  if (processedCapacityData && processedCapacityData.data && processedCapacityData.data[categoryKey]) {
    const categoryDataAll = processedCapacityData.data[categoryKey];

    Object.keys(categoryDataAll).forEach(scenarioId => {
      const scenarioData = categoryDataAll[scenarioId];
      if (scenarioData && scenarioData.year === currentYear) {
        const scenarioName = scenarioData.scenarioName || scenarioId;
        // Exclude WLO scenarios - all other scenarios should be shown
        const isWLO = scenarioName.includes('WLO') || scenarioName.includes('Hoog') || scenarioName.includes('Laag');
        if (!isWLO) {
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

  scenarioComparisons.sort((a, b) => a.scenarioName.localeCompare(b.scenarioName));

  const margin = { top: 120, right: 60, bottom: 160, left: 150 };
  const width = 1100 - margin.left - margin.right;
  const height = 500 - margin.top - margin.bottom;

  const chartGroup = canvas.append('g')
    .attr('transform', `translate(${margin.left}, ${margin.top})`);

  const x = d3.scaleBand()
    .domain(scenarioComparisons.map((d, i) => i))
    .range([0, width])
    .padding(0.3);

  const maxCapacity = d3.max(scenarioComparisons, d => d.capacity) || 100;
  const y = d3.scaleLinear()
    .domain([0, maxCapacity * 1.3])
    .range([height, 0]);

  // Get or create tooltip (reuse the existing one if available)
  let popupTooltip = d3.select('body').select('.capacity-popup-tooltip');
  if (popupTooltip.empty()) {
    popupTooltip = d3.select('body').append('div')
      .attr('class', 'capacity-popup-tooltip')
      .style('position', 'absolute')
      .style('visibility', 'hidden')
      .style('background-color', 'rgba(0, 0, 0, 0.85)')
      .style('color', 'white')
      .style('padding', '10px')
      .style('border-radius', '5px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('z-index', '10001')
      .style('box-shadow', '0 2px 4px rgba(0,0,0,0.2)');
  }

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
    .on('mouseover', function(_event, d) {
      if (d.capacity > 0 || d.volume > 0) {
        d3.select(this).style('opacity', 0.7);

        const capacityText = d.capacity > 999
          ? `${(d.capacity / 1000).toFixed(1)} GW`
          : `${Math.round(d.capacity)} MW`;
        const capacityFactor = (d.fullLoadHours / 8760) * 100;

        let volumeText;
        if (capacityEnergyUnit === 'PJ') {
          const volumePJ = d.volume / 1000000000;
          volumeText = `${volumePJ.toFixed(1)} PJ`;
        } else {
          const volumeTWh = d.volume / 3600000000;
          volumeText = `${volumeTWh.toFixed(1)} TWh`;
        }

        popupTooltip
          .style('visibility', 'visible')
          .html(`
            <strong>${d.scenarioName}</strong><br/>
            Capacity: ${capacityText}<br/>
            Volume: ${volumeText}<br/>
            Full Load Hours: ${Math.round(d.fullLoadHours)} h<br/>
            Capacity Factor: ${capacityFactor.toFixed(1)}%
          `);
      }
    })
    .on('mousemove', function(event) {
      popupTooltip
        .style('top', (event.pageY - 10) + 'px')
        .style('left', (event.pageX + 10) + 'px');
    })
    .on('mouseout', function() {
      d3.select(this).style('opacity', 1);
      popupTooltip.style('visibility', 'hidden');
    });

  chartGroup.append('g')
    .attr('transform', `translate(0, ${height})`)
    .call(d3.axisBottom(x).tickFormat((d, i) => scenarioComparisons[i].scenarioName))
    .selectAll('text')
    .style('text-anchor', 'end')
    .attr('dx', '-.8em')
    .attr('dy', '.15em')
    .attr('transform', 'rotate(-45)')
    .style('font-size', '10px');

  chartGroup.append('g')
    .call(d3.axisLeft(y).ticks(8).tickFormat(d => d > 999 ? `${(d / 1000).toFixed(1)} GW` : `${d} MW`))
    .style('font-size', '11px');

  chartGroup.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('y', -margin.left + 50)
    .attr('x', -height / 2)
    .attr('text-anchor', 'middle')
    .style('font-size', '12px')
    .style('font-weight', 'bold')
    .text('Opgesteld vermogen');
}
