// loader.js
// Non-blocking persistent notifier-style loader (default).
//
// API unchanged:
//   showLoader(message, opts)
//   hideLoader()
//   updateLoader(message)
//   isLoaderVisible()
//
// Default opts:
//   { gifUrl = '/assets/loader.gif', nonBlocking = true, ariaLabel = null, maxDuration = null }
// To get the old blocking overlay behavior, call showLoader(..., { nonBlocking: false })

const DEFAULT_GIF = '/assets/loader.gif';
const OVERLAY_ID = 'loading-overlay';
const MSG_ID = 'loading-msg';
const GIF_ID = 'loading-gif';
const CARD_ID = 'loading-card';

let _autoHideTimer = null;

/**
 * Create DOM structure if it doesn't exist.
 * We create a single element that can behave either as:
 * - non-blocking notifier (bottom-center toast-like)
 * - blocking fullscreen overlay (centered with backdrop)
 */
function ensureDOM() {
    if (document.getElementById(OVERLAY_ID)) return;

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'hidden'; // reuse your CSS .hidden class to hide
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.setAttribute('aria-hidden', 'true');

    // inner structure: backdrop (may be hidden) and card
    overlay.innerHTML = `
    <div class="loading-backdrop" aria-hidden="true"></div>
    <div class="loading-card" id="${CARD_ID}">
      <img id="${GIF_ID}" class="loading-gif" alt="Loading" />
      <div id="${MSG_ID}" class="loading-msg"></div>
    </div>
  `;

    // minimal base styles to ensure notifier positioning works even without CSS changes.
    // These are conservative and won't override your base.css unless necessary.
    overlay.style.position = 'fixed';
    overlay.style.zIndex = '2000';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.pointerEvents = 'none'; // default non-blocking

    // small defaults for the card to look like your theme (will be overridden by base.css if present)
    const card = overlay.querySelector('.loading-card');
    if (card) {
        card.style.pointerEvents = 'none'; // allow clicks to pass through by default
        card.style.background = 'var(--card, #fff)';
        card.style.border = '1px solid var(--border, #cdd2d9)';
        card.style.borderRadius = '8px';
        card.style.boxShadow = 'var(--shadow, 0 1px 3px rgba(0,0,0,.06))';
        card.style.padding = '12px 16px';
        card.style.display = 'flex';
        card.style.gap = '10px';
        card.style.alignItems = 'center';
        card.style.minWidth = '160px';
        card.style.maxWidth = '90%';
    }

    const gif = overlay.querySelector('.loading-gif');
    if (gif) {
        gif.style.width = '36px';
        gif.style.height = '36px';
        gif.style.objectFit = 'contain';
    }

    const msg = overlay.querySelector('.loading-msg');
    if (msg) {
        msg.style.fontSize = '0.95rem';
        msg.style.color = 'var(--txt, #24313f)';
    }

    // append to body
    document.body.appendChild(overlay);
}

/**
 * Show the loader.
 * opts:
 *   gifUrl (string|null) - gif url or null to hide image
 *   nonBlocking (bool) - true => notifier-like, false => blocking overlay
 *   ariaLabel (string|null)
 *   maxDuration (ms|null) - auto-hide safety timer
 */
export function showLoader(message = 'Loading…', opts = {}) {
    const {
        gifUrl = DEFAULT_GIF,
        nonBlocking = true,
        ariaLabel = null,
        maxDuration = null
    } = opts || {};

    ensureDOM();

    const overlay = document.getElementById(OVERLAY_ID);
    const gif = document.getElementById(GIF_ID);
    const msg = document.getElementById(MSG_ID);
    const card = document.getElementById(CARD_ID);
    const backdrop = overlay.querySelector('.loading-backdrop');

    // Defensive recreate if needed
    if (!overlay || !msg || !card) {
        const existing = document.getElementById(OVERLAY_ID);
        if (existing) existing.remove();
        ensureDOM();
    }

    // message
    const messageNode = document.getElementById(MSG_ID);
    if (messageNode) messageNode.textContent = message || '';

    // gif handling
    const gifNode = document.getElementById(GIF_ID);
    if (gifNode) {
        if (gifUrl) {
            gifNode.src = gifUrl;
            gifNode.style.display = '';
        } else {
            gifNode.removeAttribute('src');
            gifNode.style.display = 'none';
        }
    }

    // Style/behavior for notifier (non-blocking) vs blocking overlay
    if (nonBlocking) {
        // Position like a toast: bottom center, no backdrop, allow clicks through
        overlay.style.pointerEvents = 'none';
        if (backdrop) backdrop.style.display = 'none';

        // place card bottom-center
        overlay.style.left = '50%';
        overlay.style.right = 'auto';
        overlay.style.top = 'auto';
        overlay.style.bottom = '80px';
        overlay.style.transform = 'translateX(-50%)';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'flex-end';

        // make card non-interactive so it does not block clicks
        if (card) {
            card.style.pointerEvents = 'none';
            // subtle box shadow / size adjustments can remain
        }

    } else {
        // blocking: fullscreen centered with backdrop and pointer-events enabled
        overlay.style.pointerEvents = 'auto';
        if (backdrop) {
            backdrop.style.display = '';
            backdrop.style.position = 'absolute';
            backdrop.style.inset = '0';
            backdrop.style.background = 'rgba(0,0,0,0.35)';
            backdrop.style.backdropFilter = 'blur(2px)';
            backdrop.style.pointerEvents = 'auto';
        }

        // full-screen centered
        overlay.style.left = '0';
        overlay.style.right = '0';
        overlay.style.top = '0';
        overlay.style.bottom = '0';
        overlay.style.transform = '';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';

        if (card) {
            card.style.pointerEvents = 'auto';
        }
    }

    // show
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    overlay.setAttribute('aria-busy', 'true');
    if (ariaLabel) overlay.setAttribute('aria-label', ariaLabel);
    else overlay.removeAttribute('aria-label');

    // reset any previous timer
    if (_autoHideTimer) {
        clearTimeout(_autoHideTimer);
        _autoHideTimer = null;
    }

    if (typeof maxDuration === 'number' && maxDuration > 0) {
        _autoHideTimer = setTimeout(() => {
            hideLoader();
            _autoHideTimer = null;
        }, maxDuration);
    }
}

/**
 * Hide the loader.
 */
export function hideLoader() {
    if (_autoHideTimer) {
        clearTimeout(_autoHideTimer);
        _autoHideTimer = null;
    }

    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('aria-busy', 'false');

    // clear gif to avoid continued animation/network usage
    const gif = document.getElementById(GIF_ID);
    if (gif) gif.removeAttribute('src');

    // restore generic layout defaults (so a subsequent show with different opts behaves correctly)
    overlay.style.pointerEvents = 'none';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.top = '0';
    overlay.style.bottom = '0';
    overlay.style.transform = '';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';

    const backdrop = overlay.querySelector('.loading-backdrop');
    if (backdrop) backdrop.style.display = '';
}

/**
 * Update the loader message while visible (or show it if not present).
 */
export function updateLoader(message) {
    const msg = document.getElementById(MSG_ID);
    if (msg) {
        msg.textContent = message || '';
    } else {
        // show with defaults
        showLoader(message);
    }
}

/**
 * Whether the loader is visible right now.
 */
export function isLoaderVisible() {
    const overlay = document.getElementById(OVERLAY_ID);
    return !!overlay && !overlay.classList.contains('hidden');
}
