// Scenario Settings Module
// Manages scenario visibility settings with localStorage persistence

(function() {
  'use strict';

  const STORAGE_KEY = 'scenarioVisibilitySettings';
  const SECTION_STORAGE_KEY = 'sectionVisibilitySettings';
  const YEAR_STORAGE_KEY = 'yearVisibilitySettings';

  let visibilitySettings = {};
  let scenarioGroups = {};
  let allScenarios = [];

  // Year visibility: the years of viewer-config.json, each shown unless
  // switched off here
  let allYears = [];
  let yearVisibility = {};

  // Section visibility, in page order
  const SECTIONS = [
    { id: 'section-sankey', label: 'Energiestromen (Sankey)' },
    { id: 'section-treemaps', label: 'Treemaps en staafdiagrammen', configFlag: 'hasCarrierTreemaps' },
    { id: 'section-ternary', label: 'Energiemix-trajecten', configFlag: 'hasTernaryMix' },
    { id: 'section-capacity', label: 'Opgesteld vermogen', configFlag: 'hasCapacityVisualization' },
    { id: 'section-tvkn', label: 'Service Demand', configFlag: 'hasServiceDemandSection' },
    { id: 'section-3dplot', label: 'Scenariotrajecten 2030–2050', configFlag: 'has3DPlot' },
    { id: 'section-waterfall', label: 'Watervaldiagram finaal verbruik' }
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

  // A section gets a toggle only when this viewer's page has it and its
  // viewer-config flag allows it
  function isSectionAvailable(section) {
    return isSectionEnabledByConfig(section) && !!document.getElementById(section.id);
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
    // Initialize defaults for any missing sections: visible, unless the
    // viewer's page marks the section with data-default-hidden
    SECTIONS.forEach(s => {
      if (sectionVisibility[s.id] === undefined) {
        const el = document.getElementById(s.id);
        sectionVisibility[s.id] = !(el && el.hasAttribute('data-default-hidden'));
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
      // These re-render when their container regains its width; the update
      // also covers browsers without ResizeObserver
      case 'section-treemaps':
        if (typeof window.updateCarrierTreemaps === 'function') window.updateCarrierTreemaps();
        break;
      case 'section-ternary':
        if (typeof window.updateTernaryMix === 'function') window.updateTernaryMix();
        break;
      case 'section-3dplot':
        if (typeof window.update3DPlotScenario === 'function') window.update3DPlotScenario();
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
    allYears = config.years || [];
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
    const newValue = !visibilitySettings[groupKey];
    visibilitySettings[groupKey] = newValue;
    // When enabling a group, also enable all its individual scenarios
    if (newValue && scenarioGroups[groupName]) {
      scenarioGroups[groupName].forEach(s => {
        visibilitySettings[s.id] = true;
      });
    }
    saveSettings();
  }

  // Toggle individual scenario visibility
  function toggleScenario(scenarioId) {
    const newValue = !visibilitySettings[scenarioId];
    visibilitySettings[scenarioId] = newValue;
    // If enabling a scenario whose group is hidden, also enable the group
    if (newValue) {
      const scenario = allScenarios.find(s => s.id === scenarioId);
      if (scenario) {
        const groupKey = `group:${scenario.scenarioGroup || 'Ungrouped'}`;
        if (visibilitySettings[groupKey] === false) {
          visibilitySettings[groupKey] = true;
        }
      }
    }
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

  // Load year settings from localStorage
  function loadYearSettings() {
    try {
      const stored = localStorage.getItem(YEAR_STORAGE_KEY);
      if (stored) {
        yearVisibility = JSON.parse(stored) || {};
      }
    } catch (e) {
      console.warn('Failed to load year settings:', e);
      yearVisibility = {};
    }
  }

  // Save year settings to localStorage
  function saveYearSettings() {
    try {
      localStorage.setItem(YEAR_STORAGE_KEY, JSON.stringify(yearVisibility));
    } catch (e) {
      console.warn('Failed to save year settings:', e);
    }
  }

  // Check if a year is included in the viewer
  function isYearVisible(yearId) {
    return yearVisibility[String(yearId)] !== false;
  }

  // Get the years that are included in the viewer
  function getVisibleYears() {
    return allYears.filter(y => isYearVisible(y.id));
  }

  // Show or hide a set of years in one go; at least one year stays visible
  function setYearsVisible(isVisible) {
    const next = {};
    allYears.forEach(y => { next[String(y.id)] = !!isVisible(y); });
    if (allYears.length && !allYears.some(y => next[String(y.id)])) return;
    Object.assign(yearVisibility, next);
    saveYearSettings();
    notifyYearChange();
  }

  // Toggle a year; the last visible year cannot be switched off
  function toggleYear(yearId) {
    const key = String(yearId);
    setYearsVisible(y => String(y.id) === key ? !isYearVisible(key) : isYearVisible(y.id));
  }

  // Notify other components of year visibility changes
  function notifyYearChange() {
    window.dispatchEvent(new CustomEvent('yearVisibilityChanged', {
      detail: { visibleYears: getVisibleYears() }
    }));
  }

  // Distance of the cog wheel buttons from the right edge of their bar (px)
  const COG_RIGHT = 15;

  // Create settings button and replace top-right label
  function createSettingsButton() {
    const topRightLabel = document.getElementById('topRightLabel');
    if (topRightLabel) {
      // Clear existing content
      topRightLabel.innerHTML = '';
      topRightLabel.style.cssText = 'float: right; cursor: pointer;';
      topRightLabel.appendChild(createCogButton(`margin: 10px ${COG_RIGHT}px 0 0;`));
    }

    // A second button at the top right of the menu bar, so the settings stay
    // within reach when the menu sticks while scrolling. Same size and same
    // distance from the right edge as the one above, so the two line up.
    const menu = document.getElementById('menuContainer');
    if (menu && !document.getElementById('menuSettingsButton')) {
      if (getComputedStyle(menu).position === 'static') menu.style.position = 'relative';
      const menuBtn = createCogButton(`position: absolute; top: 4px; right: ${COG_RIGHT}px; z-index: 21; margin: 0;`);
      menuBtn.id = 'menuSettingsButton';
      menu.appendChild(menuBtn);
    }
  }

  // Settings icon button with cog wheel icon
  function createCogButton(extraStyle) {
    const settingsBtn = document.createElement('button');
    settingsBtn.type = 'button';
    settingsBtn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    `;
    settingsBtn.title = 'Instellingen';
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
      opacity: 0.9;
      ${extraStyle}
    `;

    settingsBtn.addEventListener('mouseenter', function() {
      this.style.opacity = '1';
    });

    settingsBtn.addEventListener('mouseleave', function() {
      this.style.opacity = '0.9';
    });

    settingsBtn.addEventListener('click', openSettingsPopup);

    return settingsBtn;
  }

  // Show or hide one scenario. A scenario of a group that is switched off as
  // a whole comes back on its own, without the rest of its group.
  function setScenarioShown(scenario, shown) {
    const groupName = scenario.scenarioGroup || 'Ungrouped';
    if (shown && !isGroupVisible(groupName)) {
      (scenarioGroups[groupName] || []).forEach(s => { visibilitySettings[s.id] = false; });
      visibilitySettings[`group:${groupName}`] = true;
    }
    visibilitySettings[scenario.id] = shown;
    saveSettings();
  }

  // Show or hide all scenarios of a group
  function setGroupShown(groupName, shown) {
    visibilitySettings[`group:${groupName}`] = shown;
    if (shown) {
      (scenarioGroups[groupName] || []).forEach(s => { visibilitySettings[s.id] = true; });
    }
    saveSettings();
  }

  // Styles of the settings popup. Scoped to its id, which also outranks the
  // viewer's base stylesheet (Milligram) for buttons. Sizes are in px: the
  // viewers set the root font size to 62.5%.
  function injectSettingsStyles() {
    if (document.getElementById('fst-styles')) return;
    const INK = { text: '#2B2B2B', muted: '#8A857D', faint: '#A39D93', line: '#DCD7CF', panel: '#F5F3EF', hover: '#EAE6E0' };
    const style = document.createElement('style');
    style.id = 'fst-styles';
    style.textContent = `
#scenario-settings-popup{position:fixed;top:0;right:0;bottom:0;left:0;z-index:10000;display:flex;align-items:center;
  justify-content:center;background:rgba(30,28,25,.42)}
#scenario-settings-popup *{box-sizing:border-box}
#scenario-settings-popup .fst-panel{display:flex;flex-direction:column;width:880px;max-width:calc(100vw - 48px);
  max-height:calc(100vh - 48px);background:${INK.panel};border-radius:12px;overflow:hidden;color:${INK.text};
  font-size:13px;line-height:1.4;text-align:left}
#scenario-settings-popup button{margin:0;height:auto;min-height:0;padding:6px 11px;font:inherit;font-size:12px;
  font-weight:400;line-height:1.3;letter-spacing:normal;text-transform:none;text-decoration:none;white-space:nowrap;
  color:${INK.text};background:#fff;border:1px solid transparent;border-radius:3px;box-shadow:none;cursor:pointer;
  transition:background .15s ease,color .15s ease,border-color .15s ease,box-shadow .15s ease}
#scenario-settings-popup button:hover,#scenario-settings-popup button:focus{color:${INK.text};background:#fff;
  border-color:transparent;outline:none}
#scenario-settings-popup button:focus-visible{outline:2px solid ${INK.muted};outline-offset:2px}

#scenario-settings-popup .fst-head{display:flex;align-items:flex-start;justify-content:space-between;gap:32px;
  flex:none;padding:28px 36px 0}
#scenario-settings-popup .fst-title{font-size:20px;font-weight:600;line-height:1.25;letter-spacing:-.2px}
#scenario-settings-popup .fst-sub{margin-top:6px;font-size:12px;color:${INK.muted}}
#scenario-settings-popup button.fst-close{display:inline-flex;align-items:center;justify-content:center;flex:none;
  width:30px;height:30px;padding:0;background:none;color:${INK.muted}}
#scenario-settings-popup button.fst-close:hover,#scenario-settings-popup button.fst-close:focus{background:${INK.hover};
  color:${INK.text}}

#scenario-settings-popup .fst-body{flex:1 1 auto;min-height:0;overflow-y:auto;padding:4px 36px 24px}
#scenario-settings-popup .fst-block{padding-top:24px}
#scenario-settings-popup .fst-block-head{display:flex;align-items:center;gap:6px;min-height:26px;margin-bottom:8px}
#scenario-settings-popup .fst-block-title{font-size:11px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;
  color:${INK.muted}}
#scenario-settings-popup .fst-count{margin:0 10px 0 2px;font-size:12px;color:#C6C0B6;font-variant-numeric:tabular-nums}
#scenario-settings-popup .fst-spacer{flex:1}
#scenario-settings-popup button.fst-link{padding:5px 8px;background:none;color:${INK.muted}}
#scenario-settings-popup button.fst-link:hover,#scenario-settings-popup button.fst-link:focus{background:${INK.hover};
  color:${INK.text}}

/* A chip is a switch: filled when shown, an outline when hidden - like the
   available and unavailable buttons in the viewer's menu */
#scenario-settings-popup .fst-chips{display:flex;flex-wrap:wrap;gap:6px}
#scenario-settings-popup button.fst-chip{background:var(--fst-chip,#fff);font-variant-numeric:tabular-nums}
#scenario-settings-popup button.fst-chip:hover,#scenario-settings-popup button.fst-chip:focus{
  background:var(--fst-chip,#fff);box-shadow:inset 0 0 0 1px rgba(43,43,43,.28)}
#scenario-settings-popup button.fst-chip.is-off{background:transparent;border-color:${INK.line};color:${INK.faint}}
#scenario-settings-popup button.fst-chip.is-off:hover,#scenario-settings-popup button.fst-chip.is-off:focus{
  background:transparent;border-color:${INK.muted};color:${INK.text};box-shadow:none}

#scenario-settings-popup .fst-group{margin-top:14px}
#scenario-settings-popup .fst-group:first-child{margin-top:0}
#scenario-settings-popup button.fst-group-title{display:inline-flex;align-items:baseline;gap:8px;max-width:100%;
  margin-bottom:5px;padding:2px 0;background:none;font-weight:500}
#scenario-settings-popup button.fst-group-title:hover,#scenario-settings-popup button.fst-group-title:focus{
  background:none}
#scenario-settings-popup button.fst-group-title:hover .fst-group-name{text-decoration:underline;
  text-decoration-color:#C6C0B6;text-underline-offset:3px}
#scenario-settings-popup .fst-group-name{overflow:hidden;text-overflow:ellipsis}
#scenario-settings-popup .fst-group-count{font-weight:400;color:#C6C0B6;font-variant-numeric:tabular-nums}

/* The hairline shows where a longer list scrolls under the footer */
#scenario-settings-popup .fst-foot{display:flex;justify-content:flex-end;flex:none;margin:0 36px;padding:18px 0 26px;
  border-top:1px solid #E7E3DC}
#scenario-settings-popup button.fst-done{padding:8px 24px;background:${INK.text};border-color:${INK.text};color:#fff}
#scenario-settings-popup button.fst-done:hover,#scenario-settings-popup button.fst-done:focus{background:#4A4A4A;
  border-color:#4A4A4A;color:#fff}
`;
    document.head.appendChild(style);
  }

  let settingsKeyHandler = null;

  // Create settings popup
  function openSettingsPopup() {
    // Remove existing popup if any
    const existingPopup = document.getElementById('scenario-settings-popup');
    if (existingPopup) {
      closeSettingsPopup();
      return;
    }

    injectSettingsStyles();

    const el = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };

    // A chip that switches something on or off
    const chip = (text, isOn, onClick, color) => {
      const node = el('button', 'fst-chip' + (isOn ? '' : ' is-off'), text);
      node.type = 'button';
      node.setAttribute('aria-pressed', isOn ? 'true' : 'false');
      if (color) node.style.setProperty('--fst-chip', color);
      node.addEventListener('click', onClick);
      return node;
    };

    // A block: a heading with a count and shortcuts, and the chips below
    const block = (title, links) => {
      const root = el('div', 'fst-block');
      const head = el('div', 'fst-block-head');
      head.appendChild(el('span', 'fst-block-title', title));
      const count = el('span', 'fst-count');
      head.appendChild(count);
      head.appendChild(el('span', 'fst-spacer'));
      (links || []).forEach(([text, onClick]) => {
        const link = el('button', 'fst-link', text);
        link.type = 'button';
        link.addEventListener('click', onClick);
        head.appendChild(link);
      });
      const content = el('div');
      root.appendChild(head);
      root.appendChild(content);
      return { root, count, content };
    };

    const overlay = el('div');
    overlay.id = 'scenario-settings-popup';
    const panel = el('div', 'fst-panel');
    overlay.appendChild(panel);

    /* ---- header ---- */
    const head = el('div', 'fst-head');
    const heading = el('div');
    heading.appendChild(el('div', 'fst-title', 'Instellingen'));
    heading.appendChild(el('div', 'fst-sub', 'Kies welke secties, jaren en scenario\'s de viewer toont'));
    const closeBtn = el('button', 'fst-close');
    closeBtn.type = 'button';
    closeBtn.title = 'Sluiten';
    closeBtn.setAttribute('aria-label', 'Sluiten');
    closeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 2l10 10M12 2L2 12"/></svg>';
    closeBtn.addEventListener('click', closeSettingsPopup);
    head.appendChild(heading);
    head.appendChild(closeBtn);
    panel.appendChild(head);

    const body = el('div', 'fst-body');
    panel.appendChild(body);

    /* ---- sections ---- */
    const sections = block('Secties');
    sections.content.className = 'fst-chips';
    sections.content.id = 'section-toggles-grid';

    function buildSectionToggles() {
      const available = SECTIONS.filter(isSectionAvailable);
      sections.content.innerHTML = '';
      sections.count.textContent = `${available.filter(s => isSectionVisible(s.id)).length} / ${available.length}`;
      available.forEach(section => {
        sections.content.appendChild(chip(section.label, isSectionVisible(section.id), () => {
          toggleSection(section.id);
          buildSectionToggles();
        }));
      });
    }
    buildSectionToggles();
    body.appendChild(sections.root);

    /* ---- years ---- */
    const years = block('Jaren', [
      ['Alle jaren', () => { setYearsVisible(() => true); buildYearToggles(); }],
      ['Elke 5 jaar', () => { setYearsVisible(y => parseInt(y.id) % 5 === 0); buildYearToggles(); }]
    ]);
    years.content.className = 'fst-chips';
    years.content.id = 'year-toggles-grid';

    function buildYearToggles() {
      years.content.innerHTML = '';
      years.count.textContent = `${getVisibleYears().length} / ${allYears.length}`;
      allYears.forEach(year => {
        years.content.appendChild(chip(year.title || year.id, isYearVisible(year.id), () => {
          toggleYear(year.id);
          buildYearToggles();
        }));
      });
    }
    buildYearToggles();
    if (allYears.length > 1) body.appendChild(years.root);

    /* ---- scenarios, per study ---- */
    const scenarios = block('Scenario\'s', [
      ['Alles tonen', () => {
        Object.keys(scenarioGroups).forEach(groupName => setGroupShown(groupName, true));
        scenariosChanged();
      }],
      ['Alles verbergen', () => {
        Object.keys(scenarioGroups).forEach(groupName => setGroupShown(groupName, false));
        scenariosChanged();
      }]
    ]);

    // Scenario chips take the colour their buttons have in the viewer's menu
    const scenarioColor = scenario => {
      const colors = (typeof viewerConfig !== 'undefined' && viewerConfig && viewerConfig.colors) || {};
      return colors[scenario.colorGroup] || '#fff';
    };

    function buildScenarioToggles() {
      scenarios.content.innerHTML = '';
      scenarios.count.textContent = `${getVisibleScenarios().length} / ${allScenarios.length}`;
      Object.keys(scenarioGroups).forEach(groupName => {
        const members = scenarioGroups[groupName];
        const shownCount = members.filter(s => isScenarioVisible(s.id)).length;
        const group = el('div', 'fst-group');

        // The group's title switches the whole group
        const title = el('button', 'fst-group-title');
        title.type = 'button';
        title.title = shownCount === members.length ? 'Klik om deze studie te verbergen' : 'Klik om deze studie te tonen';
        title.appendChild(el('span', 'fst-group-name', groupName === 'Ungrouped' ? 'Overig' : groupName));
        title.appendChild(el('span', 'fst-group-count', `${shownCount} / ${members.length}`));
        title.addEventListener('click', () => {
          setGroupShown(groupName, shownCount !== members.length);
          scenariosChanged();
        });
        group.appendChild(title);

        const chips = el('div', 'fst-chips');
        members.forEach(scenario => {
          const shown = isScenarioVisible(scenario.id);
          chips.appendChild(chip(scenario.title, shown, () => {
            setScenarioShown(scenario, !shown);
            scenariosChanged();
          }, scenarioColor(scenario)));
        });
        group.appendChild(chips);
        scenarios.content.appendChild(group);
      });
    }

    function scenariosChanged() {
      buildScenarioToggles();
      notifyScenarioChange();
    }

    buildScenarioToggles();
    body.appendChild(scenarios.root);

    /* ---- footer ---- */
    const foot = el('div', 'fst-foot');
    const doneBtn = el('button', 'fst-done', 'Klaar');
    doneBtn.type = 'button';
    doneBtn.addEventListener('click', closeSettingsPopup);
    foot.appendChild(doneBtn);
    panel.appendChild(foot);

    document.body.appendChild(overlay);

    // Close on overlay click and on Escape
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeSettingsPopup();
    });
    settingsKeyHandler = e => { if (e.key === 'Escape') closeSettingsPopup(); };
    document.addEventListener('keydown', settingsKeyHandler);
  }

  // Close the settings popup. If the scenario selected in the viewer was
  // switched off, the viewer moves on to the first scenario that is shown.
  function closeSettingsPopup() {
    const overlay = document.getElementById('scenario-settings-popup');
    if (!overlay) return;
    if (settingsKeyHandler) {
      document.removeEventListener('keydown', settingsKeyHandler);
      settingsKeyHandler = null;
    }

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
  loadYearSettings();

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
    isYearVisible,
    getVisibleYears,
    toggleYear,
    toggleSection,
    applySectionVisibility,
    getSettings: () => visibilitySettings,
    getAllScenarios: () => allScenarios,
    getScenarioGroups: () => scenarioGroups
  };

})();
