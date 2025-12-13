// Theme toggle
const themeToggle = document.getElementById("theme-toggle")
const htmlElement = document.documentElement

// Load theme preference
const savedTheme = localStorage.getItem("theme") || "dark"
if (savedTheme === "light") {
    htmlElement.classList.add("light-mode")
}

// Toggle theme
themeToggle.addEventListener("click", () => {
    htmlElement.classList.toggle("light-mode")
    const isLight = htmlElement.classList.contains("light-mode")
    localStorage.setItem("theme", isLight ? "light" : "dark")
})

// Mobile menu (optional)
const mobileMenuBtn = document.querySelector(".mobile-menu-btn")
const navLinks = document.querySelector(".nav-links")

if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener("click", () => {
        navLinks.style.display = navLinks.style.display === "flex" ? "none" : "flex"
    })
}

// Video Carousel Logic (Infinite Loop)
document.addEventListener("DOMContentLoaded", () => {
    const carousel = document.querySelector(".video-carousel")
    const prevBtn = document.querySelector(".prev-btn")
    const nextBtn = document.querySelector(".next-btn")
    const indicators = document.querySelectorAll(".indicator")
    const items = document.querySelectorAll(".carousel-item")

    if (!carousel || items.length === 0) return

    // Clone first and last items for infinite loop
    const firstClone = items[0].cloneNode(true)
    const lastClone = items[items.length - 1].cloneNode(true)

    // Add clones
    carousel.appendChild(firstClone)
    carousel.insertBefore(lastClone, items[0])

    const totalItems = items.length
    let currentIndex = 1 // Start at 1 (first real item) because of prepended clone
    let isTransitioning = false

    // Initial scroll to first real item (skip clone)
    const scrollToRealFirst = () => {
        carousel.style.scrollBehavior = "auto"
        carousel.scrollLeft = carousel.offsetWidth
        carousel.style.scrollBehavior = "smooth"
    }
    // Wait for layout
    setTimeout(scrollToRealFirst, 50)

    const updateIndicators = (realIndex) => {
        indicators.forEach((ind, i) => {
            if (i === realIndex) ind.classList.add("active")
            else ind.classList.remove("active")
        })
    }

    const scrollCarousel = (index, smooth = true) => {
        if (isTransitioning) return
        isTransitioning = true

        carousel.style.scrollBehavior = smooth ? "smooth" : "auto"
        carousel.scrollLeft = index * carousel.offsetWidth
        currentIndex = index

        // Update indicators immediately for better UX (calculating real index)
        let realIndex = currentIndex - 1
        if (currentIndex === 0) realIndex = totalItems - 1
        if (currentIndex === totalItems + 1) realIndex = 0
        updateIndicators(realIndex)

        setTimeout(() => { isTransitioning = false }, 500)
    }

    // Button Listeners
    if (nextBtn) {
        nextBtn.addEventListener("click", () => {
            if (currentIndex >= totalItems + 1) return
            scrollCarousel(currentIndex + 1)
        })
    }

    if (prevBtn) {
        prevBtn.addEventListener("click", () => {
            if (currentIndex <= 0) return
            scrollCarousel(currentIndex - 1)
        })
    }

    // Infinite Loop Logic on Scroll End
    carousel.addEventListener("scroll", () => {
        if (isTransitioning) return // Ignore scroll events during button transition

        const scrollLeft = carousel.scrollLeft
        const width = carousel.offsetWidth
        const index = Math.round(scrollLeft / width)

        // If manual scroll changed index, update it
        if (index !== currentIndex) {
            currentIndex = index
            let realIndex = currentIndex - 1
            if (realIndex < 0) realIndex = totalItems - 1
            if (realIndex >= totalItems) realIndex = 0
            updateIndicators(realIndex)
        }

        // Silent Loop Jumps
        clearTimeout(carousel.scrollTimeout)
        carousel.scrollTimeout = setTimeout(() => {
            if (currentIndex === 0) { // At Last Clone -> Jump to Real Last
                carousel.style.scrollBehavior = "auto"
                currentIndex = totalItems
                carousel.scrollLeft = currentIndex * width
                carousel.style.scrollBehavior = "smooth"
            }
            if (currentIndex === totalItems + 1) { // At First Clone -> Jump to Real First
                carousel.style.scrollBehavior = "auto"
                currentIndex = 1
                carousel.scrollLeft = currentIndex * width
                carousel.style.scrollBehavior = "smooth"
            }
        }, 150)
    })

    // Indicator clicks
    indicators.forEach((ind, i) => {
        ind.addEventListener("click", () => {
            scrollCarousel(i + 1) // +1 because 0 is a clone
        })
    })

    // Handle Resize
    window.addEventListener("resize", () => {
        carousel.style.scrollBehavior = "auto"
        carousel.scrollLeft = currentIndex * carousel.offsetWidth
        carousel.style.scrollBehavior = "smooth"
    })
})

