setTimeout(() => {
  initializeUI
}, 500)

// init
let factor = 1675
let maxWidth = 1900

function initializeUI () {
  // initilize ui
  if (document.getElementById('main-container').offsetWidth > maxWidth) {
    windowScaleValueInit = maxWidth / factor
  } else {windowScaleValueInit = document.getElementById('main-container').offsetWidth / 940 }
}

// Update the waterfall selection display when the page loads
window.addEventListener('load', function () {
  // Try to update the waterfall display if the function exists
  if (typeof updateWaterfallSelectionDisplay === 'function') {
    updateWaterfallSelectionDisplay(currentRoutekaart, currentSector)
  }
})

// Create a ResizeObserver instance
const resizeObserver = new ResizeObserver((entries) => {
  for (let entry of entries) {
    let { width, height } = entry.contentRect

    // Restrict to maxWidth if necessary
    if (width > maxWidth) width = maxWidth

    // Calculate scaling value and dynamic styles
    const windowScaleValue = width / factor
    // Scale the SVG
    // console.log(sankeyConfigs)

    if (typeof sankeyConfigs === 'undefined' || !sankeyConfigs) return
    sankeyConfigs.forEach(element => {
      const svgElement = d3.select('#' + element.sankeyInstanceID + '_sankeySVGPARENT')
      const backdropElement = d3.select('#' + element.sankeyInstanceID + '_backdropSVG')
      const targetEl = document.getElementById(element.targetDIV)
      if (!targetEl) return
      const containerWidth = targetEl.offsetWidth - 40
      const originalWidth = element.width; // Adjust based on your SVG's original width
      const originalHeight = element.height; // Adjust based on your SVG's original heigh
      const scale = containerWidth / originalWidth

      // Update sankey SVG
      svgElement.attr('viewBox', `0 0 ${originalWidth} ${originalHeight}`)
      svgElement.attr('width', originalWidth * scale)
      svgElement.attr('height', originalHeight * scale)

      // Update backdrop SVG with same dimensions
      backdropElement.attr('viewBox', `0 0 ${originalWidth} ${originalHeight}`)
      backdropElement.attr('width', originalWidth * scale)
      backdropElement.attr('height', originalHeight * scale)

      const svgParent = document.getElementById(element.sankeyInstanceID + '_sankeySVGPARENT')
      if (svgParent) {
        d3.select(element.targetDIV).style('height', svgParent.getBoundingClientRect().height + 'px')
      }
    })
    d3.select('#menuContainer2').style('top', document.getElementById('menuContainer').offsetHeight + 'px')
  }
})

// Observe the target element
const targetElement = document.getElementById('main-container') // Adjust target as needed
if (targetElement) {
  resizeObserver.observe(targetElement)
} else {
  console.error('Target element for ResizeObserver not found.')
}
// Observe the div for resize changes
const resizeableDiv = document.getElementById('main-container')
resizeObserver.observe(resizeableDiv)
