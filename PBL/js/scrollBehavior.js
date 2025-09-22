// Function to handle scroll behavior for hiding buttons
function setupScrollBehavior () {
  const waterfallSection = document.querySelector('.scaled-wrapper-waterfall')
  const yearButtons = document.querySelector('#yearButtons')
  const scopeButtons = document.querySelector('#sankeyEnergiestromenSelectieMenu')
  const menuContainer = document.querySelector('#menuContainer')

  if (!waterfallSection || !yearButtons || !scopeButtons || !menuContainer) return

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // When waterfall section is in view, hide the buttons with transition
        yearButtons.classList.add('hidden')
        scopeButtons.classList.add('hidden')
        menuContainer.classList.add('hidden-buttons')
      } else {
        // When waterfall section is out of view, show the buttons with transition
        yearButtons.classList.remove('hidden')
        scopeButtons.classList.remove('hidden')
        menuContainer.classList.remove('hidden-buttons')
      }
    })
  }, {
    threshold: 0.5 // Trigger when 10% of the element is visible
  })

  observer.observe(waterfallSection)
}

// Call the function when the DOM is loaded
document.addEventListener('DOMContentLoaded', setupScrollBehavior)
