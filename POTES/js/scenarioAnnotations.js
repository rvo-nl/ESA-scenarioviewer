// Scenario annotations: a text per scenario, shown in a panel under the sankey diagram.
//
// The texts come from scenario_annotations.json, which the dataprocessor builds from the
// scenario_annotations.txt files in the scenario input folders
// (input/data/<model>_data/<scenario_id>/). Each text is HTML and is shown as written.
// In production the file is part of the encrypted dataset and loadData.js hands it over
// through setScenarioAnnotations(); in development it is read from private/.
//
// Folded, the panel always has the same height -- also when the selected scenario has no
// text -- so the sections below it do not move when switching scenarios. A text that does
// not fit gets a "Toon meer" button that unfolds the panel; selecting another scenario
// folds it back.
(function () {
  let annotations = {}
  let shownScenarioId // scenario whose text is in the panel (undefined: nothing shown yet)

  function getElements () {
    const panel = document.getElementById('scenarioAnnotations')
    if (!panel) return null
    return {
      panel,
      text: panel.querySelector('.scenario-annotations-text'),
      toggle: panel.querySelector('.scenario-annotations-toggle')
    }
  }

  function selectedScenarioId () {
    const scenario = window.globalActiveScenario
    return scenario && scenario.id ? scenario.id : null
  }

  // Show the fade and the button only when the folded text does not fit. While the
  // panel is unfolded the button stays, so it can be folded again.
  function updateOverflow () {
    const el = getElements()
    if (!el) return
    const expanded = el.panel.classList.contains('is-expanded')
    const overflowing = !expanded && el.text.scrollHeight > el.text.clientHeight + 1
    el.panel.classList.toggle('is-overflowing', overflowing)
    el.toggle.hidden = !(expanded || overflowing)
  }

  function setExpanded (expanded) {
    const el = getElements()
    if (!el) return
    el.panel.classList.toggle('is-expanded', expanded)
    el.toggle.textContent = expanded ? 'Toon minder' : 'Toon meer'
    el.toggle.setAttribute('aria-expanded', String(expanded))
    updateOverflow()
  }

  // Put the text of the selected scenario in the panel, folded. Does nothing when that
  // scenario is already shown, unless force is set (new texts loaded).
  function render (force) {
    const el = getElements()
    if (!el) return
    const scenarioId = selectedScenarioId()
    if (!force && scenarioId === shownScenarioId) return
    shownScenarioId = scenarioId
    el.text.innerHTML = (scenarioId && annotations[scenarioId]) || ''
    el.text.scrollTop = 0
    setExpanded(false)
  }

  // Called by loadData.js with the texts from the decrypted dataset
  window.setScenarioAnnotations = function (texts) {
    annotations = texts && typeof texts === 'object' ? texts : {}
    render(true)
  }

  // Development mode: read the texts straight from the private folder. A missing file
  // just means there are no texts.
  window.loadScenarioAnnotations = function (url) {
    fetch(url)
      .then(response => (response.ok ? response.json() : {}))
      .catch(() => ({}))
      .then(texts => window.setScenarioAnnotations(texts))
  }

  function init () {
    const el = getElements()
    if (!el) return

    el.toggle.addEventListener('click', () => {
      setExpanded(!el.panel.classList.contains('is-expanded'))
    })

    // drawSelectionButtons.js announces every new scenario/year selection
    window.addEventListener('scenarioSelectionChanged', () => render(false))

    // Safety net for a page whose shared/ files predate that announcement: notice the
    // change after a click (scenario button, diagram switch) or on a light timer.
    document.addEventListener('click', () => setTimeout(() => render(false), 0), true)
    setInterval(() => render(false), 500)

    // Re-check whether the text fits whenever the panel changes width (window resize,
    // fonts finishing loading, the section being shown again)
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => updateOverflow()).observe(el.text)
    } else {
      window.addEventListener('resize', updateOverflow)
    }

    render(true)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
