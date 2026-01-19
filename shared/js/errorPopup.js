// Error Popup Module
// Shows detailed error information in a modal popup

/**
 * Display an error popup with detailed information
 * @param {Object} options - Error display options
 * @param {string} options.title - Error title
 * @param {string} options.message - Main error message
 * @param {Error} options.error - Error object (optional)
 * @param {Object} options.context - Additional context data (optional)
 * @param {string} options.stackTrace - Stack trace (optional)
 */
function showErrorPopup(options) {
  const {
    title = 'Error',
    message = 'An error occurred',
    error = null,
    context = {},
    stackTrace = null
  } = options

  // Close any existing error popup
  closeErrorPopup()

  // Create popup container
  const popupContainer = d3.select('body')
    .append('div')
    .attr('id', 'errorPopupContainer')
    .style('position', 'fixed')
    .style('top', '0')
    .style('left', '0')
    .style('width', '100%')
    .style('height', '100%')
    .style('background-color', 'rgba(0, 0, 0, 0.5)')
    .style('z-index', '10000')
    .style('display', 'flex')
    .style('justify-content', 'center')
    .style('align-items', 'center')
    .on('click', function(event) {
      if (event.target === this) {
        closeErrorPopup()
      }
    })

  // Create popup content
  const popup = popupContainer
    .append('div')
    .attr('id', 'errorPopupContent')
    .style('background-color', '#fff')
    .style('border-radius', '8px')
    .style('box-shadow', '0 4px 20px rgba(0,0,0,0.3)')
    .style('max-width', '800px')
    .style('max-height', '80vh')
    .style('overflow-y', 'auto')
    .style('padding', '30px')
    .style('position', 'relative')
    .on('click', function(event) {
      event.stopPropagation()
    })

  // Close button
  const closeButton = popup.append('button')
    .attr('id', 'errorPopupCloseButton')
    .style('position', 'absolute')
    .style('top', '15px')
    .style('right', '15px')
    .style('width', '30px')
    .style('height', '30px')
    .style('border', 'none')
    .style('background-color', '#f5f5f5')
    .style('border-radius', '4px')
    .style('cursor', 'pointer')
    .style('font-size', '18px')
    .style('color', '#666')
    .style('display', 'flex')
    .style('align-items', 'center')
    .style('justify-content', 'center')
    .text('×')
    .on('click', closeErrorPopup)
    .on('mouseover', function() {
      d3.select(this).style('background-color', '#e0e0e0')
    })
    .on('mouseout', function() {
      d3.select(this).style('background-color', '#f5f5f5')
    })

  // Error icon and title
  const header = popup.append('div')
    .style('display', 'flex')
    .style('align-items', 'center')
    .style('margin-bottom', '20px')

  header.append('div')
    .style('width', '40px')
    .style('height', '40px')
    .style('border-radius', '50%')
    .style('background-color', '#f44336')
    .style('display', 'flex')
    .style('align-items', 'center')
    .style('justify-content', 'center')
    .style('margin-right', '15px')
    .style('color', 'white')
    .style('font-size', '24px')
    .style('font-weight', 'bold')
    .text('!')

  header.append('h2')
    .style('margin', '0')
    .style('font-size', '24px')
    .style('color', '#333')
    .text(title)

  // Error message
  popup.append('div')
    .style('margin-bottom', '20px')
    .style('padding', '15px')
    .style('background-color', '#fff3f3')
    .style('border-left', '4px solid #f44336')
    .style('border-radius', '4px')
    .append('p')
    .style('margin', '0')
    .style('font-size', '14px')
    .style('color', '#333')
    .style('line-height', '1.5')
    .text(message)

  // Error details section
  if (error) {
    const detailsSection = popup.append('div')
      .style('margin-bottom', '20px')

    detailsSection.append('h3')
      .style('margin', '0 0 10px 0')
      .style('font-size', '16px')
      .style('color', '#555')
      .text('Error Details')

    const detailsBox = detailsSection.append('div')
      .style('padding', '15px')
      .style('background-color', '#f9f9f9')
      .style('border', '1px solid #ddd')
      .style('border-radius', '4px')
      .style('font-family', 'monospace')
      .style('font-size', '12px')
      .style('color', '#d32f2f')

    if (error.message) {
      detailsBox.append('div')
        .style('margin-bottom', '10px')
        .html(`<strong>Message:</strong> ${error.message}`)
    }

    if (error.name) {
      detailsBox.append('div')
        .style('margin-bottom', '10px')
        .html(`<strong>Type:</strong> ${error.name}`)
    }
  }

  // Context information
  if (context && Object.keys(context).length > 0) {
    const contextSection = popup.append('div')
      .style('margin-bottom', '20px')

    contextSection.append('h3')
      .style('margin', '0 0 10px 0')
      .style('font-size', '16px')
      .style('color', '#555')
      .text('Context Information')

    const contextBox = contextSection.append('div')
      .style('padding', '15px')
      .style('background-color', '#f9f9f9')
      .style('border', '1px solid #ddd')
      .style('border-radius', '4px')
      .style('font-family', 'monospace')
      .style('font-size', '12px')

    Object.entries(context).forEach(([key, value]) => {
      contextBox.append('div')
        .style('margin-bottom', '5px')
        .html(`<strong>${key}:</strong> ${JSON.stringify(value, null, 2)}`)
    })
  }

  // Stack trace
  const trace = stackTrace || (error && error.stack)
  if (trace) {
    const stackSection = popup.append('div')
      .style('margin-bottom', '20px')

    stackSection.append('h3')
      .style('margin', '0 0 10px 0')
      .style('font-size', '16px')
      .style('color', '#555')
      .text('Stack Trace')

    const stackBox = stackSection.append('div')
      .style('padding', '15px')
      .style('background-color', '#f9f9f9')
      .style('border', '1px solid #ddd')
      .style('border-radius', '4px')
      .style('font-family', 'monospace')
      .style('font-size', '11px')
      .style('max-height', '200px')
      .style('overflow-y', 'auto')
      .style('white-space', 'pre-wrap')
      .style('word-break', 'break-all')
      .text(trace)
  }

  // Copy to clipboard button
  const buttonContainer = popup.append('div')
    .style('display', 'flex')
    .style('justify-content', 'flex-end')
    .style('gap', '10px')
    .style('margin-top', '20px')

  buttonContainer.append('button')
    .style('padding', '10px 20px')
    .style('background-color', '#2196F3')
    .style('color', 'white')
    .style('border', 'none')
    .style('border-radius', '4px')
    .style('cursor', 'pointer')
    .style('font-size', '14px')
    .text('Copy Error Details')
    .on('click', function() {
      const errorDetails = `
${title}
${'='.repeat(title.length)}

Message: ${message}

${error ? `Error Type: ${error.name}
Error Message: ${error.message}
` : ''}
${Object.keys(context).length > 0 ? `
Context:
${JSON.stringify(context, null, 2)}
` : ''}
${trace ? `
Stack Trace:
${trace}
` : ''}
Generated: ${new Date().toISOString()}
      `.trim()

      navigator.clipboard.writeText(errorDetails).then(() => {
        // Show feedback
        const btn = d3.select(this)
        const originalText = btn.text()
        btn.text('Copied!').style('background-color', '#4CAF50')
        setTimeout(() => {
          btn.text(originalText).style('background-color', '#2196F3')
        }, 2000)
      }).catch(err => {
        console.error('Failed to copy to clipboard:', err)
        alert('Failed to copy to clipboard')
      })
    })
    .on('mouseover', function() {
      d3.select(this).style('background-color', '#1976D2')
    })
    .on('mouseout', function() {
      d3.select(this).style('background-color', '#2196F3')
    })

  buttonContainer.append('button')
    .style('padding', '10px 20px')
    .style('background-color', '#757575')
    .style('color', 'white')
    .style('border', 'none')
    .style('border-radius', '4px')
    .style('cursor', 'pointer')
    .style('font-size', '14px')
    .text('Close')
    .on('click', closeErrorPopup)
    .on('mouseover', function() {
      d3.select(this).style('background-color', '#616161')
    })
    .on('mouseout', function() {
      d3.select(this).style('background-color', '#757575')
    })

  console.error('Error popup displayed:', {title, message, error, context, stackTrace: trace})
}

/**
 * Close the error popup
 */
function closeErrorPopup() {
  d3.select('#errorPopupContainer').remove()
}

// Make functions globally available
window.showErrorPopup = showErrorPopup
window.closeErrorPopup = closeErrorPopup
