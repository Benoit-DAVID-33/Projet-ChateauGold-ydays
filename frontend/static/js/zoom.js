// Fonctionnalité de zoom pour images et vidéos
document.addEventListener('DOMContentLoaded', function() {
    const mediaContainers = document.querySelectorAll('.media-container');
    
    mediaContainers.forEach(container => {
        const media = container.querySelector('video, img');
        if (!media) return;
        
        let zoomLevel = 1;
        const minZoom = 0.5;
        const maxZoom = 5;
        const zoomStep = 0.25;
        
        // Créer les contrôles de zoom
        const zoomControls = document.createElement('div');
        zoomControls.className = 'zoom-controls';
        zoomControls.innerHTML = `
            <button class="zoom-btn zoom-in-btn" title="Zoom avant">+</button>
            <button class="zoom-btn zoom-out-btn" title="Zoom arrière">-</button>
            <button class="zoom-btn zoom-reset-btn" title="Réinitialiser">⟲</button>
        `;
        container.appendChild(zoomControls);
        
        // Afficher le niveau de zoom
        const zoomLevelDisplay = document.createElement('div');
        zoomLevelDisplay.className = 'zoom-level';
        zoomLevelDisplay.textContent = '100%';
        container.appendChild(zoomLevelDisplay);
        
        // Fonction pour appliquer le zoom
        function applyZoom(level) {
            zoomLevel = Math.max(minZoom, Math.min(maxZoom, level));
            media.style.transform = `scale(${zoomLevel})`;
            zoomLevelDisplay.textContent = Math.round(zoomLevel * 100) + '%';
            
            if (zoomLevel > 1) {
                container.classList.add('zoomed');
            } else {
                container.classList.remove('zoomed');
            }
        }
        
        // Bouton zoom avant
        const zoomInBtn = zoomControls.querySelector('.zoom-in-btn');
        zoomInBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            applyZoom(zoomLevel + zoomStep);
        });
        
        // Bouton zoom arrière
        const zoomOutBtn = zoomControls.querySelector('.zoom-out-btn');
        zoomOutBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            applyZoom(zoomLevel - zoomStep);
        });
        
        // Bouton réinitialiser
        const zoomResetBtn = zoomControls.querySelector('.zoom-reset-btn');
        zoomResetBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            applyZoom(1);
            
            // Si c'est une vidéo, on la réinitialise aussi
            if (media && media.tagName === 'VIDEO') {
                try {
                    media.currentTime = 0;
                    // Reprendre la lecture (sans forcer si le navigateur bloque l'autoplay)
                    media.play().catch(function() {});
                } catch (err) {
                    console.warn('Reset video failed:', err);
                }
            }
        });
        
        // Zoom avec la molette de souris
        container.addEventListener('wheel', function(e) {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -zoomStep : zoomStep;
                applyZoom(zoomLevel + delta);
            }
        }, { passive: false });
        
        // Double-clic pour réinitialiser
        media.addEventListener('dblclick', function() {
            applyZoom(1);
        });
    });
});