// Media Modal Logic (handles both images and videos)
document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("video-modal")
    const modalImg = modal.querySelector("img")
    const modalVideo = modal.querySelector("video")
    const closeBtn = document.querySelector(".close-modal")
    const expandBtns = document.querySelectorAll(".expand-btn")

    if (!modal) return

    expandBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.preventDefault()
            e.stopPropagation()
            const videoWrapper = btn.closest(".video-wrapper")

            // Check if it's an image or video
            const sourceImg = videoWrapper.querySelector("img")
            const sourceVideo = videoWrapper.querySelector("video")

            if (sourceImg) {
                // It's an image (GIF)
                const sourceSrc = sourceImg.getAttribute("src")
                modalImg.src = sourceSrc
                modalImg.style.display = "block"
                modalVideo.style.display = "none"
                modal.style.display = "flex"
            } else if (sourceVideo) {
                // It's a video
                const sourceSrc = sourceVideo.getAttribute("src")
                modalVideo.src = sourceSrc
                modalVideo.style.display = "block"
                modalImg.style.display = "none"
                modal.style.display = "flex"
                // Slight delay to ensure display:flex renders before playing
                requestAnimationFrame(() => {
                    modalVideo.play().catch(err => console.error("Auto-play failed:", err))
                })
            }
        })
    })

    const closeModal = () => {
        modal.style.display = "none"
        modalVideo.pause()
        modalVideo.currentTime = 0
        modalVideo.src = "" // Clear src to stop buffering
        modalImg.src = "" // Clear img src
    }

    closeBtn.addEventListener("click", closeModal)

    // Close on outside click
    window.addEventListener("click", (e) => {
        if (e.target === modal) {
            closeModal()
        }
    })

    // Close on Escape key
    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modal.style.display === "flex") {
            closeModal()
        }
    })
})

// Fetch Marketplace Stats
const fetchMarketplaceStats = async () => {
    try {
        const response = await fetch("https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json;api-version=3.0-preview.1"
            },
            body: JSON.stringify({
                filters: [{
                    criteria: [{
                        filterType: 7,
                        value: "ric-v.postgres-explorer"
                    }]
                }],
                flags: 914 // Include statistics, versions, etc.
            })
        })

        const data = await response.json()
        const extension = data.results[0].extensions[0]

        if (extension) {
            // Stats
            const installCount = extension.statistics.find(s => s.statisticName === "install")?.value
            const rating = extension.statistics.find(s => s.statisticName === "weightedRating")?.value
            const version = extension.versions[0].version

            // DOM Elements
            const downloadEl = document.getElementById("stat-downloads")
            const ratingEl = document.getElementById("stat-rating")
            const versionEl = document.getElementById("stat-version")
            const badgeVersionEl = document.getElementById("badge-version")

            // Format numbers
            const formatNumber = (num) => {
                if (num >= 1000000) return (num / 1000000).toFixed(1) + "M"
                if (num >= 1000) return (num / 1000).toFixed(1) + "K"
                return num
            }

            // Update UI
            if (downloadEl) downloadEl.textContent = formatNumber(installCount)
            if (ratingEl) ratingEl.textContent = rating ? rating.toFixed(1) : "5.0"
            if (versionEl) versionEl.textContent = "v" + version
            if (badgeVersionEl) badgeVersionEl.textContent = version
        }
    } catch (error) {
        console.error("Failed to fetch marketplace stats:", error)
    }
}

// Init
fetchMarketplaceStats()
