function drawRemarks () {
  // console.log(sankeyData.nodes)
  d3.select('#remarksContainer').html('') // EDIT TIJS - add
  for (i = 0;i < sankeyData.nodes.length;i++) {
    // console.log(sankeyData.nodes[i])
    addToRemarksContainer('remarksContainer', sankeyData.nodes[i].remark[currentScenarioID + 1], sankeyData.nodes[i].index + 1) // start counting at 1 instead of zero
  }
}

function addToRemarksContainer (targetdiv, remarksData2, index) {
  if (!remarksData2) { // Add this check to skip null/undefined remarks
    return
  }

  // Parse any <info>, <aanname>, <bron> from the remarksData2 HTML string
  const parser = new DOMParser()
  const parsedHTML = parser.parseFromString(remarksData2, 'text/html')

  const infoItems = parsedHTML.querySelectorAll('info')
  const aannameItems = parsedHTML.querySelectorAll('aanname')
  const bronItems = parsedHTML.querySelectorAll('bron')

  // If there are no recognized custom tags, exit early
  if (infoItems.length === 0 && aannameItems.length === 0 && bronItems.length === 0) {
    return
  }

  // Create a 2-column "wrapper":
  //   Column #1: The big "A" path
  //   Column #2: A <ul> with multiple <li> entries
  const wrapper = document.createElement('div')
  wrapper.style.display = 'grid'
  // Adjust the width of the first column (where the big "A" goes) to your liking
  wrapper.style.gridTemplateColumns = '0px auto'
  wrapper.style.columnGap = '16px'
  wrapper.style.alignItems = 'start'
  // Optional margin to space out each entire group
  wrapper.style.marginBottom = '24px'
  wrapper.style.marginRight = '0px'

  // 1) Left column: the big "A" SVG
  const leftColumn = document.createElement('div')
  // We'll create the big "A" via a helper function
  const bigASVG = createBigA(index, remarksData2)
  leftColumn.appendChild(bigASVG)

  // 2) Right column: a <ul> that holds the different remarks
  const rightColumn = document.createElement('ul')
  rightColumn.style.listStyleType = 'none'
  rightColumn.style.padding = '0' // remove default padding
  rightColumn.style.margin = '0' // remove default margin

  // Attach columns to the wrapper
  wrapper.appendChild(leftColumn)
  wrapper.appendChild(rightColumn)

  // A small helper to add an <li> with an icon (left) and text (right)
  function addListItem (tagType, content) {
    const li = document.createElement('li')

    // Each <li> is effectively another 2-column layout
    li.style.display = 'grid'
    li.style.gridTemplateColumns = '80px auto'; // icon column + text column
    li.style.alignItems = 'start'
    li.style.columnGap = '8px'
    li.style.marginBottom = '8px' // space between each item

    // The small icon
    const icon = createIcon(tagType)
    // The text next to the icon
    const textSpan = document.createElement('span')
    textSpan.innerHTML = content // keep HTML if needed

    // Append icon + text to li
    li.appendChild(icon)
    li.appendChild(textSpan)

    // (Optional: styling based on type, e.g., bigger font for <aanname> or so)
    // if (tagType === 'aanname') {
    //   textSpan.style.fontWeight = 'bold'
    // }

    rightColumn.appendChild(li)
  }

  // Finally, loop over each item found and add them as list items
  infoItems.forEach((elem) => {
    addListItem('info', elem.innerHTML)
  })

  bronItems.forEach((elem) => {
    addListItem('bron', elem.innerHTML)
  })

  aannameItems.forEach((elem) => {
    addListItem('aanname', elem.innerHTML)
  })

  // Append everything to #remarksContainer
  document.getElementById(targetdiv).appendChild(wrapper)
}

/**
 * Helper function to create the big "A" (or any index letter/number) in an SVG.
 * Color depends on whether <aanname> appears in remarksData2.
 */
function createBigA (index, remarksData2) {
  // Create the SVG element
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', '60')
  svg.setAttribute('height', '60')
  svg.setAttribute('viewBox', '0 -960 960 960')

  // Main path
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M152-160q-23 0-35-20.5t1-40.5l328-525q12-19 34-19t34 19l328 525q13 20 1 40.5T808-160H152Z')
  path.setAttribute('transform', 'translate(1075,-970) rotate(180) scale(0.8)')
  // Decide fill color based on <aanname> presence
  const fillColor = hasAanname(remarksData2) ? '#c1121f' : '#495057'
  path.setAttribute('fill', fillColor)

  svg.appendChild(path) // disable i

  // Overlay text (the 'A' or your index)
  const textA = document.createElementNS('http://www.w3.org/2000/svg', 'text')
  textA.setAttribute('x', '690')
  textA.setAttribute('y', '-650')
  textA.setAttribute('text-anchor', 'middle')
  textA.setAttribute('dominant-baseline', 'middle')
  textA.setAttribute('font-size', '224')
  textA.setAttribute('fill', 'white')
  textA.setAttribute('font-weight', 'bold')
  textA.textContent = index; // e.g. 'A' or '1' or something

  svg.appendChild(textA)

  return svg
}

/**
 * Helper function to detect if <aanname> tags exist in the given string.
 */
function hasAanname (inputString) {
  const parser = new DOMParser()
  const parsedHTML = parser.parseFromString(inputString, 'text/html')
  const aannameItems = parsedHTML.querySelectorAll('aanname')
  return aannameItems.length > 0
}

/**
 * Helper function to create the small icon (info/aanname/bron).
 * You can adjust sizes, colors, paths as needed.
 */
function createIcon (type) {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  icon.setAttribute('width', '32')
  icon.setAttribute('height', '32')
  icon.setAttribute('viewBox', '0 -960 960 960')

  // Shift the icon downward:
  icon.style.position = 'relative'
  icon.style.top = '8px' // Adjust as needed
  icon.style.scale = 0.9

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')

  if (type === 'aanname') {
    path.setAttribute('d', 'M109-120q-11 0-20-5.5T75-140q-5-9-5.5-19.5T75-180l370-640q6-10 15.5-15t19.5-5q10 0 19.5 5t15.5 15l370 640q6 10 5.5 20.5T885-140q-5 9-14 14.5t-20 5.5H109Zm371-120q17 0 28.5-11.5T520-280q0-17-11.5-28.5T480-320q-17 0-28.5 11.5T440-280q0 17 11.5 28.5T480-240Zm0-120q17 0 28.5-11.5T520-400v-120q0-17-11.5-28.5T480-560q-17 0-28.5 11.5T440-520v120q0 17 11.5 28.5T480-360Z')
    path.setAttribute('fill', '#c1121f')
  }
  else if (type === 'info') {
    path.setAttribute('d', 'M480-280q17 0 28.5-11.5T520-320v-160q0-17-11.5-28.5T480-520q-17 0-28.5 11.5T440-480v160q0 17 11.5 28.5T480-280Zm0-320q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Zm0 520q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z')
    path.setAttribute('fill', '#495057')
  }
  else if (type === 'bron') {
    path.setAttribute('d', 'M480-280q17 0 28.5-11.5T520-320v-160q0-17-11.5-28.5T480-520q-17 0-28.5 11.5T440-480v160q0 17 11.5 28.5T480-280Zm0-320q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Zm0 520q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z')
    path.setAttribute('fill', '#0096c7')
  }

  // icon.appendChild(path) // disable i-logo
  return icon
}
