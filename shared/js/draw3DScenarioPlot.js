// 3D Scenario Trajectory Plot
//
// Renders one trajectory per scenario (a point per scenario-year, connected in
// year order) in a rotatable 3D scatter plot:
//   x = activity index, y = self-sufficiency, z (vertical) = electrification
//
// Data: 3dplot_input_data.csv — read from the decrypted zip in production
// (window.viewerZipCSV) and fetched from private/ in development. The CSV only
// lists the scenario name on its first year row, so names are forward-filled.
//
// The projection is a plain orthographic camera (yaw around the vertical axis,
// pitch above the horizon) drawn with D3 into SVG — no WebGL needed for a few
// dozen points, and it keeps the typography and styling in line with the rest
// of the viewer.
//
// Everything is overridable from viewer-config.json under "plot3d":
//   { "file": "...csv", "axes": { x: {...}, y: {...}, z: {...} },
//     "scenarios": { "<csv name>": { "id": "<viewer scenario id>", "color": "#hex" } } }
//
// Public API: window.init3DPlot(), window.update3DPlotScenario()
// Depends on globals: d3, XLSX, viewerConfig, dataSource, globalActiveScenario.

(function () {
  const DEFAULTS = {
    file: '3dplot_input_data.csv',
    axes: {
      x: { key: 'activity_index', label: 'Activiteit', description: 'Index, ADAPT 2030 = 100', format: ',.0f', tooltipFormat: ',.1f' },
      y: { key: 'self_sufficiency_index', label: 'Zelfvoorziening', description: 'Aandeel binnenlandse voorziening', format: '.0%', tooltipFormat: '.1%' },
      z: { key: 'electrification_index', label: 'Elektrificatie', description: 'Aandeel elektriciteit in de energievraag', format: '.0%', tooltipFormat: '.1%' }
    },
    scenarios: {
      'tno-adapt': { id: 'TNOAT2024_ADAPT', color: '#D9785A' },
      'tno-transform': { id: 'TNOAT2024_TRANSFORM', color: '#264F73' },
      'tno-transform-ci': { id: 'TNOAT2024_TRANSFORM_CI', color: '#4F95BD' },
      'tno-transform-lc': { id: 'TNOAT2024_TRANSFORM_MC', color: '#37765C' },
      'tno-transform-lci': { id: 'TNOAT2024_TRANSFORM_MCI', color: '#6CC9A1' }
    }
  }

  const FALLBACK_COLORS = ['#8C6BB1', '#C9A227', '#DD5471', '#5E6B7A', '#A0522D']

  // Flat views carry `fit`: once reached, the plot zooms to fill the available
  // space (padding leaves room for tick labels and axis titles).
  const VIEWS = {
    iso: { label: '3D', title: 'Perspectief', yaw: -38, pitch: 24 },
    front: { label: 'Voor', title: 'Activiteit × Elektrificatie', yaw: 0, pitch: 0, fit: { top: 44, right: 24, bottom: 64, left: 64 } },
    side: { label: 'Zij', title: 'Zelfvoorziening × Elektrificatie', yaw: -90, pitch: 0, fit: { top: 44, right: 24, bottom: 64, left: 64 } },
    top: { label: 'Boven', title: 'Activiteit × Zelfvoorziening', yaw: 0, pitch: 90, fit: { top: 24, right: 24, bottom: 64, left: 150 } }
  }

  const HEIGHT = 540
  const INK = '#2B2B2B'
  const MUTED = '#8A8A8A'
  const GRID = '#E4E1DB'
  const FRAME = '#CFCBC3'
  const DEG = Math.PI / 180

  let settings = null
  let series = [] // [{ key, id, title, color, points: [{ year, values, p: [x,y,z] }] }]
  let scales = null // { x, y, z } linear scales: data -> [-1, 1]
  let hidden = new Set()
  let hoveredKey = null
  let yaw = VIEWS.iso.yaw * DEG
  let pitch = VIEWS.iso.pitch * DEG
  let activeView = 'iso'
  let animation = null
  let zoomOut = null // drag-initiated zoom back to the 3D framing
  let zoom = 0 // 0 = 3D framing, 1 = fitted to the plot (flat views only)
  let fitView = null // the view whose padding the fitted framing uses
  let initialized = false

  let dom = {} // container, svg, layers, tooltip, legend, viewButtons
  let size = { width: 0, height: HEIGHT }

  // ── config & data ──────────────────────────────────────────────────────

  function readSettings () {
    const cfg = (typeof viewerConfig !== 'undefined' && viewerConfig && viewerConfig.plot3d) || {}
    return {
      file: cfg.file || DEFAULTS.file,
      axes: {
        x: Object.assign({}, DEFAULTS.axes.x, cfg.axes && cfg.axes.x),
        y: Object.assign({}, DEFAULTS.axes.y, cfg.axes && cfg.axes.y),
        z: Object.assign({}, DEFAULTS.axes.z, cfg.axes && cfg.axes.z)
      },
      scenarios: Object.assign({}, DEFAULTS.scenarios, cfg.scenarios)
    }
  }

  // In development drawSelectionButtons.js fetches viewer-config.json
  // asynchronously; wait for it so the flag and plot3d overrides apply.
  async function configReady (timeout = 5000) {
    const start = Date.now()
    while (!(typeof viewerConfig !== 'undefined' && viewerConfig && viewerConfig.viewer)) {
      if (Date.now() - start > timeout) return
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }

  async function loadRows () {
    const base = settings.file.replace(/\.[^.]+$/, '')
    const zipCsv = window.viewerZipCSV && window.viewerZipCSV[base]
    if (zipCsv) return d3.csvParse(zipCsv)

    const response = await fetch('private/' + settings.file)
    if (!response.ok) throw new Error('Kan ' + settings.file + ' niet laden (' + response.status + ')')
    return d3.csvParse(await response.text())
  }

  function scenarioTitle (id, fallback) {
    const list = (typeof viewerConfig !== 'undefined' && viewerConfig && viewerConfig.scenarios) || []
    const match = list.find(s => s.id === id)
    return match ? match.title : fallback
  }

  function buildSeries (rows) {
    const axes = settings.axes
    const byKey = new Map()
    let current = null

    rows.forEach(row => {
      const name = (row.scenario || '').trim()
      if (name) current = name
      if (!current) return

      const year = parseInt(row.year, 10)
      const values = {
        x: parseFloat(row[axes.x.key]),
        y: parseFloat(row[axes.y.key]),
        z: parseFloat(row[axes.z.key])
      }
      if (isNaN(year) || isNaN(values.x) || isNaN(values.y) || isNaN(values.z)) return

      if (!byKey.has(current)) byKey.set(current, [])
      byKey.get(current).push({ year, values })
    })

    let fallbackIndex = 0
    return [...byKey.entries()].map(([key, points]) => {
      const mapped = settings.scenarios[key] || {}
      const id = mapped.id || key
      return {
        key,
        id,
        title: scenarioTitle(id, key),
        color: mapped.color || FALLBACK_COLORS[fallbackIndex++ % FALLBACK_COLORS.length],
        points: points.sort((a, b) => a.year - b.year)
      }
    })
  }

  function buildScales () {
    const all = series.flatMap(s => s.points)
    const make = axis => {
      const extent = d3.extent(all, d => d.values[axis])
      const pad = (extent[1] - extent[0]) * 0.06 || Math.abs(extent[0]) * 0.1 || 1
      return d3.scaleLinear().domain([extent[0] - pad, extent[1] + pad]).nice(5).range([-1, 1])
    }
    scales = { x: make('x'), y: make('y'), z: make('z') }
    series.forEach(s => s.points.forEach(pt => {
      pt.p = [scales.x(pt.values.x), scales.y(pt.values.y), scales.z(pt.values.z)]
    }))
  }

  // ── camera ─────────────────────────────────────────────────────────────

  function camera () {
    const width = size.width
    const height = size.height
    // 3D framing: one scale that keeps the cube in view at every rotation,
    // with room for tick labels and axis titles.
    const scale = Math.max(40, Math.min((width - 150) / (2 * 1.42), (height - 90) / (2 * 1.55)))
    let sx = scale
    let sy = scale
    let ox = width / 2
    let oy = height / 2 + 6

    // Fitted framing: in a flat view the cube projects onto [-1, 1]², so each
    // screen axis can be stretched independently to fill the plot.
    const fit = zoom > 0 && fitView && VIEWS[fitView].fit
    if (fit) {
      const innerW = Math.max(80, width - fit.left - fit.right)
      const innerH = Math.max(80, height - fit.top - fit.bottom)
      const lerp = (a, b) => a + (b - a) * zoom
      sx = lerp(sx, innerW / 2)
      sy = lerp(sy, innerH / 2)
      ox = lerp(ox, fit.left + innerW / 2)
      oy = lerp(oy, fit.top + innerH / 2)
    }

    return {
      cy: Math.cos(yaw), sy: Math.sin(yaw),
      cp: Math.cos(pitch), sp: Math.sin(pitch),
      ox, oy, scaleX: sx, scaleY: sy
    }
  }

  // Normalized cube coordinates -> screen position plus depth (larger = closer).
  function project (p, cam) {
    const x1 = p[0] * cam.cy - p[1] * cam.sy
    const y1 = p[0] * cam.sy + p[1] * cam.cy
    const up = p[2] * cam.cp + y1 * cam.sp
    return {
      x: cam.ox + cam.scaleX * x1,
      y: cam.oy - cam.scaleY * up,
      depth: -y1 * cam.cp + p[2] * cam.sp
    }
  }

  function normalDepth (n, cam) {
    const y1 = n[0] * cam.sy + n[1] * cam.cy
    return -y1 * cam.cp + n[2] * cam.sp
  }

  // ── emphasis helpers ───────────────────────────────────────────────────

  function activeKey () {
    const g = window.globalActiveScenario
    if (!g || !g.id) return null
    const match = series.find(s => s.id === g.id)
    return match ? match.key : null
  }

  function isVisible (s) {
    if (hidden.has(s.key)) return false
    if (window.ScenarioSettings && typeof window.ScenarioSettings.isScenarioVisible === 'function') {
      return window.ScenarioSettings.isScenarioVisible(s.id) !== false
    }
    return true
  }

  function emphasis (s, active) {
    if (hoveredKey) return s.key === hoveredKey ? 'focus' : 'dim'
    return s.key === active ? 'focus' : 'normal'
  }

  // ── rendering ──────────────────────────────────────────────────────────

  function render () {
    if (!dom.svg || !scales) return
    const cam = camera()
    const active = activeKey()
    const visible = series.filter(isVisible)

    dom.svg.attr('width', size.width).attr('height', size.height)
    dom.hit.attr('width', size.width).attr('height', size.height)

    renderFrame(cam)
    renderShadows(visible, cam, active)
    renderScene(visible, cam, active)
    renderAxes(cam)
    renderYearLabels(visible, cam, active)
    updateLegend(active)
  }

  // Back faces of the unit cube carry the grid, like a room seen from inside.
  function renderFrame (cam) {
    const faces = []
    ;[0, 1, 2].forEach(axis => {
      [-1, 1].forEach(sign => {
        const n = [0, 0, 0]
        n[axis] = sign
        if (normalDepth(n, cam) < -1e-6) faces.push({ axis, sign })
      })
    })

    const axisNames = ['x', 'y', 'z']
    const gridLines = []
    const borders = []
    faces.forEach(({ axis, sign }) => {
      const [a, b] = [0, 1, 2].filter(i => i !== axis)
      const at = (u, v) => {
        const p = [0, 0, 0]
        p[axis] = sign
        p[a] = u
        p[b] = v
        return project(p, cam)
      }
      scales[axisNames[a]].ticks(5).map(scales[axisNames[a]]).forEach(u => {
        if (Math.abs(Math.abs(u) - 1) > 1e-6) gridLines.push([at(u, -1), at(u, 1)])
      })
      scales[axisNames[b]].ticks(5).map(scales[axisNames[b]]).forEach(v => {
        if (Math.abs(Math.abs(v) - 1) > 1e-6) gridLines.push([at(-1, v), at(1, v)])
      })
      borders.push([at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)])
    })

    dom.frame.selectAll('path.p3d-face')
      .data(borders)
      .join('path')
      .attr('class', 'p3d-face')
      .attr('d', pts => 'M' + pts.map(p => p.x + ',' + p.y).join('L') + 'Z')
      .attr('fill', '#FCFBF9')
      .attr('stroke', FRAME)
      .attr('stroke-width', 0.8)

    dom.frame.selectAll('line.p3d-grid')
      .data(gridLines)
      .join('line')
      .attr('class', 'p3d-grid')
      .attr('x1', d => d[0].x).attr('y1', d => d[0].y)
      .attr('x2', d => d[1].x).attr('y2', d => d[1].y)
      .attr('stroke', GRID)
      .attr('stroke-width', 0.7)
  }

  // Trajectories projected onto the floor, plus drop lines for the focused one.
  function renderShadows (visible, cam, active) {
    const floor = p => project([p[0], p[1], -1], cam)
    // Seen level with the floor these cues collapse onto the frame edge: fade them out.
    const fade = Math.min(1, pitch / (15 * DEG))
    const line = d3.line().x(d => d.x).y(d => d.y)

    dom.shadows.selectAll('path.p3d-shadow')
      .data(visible, s => s.key)
      .join('path')
      .attr('class', 'p3d-shadow')
      .attr('d', s => line(s.points.map(pt => floor(pt.p))))
      .attr('fill', 'none')
      .attr('stroke', s => s.color)
      .attr('stroke-width', 1)
      .attr('stroke-opacity', s => fade * ({ focus: 0.35, normal: 0.16, dim: 0.05 })[emphasis(s, active)])

    const drops = visible
      .filter(s => emphasis(s, active) === 'focus')
      .flatMap(s => s.points.map(pt => ({ key: s.key + pt.year, color: s.color, from: project(pt.p, cam), to: floor(pt.p) })))

    dom.shadows.selectAll('line.p3d-drop')
      .data(drops, d => d.key)
      .join('line')
      .attr('class', 'p3d-drop')
      .attr('x1', d => d.from.x).attr('y1', d => d.from.y)
      .attr('x2', d => d.to.x).attr('y2', d => d.to.y)
      .attr('stroke', d => d.color)
      .attr('stroke-opacity', 0.35 * fade)
      .attr('stroke-width', 0.8)
      .attr('stroke-dasharray', '2,3')
  }

  // Segments and points share one layer so they can be painted back to front.
  function renderScene (visible, cam, active) {
    const items = []
    visible.forEach(s => {
      const state = emphasis(s, active)
      const projected = s.points.map(pt => project(pt.p, cam))
      const years = s.points.map(pt => pt.year)
      const [y0, y1] = d3.extent(years)

      projected.forEach((pr, i) => {
        if (i > 0) {
          const prev = projected[i - 1]
          items.push({
            type: 'segment', key: `seg-${s.key}-${i}`, series: s, state,
            a: prev, b: pr, depth: (prev.depth + pr.depth) / 2 - 0.001
          })
        }
        const t = y1 > y0 ? (years[i] - y0) / (y1 - y0) : 1
        items.push({
          type: 'point', key: `pt-${s.key}-${years[i]}`, series: s, state,
          point: s.points[i], at: pr, depth: pr.depth, radius: 3 + 2.2 * t, first: i === 0
        })
      })
    })
    items.sort((a, b) => a.depth - b.depth)

    // Slightly fade what lies further away to help read depth.
    const fog = depth => 0.72 + 0.28 * Math.max(0, Math.min(1, (depth + 1.75) / 3.5))
    const lineOpacity = { focus: 1, normal: 0.85, dim: 0.12 }
    const lineWidth = { focus: 2.6, normal: 1.6, dim: 1.2 }

    const nodes = dom.scene.selectAll('.p3d-item')
      .data(items, d => d.key)
      .join(enter => enter.append(d => document.createElementNS('http://www.w3.org/2000/svg', d.type === 'segment' ? 'line' : 'circle')))
      .attr('class', d => 'p3d-item p3d-' + d.type)

    nodes.filter(d => d.type === 'segment')
      .attr('x1', d => d.a.x).attr('y1', d => d.a.y)
      .attr('x2', d => d.b.x).attr('y2', d => d.b.y)
      .attr('stroke', d => d.series.color)
      .attr('stroke-width', d => lineWidth[d.state])
      .attr('stroke-linecap', 'round')
      .attr('stroke-opacity', d => lineOpacity[d.state] * fog(d.depth))

    nodes.filter(d => d.type === 'point')
      .attr('cx', d => d.at.x).attr('cy', d => d.at.y)
      .attr('r', d => d.radius + (d.state === 'focus' ? 0.8 : 0))
      // The first year is drawn open so the direction of travel is readable.
      .attr('fill', d => d.first ? '#FFF' : d.series.color)
      .attr('stroke', d => d.first ? d.series.color : '#FFF')
      .attr('stroke-width', d => d.first ? 1.6 : 1.2)
      .attr('opacity', d => lineOpacity[d.state] * fog(d.depth))
      .on('mouseenter', (event, d) => {
        setHovered(d.series.key)
        showTooltip(event, d)
      })
      .on('mousemove', (event, d) => showTooltip(event, d))
      .on('mouseleave', () => {
        setHovered(null)
        hideTooltip()
      })

    nodes.order()
  }

  // Tick labels sit on the cube edge closest to the viewer for each axis.
  function renderAxes (cam) {
    const center = project([0, 0, 0], cam)
    const axisDefs = [
      { name: 'x', dim: 0, candidates: [[-1, -1], [1, -1]].map(([y, z]) => [null, y, z]) },
      { name: 'y', dim: 1, candidates: [[-1, -1], [1, -1]].map(([x, z]) => [x, null, z]) },
      { name: 'z', dim: 2, candidates: [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, y]) => [x, y, null]) }
    ]

    const ticks = []
    const titles = []
    axisDefs.forEach(axis => {
      const edges = axis.candidates.map(c => {
        const at = t => { const p = c.slice(); p[axis.dim] = t; return p }
        return { at, a: project(at(-1), cam), b: project(at(1), cam), mid: project(at(0), cam) }
      })
      // Floor axes: the edge lowest on screen; vertical axis: the leftmost edge.
      const edge = axis.name === 'z'
        ? edges.reduce((best, e) => e.mid.x < best.mid.x ? e : best)
        : edges.reduce((best, e) => e.mid.y > best.mid.y ? e : best)

      // Axes seen end-on collapse to a point: nothing readable to label.
      if (Math.hypot(edge.b.x - edge.a.x, edge.b.y - edge.a.y) < 40) return

      let dx = edge.mid.x - center.x
      let dy = edge.mid.y - center.y
      const len = Math.hypot(dx, dy) || 1
      dx /= len
      dy /= len
      const anchor = dx < -0.35 ? 'end' : dx > 0.35 ? 'start' : 'middle'
      const cfg = settings.axes[axis.name]
      const fmt = d3.format(cfg.format)
      const scale = scales[axis.name]

      scale.ticks(5).forEach(v => {
        const p = project(edge.at(scale(v)), cam)
        ticks.push({ key: axis.name + v, x: p.x + dx * 12, y: p.y + dy * 12 + 3.5, text: fmt(v), anchor })
      })

      if (axis.name === 'z') {
        const top = project(edge.at(1), cam)
        titles.push({ key: axis.name, x: top.x, y: top.y - 22, text: cfg.label, anchor: 'middle' })
      } else {
        titles.push({ key: axis.name, x: edge.mid.x + dx * 40, y: edge.mid.y + dy * 40 + 4, text: cfg.label, anchor })
      }
    })

    dom.axes.selectAll('text.p3d-tick')
      .data(ticks, d => d.key)
      .join('text')
      .attr('class', 'p3d-tick')
      .attr('x', d => d.x).attr('y', d => d.y)
      .attr('text-anchor', d => d.anchor)
      .text(d => d.text)

    dom.axes.selectAll('text.p3d-axis-title')
      .data(titles, d => d.key)
      .join('text')
      .attr('class', 'p3d-axis-title')
      .attr('x', d => d.x).attr('y', d => d.y)
      .attr('text-anchor', d => d.anchor)
      .text(d => d.text)
  }

  function renderYearLabels (visible, cam, active) {
    const labels = visible
      .filter(s => emphasis(s, active) === 'focus')
      .flatMap(s => s.points.map(pt => {
        const at = project(pt.p, cam)
        return { key: s.key + pt.year, x: at.x + 9, y: at.y - 8, text: pt.year }
      }))

    dom.labels.selectAll('text.p3d-year')
      .data(labels, d => d.key)
      .join('text')
      .attr('class', 'p3d-year')
      .attr('x', d => d.x).attr('y', d => d.y)
      .text(d => d.text)
  }

  // ── interaction ────────────────────────────────────────────────────────

  function setHovered (key) {
    if (hoveredKey === key) return
    hoveredKey = key
    render()
  }

  function showTooltip (event, d) {
    const axes = settings.axes
    const rows = ['x', 'y', 'z'].map(a => `
      <div class="p3d-tt-row"><span>${axes[a].label}</span><b>${d3.format(axes[a].tooltipFormat || axes[a].format)(d.point.values[a])}</b></div>`).join('')
    dom.tooltip.html(`
      <div class="p3d-tt-head"><i style="background:${d.series.color}"></i>${d.series.title}</div>
      <div class="p3d-tt-year">${d.point.year}</div>${rows}`)

    const bounds = dom.plot.node().getBoundingClientRect()
    const tip = dom.tooltip.style('opacity', 1).node()
    let left = event.clientX - bounds.left + 16
    let top = event.clientY - bounds.top - 12
    if (left + tip.offsetWidth > bounds.width - 8) left = event.clientX - bounds.left - tip.offsetWidth - 16
    if (top + tip.offsetHeight > bounds.height - 8) top = bounds.height - tip.offsetHeight - 8
    dom.tooltip.style('left', left + 'px').style('top', Math.max(8, top) + 'px')
  }

  function hideTooltip () {
    dom.tooltip.style('opacity', 0)
  }

  // Runs phases back to back on one timer; each phase gets an eased t in [0, 1].
  function runPhases (phases) {
    let index = 0
    let phaseStart = 0
    if (phases.length && phases[0].begin) phases[0].begin()
    return d3.timer(elapsed => {
      while (index < phases.length) {
        const phase = phases[index]
        const t = Math.min(1, (elapsed - phaseStart) / phase.duration)
        phase.step(d3.easeCubicInOut(t))
        if (t < 1) break
        phaseStart += phase.duration
        index++
        if (index < phases.length && phases[index].begin) phases[index].begin()
      }
      render()
      if (index >= phases.length) {
        animation.stop()
        animation = null
      }
    })
  }

  // Zoom back to the 3D framing first, rotate, then — for a flat view — zoom
  // in so the 2D projection uses the full plot area.
  function setView (name) {
    const view = VIEWS[name]
    if (!view) return
    activeView = name
    updateViewButtons()
    if (animation) animation.stop()
    if (zoomOut) { zoomOut.stop(); zoomOut = null }

    // Rotate the short way round.
    const targetPitch = view.pitch * DEG
    let deltaYaw = (view.yaw * DEG - yaw) % (2 * Math.PI)
    if (deltaYaw > Math.PI) deltaYaw -= 2 * Math.PI
    if (deltaYaw < -Math.PI) deltaYaw += 2 * Math.PI
    const rotates = Math.abs(deltaYaw) > 1e-4 || Math.abs(targetPitch - pitch) > 1e-4

    const phases = []
    if (zoom > 0 && (rotates || fitView !== name)) {
      const from = zoom
      phases.push({ duration: 380, step: t => { zoom = from * (1 - t) } })
    }
    if (rotates) {
      const startYaw = yaw
      const startPitch = pitch
      phases.push({
        duration: 750,
        step: t => {
          yaw = startYaw + deltaYaw * t
          pitch = startPitch + (targetPitch - startPitch) * t
        }
      })
    }
    if (view.fit) {
      let from = 0
      phases.push({
        duration: 520,
        begin: () => { fitView = name; from = zoom },
        step: t => { zoom = from + (1 - from) * t }
      })
    }
    if (phases.length) animation = runPhases(phases)
  }

  function attachDrag () {
    dom.svg.call(d3.drag()
      .filter(event => !event.button && !(event.target.classList && event.target.classList.contains('p3d-point')))
      .on('start', () => {
        if (animation) { animation.stop(); animation = null }
        // Leaving a fitted flat view: ease back to the 3D framing while dragging.
        if (zoom > 0 && !zoomOut) {
          const from = zoom
          zoomOut = d3.timer(elapsed => {
            const t = Math.min(1, elapsed / 320)
            zoom = from * (1 - d3.easeCubicOut(t))
            render()
            if (t >= 1) { zoomOut.stop(); zoomOut = null }
          })
        }
        hideTooltip()
        dom.svg.classed('is-dragging', true)
      })
      .on('drag', event => {
        yaw += event.dx * 0.45 * DEG
        pitch = Math.max(0, Math.min(90 * DEG, pitch + event.dy * 0.45 * DEG))
        if (activeView) {
          activeView = null
          updateViewButtons()
        }
        render()
      })
      .on('end', () => dom.svg.classed('is-dragging', false)))

    dom.svg.on('dblclick', () => setView('iso'))
  }

  // ── chrome: controls, legend, export ───────────────────────────────────

  function buildControls () {
    const controls = d3.select('#plot3dControls')
    if (controls.empty()) return
    controls.html('')

    const group = controls.append('div').attr('class', 'p3d-segmented')
    dom.viewButtons = group.selectAll('button')
      .data(Object.keys(VIEWS))
      .join('button')
      .attr('type', 'button')
      .attr('class', 'p3d-btn')
      .attr('title', key => VIEWS[key].title)
      .text(key => VIEWS[key].label)
      .on('click', (event, key) => setView(key))

    controls.append('button')
      .attr('type', 'button')
      .attr('class', 'p3d-btn p3d-btn-export')
      .text('Exporteer data (xlsx)')
      .on('click', exportXlsx)

    updateViewButtons()
  }

  function updateViewButtons () {
    if (dom.viewButtons) dom.viewButtons.classed('is-active', key => key === activeView)
  }

  function buildLegend () {
    dom.legend.html('')
    dom.legend.append('div').attr('class', 'p3d-side-title').text("Scenario's")

    dom.legendItems = dom.legend.append('div').attr('class', 'p3d-legend')
      .selectAll('button')
      .data(series, s => s.key)
      .join('button')
      .attr('type', 'button')
      .attr('class', 'p3d-legend-item')
      .attr('title', 'Klik om te tonen of te verbergen')
      .on('click', (event, s) => {
        if (hidden.has(s.key)) hidden.delete(s.key)
        else hidden.add(s.key)
        render()
      })
      .on('mouseenter', (event, s) => { if (!hidden.has(s.key)) setHovered(s.key) })
      .on('mouseleave', () => setHovered(null))

    dom.legendItems.append('span').attr('class', 'p3d-swatch').style('background', s => s.color)
    dom.legendItems.append('span').attr('class', 'p3d-legend-label').text(s => s.title)

    const axes = settings.axes
    const notes = dom.legend.append('div').attr('class', 'p3d-axis-notes')
    notes.append('div').attr('class', 'p3d-side-title').text('Assen')
    ;['x', 'y', 'z'].forEach(a => {
      const row = notes.append('div').attr('class', 'p3d-axis-note')
      row.append('b').text(axes[a].label)
      row.append('span').text(axes[a].description)
    })

    const years = d3.extent(series.flatMap(s => s.points.map(pt => pt.year)))
    dom.legend.append('div').attr('class', 'p3d-hint')
      .html(`Open punt = ${years[0]}, gevuld = latere jaren tot ${years[1]}.<br>Sleep om te draaien · dubbelklik om te herstellen.`)
  }

  function updateLegend (active) {
    if (!dom.legendItems) return
    dom.legendItems
      .classed('is-hidden', s => !isVisible(s))
      .classed('is-active', s => s.key === active)
      .classed('is-dim', s => hoveredKey && s.key !== hoveredKey)
  }

  function exportXlsx () {
    if (typeof XLSX === 'undefined') {
      console.error('3D plot: XLSX library not loaded')
      return
    }
    const axes = settings.axes
    const rows = [['Scenario', 'Scenario ID', 'Jaar', axes.x.label, axes.y.label, axes.z.label]]
    series.forEach(s => s.points.forEach(pt => {
      rows.push([s.title, s.id, pt.year, pt.values.x, pt.values.y, pt.values.z])
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Scenariotrajecten')
    XLSX.writeFile(wb, `scenariotrajecten_3d_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ── setup ──────────────────────────────────────────────────────────────

  function injectStyles () {
    if (document.getElementById('p3d-styles')) return
    const style = document.createElement('style')
    style.id = 'p3d-styles'
    style.textContent = `
      .p3d-card { display: flex; gap: 28px; background: #FFF; border: 1px solid #E0DDD7; border-radius: 12px;
        padding: 20px 24px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); margin-top: 20px; }
      .p3d-plot { position: relative; flex: 1 1 0; min-width: 0; }
      .p3d-plot svg { display: block; cursor: grab; user-select: none; touch-action: none; }
      .p3d-plot svg.is-dragging { cursor: grabbing; }
      .p3d-plot svg text { font-family: inherit; }
      .p3d-tick { font-size: 10px; fill: ${MUTED}; font-variant-numeric: tabular-nums; pointer-events: none; }
      .p3d-axis-title { font-size: 11px; font-weight: 600; fill: ${INK}; letter-spacing: 0.02em; pointer-events: none; }
      .p3d-year { font-size: 9.5px; fill: ${MUTED}; pointer-events: none; font-variant-numeric: tabular-nums; }
      .p3d-point { cursor: pointer; }
      .p3d-side { flex: 0 0 230px; display: flex; flex-direction: column; gap: 22px; padding-top: 6px; }
      .p3d-side-title { font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
        color: ${MUTED}; margin-bottom: 6px; }
      .p3d-legend { display: flex; flex-direction: column; gap: 2px; }
      #section-3dplot button.p3d-legend-item { all: unset; box-sizing: border-box; display: flex; align-items: center;
        gap: 10px; width: 100%; padding: 6px 8px; margin: 0 -8px; border-radius: 6px; cursor: pointer;
        font-size: 12px; line-height: 1.35; color: ${INK}; transition: background 0.15s, opacity 0.15s; }
      #section-3dplot button.p3d-legend-item:hover { background: #F5F3EF; }
      #section-3dplot button.p3d-legend-item.is-active .p3d-legend-label { font-weight: 600; }
      #section-3dplot button.p3d-legend-item.is-dim { opacity: 0.4; }
      #section-3dplot button.p3d-legend-item.is-hidden { opacity: 0.35; }
      #section-3dplot button.p3d-legend-item.is-hidden .p3d-swatch { background: transparent !important;
        box-shadow: inset 0 0 0 1px #BBB; }
      .p3d-swatch { flex: 0 0 18px; height: 3px; border-radius: 2px; }
      .p3d-axis-note { display: flex; flex-direction: column; font-size: 11.5px; line-height: 1.4; margin-bottom: 8px; color: #555; }
      .p3d-axis-note b { color: ${INK}; font-weight: 600; }
      .p3d-hint { font-size: 11px; line-height: 1.5; color: ${MUTED}; margin-top: auto; }
      .p3d-tooltip { position: absolute; pointer-events: none; opacity: 0; transition: opacity 0.12s; min-width: 190px;
        background: rgba(255,255,255,0.97); border: 1px solid #E0DDD7; border-radius: 8px; padding: 10px 12px;
        box-shadow: 0 6px 20px rgba(0,0,0,0.08); font-size: 11.5px; color: ${INK}; z-index: 5; }
      .p3d-tt-head { display: flex; align-items: center; gap: 8px; font-weight: 600; line-height: 1.3; }
      .p3d-tt-head i { flex: 0 0 8px; height: 8px; border-radius: 50%; }
      .p3d-tt-year { color: ${MUTED}; margin: 2px 0 8px 16px; }
      .p3d-tt-row { display: flex; justify-content: space-between; gap: 16px; padding: 2px 0 2px 16px;
        font-variant-numeric: tabular-nums; }
      .p3d-tt-row span { color: #666; }
      #plot3dControls { display: flex; align-items: center; gap: 12px; }
      .p3d-segmented { display: inline-flex; background: #FFF; border: 1px solid #D5D1CA; border-radius: 6px; padding: 2px; }
      #section-3dplot button.p3d-btn { height: 24px; line-height: 22px; padding: 0 12px; margin: 0; font-size: 11px;
        font-weight: 400; font-family: inherit; text-transform: none; letter-spacing: normal; color: #555;
        background: transparent; border: 1px solid transparent; border-radius: 4px; cursor: pointer;
        transition: background 0.15s, color 0.15s; }
      #section-3dplot button.p3d-btn:hover { background: #F2F0EC; }
      #section-3dplot .p3d-segmented button.p3d-btn.is-active { background: ${INK}; color: #FFF; }
      #section-3dplot button.p3d-btn-export { height: 28px; background: #FFF; border-color: #CCC; color: #444; }
      .p3d-message { color: #888; font-size: 13px; padding: 16px 0; }
      @media (max-width: 900px) {
        .p3d-card { flex-direction: column; padding: 16px; }
        .p3d-side { flex-basis: auto; }
      }
    `
    document.head.appendChild(style)
  }

  function buildLayout (container) {
    container.innerHTML = ''
    const card = d3.select(container).append('div').attr('class', 'p3d-card')

    dom.plot = card.append('div').attr('class', 'p3d-plot')
    dom.svg = dom.plot.append('svg').attr('role', 'img')
      .attr('aria-label', 'Driedimensionale weergave van scenariotrajecten')
    dom.hit = dom.svg.append('rect').attr('fill', 'transparent')
    dom.frame = dom.svg.append('g').attr('pointer-events', 'none')
    dom.shadows = dom.svg.append('g').attr('pointer-events', 'none')
    dom.scene = dom.svg.append('g')
    dom.axes = dom.svg.append('g')
    dom.labels = dom.svg.append('g')
    dom.tooltip = dom.plot.append('div').attr('class', 'p3d-tooltip')

    dom.legend = card.append('div').attr('class', 'p3d-side')

    const measure = () => {
      const width = Math.max(320, dom.plot.node().clientWidth)
      size = { width, height: width < 600 ? Math.round(width * 0.9) : HEIGHT }
    }
    measure()
    if (typeof ResizeObserver === 'function') {
      let last = size.width
      new ResizeObserver(() => {
        measure()
        if (size.width !== last) {
          last = size.width
          render()
        }
      }).observe(dom.plot.node())
    }
  }

  window.init3DPlot = async function () {
    const section = document.getElementById('section-3dplot')
    const container = document.getElementById('plot3dContainer')
    if (!section || !container || initialized) return
    initialized = true
    await configReady()

    if (typeof viewerConfig !== 'undefined' && viewerConfig?.viewer?.has3DPlot === false) {
      section.style.display = 'none'
      return
    }

    injectStyles()
    settings = readSettings()
    container.innerHTML = '<p class="p3d-message">Laden…</p>'

    try {
      series = buildSeries(await loadRows())
    } catch (error) {
      console.warn('3D plot:', error.message)
      container.innerHTML = '<p class="p3d-message">Data voor deze sectie is niet beschikbaar.</p>'
      return
    }
    if (!series.length) {
      container.innerHTML = '<p class="p3d-message">Data voor deze sectie is niet beschikbaar.</p>'
      return
    }

    buildScales()
    buildControls()
    buildLayout(container)
    buildLegend()
    attachDrag()
    render()
  }

  window.update3DPlotScenario = function () {
    render()
  }

  window.addEventListener('scenarioVisibilityChanged', () => render())
})()
