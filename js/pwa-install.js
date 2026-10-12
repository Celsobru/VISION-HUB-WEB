/* ============================================
   PWA Install Handler - Vision Plus
   ============================================ */
(function () {
    'use strict';

    // --- Service Worker Registration ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('/sw.js').catch(function (err) {
                console.log('SW registration skipped:', err);
            });
        });
    }

    // --- Install Prompt ---
    var deferredPrompt = null;

    // Create the install banner
    function createInstallBanner() {
        // Don't show if already installed (standalone mode)
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
            return;
        }

        // Don't show if user dismissed it before (24h cooldown)
        var dismissed = localStorage.getItem('pwa-install-dismissed');
        if (dismissed && Date.now() - parseInt(dismissed) < 86400000) {
            return;
        }

        var banner = document.createElement('div');
        banner.id = 'pwa-install-banner';
        banner.innerHTML =
            '<div class="pwa-banner-content">' +
            '    <div class="pwa-banner-icon">📲</div>' +
            '    <div class="pwa-banner-text">' +
            '        <strong>Instalar Vision Plus</strong>' +
            '        <span>Adicione à tela inicial para acesso rápido</span>' +
            '    </div>' +
            '    <button id="pwa-install-btn" class="pwa-install-btn">Instalar</button>' +
            '    <button id="pwa-dismiss-btn" class="pwa-dismiss-btn">&times;</button>' +
            '</div>';

        document.body.appendChild(banner);

        // Animate in
        setTimeout(function () {
            banner.classList.add('pwa-banner-visible');
        }, 1000);

        // Install button click
        document.getElementById('pwa-install-btn').addEventListener('click', function () {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then(function (choiceResult) {
                    if (choiceResult.outcome === 'accepted') {
                        console.log('PWA instalado!');
                    }
                    deferredPrompt = null;
                    banner.classList.remove('pwa-banner-visible');
                    setTimeout(function () { banner.remove(); }, 400);
                });
            }
        });

        // Dismiss button click
        document.getElementById('pwa-dismiss-btn').addEventListener('click', function () {
            localStorage.setItem('pwa-install-dismissed', Date.now().toString());
            banner.classList.remove('pwa-banner-visible');
            setTimeout(function () { banner.remove(); }, 400);
        });
    }

    // Helper to show/hide custom install triggers
    function toggleCustomTriggers(show) {
        var triggers = document.querySelectorAll('.pwa-install-trigger');
        triggers.forEach(function (trigger) {
            if (show) {
                trigger.style.setProperty('display', 'inline-flex', 'important');
            } else {
                trigger.style.setProperty('display', 'none', 'important');
            }
        });
    }

    // Set up click handlers for custom install triggers
    function setupCustomTriggers() {
        var triggers = document.querySelectorAll('.pwa-install-trigger');
        triggers.forEach(function (trigger) {
            trigger.onclick = function (e) {
                e.preventDefault();
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    deferredPrompt.userChoice.then(function (choiceResult) {
                        if (choiceResult.outcome === 'accepted') {
                            console.log('PWA instalado!');
                        }
                        deferredPrompt = null;
                        toggleCustomTriggers(false);
                        var banner = document.getElementById('pwa-install-banner');
                        if (banner) {
                            banner.classList.remove('pwa-banner-visible');
                            setTimeout(function () { banner.remove(); }, 400);
                        }
                    });
                }
            };
        });
    }

    // Listen for the browser install prompt
    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredPrompt = e;
        createInstallBanner();
        toggleCustomTriggers(true);
        setupCustomTriggers();
    });

    // If app was installed, remove the banner and hide triggers
    window.addEventListener('appinstalled', function () {
        var banner = document.getElementById('pwa-install-banner');
        if (banner) {
            banner.classList.remove('pwa-banner-visible');
            setTimeout(function () { banner.remove(); }, 400);
        }
        deferredPrompt = null;
        toggleCustomTriggers(false);
    });

    // Run setup on load in case buttons exist
    window.addEventListener('DOMContentLoaded', function () {
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
            toggleCustomTriggers(false);
        } else if (deferredPrompt) {
            toggleCustomTriggers(true);
            setupCustomTriggers();
        }
    });

    // --- Inject CSS for banner ---
    var style = document.createElement('style');
    style.textContent =
        '#pwa-install-banner {' +
        '    position: fixed;' +
        '    bottom: -100px;' +
        '    left: 50%;' +
        '    transform: translateX(-50%);' +
        '    z-index: 10000;' +
        '    transition: bottom 0.4s cubic-bezier(0.4, 0, 0.2, 1);' +
        '    width: calc(100% - 32px);' +
        '    max-width: 480px;' +
        '    pointer-events: none;' +
        '}' +
        '#pwa-install-banner.pwa-banner-visible {' +
        '    bottom: 20px;' +
        '    pointer-events: auto;' +
        '}' +
        '.pwa-banner-content {' +
        '    display: flex;' +
        '    align-items: center;' +
        '    gap: 12px;' +
        '    background: linear-gradient(135deg, #1e1e2e, #2d2b55);' +
        '    border: 1px solid rgba(108, 92, 231, 0.4);' +
        '    border-radius: 16px;' +
        '    padding: 14px 16px;' +
        '    box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(108,92,231,0.15);' +
        '    backdrop-filter: blur(12px);' +
        '}' +
        '.pwa-banner-icon {' +
        '    font-size: 32px;' +
        '    flex-shrink: 0;' +
        '}' +
        '.pwa-banner-text {' +
        '    flex: 1;' +
        '    display: flex;' +
        '    flex-direction: column;' +
        '    gap: 2px;' +
        '}' +
        '.pwa-banner-text strong {' +
        '    color: #fff;' +
        '    font-size: 14px;' +
        '    font-family: "Inter", sans-serif;' +
        '}' +
        '.pwa-banner-text span {' +
        '    color: rgba(255,255,255,0.6);' +
        '    font-size: 12px;' +
        '    font-family: "Inter", sans-serif;' +
        '}' +
        '.pwa-install-btn {' +
        '    background: linear-gradient(135deg, #00d4ff, #7c3aed);' +
        '    color: #fff;' +
        '    border: none;' +
        '    padding: 10px 20px;' +
        '    border-radius: 10px;' +
        '    font-size: 13px;' +
        '    font-weight: 700;' +
        '    font-family: "Inter", sans-serif;' +
        '    cursor: pointer;' +
        '    white-space: nowrap;' +
        '    transition: transform 0.2s, box-shadow 0.2s;' +
        '    flex-shrink: 0;' +
        '}' +
        '.pwa-install-btn:hover {' +
        '    transform: scale(1.05);' +
        '    box-shadow: 0 4px 15px rgba(108,92,231,0.4);' +
        '}' +
        '.pwa-dismiss-btn {' +
        '    background: none;' +
        '    border: none;' +
        '    color: rgba(255,255,255,0.4);' +
        '    font-size: 22px;' +
        '    cursor: pointer;' +
        '    padding: 0 4px;' +
        '    line-height: 1;' +
        '    flex-shrink: 0;' +
        '    transition: color 0.2s;' +
        '}' +
        '.pwa-dismiss-btn:hover {' +
        '    color: #fff;' +
        '}';
    document.head.appendChild(style);
})();
