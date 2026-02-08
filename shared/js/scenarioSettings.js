// Scenario Settings Module
// Manages scenario visibility settings with localStorage persistence

(function() {
  'use strict';

  const STORAGE_KEY = 'scenarioVisibilitySettings';
  const SECTION_STORAGE_KEY = 'sectionVisibilitySettings';

  let visibilitySettings = {};
  let scenarioGroups = {};
  let allScenarios = [];

  // Section visibility
  const SECTIONS = [
    { id: 'section-sankey', label: 'Energiestromen (Sankey)' },
    { id: 'section-capacity', label: 'Opgesteld vermogen' },
    { id: 'section-tvkn', label: 'Service Demand', configFlag: 'hasServiceDemandSection' },
    { id: 'section-waterfall', label: 'Finaal verbruik (waterval)' }
  ];
  let sectionVisibility = {};

  // Check if a section is disabled by viewer-config
  function isSectionEnabledByConfig(section) {
    if (!section.configFlag) return true;
    if (typeof viewerConfig !== 'undefined' && viewerConfig && viewerConfig.viewer) {
      return viewerConfig.viewer[section.configFlag] !== false;
    }
    return true;
  }

  // Load settings from localStorage
  function loadSettings() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        visibilitySettings = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to load scenario settings:', e);
      visibilitySettings = {};
    }
  }

  // Save settings to localStorage
  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visibilitySettings));
    } catch (e) {
      console.warn('Failed to save scenario settings:', e);
    }
  }

  // Load section settings from localStorage
  function loadSectionSettings() {
    try {
      const stored = localStorage.getItem(SECTION_STORAGE_KEY);
      if (stored) {
        sectionVisibility = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to load section settings:', e);
      sectionVisibility = {};
    }
    // Initialize defaults for any missing sections
    SECTIONS.forEach(s => {
      if (sectionVisibility[s.id] === undefined) {
        sectionVisibility[s.id] = true;
      }
    });
  }

  // Save section settings to localStorage
  function saveSectionSettings() {
    try {
      localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(sectionVisibility));
    } catch (e) {
      console.warn('Failed to save section settings:', e);
    }
  }

  // Check if a section is visible (respects both user toggle and viewer-config flag)
  function isSectionVisible(sectionId) {
    const section = SECTIONS.find(s => s.id === sectionId);
    if (section && !isSectionEnabledByConfig(section)) return false;
    return sectionVisibility[sectionId] !== false;
  }

  // Toggle section visibility
  function toggleSection(sectionId) {
    const wasHidden = !isSectionVisible(sectionId);
    sectionVisibility[sectionId] = !isSectionVisible(sectionId);
    saveSectionSettings();
    applySectionVisibility();

    // If section was just made visible, refresh its content
    if (wasHidden && isSectionVisible(sectionId)) {
      refreshSection(sectionId);
    }
  }

  // Refresh a section's content after it becomes visible
  function refreshSection(sectionId) {
    switch (sectionId) {
      case 'section-sankey':
      case 'section-capacity':
      case 'section-tvkn':
        // Use setScenario() which already coordinates all section updates
        // with the correct config object and has isSectionVisible guards
        if (typeof window.setScenario === 'function') {
          window.setScenario();
        }
        break;
      case 'section-waterfall':
        if (typeof switchRoutekaart === 'function') {
          try {
            switchRoutekaart({
              scenario: typeof globalActiveScenario !== 'undefined' ? globalActiveScenario.id : '',
              sector: typeof globalActiveSector !== 'undefined' ? globalActiveSector : 'alle',
              routekaart: typeof globalActiveToepassing !== 'undefined' ? globalActiveToepassing : 'alle'
            });
          } catch (e) {
            console.warn('Could not refresh waterfall:', e);
          }
        }
        break;
    }
  }

  // Apply section visibility to DOM
  function applySectionVisibility() {
    SECTIONS.forEach(section => {
      const el = document.getElementById(section.id);
      if (el) {
        // If disabled by viewer-config, always hide
        if (!isSectionEnabledByConfig(section)) {
          el.style.display = 'none';
          return;
        }
        el.style.display = isSectionVisible(section.id) ? '' : 'none';
      }
    });
  }

  // Initialize from viewer config
  function initializeFromConfig(config) {
    if (!config || !config.scenarios) return;

    allScenarios = config.scenarios;
    scenarioGroups = {};

    // Group scenarios by scenarioGroup
    config.scenarios.forEach(scenario => {
      const group = scenario.scenarioGroup || 'Ungrouped';
      if (!scenarioGroups[group]) {
        scenarioGroups[group] = [];
      }
      scenarioGroups[group].push(scenario);

      // Initialize visibility if not set
      if (visibilitySettings[scenario.id] === undefined) {
        visibilitySettings[scenario.id] = true; // default: visible
      }
    });

    // Initialize group visibility
    Object.keys(scenarioGroups).forEach(groupName => {
      const groupKey = `group:${groupName}`;
      if (visibilitySettings[groupKey] === undefined) {
        visibilitySettings[groupKey] = true; // default: visible
      }
    });

    saveSettings();
  }

  // Check if a scenario is visible
  function isScenarioVisible(scenarioId) {
    const scenario = allScenarios.find(s => s.id === scenarioId);
    if (!scenario) return true;

    const groupKey = `group:${scenario.scenarioGroup || 'Ungrouped'}`;
    const groupVisible = visibilitySettings[groupKey] !== false;
    const scenarioVisible = visibilitySettings[scenarioId] !== false;

    return groupVisible && scenarioVisible;
  }

  // Get filtered scenarios list
  function getVisibleScenarios() {
    return allScenarios.filter(s => isScenarioVisible(s.id));
  }

  // Toggle group visibility
  function toggleGroup(groupName) {
    const groupKey = `group:${groupName}`;
    visibilitySettings[groupKey] = !visibilitySettings[groupKey];
    saveSettings();
  }

  // Toggle individual scenario visibility
  function toggleScenario(scenarioId) {
    visibilitySettings[scenarioId] = !visibilitySettings[scenarioId];
    saveSettings();
  }

  // Set group visibility
  function setGroupVisibility(groupName, visible) {
    const groupKey = `group:${groupName}`;
    visibilitySettings[groupKey] = visible;
    saveSettings();
  }

  // Set scenario visibility
  function setScenarioVisibility(scenarioId, visible) {
    visibilitySettings[scenarioId] = visible;
    saveSettings();
  }

  // Get group visibility status
  function isGroupVisible(groupName) {
    const groupKey = `group:${groupName}`;
    return visibilitySettings[groupKey] !== false;
  }

  // Create settings button and replace top-right label
  function createSettingsButton() {
    const topRightLabel = document.getElementById('topRightLabel');
    if (!topRightLabel) return;

    // Clear existing content
    topRightLabel.innerHTML = '';
    topRightLabel.style.cssText = 'float: right; cursor: pointer;';

    // Create settings icon button with cog wheel icon
    const settingsBtn = document.createElement('button');
    settingsBtn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    `;
    settingsBtn.title = 'Scenario Settings';
    settingsBtn.style.cssText = `
      background: transparent;
      border: none;
      padding: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      transition: opacity 0.2s;
      margin: 10px 15px 0 0;
      opacity: 0.9;
    `;

    settingsBtn.addEventListener('mouseenter', function() {
      this.style.opacity = '1';
    });

    settingsBtn.addEventListener('mouseleave', function() {
      this.style.opacity = '0.9';
    });

    settingsBtn.addEventListener('click', openSettingsPopup);

    topRightLabel.appendChild(settingsBtn);
  }

  // Create settings popup
  function openSettingsPopup() {
    // Remove existing popup if any
    const existingPopup = document.getElementById('scenario-settings-popup');
    if (existingPopup) {
      existingPopup.remove();
      return;
    }

    // Track expanded state of groups
    const expandedGroups = new Set();

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'scenario-settings-popup';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(2px);
    `;

    // Create popup content
    const popup = document.createElement('div');
    popup.style.cssText = `
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05);
      max-width: 1000px;
      max-height: 85vh;
      width: 90%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 20px 24px;
      border-bottom: 1px solid #d8d8d8;
      display: flex;
      flex-direction: column;
      gap: 6px;
      background: #f0f2f5;
    `;

    const title = document.createElement('h2');
    title.textContent = 'Instellingen';
    title.style.cssText = 'margin: 0; font-size: 18px; font-weight: 600; color: #1a1a1a; letter-spacing: -0.02em;';

    const subtitle = document.createElement('p');
    subtitle.textContent = 'Selecteer welke secties en scenario\'s je in de viewer wilt tonen';
    subtitle.style.cssText = 'margin: 0; font-size: 13px; color: #5a5a5a; font-weight: 400;';

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
      background: transparent;
      border: none;
      font-size: 28px;
      cursor: pointer;
      color: #888;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      padding: 0;
      line-height: 1;
      transition: all 0.15s ease;
      position: absolute;
      top: 16px;
      right: 20px;
    `;

    closeBtn.addEventListener('mouseenter', function() {
      this.style.backgroundColor = '#e0e0e0';
      this.style.color = '#333';
    });
    closeBtn.addEventListener('mouseleave', function() {
      this.style.backgroundColor = 'transparent';
      this.style.color = '#888';
    });
    closeBtn.addEventListener('click', () => overlay.remove());

    header.appendChild(title);
    header.appendChild(subtitle);
    popup.appendChild(closeBtn);

    // Content area (scrollable) - two column masonry-like layout
    const content = document.createElement('div');
    content.style.cssText = `
      padding: 16px 24px;
      overflow-y: auto;
      flex: 1;
      background: #fafafa;
      columns: 2;
      column-gap: 12px;
    `;

    // Scenario's title spanning both columns
    const scenarioSectionTitle = document.createElement('div');
    scenarioSectionTitle.style.cssText = 'column-span: all; font-size: 13px; font-weight: 600; color: #2c3e50; margin-bottom: 8px;';
    scenarioSectionTitle.textContent = "Scenario's";
    content.appendChild(scenarioSectionTitle);

    // Build groups UI
    const sortedGroups = Object.keys(scenarioGroups).sort();
    sortedGroups.forEach((groupName, index) => {
      const groupDiv = document.createElement('div');
      groupDiv.style.cssText = `
        margin-bottom: 12px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        overflow: hidden;
        background: white;
        box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        break-inside: avoid;
      `;

      // Group header
      const groupHeader = document.createElement('div');
      groupHeader.style.cssText = `
        padding: 10px 14px;
        background: linear-gradient(to bottom, #f9fafb 0%, #f5f6f7 100%);
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
        user-select: none;
        transition: background 0.15s ease;
      `;

      // Create custom toggle button for group
      const groupToggleContainer = document.createElement('div');
      groupToggleContainer.style.cssText = `
        width: 44px;
        height: 24px;
        background: ${isGroupVisible(groupName) ? '#14B8A6' : '#ccc'};
        border-radius: 12px;
        position: relative;
        cursor: pointer;
        transition: background 0.3s ease;
        flex-shrink: 0;
      `;

      const groupToggleCircle = document.createElement('div');
      groupToggleCircle.style.cssText = `
        width: 18px;
        height: 18px;
        background: white;
        border-radius: 50%;
        position: absolute;
        top: 3px;
        left: ${isGroupVisible(groupName) ? '23px' : '3px'};
        transition: left 0.3s ease;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      `;

      groupToggleContainer.appendChild(groupToggleCircle);

      groupToggleContainer.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleGroup(groupName);
        refreshPopupContent();
        notifyScenarioChange();
      });

      const groupTitle = document.createElement('strong');
      groupTitle.textContent = groupName;
      groupTitle.style.cssText = 'flex: 1; font-size: 13px; color: #2c3e50; font-weight: 600; line-height: 1.3;';

      const groupCount = document.createElement('span');
      const visibleCount = scenarioGroups[groupName].filter(s => isScenarioVisible(s.id)).length;
      const totalCount = scenarioGroups[groupName].length;
      groupCount.textContent = `${visibleCount}/${totalCount}`;
      groupCount.style.cssText = `
        font-size: 11px;
        color: #7f8c8d;
        background: white;
        padding: 2px 7px;
        border-radius: 10px;
        font-weight: 500;
        border: 1px solid #e0e0e0;
        flex-shrink: 0;
      `;

      const expandIcon = document.createElement('span');
      expandIcon.innerHTML = '▼';
      expandIcon.style.cssText = 'font-size: 8px; color: #95a5a6; transition: transform 0.2s ease; flex-shrink: 0;';

      groupHeader.appendChild(groupToggleContainer);
      groupHeader.appendChild(groupTitle);
      groupHeader.appendChild(groupCount);
      groupHeader.appendChild(expandIcon);

      // Scenarios list (collapsible)
      const scenariosList = document.createElement('div');
      scenariosList.style.cssText = `
        display: none;
        padding: 8px 14px;
        background: #fcfcfc;
        border-top: 1px solid #ececec;
      `;

      scenarioGroups[groupName].forEach((scenario, idx) => {
        const scenarioDiv = document.createElement('div');
        scenarioDiv.style.cssText = `
          padding: 7px 10px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding-left: 26px;
          border-radius: 5px;
          transition: background 0.15s ease;
          ${idx > 0 ? 'border-top: 1px solid #f0f0f0;' : ''}
        `;
        scenarioDiv.addEventListener('mouseenter', function() {
          if (isGroupVisible(groupName)) {
            this.style.background = '#f5f7fa';
          }
        });
        scenarioDiv.addEventListener('mouseleave', function() {
          this.style.background = 'transparent';
        });

        // Create custom toggle button for scenario
        const isScenarioChecked = visibilitySettings[scenario.id] !== false;
        const isEnabled = isGroupVisible(groupName);

        const scenarioToggleContainer = document.createElement('div');
        scenarioToggleContainer.style.cssText = `
          width: 44px;
          height: 24px;
          background: ${isScenarioChecked && isEnabled ? '#14B8A6' : '#ccc'};
          border-radius: 12px;
          position: relative;
          cursor: ${isEnabled ? 'pointer' : 'not-allowed'};
          transition: background 0.3s ease;
          flex-shrink: 0;
          opacity: ${isEnabled ? '1' : '0.5'};
        `;

        const scenarioToggleCircle = document.createElement('div');
        scenarioToggleCircle.style.cssText = `
          width: 18px;
          height: 18px;
          background: white;
          border-radius: 50%;
          position: absolute;
          top: 3px;
          left: ${isScenarioChecked ? '23px' : '3px'};
          transition: left 0.3s ease;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        `;

        scenarioToggleContainer.appendChild(scenarioToggleCircle);

        scenarioToggleContainer.addEventListener('click', function() {
          if (isGroupVisible(groupName)) {
            toggleScenario(scenario.id);
            refreshPopupContent();
            notifyScenarioChange();
          }
        });

        const scenarioLabel = document.createElement('label');
        scenarioLabel.textContent = scenario.title;
        scenarioLabel.style.cssText = `
          font-size: 12px;
          color: ${!isGroupVisible(groupName) ? '#bdc3c7' : '#34495e'};
          cursor: pointer;
          user-select: none;
          flex: 1;
          line-height: 1.3;
        `;
        scenarioLabel.addEventListener('click', function() {
          if (isGroupVisible(groupName)) {
            toggleScenario(scenario.id);
            refreshPopupContent();
            notifyScenarioChange();
          }
        });

        scenarioDiv.appendChild(scenarioToggleContainer);
        scenarioDiv.appendChild(scenarioLabel);
        scenariosList.appendChild(scenarioDiv);
      });

      // Toggle expand/collapse
      groupHeader.addEventListener('click', function(e) {
        if (e.target === groupToggleContainer || groupToggleContainer.contains(e.target)) return;
        if (expandedGroups.has(groupName)) {
          expandedGroups.delete(groupName);
          scenariosList.style.display = 'none';
          expandIcon.style.transform = 'rotate(0deg)';
        } else {
          expandedGroups.add(groupName);
          scenariosList.style.display = 'block';
          expandIcon.style.transform = 'rotate(-180deg)';
        }
      });

      groupDiv.appendChild(groupHeader);
      groupDiv.appendChild(scenariosList);
      content.appendChild(groupDiv);
    });

    // Footer with action buttons
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 14px 24px;
      border-top: 1px solid #e8e8e8;
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      background: white;
    `;

    const showAllBtn = document.createElement('button');
    showAllBtn.textContent = 'Alles tonen';
    showAllBtn.style.cssText = `
      padding: 8px 16px;
      background: white;
      border: 1px solid #d0d7de;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      color: #24292f;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    `;
    showAllBtn.addEventListener('mouseenter', function() {
      this.style.background = '#f6f8fa';
      this.style.borderColor = '#bcc5cf';
    });
    showAllBtn.addEventListener('mouseleave', function() {
      this.style.background = 'white';
      this.style.borderColor = '#d0d7de';
    });
    showAllBtn.addEventListener('click', function() {
      Object.keys(scenarioGroups).forEach(g => setGroupVisibility(g, true));
      allScenarios.forEach(s => setScenarioVisibility(s.id, true));
      refreshPopupContent();
      notifyScenarioChange();
    });

    const hideAllBtn = document.createElement('button');
    hideAllBtn.textContent = 'Alles verbergen';
    hideAllBtn.style.cssText = `
      padding: 8px 16px;
      background: white;
      border: 1px solid #d0d7de;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      color: #24292f;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    `;
    hideAllBtn.addEventListener('mouseenter', function() {
      this.style.background = '#f6f8fa';
      this.style.borderColor = '#bcc5cf';
    });
    hideAllBtn.addEventListener('mouseleave', function() {
      this.style.background = 'white';
      this.style.borderColor = '#d0d7de';
    });
    hideAllBtn.addEventListener('click', function() {
      Object.keys(scenarioGroups).forEach(g => setGroupVisibility(g, false));
      allScenarios.forEach(s => setScenarioVisibility(s.id, false));
      refreshPopupContent();
      notifyScenarioChange();
    });

    const doneBtn = document.createElement('button');
    doneBtn.textContent = 'Done';
    doneBtn.style.cssText = `
      padding: 8px 20px;
      background: #0969da;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: background 0.15s ease;
      box-shadow: 0 1px 3px rgba(9, 105, 218, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    `;
    doneBtn.addEventListener('mouseenter', function() {
      this.style.background = '#0860ca';
    });
    doneBtn.addEventListener('mouseleave', function() {
      this.style.background = '#0969da';
    });
    doneBtn.addEventListener('click', () => {
      // Check if current scenario is still visible
      if (typeof window.globalActiveScenario !== 'undefined' && window.globalActiveScenario && window.globalActiveScenario.id) {
        if (!isScenarioVisible(window.globalActiveScenario.id)) {
          // Current scenario is hidden, select first visible scenario
          const visibleScenarios = getVisibleScenarios();
          if (visibleScenarios.length > 0) {
            window.globalActiveScenario.id = visibleScenarios[0].id;
            window.globalActiveScenario.title = visibleScenarios[0].title;
            // Trigger a final update to refresh the viewer with the new scenario
            notifyScenarioChange();
          }
        }
      }
      overlay.remove();
    });

    footer.appendChild(showAllBtn);
    footer.appendChild(hideAllBtn);
    footer.appendChild(doneBtn);

    // Section toggles panel
    const sectionPanel = document.createElement('div');
    sectionPanel.style.cssText = `
      padding: 16px 24px;
      border-bottom: 1px solid #d8d8d8;
      background: #fafafa;
    `;

    const sectionTitle = document.createElement('div');
    sectionTitle.style.cssText = 'font-size: 13px; font-weight: 600; color: #2c3e50; margin-bottom: 10px;';
    sectionTitle.textContent = 'Secties';
    sectionPanel.appendChild(sectionTitle);

    const sectionGrid = document.createElement('div');
    sectionGrid.id = 'section-toggles-grid';
    sectionGrid.style.cssText = `
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    `;

    function buildSectionToggles() {
      sectionGrid.innerHTML = '';
      SECTIONS.filter(s => isSectionEnabledByConfig(s)).forEach(section => {
        const visible = isSectionVisible(section.id);
        const item = document.createElement('div');
        item.style.cssText = `
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.15s ease;
        `;
        item.addEventListener('mouseenter', function() { this.style.background = '#f5f7fa'; });
        item.addEventListener('mouseleave', function() { this.style.background = 'white'; });

        const toggle = document.createElement('div');
        toggle.style.cssText = `
          width: 44px;
          height: 24px;
          background: ${visible ? '#3B82F6' : '#ccc'};
          border-radius: 12px;
          position: relative;
          transition: background 0.3s ease;
          flex-shrink: 0;
        `;

        const circle = document.createElement('div');
        circle.style.cssText = `
          width: 18px;
          height: 18px;
          background: white;
          border-radius: 50%;
          position: absolute;
          top: 3px;
          left: ${visible ? '23px' : '3px'};
          transition: left 0.3s ease;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        `;
        toggle.appendChild(circle);

        const label = document.createElement('span');
        label.textContent = section.label;
        label.style.cssText = 'font-size: 12px; color: #34495e; user-select: none;';

        item.appendChild(toggle);
        item.appendChild(label);

        item.addEventListener('click', function() {
          toggleSection(section.id);
          buildSectionToggles();
        });

        sectionGrid.appendChild(item);
      });
    }

    buildSectionToggles();
    sectionPanel.appendChild(sectionGrid);

    popup.appendChild(header);
    popup.appendChild(sectionPanel);
    popup.appendChild(content);
    popup.appendChild(footer);
    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) {
        overlay.remove();
      }
    });

    // Helper to refresh popup content
    function refreshPopupContent() {
      content.innerHTML = '';
      // Re-add Scenario's title
      const scenarioTitle = document.createElement('div');
      scenarioTitle.style.cssText = 'column-span: all; font-size: 13px; font-weight: 600; color: #2c3e50; margin-bottom: 8px;';
      scenarioTitle.textContent = "Scenario's";
      content.appendChild(scenarioTitle);

      const sortedGroups = Object.keys(scenarioGroups).sort();
      sortedGroups.forEach((groupName, index) => {
        const groupDiv = document.createElement('div');
        groupDiv.style.cssText = `
          margin-bottom: 12px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          overflow: hidden;
          background: white;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
          break-inside: avoid;
        `;

        const groupHeader = document.createElement('div');
        groupHeader.style.cssText = `
          padding: 10px 14px;
          background: linear-gradient(to bottom, #f9fafb 0%, #f5f6f7 100%);
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          user-select: none;
          transition: background 0.15s ease;
        `;

        // Create custom toggle button for group (in refresh)
        const groupToggleContainer = document.createElement('div');
        groupToggleContainer.style.cssText = `
          width: 44px;
          height: 24px;
          background: ${isGroupVisible(groupName) ? '#14B8A6' : '#ccc'};
          border-radius: 12px;
          position: relative;
          cursor: pointer;
          transition: background 0.3s ease;
          flex-shrink: 0;
        `;

        const groupToggleCircle = document.createElement('div');
        groupToggleCircle.style.cssText = `
          width: 18px;
          height: 18px;
          background: white;
          border-radius: 50%;
          position: absolute;
          top: 3px;
          left: ${isGroupVisible(groupName) ? '23px' : '3px'};
          transition: left 0.3s ease;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        `;

        groupToggleContainer.appendChild(groupToggleCircle);

        groupToggleContainer.addEventListener('click', function(e) {
          e.stopPropagation();
          toggleGroup(groupName);
          refreshPopupContent();
          notifyScenarioChange();
        });

        const groupTitle = document.createElement('strong');
        groupTitle.textContent = groupName;
        groupTitle.style.cssText = 'flex: 1; font-size: 13px; color: #2c3e50; font-weight: 600; line-height: 1.3;';

        const groupCount = document.createElement('span');
        const visibleCount = scenarioGroups[groupName].filter(s => isScenarioVisible(s.id)).length;
        const totalCount = scenarioGroups[groupName].length;
        groupCount.textContent = `${visibleCount}/${totalCount}`;
        groupCount.style.cssText = `
          font-size: 11px;
          color: #7f8c8d;
          background: white;
          padding: 2px 7px;
          border-radius: 10px;
          font-weight: 500;
          border: 1px solid #e0e0e0;
          flex-shrink: 0;
        `;

        const expandIcon = document.createElement('span');
        expandIcon.innerHTML = '▼';
        expandIcon.style.cssText = 'font-size: 8px; color: #95a5a6; transition: transform 0.2s ease; flex-shrink: 0;';

        groupHeader.appendChild(groupToggleContainer);
        groupHeader.appendChild(groupTitle);
        groupHeader.appendChild(groupCount);
        groupHeader.appendChild(expandIcon);

        const scenariosList = document.createElement('div');
        const isExpanded = expandedGroups.has(groupName);
        scenariosList.style.cssText = `
          display: ${isExpanded ? 'block' : 'none'};
          padding: 8px 14px;
          background: #fcfcfc;
          border-top: 1px solid #ececec;
        `;
        expandIcon.style.transform = isExpanded ? 'rotate(-180deg)' : 'rotate(0deg)';

        scenarioGroups[groupName].forEach((scenario, idx) => {
          const scenarioDiv = document.createElement('div');
          scenarioDiv.style.cssText = `
            padding: 7px 10px;
            display: flex;
            align-items: center;
            gap: 10px;
            padding-left: 26px;
            border-radius: 5px;
            transition: background 0.15s ease;
            ${idx > 0 ? 'border-top: 1px solid #f0f0f0;' : ''}
          `;
          scenarioDiv.addEventListener('mouseenter', function() {
            if (isGroupVisible(groupName)) {
              this.style.background = '#f5f7fa';
            }
          });
          scenarioDiv.addEventListener('mouseleave', function() {
            this.style.background = 'transparent';
          });

          // Create custom toggle button for scenario (in refresh)
          const isScenarioChecked = visibilitySettings[scenario.id] !== false;
          const isEnabled = isGroupVisible(groupName);

          const scenarioToggleContainer = document.createElement('div');
          scenarioToggleContainer.style.cssText = `
            width: 44px;
            height: 24px;
            background: ${isScenarioChecked && isEnabled ? '#14B8A6' : '#ccc'};
            border-radius: 12px;
            position: relative;
            cursor: ${isEnabled ? 'pointer' : 'not-allowed'};
            transition: background 0.3s ease;
            flex-shrink: 0;
            opacity: ${isEnabled ? '1' : '0.5'};
          `;

          const scenarioToggleCircle = document.createElement('div');
          scenarioToggleCircle.style.cssText = `
            width: 18px;
            height: 18px;
            background: white;
            border-radius: 50%;
            position: absolute;
            top: 3px;
            left: ${isScenarioChecked ? '23px' : '3px'};
            transition: left 0.3s ease;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          `;

          scenarioToggleContainer.appendChild(scenarioToggleCircle);

          scenarioToggleContainer.addEventListener('click', function() {
            if (isGroupVisible(groupName)) {
              toggleScenario(scenario.id);
              refreshPopupContent();
              notifyScenarioChange();
            }
          });

          const scenarioLabel = document.createElement('label');
          scenarioLabel.textContent = scenario.title;
          scenarioLabel.style.cssText = `
            font-size: 12px;
            color: ${!isGroupVisible(groupName) ? '#bdc3c7' : '#34495e'};
            cursor: pointer;
            user-select: none;
            flex: 1;
            line-height: 1.3;
          `;
          scenarioLabel.addEventListener('click', function() {
            if (isGroupVisible(groupName)) {
              toggleScenario(scenario.id);
              refreshPopupContent();
              notifyScenarioChange();
            }
          });

          scenarioDiv.appendChild(scenarioToggleContainer);
          scenarioDiv.appendChild(scenarioLabel);
          scenariosList.appendChild(scenarioDiv);
        });

        groupHeader.addEventListener('click', function(e) {
          if (e.target === groupToggleContainer || groupToggleContainer.contains(e.target)) return;
          if (expandedGroups.has(groupName)) {
            expandedGroups.delete(groupName);
            scenariosList.style.display = 'none';
            expandIcon.style.transform = 'rotate(0deg)';
          } else {
            expandedGroups.add(groupName);
            scenariosList.style.display = 'block';
            expandIcon.style.transform = 'rotate(-180deg)';
          }
        });

        groupDiv.appendChild(groupHeader);
        groupDiv.appendChild(scenariosList);
        content.appendChild(groupDiv);
      });
    }
  }

  // Notify other components of scenario visibility changes
  function notifyScenarioChange() {
    // Dispatch custom event for other components to listen to
    window.dispatchEvent(new CustomEvent('scenarioVisibilityChanged', {
      detail: {
        visibleScenarios: getVisibleScenarios(),
        settings: visibilitySettings
      }
    }));
  }

  // Initialize
  loadSettings();
  loadSectionSettings();

  // Public API
  window.ScenarioSettings = {
    initialize: function(viewerConfig) {
      initializeFromConfig(viewerConfig);
      createSettingsButton();
      applySectionVisibility();
    },
    isScenarioVisible,
    getVisibleScenarios,
    toggleGroup,
    toggleScenario,
    setGroupVisibility,
    setScenarioVisibility,
    isGroupVisible,
    isSectionVisible,
    toggleSection,
    applySectionVisibility,
    getSettings: () => visibilitySettings,
    getAllScenarios: () => allScenarios,
    getScenarioGroups: () => scenarioGroups
  };

})();
