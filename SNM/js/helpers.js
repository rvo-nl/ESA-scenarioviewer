function wrap (text, width) {
  text.each(function () {
    var text = d3.select(this),
      words = text.text().split(/\s+/).reverse(),
      word,
      line = [],
      lineNumber = 0,
      lineHeight = 1.8, // ems
      y = text.attr('y'),
      dy = parseFloat(text.attr('dy'))
    if (isNaN(dy)) {dy = 0}
    var tspan = text.text(null).append('tspan').attr('x', 10).attr('y', y).attr('dy', dy + 'em')
    while (word = words.pop()) {
      line.push(word)
      tspan.text(line.join(' '))
      if (tspan.node().getComputedTextLength() > width) {
        line.pop()
        tspan.text(line.join(' '))
        line = [word]
        tspan = text.append('tspan').attr('x', 10).attr('y', 0).attr('dy', ++lineNumber * lineHeight + dy + 'em').text(word) // changed x from 0 to 20 TIJS
      }
    }
  })
}

function getTextWidth (text, fontSize, fontFamily, fontWeight) {
  // Create a temporary span element
  const span = document.createElement('span')
  // Set the span's font properties
  span.style.fontSize = fontSize
  span.style.fontFamily = fontFamily
  // Set the span's text content
  span.textContent = text
  // Add the span to the body to measure its width
  document.body.appendChild(span)
  // Get the width of the span
  const width = span.offsetWidth
  // Remove the span from the body
  document.body.removeChild(span)
  // Return the width
  return width
}
