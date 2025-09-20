/**
 * Modal.js
 *
 * This module handles all generic modal window interactions, such as
 * opening, closing, dragging, and switching internal content panes.
 * It consolidates logic originally found in `simulation.html.js`.
 *
 * Responsibilities:
 * 1. Open modals when buttons with a `data-modal` attribute are clicked.
 * 2. Close modals when their close button is clicked.
 * 3. Make modal windows draggable by their headers.
 * 4. Manage tab-like content switching within a modal.
 */

// --- Module-level variables for dragging ---
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let currentModal = null;

/**
 * Main initialization function for the module.
 * Sets up all necessary event listeners for modal interactions.
 */
function init() {
    setupModalToggles();
    setupDraggableModals();

    // Initialize content switchers for specific modals that need them.
    // This could be made more generic if more modals adopt this pattern.
    new ModalContentSwitcher('feature-modal');
    new ModalContentSwitcher('snapshot-modal');

    console.log('Modal module initialized.');
}

/**
 * Sets up the event listeners for opening and closing all modals.
 */
function setupModalToggles() {
    const openButtons = document.querySelectorAll('[data-modal]');
    const closeButtons = document.querySelectorAll('.close-btn');

    // Open modal when a trigger button is clicked
    openButtons.forEach(button => {
        button.addEventListener('click', function() {
            const modalId = this.getAttribute('data-modal');
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.style.display = 'block';
                // Reset position to center when opening
                const modalContent = modal.querySelector('.modal-content');
                if (modalContent) {
                    modalContent.style.top = '50px';
                    modalContent.style.left = '50%';
                    modalContent.style.transform = 'translateX(-50%)';
                }
            }
        });
    });

    // Close modal when its 'X' button is clicked
    closeButtons.forEach(closeBtn => {
        // Prevent the drag event from firing when clicking the close button
        closeBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        
        closeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            this.closest('.modal').style.display = 'none';
        });
    });
}

/**
 * Sets up the drag-and-drop functionality for all modal headers.
 */
function setupDraggableModals() {
    const modalHeaders = document.querySelectorAll('.modal-header');

    modalHeaders.forEach(header => {
        header.addEventListener('mousedown', startDrag);
    });

    // Use document-level listeners for mousemove and mouseup
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', endDrag);
}

// --- Dragging Event Handlers ---

function startDrag(e) {
    // Only drag with the primary mouse button, and not on interactive elements.
    if (e.button !== 0 || e.target.matches('button, a, input, select')) {
        return;
    }
    isDragging = true;
    currentModal = e.target.closest('.modal-content');
    
    const rect = currentModal.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    
    // Remove transform to position with left/top
    currentModal.style.transform = 'none';
    document.body.classList.add('dragging'); // Optional: for custom cursor styling
}

function drag(e) {
    if (!isDragging || !currentModal) return;
    e.preventDefault();

    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;
    
    // Constrain the modal within the viewport
    const maxX = window.innerWidth - currentModal.offsetWidth;
    const maxY = window.innerHeight - currentModal.offsetHeight;
    
    const boundedX = Math.max(0, Math.min(newX, maxX));
    const boundedY = Math.max(0, Math.min(newY, maxY));
    
    currentModal.style.left = `${boundedX}px`;
    currentModal.style.top = `${boundedY}px`;
}

function endDrag() {
    isDragging = false;
    currentModal = null;
    document.body.classList.remove('dragging');
}


/**
 * A class to manage content switching within a single modal.
 * Replaces the standalone class from simulation.html.js.
 */
class ModalContentSwitcher {
    constructor(modalId) {
        this.modal = document.getElementById(modalId);
        if (!this.modal) return;

        // Determine the default section based on modal ID
        if (modalId === "feature-modal") {
            this.currentSectionId = 'feature_modal_menu';
        } else if (modalId === "snapshot-modal") {
            this.currentSectionId = 'snapshot_modal_main_content';
        }

        this.initializeSwitcher();
    }

    initializeSwitcher() {
        // Use event delegation on the modal itself for efficiency
        this.modal.addEventListener('click', (e) => {
            const target = e.target.closest('[data-target]');
            if (target) {
                const targetId = target.getAttribute('data-target');
                this.switchContent(targetId);
            }
        });

        // Show the initial default section
        if (this.currentSectionId) {
            this.switchContent(this.currentSectionId);
        }
    }

    switchContent(targetId) {
        // Hide all content sections within this modal
        const allSections = this.modal.querySelectorAll('.modal-content-section');
        allSections.forEach(section => {
            section.classList.remove('active');
        });

        // Show the target section
        const targetSection = document.getElementById(targetId);
        if (targetSection) {
            targetSection.classList.add('active');
            this.currentSectionId = targetId;
        }
    }
}


// Export the module's public API.
export default {
    init
};
