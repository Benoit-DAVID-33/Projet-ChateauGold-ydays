
function getMediaEl() { return document.getElementById('editableImage') || document.getElementById('editableVideo'); }
function isMediaReady(el) { if (!el) return false; if (el.tagName === 'IMG') return el.complete && el.naturalWidth > 0; return el.readyState >= 2 && el.videoWidth > 0; }
function getMediaNaturalSize(el) { if (el.tagName === 'IMG') return { w: el.naturalWidth, h: el.naturalHeight }; return { w: el.videoWidth, h: el.videoHeight }; }
function getCurrentMediaTime() { var el = getMediaEl(); if (el && el.tagName === 'VIDEO' && typeof el.currentTime === 'number') return el.currentTime; return 0; }
function menuFromLeft() { return !!window.TOOLS_MENU_FROM_LEFT; }
function setMenuPos(el, open) {
    if (!el) return;
    if (menuFromLeft()) { el.style.left = open ? '0' : '-400px'; el.style.right = 'auto'; }
    else { el.style.right = open ? '0' : '-400px'; el.style.left = 'auto'; }
}
function isMenuOpen(menu) {
    if (!menu) return false;
    if (menuFromLeft()) return (menu.style.left === '0' || window.getComputedStyle(menu).left === '0px') && menu.classList.contains('active');
    return (menu.style.right === '0' || menu.style.right === '0px' || window.getComputedStyle(menu).right === '0px') && menu.classList.contains('active');
}


if (typeof window.currentMedia === 'undefined') {
    window.currentMedia = { video: null, image: null };
}
    
    if (!window.addedElements) {
        window.addedElements = [];
    }
    
    // Initialiser le flag pour éviter la récursion dans selectShape
    if (typeof window.isSelectingShape === 'undefined') {
        window.isSelectingShape = false;
    }
    
    // Définir toggleToolsMenu AVANT tout le reste pour qu'elle soit accessible
    window.toggleToolsMenu = function() {
        console.log('=== toggleToolsMenu appelé ===');
        try {
            const menu = document.getElementById('toolsMenu');
            const overlay = document.getElementById('toolsOverlay');
            
            console.log('Menu trouvé:', menu);
            console.log('Overlay trouvé:', overlay);
            
            if (!menu) {
                console.error('ERREUR: Menu toolsMenu non trouvé dans le DOM');
                alert('Menu non trouvé. Vérifiez la console pour plus de détails.');
                return;
            }
            
            // Créer l'overlay s'il n'existe pas
            let currentOverlay = overlay;
            if (!currentOverlay) {
                console.log('Création de l\'overlay...');
                currentOverlay = document.createElement('div');
                currentOverlay.id = 'toolsOverlay';
                currentOverlay.className = 'tools-overlay';
                currentOverlay.onclick = window.toggleToolsMenu;
                document.body.appendChild(currentOverlay);
            }
            
            const isMenuVisible = isMenuOpen(menu);
            console.log('Menu visible:', isMenuVisible);
            
            if (isMenuVisible) {
                console.log('Fermeture du menu...');
                menu.classList.remove('active');
                setMenuPos(menu, false);
                menu.style.setProperty('display', 'none', 'important');
                if (currentOverlay) {
                    currentOverlay.classList.remove('active');
                    currentOverlay.style.setProperty('display', 'none', 'important');
                }
                document.querySelectorAll('.shapes-submenu').forEach(submenu => {
                    submenu.classList.remove('active');
                    setMenuPos(submenu, false);
                    submenu.style.setProperty('display', 'none', 'important');
                });
                
                // Réactiver le canvas
                if (window.canvas) {
                    window.canvas.style.pointerEvents = 'auto';
                    window.canvas.style.zIndex = '100';
                }
                
                console.log('Menu fermé');
            } else {
                // Ouvrir le menu - FORCER l'ouverture avec tous les styles nécessaires
                console.log('Ouverture du menu...');
                
                document.querySelectorAll('.shapes-submenu').forEach(submenu => {
                    submenu.classList.remove('active');
                    setMenuPos(submenu, false);
                    submenu.style.setProperty('display', 'none', 'important');
                });
                if (window.canvas) {
                    window.canvas.style.pointerEvents = 'none';
                    window.canvas.style.zIndex = '50';
                }
                menu.classList.add('active');
                menu.style.setProperty('display', 'flex', 'important');
                menu.style.setProperty('visibility', 'visible', 'important');
                menu.style.setProperty('opacity', '1', 'important');
                setMenuPos(menu, true);
                menu.style.setProperty('z-index', '2000', 'important');
                menu.style.setProperty('position', 'fixed', 'important');
                menu.style.setProperty('top', '0', 'important');
                menu.style.setProperty('width', '350px', 'important');
                menu.style.setProperty('height', '100vh', 'important');
                menu.style.setProperty('background', 'white', 'important');
                
                if (currentOverlay) {
                    currentOverlay.classList.add('active');
                    currentOverlay.style.setProperty('z-index', '1999', 'important');
                    currentOverlay.style.setProperty('display', 'block', 'important');
                    currentOverlay.style.setProperty('position', 'fixed', 'important');
                    currentOverlay.style.setProperty('top', '0', 'important');
                    currentOverlay.style.setProperty('left', '0', 'important');
                    currentOverlay.style.setProperty('width', '100%', 'important');
                    currentOverlay.style.setProperty('height', '100%', 'important');
                    currentOverlay.style.setProperty('background', 'rgba(0, 0, 0, 0.5)', 'important');
                }
                
                console.log('Menu ouvert - Styles appliqués avec !important');
            }
        } catch (error) {
            console.error('ERREUR dans toggleToolsMenu:', error);
            alert('Erreur lors de l\'ouverture du menu: ' + error.message);
        }
    };
    
    console.log('toggleToolsMenu défini globalement:', typeof window.toggleToolsMenu);
    
    // Définir selectTool AVANT tout le reste pour qu'elle soit accessible
    window.selectTool = function(tool) {
        try {
            console.log('selectTool appelé avec:', tool);
            
            // Vérifier que tool est valide
            if (!tool || typeof tool !== 'string') {
                console.error('selectTool: tool invalide:', tool);
                return;
            }
            
            // Fermer tous les sous-menus d'abord de manière sécurisée
            try {
                const allSubmenus = document.querySelectorAll('.shapes-submenu');
                if (allSubmenus && allSubmenus.length > 0) {
                    allSubmenus.forEach(submenu => {
                        try {
                            if (submenu) {
                                submenu.classList.remove('active');
                                setMenuPos(submenu, false);
                            }
                        } catch (e) {
                            console.warn('Erreur lors de la fermeture d\'un sous-menu:', e);
                        }
                    });
                }
            } catch (e) {
                console.warn('Erreur lors de la fermeture des sous-menus:', e);
            }
            try {
                const mainMenu = document.getElementById('toolsMenu');
                if (mainMenu) setMenuPos(mainMenu, false);
            } catch (e) {
                console.warn('Erreur lors de la fermeture du menu principal:', e);
            }
            
            // Désactiver le canvas immédiatement pour éviter qu'il bloque les clics
            try {
                const canvas = document.getElementById('editingCanvas');
                if (canvas) {
                    canvas.style.pointerEvents = 'none';
                    canvas.style.zIndex = '50';
                }
            } catch (e) {
                console.warn('Erreur lors de la désactivation du canvas:', e);
            }
            
            // Attendre un peu avant d'ouvrir le sous-menu pour l'animation
            setTimeout(() => {
                try {
                    // Ouvrir le sous-menu correspondant
                    if (tool === 'formes') {
                        const shapesMenu = document.getElementById('shapesSubmenu');
                        if (shapesMenu) {
                            shapesMenu.classList.add('active');
                            setMenuPos(shapesMenu, true);
                            shapesMenu.style.setProperty('display', 'flex', 'important');
                            shapesMenu.style.setProperty('visibility', 'visible', 'important');
                            shapesMenu.style.setProperty('opacity', '1', 'important');
                            shapesMenu.style.setProperty('z-index', '2001', 'important');
                            console.log('Sous-menu Formes ouvert');
                        } else {
                            console.error('❌ Sous-menu Formes non trouvé dans le DOM');
                            alert('Erreur: Le sous-menu Formes n\'a pas été trouvé. Veuillez recharger la page.');
                        }
                    } else if (tool === 'lignes') {
                        const linesMenu = document.getElementById('linesSubmenu');
                        if (linesMenu) {
                            linesMenu.classList.add('active');
                            setMenuPos(linesMenu, true);
                            linesMenu.style.setProperty('display', 'flex', 'important');
                            linesMenu.style.setProperty('visibility', 'visible', 'important');
                            linesMenu.style.setProperty('opacity', '1', 'important');
                            linesMenu.style.setProperty('z-index', '2001', 'important');
                            console.log('Sous-menu Lignes ouvert');
                        } else {
                            console.error('❌ Sous-menu Lignes non trouvé dans le DOM');
                            alert('Erreur: Le sous-menu Lignes n\'a pas été trouvé. Veuillez recharger la page.');
                        }
                    } else if (tool === 'dessin') {
                        const drawMenu = document.getElementById('drawSubmenu');
                        if (drawMenu) {
                            drawMenu.classList.add('active');
                            setMenuPos(drawMenu, true);
                            drawMenu.style.setProperty('display', 'flex', 'important');
                            drawMenu.style.setProperty('visibility', 'visible', 'important');
                            drawMenu.style.setProperty('opacity', '1', 'important');
                            drawMenu.style.setProperty('z-index', '2001', 'important');
                            console.log('Sous-menu Dessin ouvert');
                        } else {
                            console.error('❌ Sous-menu Dessin non trouvé dans le DOM');
                            alert('Erreur: Le sous-menu Dessin n\'a pas été trouvé. Veuillez recharger la page.');
                        }
                    } else if (tool === 'objets3d') {
                        const objets3dMenu = document.getElementById('objets3dSubmenu');
                        if (objets3dMenu) {
                            objets3dMenu.classList.add('active');
                            setMenuPos(objets3dMenu, true);
                            objets3dMenu.style.setProperty('display', 'flex', 'important');
                            objets3dMenu.style.setProperty('visibility', 'visible', 'important');
                            objets3dMenu.style.setProperty('opacity', '1', 'important');
                            objets3dMenu.style.setProperty('z-index', '2001', 'important');
                            console.log('Sous-menu Objets 3D ouvert');
                        } else {
                            console.warn('Sous-menu Objets 3D non trouvé');
                        }
                    } else {
                        console.warn('selectTool: tool non reconnu:', tool);
                    }
                } catch (error) {
                    console.error('Erreur dans setTimeout de selectTool:', error);
                    console.error('Stack trace:', error.stack);
                    alert('Erreur lors de l\'ouverture du sous-menu: ' + error.message);
                }
            }, 100);
        } catch (error) {
            console.error('Erreur critique dans selectTool:', error);
            console.error('Stack trace:', error.stack);
            alert('Erreur critique: ' + error.message + '\nVeuillez recharger la page.');
        }
    };
    
    console.log('selectTool défini globalement:', typeof window.selectTool);
    
    // S'assurer que selectTool est accessible globalement même après le chargement
    if (typeof window.selectTool !== 'function') {
        console.error('ERREUR: window.selectTool n\'a pas été correctement définie!');
    }
    
    // Définir les fonctions de fermeture des sous-menus AVANT tout le reste
    window.closeShapesSubmenu = function() {
        console.log('Fermeture du sous-menu Formes');
        const shapesMenu = document.getElementById('shapesSubmenu');
        if (shapesMenu) {
            shapesMenu.classList.remove('active');
            setMenuPos(shapesMenu, false);
        }
        const mainMenu = document.getElementById('toolsMenu');
        if (mainMenu) {
            setMenuPos(mainMenu, true);
            mainMenu.style.display = 'flex';
            mainMenu.style.visibility = 'visible';
            mainMenu.style.opacity = '1';
            mainMenu.style.zIndex = '2000';
            console.log('Menu principal réaffiché');
        } else {
            console.error('Menu principal non trouvé');
        }
        if (typeof currentShape !== 'undefined') {
            currentShape = null;
        }
    };
    
    window.closeLinesSubmenu = function() {
        console.log('Fermeture du sous-menu Lignes');
        const linesMenu = document.getElementById('linesSubmenu');
        if (linesMenu) {
            linesMenu.classList.remove('active');
            setMenuPos(linesMenu, false);
        }
        const mainMenu = document.getElementById('toolsMenu');
        if (mainMenu) {
            setMenuPos(mainMenu, true);
            mainMenu.style.display = 'flex';
            mainMenu.style.visibility = 'visible';
            mainMenu.style.opacity = '1';
            mainMenu.style.zIndex = '2000';
            console.log('Menu principal réaffiché');
        } else {
            console.error('Menu principal non trouvé');
        }
        if (typeof currentLineType !== 'undefined') {
            currentLineType = null;
        }
    };
    
    window.closeTextSubmenu = function() {
        console.log('Fermeture du sous-menu Texte');
        const textMenu = document.getElementById('textSubmenu');
        if (textMenu) {
            textMenu.classList.remove('active');
            setMenuPos(textMenu, false);
        }
        const mainMenu = document.getElementById('toolsMenu');
        if (mainMenu) {
            setMenuPos(mainMenu, true);
            mainMenu.style.display = 'flex';
            mainMenu.style.visibility = 'visible';
            mainMenu.style.opacity = '1';
            mainMenu.style.zIndex = '2000';
            console.log('Menu principal réaffiché');
        } else {
            console.error('Menu principal non trouvé');
        }
    };
    
    window.closeDrawSubmenu = function() {
        console.log('Fermeture du sous-menu Dessin');
        const drawMenu = document.getElementById('drawSubmenu');
        if (drawMenu) {
            drawMenu.classList.remove('active');
            setMenuPos(drawMenu, false);
        }
        const mainMenu = document.getElementById('toolsMenu');
        if (mainMenu) {
            setMenuPos(mainMenu, true);
            mainMenu.style.display = 'flex';
            mainMenu.style.visibility = 'visible';
            mainMenu.style.opacity = '1';
            mainMenu.style.zIndex = '2000';
            console.log('Menu principal réaffiché');
        } else {
            console.error('Menu principal non trouvé');
        }
    };
    
    window.closeObjets3dSubmenu = function() {
        const menu = document.getElementById('objets3dSubmenu');
        if (menu) {
            menu.classList.remove('active');
            setMenuPos(menu, false);
        }
        const mainMenu = document.getElementById('toolsMenu');
        if (mainMenu) {
            setMenuPos(mainMenu, true);
            mainMenu.style.display = 'flex';
            mainMenu.style.visibility = 'visible';
            mainMenu.style.opacity = '1';
            mainMenu.style.zIndex = '2000';
        }
    };
    
    console.log('Fonctions de fermeture définies globalement');
    
    // Dessine une forme 3D (cube, bille, hexagone 3D) avec rotation 3D - rotationX/rotationY en radians
    function drawShape3d(shape3dType, x, y, w, h, useCtx, rotationX, rotationY) {
        var c = useCtx || window.ctx || ctx;
        if (!c) return;
        var rx = rotationX || 0, ry = rotationY || 0;
        var cx = x + w / 2, cy = y + h / 2;
        var scale = (shape3dType === 'hexagon3d') ? (Math.min(w, h) / 4) : (Math.min(w, h) / 2.5);
        function rotateX(px, py, pz) {
            var cos = Math.cos(rx), sin = Math.sin(rx);
            return { x: px, y: py * cos - pz * sin, z: py * sin + pz * cos };
        }
        function rotateY(px, py, pz) {
            var cos = Math.cos(ry), sin = Math.sin(ry);
            return { x: px * cos + pz * sin, y: py, z: -px * sin + pz * cos };
        }
        function project(px, py, pz) {
            var r = rotateY(px, py, pz);
            r = rotateX(r.x, r.y, r.z);
            return { sx: cx + scale * r.x, sy: cy - scale * r.y, z: r.z };
        }
        c.save();
        c.strokeStyle = '#FFD700';
        c.lineWidth = 2;
        if (shape3dType === 'cube') {
            var v = [];
            for (var iz = -1; iz <= 1; iz += 2) {
                for (var iy = -1; iy <= 1; iy += 2) {
                    for (var ix = -1; ix <= 1; ix += 2) {
                        v.push(project(ix, iy, iz));
                    }
                }
            }
            var faces = [
                { i: [0,1,3,2], z: 0 },   // z=-1
                { i: [4,5,7,6], z: 0 },
                { i: [0,1,5,4], z: 0 },
                { i: [2,3,7,6], z: 0 },
                { i: [0,2,6,4], z: 0 },
                { i: [1,3,7,5], z: 0 }
            ];
            var fidx = [[0,1,3,2],[4,5,7,6],[0,1,5,4],[2,3,7,6],[0,2,6,4],[1,3,7,5]];
            for (var f = 0; f < 6; f++) {
                var idx = fidx[f];
                var z = (v[idx[0]].z + v[idx[1]].z + v[idx[2]].z + v[idx[3]].z) / 4;
                faces[f].z = z;
                faces[f].i = idx;
            }
            faces.sort(function(a,b) { return a.z - b.z; });
            var shades = [0.25, 0.35, 0.4, 0.45, 0.5, 0.55];
            for (var f = 0; f < 6; f++) {
                var idx = faces[f].i;
                c.fillStyle = 'rgba(255, 215, 0, ' + shades[f] + ')';
                c.beginPath();
                c.moveTo(v[idx[0]].sx, v[idx[0]].sy);
                for (var i = 1; i < 4; i++) c.lineTo(v[idx[i]].sx, v[idx[i]].sy);
                c.closePath();
                c.fill();
                c.stroke();
            }
        } else if (shape3dType === 'sphere') {
            var r = Math.min(w, h) / 2;
            // Position du reflet (lumière) en fonction de la rotation 3D — effet marqué pour que la bille tourne visuellement
            var gx = cx + r * 0.6 * Math.sin(ry);
            var gy = cy - r * 0.6 * Math.sin(rx);
            var grad = c.createRadialGradient(gx - r * 0.4, gy - r * 0.4, 0, cx, cy, r * 1.1);
            grad.addColorStop(0, 'rgba(255, 255, 220, 0.95)');
            grad.addColorStop(0.4, 'rgba(255, 230, 150, 0.6)');
            grad.addColorStop(0.7, 'rgba(255, 215, 0, 0.4)');
            grad.addColorStop(1, 'rgba(180, 140, 0, 0.5)');
            c.fillStyle = grad;
            c.beginPath();
            c.arc(cx, cy, r, 0, 2 * Math.PI);
            c.fill();
            // Ombre côté opposé au reflet pour renforcer l'effet 3D
            var sx = cx - r * 0.5 * Math.sin(ry);
            var sy = cy + r * 0.5 * Math.sin(rx);
            var shadowGrad = c.createRadialGradient(sx, sy, 0, cx, cy, r * 1.2);
            shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
            shadowGrad.addColorStop(0.6, 'rgba(0, 0, 0, 0)');
            shadowGrad.addColorStop(1, 'rgba(80, 60, 0, 0.35)');
            c.fillStyle = shadowGrad;
            c.beginPath();
            c.arc(cx, cy, r, 0, 2 * Math.PI);
            c.fill();
            c.strokeStyle = '#FFD700';
            c.stroke();
        } else if (shape3dType === 'hexagon3d') {
            // Même système de coordonnées normalisées que le cube (-1..1) pour que project() applique bien rotationX/rotationY
            var rNorm = 1;
            var d = 0.6;
            var back = [], front = [];
            for (var i = 0; i < 6; i++) {
                var a = (Math.PI / 3) * i - Math.PI / 6;
                var px = rNorm * Math.cos(a), py = rNorm * Math.sin(a);
                back.push(project(px, py, -d));
                front.push(project(px, py, d));
            }
            var backZ = (back[0].z + back[1].z + back[2].z) / 3;
            var frontZ = (front[0].z + front[1].z + front[2].z) / 3;
            if (backZ < frontZ) {
                c.fillStyle = 'rgba(255, 215, 0, 0.25)';
                c.beginPath();
                c.moveTo(back[0].sx, back[0].sy);
                for (i = 1; i < 6; i++) c.lineTo(back[i].sx, back[i].sy);
                c.closePath();
                c.fill();
                c.stroke();
                for (i = 0; i < 6; i++) {
                    c.beginPath();
                    c.moveTo(back[i].sx, back[i].sy);
                    c.lineTo(front[i].sx, front[i].sy);
                    c.stroke();
                }
            }
            c.fillStyle = 'rgba(255, 215, 0, 0.5)';
            c.beginPath();
            c.moveTo(front[0].sx, front[0].sy);
            for (i = 1; i < 6; i++) c.lineTo(front[i].sx, front[i].sy);
            c.closePath();
            c.fill();
            c.stroke();
            if (frontZ < backZ) {
                c.fillStyle = 'rgba(255, 215, 0, 0.25)';
                c.beginPath();
                c.moveTo(back[0].sx, back[0].sy);
                for (i = 1; i < 6; i++) c.lineTo(back[i].sx, back[i].sy);
                c.closePath();
                c.fill();
                c.stroke();
                for (i = 0; i < 6; i++) {
                    c.beginPath();
                    c.moveTo(back[i].sx, back[i].sy);
                    c.lineTo(front[i].sx, front[i].sy);
                    c.stroke();
                }
            }
        }
        c.restore();
    }
    
    window.selectShape3d = function(shape3dType) {
        try {
            console.log('🎬 selectShape3d appelée avec type:', shape3dType);
            if (typeof window.closeObjets3dSubmenu === 'function') window.closeObjets3dSubmenu();
            var imageElement = getMediaEl();
            var currentCanvas = document.getElementById('editingCanvas');
            if (!currentCanvas || !imageElement || !isMediaReady(imageElement)) {
                alert('Vidéo ou canvas non prêt.');
                return;
            }
            var cw = currentCanvas.width || imageElement.offsetWidth;
            var ch = currentCanvas.height || imageElement.offsetHeight;
            var size = (shape3dType === 'hexagon3d') ? 70 : 80; // hexagone 3D : 70x70
            var nx = (cw / 2) - size / 2;
            var ny = (ch / 2) - size / 2;
            if (!window.addedElements) window.addedElements = [];
            var id = 'shape3d_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            var el = {
                type: 'shape3d',
                id: id,
                shape3dType: shape3dType,
                x: nx,
                y: ny,
                width: size,
                height: size,
                rotationX: 0,
                rotationY: 0,
                addedAtTime: getCurrentMediaTime()
            };
            console.log('📦 Élément créé:', el);
            window.addedElements.push(el);
            console.log('Élément ajouté à window.addedElements. Total:', window.addedElements.length);
            console.log('window.addedElements contient maintenant:', window.addedElements);
            window.selectedElement = el;
            if (typeof selectedElement !== 'undefined') selectedElement = el;
            if (currentCanvas) {
                currentCanvas.style.pointerEvents = 'auto';
                currentCanvas.style.zIndex = '100';
            }
            if (typeof redrawCanvas === 'function') redrawCanvas();
            if (typeof updateCanvasPointerEvents === 'function') updateCanvasPointerEvents();
        } catch (err) { console.error('selectShape3d:', err); }
    };
    
    // Définir drawShape AVANT selectShape pour qu'elle soit accessible
    window.drawShape = function(shapeType, x, y, width, height, elementId = null) {
        console.log('drawShape appelé:', {shapeType, x, y, width, height, elementId});
        
        try {
            // Essayer d'obtenir le contexte de plusieurs façons
            let currentCtx = window.ctx;
            let currentCanvas = window.canvas;
            
            // Si le contexte n'est pas disponible, essayer de le récupérer
            if (!currentCtx) {
                // Essayer de récupérer le canvas
                if (!currentCanvas) {
                    currentCanvas = document.getElementById('editingCanvas');
                    if (currentCanvas) {
                        window.canvas = currentCanvas;
                    }
                }
                
                // Si on a le canvas, obtenir le contexte
                if (currentCanvas) {
                    currentCtx = currentCanvas.getContext('2d');
                    if (currentCtx) {
                        window.ctx = currentCtx;
                    }
                }
            }
            
            // Si toujours pas de contexte, erreur
            if (!currentCtx) {
                console.error('Contexte canvas non disponible pour dessiner la forme');
                console.log('window.ctx:', window.ctx);
                console.log('window.canvas:', window.canvas);
                return null;
            }
            
            // Vérifier que le canvas a une taille valide
            if (currentCanvas && (currentCanvas.width === 0 || currentCanvas.height === 0)) {
                currentCanvas.width = window.innerWidth || 1920;
                currentCanvas.height = window.innerHeight || 1080;
                console.log('Canvas redimensionné dans drawShape:', currentCanvas.width, 'x', currentCanvas.height);
            }
            
            console.log('Contexte disponible, dessin de la forme...');
            
            const id = elementId || 'shape_' + Date.now();
            
            // Sauvegarder l'état du contexte
            currentCtx.save();
            
            // Forcer un rendu visible des formes même après des modes de dessin/effacement
            currentCtx.globalCompositeOperation = 'source-over';
            currentCtx.globalAlpha = 1;
            currentCtx.setLineDash([]);
            // Toutes les formes en jaune (or) - couleur jaune vif
            currentCtx.strokeStyle = '#FFD700';
            currentCtx.fillStyle = 'rgba(255, 215, 0, 0.55)';
            currentCtx.lineWidth = 3;
            
            switch(shapeType) {
            case 'square':
                currentCtx.fillRect(x, y, width, height);
                currentCtx.strokeRect(x, y, width, height);
                break;
                
            case 'rounded-square':
                const radius = Math.min(width, height) * 0.2;
                currentCtx.beginPath();
                currentCtx.moveTo(x + radius, y);
                currentCtx.lineTo(x + width - radius, y);
                currentCtx.quadraticCurveTo(x + width, y, x + width, y + radius);
                currentCtx.lineTo(x + width, y + height - radius);
                currentCtx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
                currentCtx.lineTo(x + radius, y + height);
                currentCtx.quadraticCurveTo(x, y + height, x, y + height - radius);
                currentCtx.lineTo(x, y + radius);
                currentCtx.quadraticCurveTo(x, y, x + radius, y);
                currentCtx.closePath();
                currentCtx.fill();
                currentCtx.stroke();
                break;
                
            case 'circle':
                const centerX = x + width / 2;
                const centerY = y + height / 2;
                const radius_circle = Math.min(width, height) / 2;
                currentCtx.beginPath();
                currentCtx.arc(centerX, centerY, radius_circle, 0, 2 * Math.PI);
                currentCtx.fill();
                currentCtx.stroke();
                break;
                
            case 'triangle':
                currentCtx.beginPath();
                currentCtx.moveTo(x + width / 2, y);
                currentCtx.lineTo(x, y + height);
                currentCtx.lineTo(x + width, y + height);
                currentCtx.closePath();
                currentCtx.fill();
                currentCtx.stroke();
                break;
                
            case 'triangle-inverted':
                currentCtx.beginPath();
                currentCtx.moveTo(x + width / 2, y + height);
                currentCtx.lineTo(x, y);
                currentCtx.lineTo(x + width, y);
                currentCtx.closePath();
                currentCtx.fill();
                currentCtx.stroke();
                break;
                
            case 'diamond':
                currentCtx.beginPath();
                currentCtx.moveTo(x + width / 2, y);
                currentCtx.lineTo(x + width, y + height / 2);
                currentCtx.lineTo(x + width / 2, y + height);
                currentCtx.lineTo(x, y + height / 2);
                currentCtx.closePath();
                currentCtx.fill();
                currentCtx.stroke();
                break;
                
            case 'hexagon':
                const centerX_hex = x + width / 2;
                const centerY_hex = y + height / 2;
                const radius_hex = Math.min(width, height) / 2;
                currentCtx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const angle = (Math.PI / 3) * i;
                    const px = centerX_hex + radius_hex * Math.cos(angle);
                    const py = centerY_hex + radius_hex * Math.sin(angle);
                    if (i === 0) {
                        currentCtx.moveTo(px, py);
                    } else {
                        currentCtx.lineTo(px, py);
                    }
                }
                currentCtx.closePath();
                currentCtx.fill();
                currentCtx.stroke();
                break;
                
            default:
                console.warn('Type de forme non reconnu:', shapeType);
                currentCtx.restore();
                return null;
        }
        
            // Restaurer l'état du contexte
            currentCtx.restore();
            
            // NE JAMAIS ajouter d'élément dans drawShape - cela doit être fait AVANT l'appel
            // drawShape est uniquement responsable du dessin, pas de la gestion des éléments
            if (!elementId) {
                console.warn('drawShape appelé sans elementId - l\'élément devrait être ajouté avant');
            }
            
            console.log('Forme dessinée avec succès:', {id, x, y, width, height});
            return { id, x, y, width, height };
            
        } catch (error) {
            console.error('ERREUR dans drawShape:', error);
            console.error('Détails:', {shapeType, x, y, width, height, elementId});
            return null;
        }
    };
    
    console.log('window.drawShape défini globalement:', typeof window.drawShape);
    
    // Définir selectShape - VERSION ULTRA-SIMPLIFIÉE SANS RÉCURSION
    window.selectShape = function(shapeType) {
        console.log('=== selectShape appelé avec:', shapeType);
        
        // VÉRIFICATION STRICTE - si déjà en cours, IGNORER COMPLÈTEMENT
        if (window.isSelectingShape === true) {
            console.warn('selectShape déjà en cours, appel ignoré');
            return;
        }
        
        // Définir le flag IMMÉDIATEMENT
        window.isSelectingShape = true;
        
        // Utiliser requestAnimationFrame pour s'assurer que le DOM est prêt
        requestAnimationFrame(function() {
            // Vérifier à nouveau le flag
            if (!window.isSelectingShape) {
                console.warn('Flag désactivé, abandon');
                return;
            }
            
            try {
                // Fermer le sous-menu
                const shapesMenu = document.getElementById('shapesSubmenu');
                if (shapesMenu) {
                    setMenuPos(shapesMenu, false);
                    shapesMenu.style.display = 'none';
                }
                const mainMenu = document.getElementById('toolsMenu');
                if (mainMenu) {
                    setMenuPos(mainMenu, true);
                    mainMenu.style.display = 'flex';
                }
                
                // Récupérer le canvas
                const currentCanvas = document.getElementById('editingCanvas');
                if (!currentCanvas) {
                    window.isSelectingShape = false;
                    alert('Erreur: Le canvas n\'est pas disponible.');
                    return;
                }
                
                // Récupérer le contexte
                const currentCtx = currentCanvas.getContext('2d');
                if (!currentCtx) {
                    window.isSelectingShape = false;
                    alert('Erreur: Le contexte du canvas n\'est pas disponible.');
                    return;
                }
                
                // Synchroniser avec window
                window.canvas = currentCanvas;
                window.ctx = currentCtx;
                
                // Styles du canvas - modifications minimales
                currentCanvas.style.display = 'block';
                currentCanvas.style.visibility = 'visible';
                currentCanvas.style.opacity = '1';
                currentCanvas.style.zIndex = '1000';
                currentCanvas.style.pointerEvents = 'auto';
                
                // Obtenir l'image
                const imageElement = getMediaEl();
                if (!imageElement) {
                    window.isSelectingShape = false;
                    alert('Image non trouvée.');
                    return;
                }
                
                // Vérifier si l'image est chargée
                if (!isMediaReady(imageElement)) {
                    console.warn('Image non chargée, abandon');
                    window.isSelectingShape = false;
                    alert('Veuillez attendre que l\'image soit complètement chargée.');
                    return;
                }

                // Toujours aligner la taille du canvas sur le média affiché.
                // Sinon une forme peut être créée hors champ (invisible) si le canvas
                // a temporairement la taille de la fenêtre.
                const mediaW = imageElement.offsetWidth || currentCanvas.width;
                const mediaH = imageElement.offsetHeight || currentCanvas.height;
                if (mediaW > 0 && mediaH > 0) {
                    if (currentCanvas.width !== mediaW || currentCanvas.height !== mediaH) {
                        currentCanvas.width = mediaW;
                        currentCanvas.height = mediaH;
                    }
                } else if (currentCanvas.width === 0 || currentCanvas.height === 0) {
                    currentCanvas.width = window.innerWidth || 1920;
                    currentCanvas.height = window.innerHeight || 1080;
                }
                
                // Position au centre du canvas (espace image) pour que la forme défile avec l'image
                const defaultSize = 100;
                const shapeStartX = (currentCanvas.width / 2) - defaultSize / 2;
                const shapeStartY = (currentCanvas.height / 2) - defaultSize / 2;
                
                console.log('Création de la forme:', {shapeType, shapeStartX, shapeStartY});
                
                // Initialiser addedElements si nécessaire
                if (!window.addedElements) {
                    window.addedElements = [];
                }
                
                // Créer l'élément avec un ID unique
                const newElementId = 'shape_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                const newElement = {
                    type: 'shape',
                    id: newElementId,
                    shapeType: shapeType,
                    x: shapeStartX,
                    y: shapeStartY,
                    width: defaultSize,
                    height: defaultSize,
                    addedAtTime: getCurrentMediaTime()
                };
                
                // Ajouter à la liste AVANT de dessiner
                window.addedElements.push(newElement);
                console.log('Élément ajouté:', newElement);
                
                // Dessiner la forme DIRECTEMENT sur le canvas
                const shapeResult = window.drawShape(shapeType, shapeStartX, shapeStartY, defaultSize, defaultSize, newElementId);
                
                if (!shapeResult) {
                    // Retirer l'élément si le dessin a échoué
                    const index = window.addedElements.findIndex(el => el.id === newElementId);
                    if (index !== -1) {
                        window.addedElements.splice(index, 1);
                    }
                    window.isSelectingShape = false;
                    alert('Erreur: La forme n\'a pas pu être dessinée.');
                    return;
                }
                
                // Sélectionner la forme et activer les interactions (déplacer, agrandir/réduire)
                window.selectedElement = newElement;
                if (typeof selectedElement !== 'undefined') selectedElement = newElement;
                
                // Activer le canvas pour pouvoir déplacer et redimensionner la forme
                if (currentCanvas) {
                    currentCanvas.style.pointerEvents = 'auto';
                    currentCanvas.style.zIndex = '100';
                }
                
                // Réinitialiser le flag AVANT tout appel différé pour éviter la récursion
                window.isSelectingShape = false;
                
                // Différer redrawCanvas et updateCanvasPointerEvents pour éviter "Maximum call stack size exceeded"
                setTimeout(function() {
                    try {
                        if (typeof redrawCanvas === 'function') redrawCanvas();
                        if (typeof updateCanvasPointerEvents === 'function') updateCanvasPointerEvents();
                        console.log('Forme créée - vous pouvez la déplacer (glisser-déposer) et l\'agrandir/réduire (poignées ou molette)');
                    } catch (err) {
                        console.warn('Erreur lors du redessin après ajout de forme:', err);
                    }
                }, 0);
                
            } catch (error) {
                console.error('ERREUR dans selectShape:', error);
                console.error('Stack trace:', error.stack);
                alert('Erreur: ' + error.message);
                window.isSelectingShape = false;
            }
        });
    };
    
    console.log('selectShape défini globalement:', typeof window.selectShape);

// Vérifier que toutes les fonctions globales sont disponibles
document.addEventListener('DOMContentLoaded', function() {
    console.log('=== Vérification des fonctions globales ===');
    console.log('window.toggleToolsMenu:', typeof window.toggleToolsMenu);
    console.log('window.selectTool:', typeof window.selectTool);
    console.log('window.selectShape:', typeof window.selectShape);
    console.log('window.closeShapesSubmenu:', typeof window.closeShapesSubmenu);
    console.log('window.closeLinesSubmenu:', typeof window.closeLinesSubmenu);
    console.log('window.closeDrawSubmenu:', typeof window.closeDrawSubmenu);
    
    // Si selectTool n'est pas disponible, essayer de la redéfinir
    if (typeof window.selectTool !== 'function') {
        console.error('ERREUR CRITIQUE: window.selectTool n\'est pas disponible!');
        alert('Erreur: Les fonctions JavaScript ne sont pas chargées. Veuillez recharger la page.');
    }
});

function deleteFile(filename) {
    if (confirm('Êtes-vous sûr de vouloir supprimer cette image ?')) {
        fetch("/delete/" + filename, {
            method: "POST"
        })
        .then(() => {
            location.reload();
        });
    }
}

// La fonction toggleToolsMenu est déjà définie en haut du script dans window.toggleToolsMenu
// Pas besoin de la redéfinir ici

let currentTool = null;
let currentShape = null;
let currentLineType = null;
let isDrawing = false;
let isTextMode = false;
let isDrawMode = false;
let isMarkerMode = false;
let isEraserMode = false;
let isMoving = false;
let isResizing = false;
let isRotating = false;
let initialRotationX = 0;
let initialRotationY = 0;
let selectedElement = null;
// Rendre selectedElement accessible globalement
window.selectedElement = selectedElement;
let resizeHandle = null;
let currentText = '';
let currentFontSize = 24;
let currentDrawColor = '#FFD700';
let currentBrushSize = 5;
let startX = 0;
let startY = 0;
let lastX = 0;
let lastY = 0;
let offsetX = 0;
let offsetY = 0;
let initialElementState = null;
let initialLineMoveState = null;
let canvas, ctx, img, imageData;
let addedElements = []; // Stocker tous les éléments ajoutés (formes et textes)
let eventsSetup = false; // Flag pour éviter les doublons d'événements

// Flags pour éviter les récursions infinies
let isRedrawing = false;
let isUpdatingPointerEvents = false;
let isResizingCanvas = false;
let isInitializingCanvas = false;

// Rendre addedElements accessible globalement
// Initialiser window.addedElements si ce n'est pas déjà fait
if (!window.addedElements) {
    window.addedElements = [];
}
// Synchroniser avec la variable locale
addedElements = window.addedElements;

function initCanvas() {
    // Éviter les appels récursifs
    if (isInitializingCanvas) {
        console.warn('initCanvas déjà en cours, appel ignoré');
        return;
    }
    
    isInitializingCanvas = true;
    
    try {
        const imageElement = getMediaEl();
        if (!imageElement) {
            console.log('Image non trouvée');
            isInitializingCanvas = false;
            return;
        }
        
        canvas = document.getElementById('editingCanvas');
        if (!canvas) {
            console.log('Canvas non trouvé');
            isInitializingCanvas = false;
            return;
        }
        
        // Rendre canvas accessible globalement
        window.canvas = canvas;
        
        ctx = canvas.getContext('2d');
        if (!ctx) {
            console.log('Contexte canvas non disponible');
            isInitializingCanvas = false;
            return;
        }
        
        // Rendre ctx accessible globalement
        window.ctx = ctx;
        
        img = imageElement;
        
        // Forcer la visibilité du canvas (sans déclencher d'événements)
        if (canvas.style.display !== 'block') {
            canvas.style.setProperty('display', 'block', 'important');
        }
        if (canvas.style.visibility !== 'visible') {
            canvas.style.setProperty('visibility', 'visible', 'important');
        }
        if (canvas.style.opacity !== '1') {
            canvas.style.setProperty('opacity', '1', 'important');
        }
        // Position/taille du canvas sont définies par resizeCanvas() pour recouvrir l'image (défile avec la page)
        
        // Attendre que le média (image ou vidéo) soit chargé puis positionner le canvas
        if (isMediaReady(img)) {
            if (!isResizingCanvas) resizeCanvas();
        } else {
            if (img.tagName === 'IMG') {
                img.onload = function() { if (!isResizingCanvas) resizeCanvas(); };
                img.onerror = function() { console.error('Erreur lors du chargement de l\'image'); };
            } else {
                img.addEventListener('loadeddata', function() { if (!isResizingCanvas) resizeCanvas(); });
            }
        }
        // Réaligner le canvas si la taille de l'image change (layout, zoom, etc.)
        if (typeof ResizeObserver !== 'undefined') {
            try {
                const ro = new ResizeObserver(function() {
                    if (!isResizingCanvas && canvas && img) resizeCanvas();
                });
                ro.observe(img);
            } catch (err) { /* ignore */ }
        }
    } catch (error) {
        console.error('Erreur lors de l\'initialisation du canvas:', error);
    } finally {
        isInitializingCanvas = false;
    }
}

// Implémentation réelle (appelée de façon différée pour éviter récursion / stack overflow)
function updateCanvasPointerEventsImpl() {
    if (!canvas) return;
    
    if (isUpdatingPointerEvents) return;
    isUpdatingPointerEvents = true;
    
    try {
        const menu = document.getElementById('toolsMenu');
        const isMenuOpen = menu && menu.classList.contains('active');
        
        const toolsBtn = document.getElementById('toolsBtn');
        const saveBtn = document.getElementById('saveBtn');
        let isOverButton = false;
        if ((toolsBtn || saveBtn) && window.mouseX !== undefined && window.mouseY !== undefined) {
            const element = document.elementFromPoint(window.mouseX, window.mouseY);
            isOverButton = element && (
                (toolsBtn && (element === toolsBtn || element.closest('#toolsBtn'))) ||
                (saveBtn && (element === saveBtn || element.closest('#saveBtn'))) ||
                element.closest('.tools-btn')
            );
        }
        
        if (isMenuOpen || isOverButton) {
            if (canvas.style.pointerEvents !== 'none') {
                canvas.style.pointerEvents = 'none';
                canvas.style.zIndex = '50';
            }
            return;
        }
        
        const currentSelected = window.selectedElement || selectedElement;
        const hasActiveTool = currentShape !== null || 
                             currentLineType !== null || 
                             isTextMode || 
                             isDrawMode || 
                             isMarkerMode ||
                             isEraserMode ||
                             currentSelected !== null ||
                             (window.addedElements && window.addedElements.length > 0);
        
        if (hasActiveTool) {
            if (canvas.style.pointerEvents !== 'auto') {
                canvas.style.pointerEvents = 'auto';
                canvas.style.zIndex = '1000';
            }
        } else {
            if (canvas.style.pointerEvents !== 'none') {
                canvas.style.pointerEvents = 'none';
                canvas.style.zIndex = '50';
            }
        }
    } finally {
        isUpdatingPointerEvents = false;
    }
}

// Toujours différer pour ne jamais exécuter dans la pile d'un event handler (évite "Maximum call stack size exceeded")
let updateCanvasPointerEventsScheduled = false;
function updateCanvasPointerEvents() {
    if (updateCanvasPointerEventsScheduled) return;
    updateCanvasPointerEventsScheduled = true;
    setTimeout(function() {
        updateCanvasPointerEventsScheduled = false;
        updateCanvasPointerEventsImpl();
    }, 0);
}

// Tracker la position de la souris pour updateCanvasPointerEvents
// Ajouter un throttling pour éviter les appels trop fréquents
let lastUpdateTime = 0;
const UPDATE_THROTTLE = 50; // Mettre à jour au maximum toutes les 50ms

document.addEventListener('mousemove', function(e) {
    window.mouseX = e.clientX;
    window.mouseY = e.clientY;
    // Mettre à jour le canvas en temps réel avec throttling
    const now = Date.now();
    if (canvas && (now - lastUpdateTime > UPDATE_THROTTLE)) {
        lastUpdateTime = now;
        updateCanvasPointerEvents();
    }
}, true);

function resizeCanvas() {
    if (!canvas || !img) return;
    
    if (isResizingCanvas) return;
    isResizingCanvas = true;
    
    setTimeout(() => {
        try {
            const imageElement = getMediaEl();
            if (!imageElement || imageElement.offsetWidth === 0 || imageElement.offsetHeight === 0) {
                isResizingCanvas = false;
                return;
            }
            // Positionner le canvas exactement sur l'image pour qu'il défile avec la page
            const w = imageElement.offsetWidth;
            const h = imageElement.offsetHeight;
            const left = imageElement.offsetLeft;
            const top = imageElement.offsetTop;
            
            canvas.width = w;
            canvas.height = h;
            canvas.style.position = 'absolute';
            canvas.style.left = left + 'px';
            canvas.style.top = top + 'px';
            canvas.style.width = w + 'px';
            canvas.style.height = h + 'px';
            canvas.style.pointerEvents = 'none';
            canvas.style.cursor = 'default';
            canvas.style.zIndex = '10';
            canvas.style.clipPath = 'none';
            canvas.style.webkitClipPath = 'none';
            
            updateCanvasPointerEvents();
            if (window.addedElements && window.addedElements.length > 0 && !isRedrawing) {
                redrawCanvas();
            }
        } catch (error) {
            console.error('Erreur lors du redimensionnement du canvas:', error);
        } finally {
            isResizingCanvas = false;
        }
    }, 50);
}

// La fonction selectTool est déjà définie en haut du script dans window.selectTool
// Pas besoin de la redéfinir ici

function showShapesSubmenu() {
    const shapesMenu = document.getElementById('shapesSubmenu');
    if (shapesMenu) {
        shapesMenu.classList.add('active');
        setMenuPos(shapesMenu, true);
        shapesMenu.style.display = 'flex';
        shapesMenu.style.visibility = 'visible';
        shapesMenu.style.opacity = '1';
        shapesMenu.style.zIndex = '2001';
        console.log('Sous-menu Formes ouvert');
        // S'assurer que le canvas est désactivé
        if (canvas) {
            canvas.style.pointerEvents = 'none';
            canvas.style.zIndex = '50';
        }
    } else {
        console.error('Sous-menu Formes non trouvé');
    }
}

// La fonction closeShapesSubmenu est déjà définie en haut du script

function showLinesSubmenu() {
    const linesMenu = document.getElementById('linesSubmenu');
    if (linesMenu) {
        linesMenu.classList.add('active');
        setMenuPos(linesMenu, true);
        linesMenu.style.display = 'flex';
        linesMenu.style.visibility = 'visible';
        linesMenu.style.opacity = '1';
        linesMenu.style.zIndex = '2001';
        console.log('Sous-menu Lignes ouvert');
        // S'assurer que le canvas est désactivé
        if (canvas) {
            canvas.style.pointerEvents = 'none';
            canvas.style.zIndex = '50';
        }
    } else {
        console.error('Sous-menu Lignes non trouvé');
    }
}

// La fonction closeLinesSubmenu est déjà définie en haut du script

// Ajouter une ligne à l'image au centre (comme les formes) - déplaçable et rallongable
window.selectLine = function(lineType) {
    console.log('=== selectLine appelé avec:', lineType);
    try {
        if (typeof window.closeLinesSubmenu === 'function') {
            window.closeLinesSubmenu();
        }
        currentLineType = null;
        currentShape = null;
        isTextMode = false;
        isDrawMode = false;
        
        const currentCanvas = document.getElementById('editingCanvas');
        const imageElement = getMediaEl();
        if (!currentCanvas || !imageElement) {
            alert('Canvas ou image non trouvé.');
            return;
        }
        if (!isMediaReady(imageElement)) {
            alert('Veuillez attendre que l\'image soit chargée.');
            return;
        }
        // Coordonnées en espace canvas pour que la ligne défile avec l'image
        const cw = currentCanvas.width || imageElement.offsetWidth;
        const ch = currentCanvas.height || imageElement.offsetHeight;
        const centerX = cw / 2;
        const centerY = ch / 2;
        const defaultLength = 80;
        const x1 = centerX - defaultLength;
        const y1 = centerY;
        const x2 = centerX + defaultLength;
        const y2 = centerY;
        
        if (!window.addedElements) window.addedElements = [];
        const newElementId = 'line_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const newElement = {
            type: 'line',
            id: newElementId,
            lineType: lineType,
            x1: x1, y1: y1, x2: x2, y2: y2,
            addedAtTime: getCurrentMediaTime()
        };
        window.addedElements.push(newElement);
        
        window.selectedElement = newElement;
        selectedElement = newElement;
        
        if (canvas && ctx) {
            canvas.style.pointerEvents = 'auto';
            canvas.style.zIndex = '100';
        }
        redrawCanvas();
        updateCanvasPointerEvents();
        console.log('Ligne ajoutée:', newElement);
    } catch (error) {
        console.error('Erreur selectLine:', error);
        alert('Erreur: ' + error.message);
    }
};

function selectLineType(lineType) {
    // Comportement par défaut : ajouter la ligne à l'image immédiatement
    if (typeof window.selectLine === 'function') {
        window.selectLine(lineType);
    } else {
        currentLineType = lineType;
        currentShape = null;
        isTextMode = false;
        isDrawMode = false;
        closeLinesSubmenu();
        if (canvas && ctx) canvas.style.cursor = 'crosshair';
        updateCanvasPointerEvents();
    }
}

function showTextSubmenu() {
    const textMenu = document.getElementById('textSubmenu');
    if (textMenu) {
        textMenu.classList.add('active');
        setMenuPos(textMenu, true);
        textMenu.style.display = 'flex';
        textMenu.style.visibility = 'visible';
        textMenu.style.opacity = '1';
        textMenu.style.zIndex = '2001';
        console.log('Sous-menu Texte ouvert');
        // S'assurer que le canvas est désactivé
        if (canvas) {
            canvas.style.pointerEvents = 'none';
            canvas.style.zIndex = '50';
        }
    } else {
        console.error('Sous-menu Texte non trouvé');
    }
}

// La fonction closeTextSubmenu est déjà définie en haut du script

function activateTextMode() {
    currentText = document.getElementById('textInput').value;
    currentFontSize = parseInt(document.getElementById('fontSizeSlider').value);
    isTextMode = true;
    isDrawMode = false;
    isMarkerMode = false;
    currentShape = null;
    currentLineType = null;
    selectedElement = null;
    closeTextSubmenu();
    
    if (canvas && ctx) {
        canvas.style.cursor = 'text';
    }
    
    if (!currentText) {
        alert('Veuillez entrer un texte');
        isTextMode = false;
        updateCanvasPointerEvents();
        return;
    }
    
    // Activer le canvas pour le texte
    updateCanvasPointerEvents();
}

function showDrawSubmenu() {
    const drawMenu = document.getElementById('drawSubmenu');
    if (drawMenu) {
        drawMenu.classList.add('active');
        setMenuPos(drawMenu, true);
        drawMenu.style.display = 'flex';
        drawMenu.style.visibility = 'visible';
        drawMenu.style.opacity = '1';
        drawMenu.style.zIndex = '2001';
        console.log('Sous-menu Dessin ouvert');
        // S'assurer que le canvas est désactivé
        if (canvas) {
            canvas.style.pointerEvents = 'none';
            canvas.style.zIndex = '50';
        }
    } else {
        console.error('Sous-menu Dessin non trouvé');
    }
}

// La fonction closeDrawSubmenu est déjà définie en haut du script dans window.closeDrawSubmenu
// Pas besoin de la redéfinir ici

function selectColor(color) {
    currentDrawColor = color;
    
    // Vérifier si l'élément existe avant d'y accéder
    const colorDisplay = document.getElementById('selectedColorDisplay');
    if (colorDisplay) {
        colorDisplay.style.background = color;
    }
    
    // Mettre à jour la sélection visuelle
    document.querySelectorAll('.color-item').forEach(item => {
        item.classList.remove('selected');
        if (item.getAttribute('data-color') === color) {
            item.classList.add('selected');
        }
    });
}

function activateDrawMode() {
    isDrawMode = true;
    isMarkerMode = false;
    isTextMode = false;
    currentShape = null;
    currentLineType = null;
    currentBrushSize = parseInt(document.getElementById('brushSizeSlider').value);
    if (typeof window.closeDrawSubmenu === 'function') {
        window.closeDrawSubmenu();
    }
    
    if (canvas && ctx) {
        canvas.style.cursor = 'crosshair';
    }
    
    // Activer le canvas pour le dessin
    updateCanvasPointerEvents();
}

function activateMarkerMode() {
    isMarkerMode = true;
    isEraserMode = false;
    isDrawMode = false;
    isTextMode = false;
    currentShape = null;
    currentLineType = null;
    currentBrushSize = parseInt(document.getElementById('brushSizeSlider').value);
    if (typeof window.closeDrawSubmenu === 'function') {
        window.closeDrawSubmenu();
    }
    
    if (canvas && ctx) {
        canvas.style.cursor = 'crosshair';
    }
    
    // Activer le canvas pour le feutre
    updateCanvasPointerEvents();
}

function activateEraserMode() {
    isEraserMode = true;
    isMarkerMode = false;
    isDrawMode = false;
    isTextMode = false;
    currentShape = null;
    currentLineType = null;
    currentBrushSize = parseInt(document.getElementById('brushSizeSlider').value);
    if (typeof window.closeDrawSubmenu === 'function') {
        window.closeDrawSubmenu();
    }
    
    if (canvas && ctx) {
        canvas.style.cursor = 'grab';
    }
    
    // Activer le canvas pour la gomme
    updateCanvasPointerEvents();
}

function deactivateDrawingTools() {
    isMarkerMode = false;
    isEraserMode = false;
    isDrawMode = false;
    isTextMode = false;
    currentShape = null;
    currentLineType = null;
    
    if (canvas && ctx) {
        canvas.style.cursor = 'default';
    }
    
    // Désactiver le canvas si aucun élément n'est sélectionné
    const hasSelectedElement = window.selectedElement || (window.addedElements && window.addedElements.length > 0);
    if (!hasSelectedElement && canvas) {
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '50';
    } else {
        updateCanvasPointerEvents();
    }
}

// Dessine un élément (forme, ligne, texte) sur un contexte d'export avec mise à l'échelle (pour export image et enregistrement vidéo avec timing)
function drawElementToExportCtx(element, ctx, scaleX, scaleY) {
    if (element.type === 'shape') {
        ctx.save();
        var scaledX = element.x * scaleX, scaledY = element.y * scaleY, scaledWidth = element.width * scaleX, scaledHeight = element.height * scaleY;
        var shapeType = element.shapeType;
        ctx.strokeStyle = '#FFD700';
        ctx.fillStyle = 'rgba(255, 215, 0, 0.55)';
        ctx.lineWidth = 3;
        switch(shapeType) {
            case 'square':
                ctx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight);
                ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);
                break;
            case 'rounded-square':
                var radius = Math.min(scaledWidth, scaledHeight) * 0.2;
                ctx.beginPath();
                ctx.moveTo(scaledX + radius, scaledY);
                ctx.lineTo(scaledX + scaledWidth - radius, scaledY);
                ctx.quadraticCurveTo(scaledX + scaledWidth, scaledY, scaledX + scaledWidth, scaledY + radius);
                ctx.lineTo(scaledX + scaledWidth, scaledY + scaledHeight - radius);
                ctx.quadraticCurveTo(scaledX + scaledWidth, scaledY + scaledHeight, scaledX + scaledWidth - radius, scaledY + scaledHeight);
                ctx.lineTo(scaledX + radius, scaledY + scaledHeight);
                ctx.quadraticCurveTo(scaledX, scaledY + scaledHeight, scaledX, scaledY + scaledHeight - radius);
                ctx.lineTo(scaledX, scaledY + radius);
                ctx.quadraticCurveTo(scaledX, scaledY, scaledX + radius, scaledY);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                break;
            case 'circle':
                var centerX = scaledX + scaledWidth / 2, centerY = scaledY + scaledHeight / 2, radius_circle = Math.min(scaledWidth, scaledHeight) / 2;
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius_circle, 0, 2 * Math.PI);
                ctx.fill();
                ctx.stroke();
                break;
            case 'triangle':
                ctx.beginPath();
                ctx.moveTo(scaledX + scaledWidth / 2, scaledY);
                ctx.lineTo(scaledX, scaledY + scaledHeight);
                ctx.lineTo(scaledX + scaledWidth, scaledY + scaledHeight);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                break;
            case 'triangle-inverted':
                ctx.beginPath();
                ctx.moveTo(scaledX + scaledWidth / 2, scaledY + scaledHeight);
                ctx.lineTo(scaledX, scaledY);
                ctx.lineTo(scaledX + scaledWidth, scaledY);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                break;
            case 'diamond':
                ctx.beginPath();
                ctx.moveTo(scaledX + scaledWidth / 2, scaledY);
                ctx.lineTo(scaledX + scaledWidth, scaledY + scaledHeight / 2);
                ctx.lineTo(scaledX + scaledWidth / 2, scaledY + scaledHeight);
                ctx.lineTo(scaledX, scaledY + scaledHeight / 2);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                break;
            case 'hexagon':
                var centerX_hex = scaledX + scaledWidth / 2, centerY_hex = scaledY + scaledHeight / 2, radius_hex = Math.min(scaledWidth, scaledHeight) / 2;
                ctx.beginPath();
                for (var i = 0; i < 6; i++) {
                    var angle = (Math.PI / 3) * i;
                    var px = centerX_hex + radius_hex * Math.cos(angle), py = centerY_hex + radius_hex * Math.sin(angle);
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                break;
        }
        ctx.restore();
    } else if (element.type === 'shape3d') {
        ctx.save();
        var sx = element.x * scaleX, sy = element.y * scaleY, sw = element.width * scaleX, sh = element.height * scaleY;
        if (typeof drawShape3d === 'function') drawShape3d(element.shape3dType, sx, sy, sw, sh, ctx, element.rotationX, element.rotationY);
        ctx.restore();
    } else if (element.type === 'text') {
        ctx.save();
        var scaledX = element.x * scaleX, scaledY = element.y * scaleY, scaledFontSize = (element.fontSize || 24) * scaleX;
        ctx.fillStyle = '#FFD700';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2 * scaleX;
        ctx.font = 'bold ' + scaledFontSize + 'px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.strokeText(element.text, scaledX, scaledY);
        ctx.fillText(element.text, scaledX, scaledY);
        ctx.restore();
    } else if (element.type === 'line') {
        var x1 = element.x1 * scaleX, y1 = element.y1 * scaleY, x2 = element.x2 * scaleX, y2 = element.y2 * scaleY;
        ctx.save();
        ctx.strokeStyle = '#FFD700';
        ctx.fillStyle = '#FFD700';
        ctx.lineWidth = 3 * scaleX;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        var lt = element.lineType || 'straight-arrow';
        if (lt === 'straight-arrow') {
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            var angle = Math.atan2(y2 - y1, x2 - x1), arrowLength = 15 * scaleX;
            ctx.beginPath();
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - arrowLength * Math.cos(angle - Math.PI / 6), y2 - arrowLength * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(x2 - arrowLength * Math.cos(angle + Math.PI / 6), y2 - arrowLength * Math.sin(angle + Math.PI / 6));
            ctx.closePath();
            ctx.fill();
        } else if (lt === 'curved') {
            var midX = (x1 + x2) / 2, midY = (y1 + y2) / 2, controlX = midX + (y2 - y1) * 0.3, controlY = midY - (x2 - x1) * 0.3;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.quadraticCurveTo(controlX, controlY, x2, y2);
            ctx.stroke();
        } else if (lt === 'zigzag') {
            var dx = x2 - x1, dy = y2 - y1, distance = Math.sqrt(dx * dx + dy * dy);
            var segments = Math.max(3, Math.floor(distance / (20 * scaleX)));
            var perpX = -dy / distance, perpY = dx / distance, amplitude = 10 * scaleX;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            for (var j = 1; j <= segments; j++) {
                var t = j / segments, xx = x1 + dx * t, yy = y1 + dy * t, offset = (j % 2 === 0 ? 1 : -1) * amplitude;
                ctx.lineTo(xx + perpX * offset, yy + perpY * offset);
            }
            ctx.stroke();
        }
        ctx.restore();
    }
}

// Fonction pour exporter l'image modifiée - retourne une promesse avec le blob
window.exportImageToBlob = function() {
    return new Promise((resolve, reject) => {
        try {
            const imageElement = getMediaEl();
            const editingCanvas = document.getElementById('editingCanvas');
            
            if (!imageElement || !editingCanvas) {
                reject(new Error('Image ou canvas non trouvé.'));
                return;
            }
            
            if (!isMediaReady(imageElement)) {
                reject(new Error('Veuillez attendre que l\'image soit complètement chargée.'));
                return;
            }
            
            const exportCanvas = document.createElement('canvas');
            const exportCtx = exportCanvas.getContext('2d');
            
            var _ns = getMediaNaturalSize(imageElement); exportCanvas.width = _ns.w; exportCanvas.height = _ns.h;
            
            exportCtx.drawImage(imageElement, 0, 0, exportCanvas.width, exportCanvas.height);
            
            const scaleX = exportCanvas.width / editingCanvas.width;
            const scaleY = exportCanvas.height / editingCanvas.height;
            
            exportCtx.drawImage(editingCanvas, 0, 0, editingCanvas.width, editingCanvas.height, 
                               0, 0, exportCanvas.width, exportCanvas.height);
            
            const elements = window.addedElements || [];
            elements.forEach(element => {
                if (element.removedAtTime !== undefined) return;
                drawElementToExportCtx(element, exportCtx, scaleX, scaleY);
            });
            
            exportCanvas.toBlob(function(blob) {
                if (!blob) {
                    reject(new Error('Erreur lors de la création de l\'image.'));
                    return;
                }
                resolve(blob);
            }, 'image/png');
            
        } catch (error) {
            reject(error);
        }
    });
};

// Fonction pour exporter/envoyer l'image modifiée (version originale pour compatibilité)
window.exportImage = function() {
    window.exportImageToBlob()
        .then(blob => {
            const formData = new FormData();
            formData.append('file', blob, 'image_modifiee.png');
            
            return fetch('/upload', {
                method: 'POST',
                body: formData
            });
        })
        .then(response => {
            if (response.ok) {
                return response.text();
            } else {
                throw new Error('Erreur lors de l\'envoi de l\'image.');
            }
        })
        .then(() => {
            alert('Image modifiée envoyée avec succès !');
            window.location.reload();
        })
        .catch(error => {
            console.error('Erreur:', error);
            alert('Erreur lors de l\'envoi: ' + error.message);
        });
};

// Fonction pour télécharger l'image modifiée sur l'ordinateur/téléphone (image ou frame vidéo)
window.downloadModifiedImage = function() {
    const saveBtn = document.getElementById('saveBtn');
    const mediaEl = getMediaEl();
    const isVideo = mediaEl && mediaEl.tagName === 'VIDEO';
    const defaultSaveLabel = isVideo ? '💾 Sauvegarder la frame actuelle (image)' : '💾 Sauvegarder l\'image modifiée';

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.6';
        saveBtn.textContent = '⏳ Préparation...';
    }

    window.exportImageToBlob()
        .then(blob => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;

            const now = new Date();
            const dateStr = now.toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_');
            link.download = isVideo ? `video_modifiee_frame_${dateStr}.png` : `image_modifiee_${dateStr}.png`;

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setTimeout(() => URL.revokeObjectURL(url), 100);

            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.style.opacity = '1';
                saveBtn.textContent = defaultSaveLabel;
            }

            alert(isVideo ? 'Vidéo modifiée (frame actuelle) enregistrée sur votre ordinateur.' : 'Image modifiée téléchargée avec succès !');
        })
        .catch(error => {
            console.error('Erreur:', error);
            alert('Erreur lors du téléchargement: ' + error.message);
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.style.opacity = '1';
                saveBtn.textContent = defaultSaveLabel;
            }
        });
};

// Enregistrer la vidéo entière avec les annotations + bande-son (télécharge un fichier MP4)
// - La vidéo est toujours relue depuis le début (currentTime = 0) pour enregistrer la vidéo entière.
// - Chaque modification n'apparaît qu'à partir de l'instant où elle a été ajoutée (addedAtTime) et disparaît après suppression (removedAtTime).
// - En cas de pause pendant l'enregistrement, aucune image n'est ajoutée pendant la pause : la durée du fichier enregistré reste égale à la durée d'origine de la vidéo.
window.recordModifiedVideo = function() {
    const video = document.getElementById('editableVideo');
    const editingCanvas = document.getElementById('editingCanvas');
    const recordBtn = document.getElementById('recordVideoBtn');

    if (!video || !editingCanvas) {
        alert('Vidéo ou canvas non trouvé.');
        return;
    }
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
        alert('Veuillez attendre que la vidéo soit chargée.');
        return;
    }

    if (typeof window._recordVideoRafId !== 'undefined' && window._recordVideoRafId !== null) {
        return;
    }
    if (typeof window._recordVideoTimeoutId !== 'undefined' && window._recordVideoTimeoutId !== null) {
        return;
    }

    if (!window.HTMLCanvasElement.prototype.captureStream) {
        alert('Votre navigateur ne supporte pas l\'enregistrement. Essayez Microsoft Edge ou Chrome.');
        return;
    }

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : (MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '');
    if (!mimeType) {
        alert('Format d\'enregistrement non supporté par ce navigateur.');
        return;
    }

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = w;
    exportCanvas.height = h;
    const exportCtx = exportCanvas.getContext('2d');

    const videoStream = exportCanvas.captureStream(30);
    var combinedStream = videoStream;

    try {
        var audioCtx = window.AudioContext || window.webkitAudioContext;
        if (audioCtx) {
            var ctx = new audioCtx();
            var source = ctx.createMediaElementSource(video);
            var dest = ctx.createMediaStreamDestination();
            source.connect(dest);
            source.connect(ctx.destination);
            combinedStream = new MediaStream([
                videoStream.getVideoTracks()[0]
            ].concat(dest.stream.getAudioTracks()));
        }
    } catch (e) {
        console.warn('Audio non capturé:', e);
    }

    const recorder = new MediaRecorder(combinedStream, { mimeType: mimeType, videoBitsPerSecond: 4000000, audioBitsPerSecond: 128000 });
    const chunks = [];

    recorder.ondataavailable = function(e) {
        if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    function stopRecording() {
        if (window._recordVideoRafId != null) {
            cancelAnimationFrame(window._recordVideoRafId);
            window._recordVideoRafId = null;
        }
        if (window._recordVideoTimeoutId != null) {
            clearTimeout(window._recordVideoTimeoutId);
            window._recordVideoTimeoutId = null;
        }
        video.removeEventListener('ended', onVideoEnded);
        video.removeEventListener('pause', onVideoPause);
        if (recorder.state === 'recording') recorder.stop();
        var badge = document.getElementById('recordProgressBadge');
        if (badge) badge.style.display = 'none';
    }

    function onVideoEnded() { stopRecording(); }
    function onVideoPause() {
        if (video.ended) return;
    }

    function finishAndDownload(blob, extension, mimeForDownload) {
        var dateStr = new Date().toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_');
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'video_modifiee_annotations_' + dateStr + '.' + extension;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 200);
        video.pause();
        var badge = document.getElementById('recordProgressBadge');
        if (badge) badge.style.display = 'none';
        if (recordBtn) {
            recordBtn.disabled = false;
            recordBtn.style.opacity = '1';
            recordBtn.textContent = 'Télécharger vidéo (propre)';
        }
        alert('Vidéo originale téléchargée (sans annotations) en format ' + extension.toUpperCase() + '.\n\nLes éléments géométriques ajoutés restent en local et seront envoyés à l\'IA comme métadonnées JSON.\n\nVous pouvez la lire avec le lecteur Windows ou VLC.');
    }

    recorder.onstop = function() {
        var blob = new Blob(chunks, { type: mimeType });
        var recordBtnRef = recordBtn;
        if (recordBtnRef) {
            recordBtnRef.disabled = true;
            recordBtnRef.style.opacity = '0.6';
            recordBtnRef.textContent = '⏳ Conversion en MP4...';
        }
        var formData = new FormData();
        formData.append('file', blob, 'record.webm');
        fetch('/api/convert-webm-to-mp4', { method: 'POST', body: formData })
            .then(function(res) {
                if (res.ok) return res.blob();
                return res.text().then(function(t) { throw new Error(t || 'Conversion échouée'); });
            })
            .then(function(mp4Blob) {
                finishAndDownload(mp4Blob, 'mp4', 'video/mp4');
            })
            .catch(function(err) {
                console.warn('Conversion MP4:', err);
                if (recordBtnRef) {
                    recordBtnRef.disabled = false;
                    recordBtnRef.style.opacity = '1';
                    recordBtnRef.textContent = 'Télécharger vidéo (propre)';
                }
                finishAndDownload(blob, 'webm', mimeType);
                alert('La vidéo a été téléchargée en WebM (avec le son). La conversion en MP4 n\'a pas été possible sur le serveur. Vous pouvez convertir le fichier avec VLC ou un outil en ligne.');
            });
    };

    if (recordBtn) {
        recordBtn.disabled = true;
        recordBtn.style.opacity = '0.6';
        recordBtn.textContent = '⏳ Traitement en cours...';
    }
    var progressBadge = document.getElementById('recordProgressBadge');
    if (progressBadge) {
        progressBadge.textContent = '0%';
        progressBadge.style.display = 'inline-block';
    }

    video.addEventListener('ended', onVideoEnded);
    video.addEventListener('pause', onVideoPause);
    video.currentTime = 0;
    video.muted = false;
    video.play().catch(function() {});

    recorder.start(200);

    var targetFps = 30;
    var frameDuration = 1 / targetFps;
    var nextCaptureTime = 0;

    function drawFrame() {
        if (video.ended) {
            return;
        }
        if (video.paused) {
            window._recordVideoRafId = requestAnimationFrame(drawFrame);
            return;
        }
        var t = video.currentTime;
        if (t >= nextCaptureTime) {
            exportCtx.drawImage(video, 0, 0, w, h);
            var scaleX = w / editingCanvas.width, scaleY = h / editingCanvas.height;
            var currentTime = video.currentTime;
            
            // ❌ NE PAS DESSINER LES ÉLÉMENTS SUR LA VIDÉO
            // Les annotations des éléments restent en local pour l'édition
            // Seule la vidéo originale est enregistrée/envoyée à l'IA
            // (Les métadonnées des éléments seront envoyées séparément en JSON)
            
            nextCaptureTime += frameDuration;
            if (nextCaptureTime < t) nextCaptureTime = t + frameDuration;
            var badge = document.getElementById('recordProgressBadge');
            if (badge && video.duration && isFinite(video.duration)) {
                var pct = Math.min(100, Math.round((video.currentTime / video.duration) * 100));
                badge.textContent = pct + '%';
            }
        }
        window._recordVideoRafId = requestAnimationFrame(drawFrame);
    }
    window._recordVideoRafId = requestAnimationFrame(drawFrame);
};

// Gestion des sliders
document.addEventListener('DOMContentLoaded', function() {
    const fontSizeSlider = document.getElementById('fontSizeSlider');
    const fontSizeValue = document.getElementById('fontSizeValue');
    if (fontSizeSlider && fontSizeValue) {
        fontSizeSlider.addEventListener('input', function() {
            fontSizeValue.textContent = this.value + 'px';
        });
    }
    
    const brushSizeSlider = document.getElementById('brushSizeSlider');
    const brushSizeValue = document.getElementById('brushSizeValue');
    if (brushSizeSlider && brushSizeValue) {
        brushSizeSlider.addEventListener('input', function() {
            brushSizeValue.textContent = this.value + 'px';
            if (isDrawMode) {
                currentBrushSize = parseInt(this.value);
            }
        });
    }
    
    // Initialiser la couleur sélectionnée
    selectColor('#FFD700');
});

// La fonction selectShape est maintenant définie globalement en haut du script (window.selectShape)
// La fonction drawShape est maintenant définie globalement en haut du script (window.drawShape)

// Garder aussi la fonction locale pour compatibilité
function drawShape(shapeType, x, y, width, height, elementId = null) {
    if (typeof window.drawShape === 'function') {
        return window.drawShape(shapeType, x, y, width, height, elementId);
    } else {
        console.error('window.drawShape n\'est pas définie');
        return null;
    }
}

function drawLine(lineType, x1, y1, x2, y2) {
    if (!ctx) return;
    
    ctx.strokeStyle = '#FFD700';
    ctx.fillStyle = '#FFD700';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    switch(lineType) {
        case 'straight-arrow':
            // Dessiner la ligne droite
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            
            // Dessiner la flèche
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const arrowLength = 15;
            const arrowWidth = 8;
            
            ctx.beginPath();
            ctx.moveTo(x2, y2);
            ctx.lineTo(
                x2 - arrowLength * Math.cos(angle - Math.PI / 6),
                y2 - arrowLength * Math.sin(angle - Math.PI / 6)
            );
            ctx.lineTo(
                x2 - arrowLength * Math.cos(angle + Math.PI / 6),
                y2 - arrowLength * Math.sin(angle + Math.PI / 6)
            );
            ctx.closePath();
            ctx.fill();
            break;
            
        case 'curved':
            // Ligne courbe (courbe de Bézier quadratique)
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const controlX = midX + (y2 - y1) * 0.3;
            const controlY = midY - (x2 - x1) * 0.3;
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.quadraticCurveTo(controlX, controlY, x2, y2);
            ctx.stroke();
            break;
            
        case 'zigzag':
            // Ligne torsadée (zigzag)
            const dx = x2 - x1;
            const dy = y2 - y1;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const segments = Math.max(3, Math.floor(distance / 20));
            const segmentLength = distance / segments;
            const perpX = -dy / distance;
            const perpY = dx / distance;
            const amplitude = 10;
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            
            for (let i = 1; i <= segments; i++) {
                const t = i / segments;
                const x = x1 + dx * t;
                const y = y1 + dy * t;
                const offset = (i % 2 === 0 ? 1 : -1) * amplitude;
                
                ctx.lineTo(
                    x + perpX * offset,
                    y + perpY * offset
                );
            }
            
            ctx.stroke();
            break;
    }
}

function drawTextOnCanvas(text, x, y, elementId = null) {
    if (!ctx) return;
    
    const id = elementId || 'text_' + Date.now();
    const fontSize = currentFontSize;
    
    ctx.fillStyle = '#FFD700';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    // Mesurer le texte pour la zone de sélection
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = fontSize;
    
    // Dessiner le texte avec contour
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
    
    // Si c'est un nouvel élément, l'ajouter à la liste
    if (!elementId) {
        if (!window.addedElements) {
            window.addedElements = [];
        }
        window.addedElements.push({
            type: 'text',
            id: id,
            text: text,
            x: x,
            y: y,
            fontSize: fontSize,
            addedAtTime: getCurrentMediaTime()
        });
    }
    
    return { id, x, y, width: textWidth, height: textHeight };
}

// Implémentation réelle du redessin (appelée de façon différée pour éviter stack overflow)
function redrawCanvasImpl() {
    if (isRedrawing) return;
    isRedrawing = true;
    
    try {
        let currentCtx = window.ctx || ctx;
        let currentCanvas = window.canvas || canvas;
        
        if (!currentCanvas) {
            currentCanvas = document.getElementById('editingCanvas');
            if (currentCanvas) window.canvas = currentCanvas;
        }
        if (!currentCtx && currentCanvas) {
            currentCtx = currentCanvas.getContext('2d');
            if (currentCtx) window.ctx = currentCtx;
        }
        
        if (!currentCtx || !currentCanvas) {
            isRedrawing = false;
            return;
        }
        
        if (currentCanvas.width === 0 || currentCanvas.height === 0) {
            currentCanvas.width = window.innerWidth || 1920;
            currentCanvas.height = window.innerHeight || 1080;
        }
        
        if (currentCanvas.style.display !== 'block') currentCanvas.style.setProperty('display', 'block', 'important');
        if (currentCanvas.style.visibility !== 'visible') currentCanvas.style.setProperty('visibility', 'visible', 'important');
        if (currentCanvas.style.opacity !== '1') currentCanvas.style.setProperty('opacity', '1', 'important');
        if (currentCanvas.style.clipPath !== 'none') {
            currentCanvas.style.setProperty('clip-path', 'none', 'important');
            currentCanvas.style.setProperty('-webkit-clip-path', 'none', 'important');
        }
        
        currentCtx.clearRect(0, 0, currentCanvas.width, currentCanvas.height);
        
        const elements = window.addedElements || addedElements || [];
        const currentSelectedElement = window.selectedElement || selectedElement;
        let selectedElementDrawn = false;
        if (elements && Array.isArray(elements) && elements.length > 0) {
            elements.forEach((element) => {
                if (!element || element.removedAtTime !== undefined) return;
                try {
                    if (element.type === 'text' && typeof drawTextOnCanvas === 'function') {
                        drawTextOnCanvas(element.text, element.x, element.y, element.id);
                    } else if (element.type === 'shape' && typeof window.drawShape === 'function') {
                        window.drawShape(element.shapeType, element.x, element.y, element.width, element.height, element.id);
                        if (currentSelectedElement && element.id === currentSelectedElement.id) selectedElementDrawn = true;
                    } else if (element.type === 'line' && typeof drawLine === 'function') {
                        drawLine(element.lineType || 'straight-arrow', element.x1, element.y1, element.x2, element.y2);
                        if (currentSelectedElement && element.id === currentSelectedElement.id) selectedElementDrawn = true;
                    } else if (element.type === 'shape3d' && typeof drawShape3d === 'function') {
                        drawShape3d(element.shape3dType, element.x, element.y, element.width, element.height, currentCtx, element.rotationX, element.rotationY);
                        if (currentSelectedElement && element.id === currentSelectedElement.id) selectedElementDrawn = true;
                    }
                } catch (err) { console.error('Erreur dessin élément:', err); }
            });
        }
        
        // Sécurité: si l'élément sélectionné n'a pas été dessiné via la boucle principale,
        // le dessiner explicitement avant les poignées.
        if (currentSelectedElement && !selectedElementDrawn && currentSelectedElement.removedAtTime === undefined) {
            try {
                if (currentSelectedElement.type === 'shape' && typeof window.drawShape === 'function') {
                    window.drawShape(
                        currentSelectedElement.shapeType,
                        currentSelectedElement.x,
                        currentSelectedElement.y,
                        currentSelectedElement.width,
                        currentSelectedElement.height,
                        currentSelectedElement.id
                    );
                } else if (currentSelectedElement.type === 'line' && typeof drawLine === 'function') {
                    drawLine(
                        currentSelectedElement.lineType || 'straight-arrow',
                        currentSelectedElement.x1,
                        currentSelectedElement.y1,
                        currentSelectedElement.x2,
                        currentSelectedElement.y2
                    );
                } else if (currentSelectedElement.type === 'shape3d' && typeof drawShape3d === 'function') {
                    drawShape3d(
                        currentSelectedElement.shape3dType,
                        currentSelectedElement.x,
                        currentSelectedElement.y,
                        currentSelectedElement.width,
                        currentSelectedElement.height,
                        currentCtx,
                        currentSelectedElement.rotationX,
                        currentSelectedElement.rotationY
                    );
                } else if (currentSelectedElement.type === 'text' && typeof drawTextOnCanvas === 'function') {
                    drawTextOnCanvas(currentSelectedElement.text, currentSelectedElement.x, currentSelectedElement.y, currentSelectedElement.id);
                }
            } catch (err) {
                console.error('Erreur dessin fallback élément sélectionné:', err);
            }
        }

        if (currentSelectedElement && (currentSelectedElement.type === 'shape' || currentSelectedElement.type === 'shape3d' || currentSelectedElement.type === 'text' || currentSelectedElement.type === 'line') && typeof drawResizeHandles === 'function') {
            try { drawResizeHandles(currentSelectedElement); } catch (err) { console.error('Erreur poignées:', err); }
        }
    } catch (error) {
        console.error('Erreur redrawCanvas:', error);
    } finally {
        isRedrawing = false;
    }
}

// Toujours différer pour ne jamais exécuter dans la pile d'un event handler (évite "Maximum call stack size exceeded")
let redrawCanvasScheduled = false;
window.redrawCanvas = function() {
    if (redrawCanvasScheduled) return;
    redrawCanvasScheduled = true;
    setTimeout(function() {
        redrawCanvasScheduled = false;
        redrawCanvasImpl();
    }, 0);
};

function drawResizeHandles(element) {
    const currentCtx = window.ctx || ctx;
    if (!currentCtx) return;
    
    const handleSize = 8;
    const handles = [];
    
    if (element.type === 'shape') {
        // 8 poignées pour les formes (coins et milieux)
        handles.push(
            {x: element.x, y: element.y}, // Coin supérieur gauche
            {x: element.x + element.width/2, y: element.y}, // Milieu haut
            {x: element.x + element.width, y: element.y}, // Coin supérieur droit
            {x: element.x + element.width, y: element.y + element.height/2}, // Milieu droit
            {x: element.x + element.width, y: element.y + element.height}, // Coin inférieur droit
            {x: element.x + element.width/2, y: element.y + element.height}, // Milieu bas
            {x: element.x, y: element.y + element.height}, // Coin inférieur gauche
            {x: element.x, y: element.y + element.height/2} // Milieu gauche
        );
    } else if (element.type === 'shape3d') {
        handles.push(
            {x: element.x, y: element.y},
            {x: element.x + element.width/2, y: element.y},
            {x: element.x + element.width, y: element.y},
            {x: element.x + element.width, y: element.y + element.height/2},
            {x: element.x + element.width, y: element.y + element.height},
            {x: element.x + element.width/2, y: element.y + element.height},
            {x: element.x, y: element.y + element.height},
            {x: element.x, y: element.y + element.height/2}
        );
    } else if (element.type === 'text') {
        const metrics = currentCtx.measureText(element.text);
        handles.push(
            {x: element.x, y: element.y},
            {x: element.x + metrics.width, y: element.y},
            {x: element.x + metrics.width, y: element.y + element.fontSize},
            {x: element.x, y: element.y + element.fontSize}
        );
    } else if (element.type === 'line') {
        handles.push({ x: element.x1, y: element.y1 });
        handles.push({ x: element.x2, y: element.y2 });
    }
    
    // Dessiner les poignées
    handles.forEach(handle => {
        currentCtx.fillStyle = '#4a90e2';
        currentCtx.strokeStyle = '#ffffff';
        currentCtx.lineWidth = 2;
        currentCtx.beginPath();
        currentCtx.arc(handle.x, handle.y, handleSize, 0, Math.PI * 2);
        currentCtx.fill();
        currentCtx.stroke();
    });
}

function getResizeHandleAtPosition(x, y, element) {
    if (!element) return null;
    
    const handleSize = 12;
    const handles = [];
    
    if (element.type === 'shape') {
        handles.push(
            {x: element.x, y: element.y, type: 'nw'},
            {x: element.x + element.width/2, y: element.y, type: 'n'},
            {x: element.x + element.width, y: element.y, type: 'ne'},
            {x: element.x + element.width, y: element.y + element.height/2, type: 'e'},
            {x: element.x + element.width, y: element.y + element.height, type: 'se'},
            {x: element.x + element.width/2, y: element.y + element.height, type: 's'},
            {x: element.x, y: element.y + element.height, type: 'sw'},
            {x: element.x, y: element.y + element.height/2, type: 'w'}
        );
    } else if (element.type === 'shape3d') {
        handles.push(
            {x: element.x, y: element.y, type: 'nw'},
            {x: element.x + element.width/2, y: element.y, type: 'n'},
            {x: element.x + element.width, y: element.y, type: 'ne'},
            {x: element.x + element.width, y: element.y + element.height/2, type: 'e'},
            {x: element.x + element.width, y: element.y + element.height, type: 'se'},
            {x: element.x + element.width/2, y: element.y + element.height, type: 's'},
            {x: element.x, y: element.y + element.height, type: 'sw'},
            {x: element.x, y: element.y + element.height/2, type: 'w'}
        );
    } else if (element.type === 'text') {
        ctx.font = `bold ${element.fontSize}px Arial`;
        const metrics = ctx.measureText(element.text);
        handles.push(
            {x: element.x, y: element.y, type: 'nw'},
            {x: element.x + metrics.width, y: element.y, type: 'ne'},
            {x: element.x + metrics.width, y: element.y + element.fontSize, type: 'se'},
            {x: element.x, y: element.y + element.fontSize, type: 'sw'}
        );
    } else if (element.type === 'line') {
        handles.push({ x: element.x1, y: element.y1, type: 'start' });
        handles.push({ x: element.x2, y: element.y2, type: 'end' });
    } else if (element.type === 'shape3d') {
        handles.push(
            {x: element.x, y: element.y, type: 'nw'},
            {x: element.x + element.width/2, y: element.y, type: 'n'},
            {x: element.x + element.width, y: element.y, type: 'ne'},
            {x: element.x + element.width, y: element.y + element.height/2, type: 'e'},
            {x: element.x + element.width, y: element.y + element.height, type: 'se'},
            {x: element.x + element.width/2, y: element.y + element.height, type: 's'},
            {x: element.x, y: element.y + element.height, type: 'sw'},
            {x: element.x, y: element.y + element.height/2, type: 'w'}
        );
    }
    
    for (let handle of handles) {
        const dx = x - handle.x;
        const dy = y - handle.y;
        if (Math.sqrt(dx * dx + dy * dy) <= handleSize) {
            return handle;
        }
    }
    return null;
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (len * len)));
    const projX = x1 + t * dx, projY = y1 + t * dy;
    return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
}

// Convertit les coordonnées viewport (clientX, clientY) en coordonnées canvas (relatives à l'image) pour que les objets défilent avec l'image
function getCanvasCoords(clientX, clientY) {
    const c = document.getElementById('editingCanvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return {
        x: clientX - r.left,
        y: clientY - r.top
    };
}

function getElementAtPosition(x, y) {
    const elementsArray = window.addedElements || [];
    for (let i = elementsArray.length - 1; i >= 0; i--) {
        const element = elementsArray[i];
        if (element.removedAtTime !== undefined) continue;
        
        if (element.type === 'text') {
            const metrics = ctx.measureText(element.text);
            if (x >= element.x && x <= element.x + metrics.width &&
                y >= element.y && y <= element.y + element.fontSize) {
                return element;
            }
        } else if (element.type === 'shape') {
            if (x >= element.x && x <= element.x + element.width &&
                y >= element.y && y <= element.y + element.height) {
                return element;
            }
        } else if (element.type === 'shape3d') {
            if (x >= element.x && x <= element.x + element.width &&
                y >= element.y && y <= element.y + element.height) {
                return element;
            }
        } else if (element.type === 'line') {
            const d = distanceToSegment(x, y, element.x1, element.y1, element.x2, element.y2);
            if (d <= 15) return element;
        }
    }
    return null;
}

// Gestion des événements de souris sur le canvas
function setupCanvasEvents() {
    if (eventsSetup) return; // Éviter les doublons d'événements
    
    try {
        if (!canvas) {
            canvas = document.getElementById('editingCanvas');
        }
        if (!canvas) {
            return;
        }
        
        if (!ctx) {
            ctx = canvas.getContext('2d');
            if (!ctx) {
                return;
            }
        }
        
        eventsSetup = true;

    // Sur la page vidéo : transmettre les clics au lecteur pour pause/play (barre de contrôle ou zone vidéo vide)
    // Ne pas transmettre si le clic est sur une annotation (ligne, forme, texte, objet 3D)
    (function() {
        var video = document.getElementById('editableVideo');
        if (!video) return;
        var CONTROL_BAR_HEIGHT = 70;
        function isInControlBar(clientX, clientY) {
            var c = document.getElementById('editingCanvas');
            if (!c) return false;
            var r = c.getBoundingClientRect();
            return (clientY >= r.bottom - CONTROL_BAR_HEIGHT && clientY <= r.bottom && clientX >= r.left && clientX <= r.right);
        }
        function clickIsOnElement(clientX, clientY) {
            var coords = getCanvasCoords(clientX, clientY);
            if (!coords) return false;
            var el = getElementAtPosition(coords.x, coords.y);
            return !!(el && (el.type === 'line' || el.type === 'shape' || el.type === 'text' || el.type === 'shape3d'));
        }
        function isInAddMode() {
            return !!(currentShape || currentLineType || isTextMode || isDrawMode || isMarkerMode || isEraserMode);
        }
        function showVideoControls(e) {
            video.focus();
            video.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, view: window, clientX: e.clientX, clientY: e.clientY }));
            video.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, view: window, clientX: e.clientX, clientY: e.clientY }));
        }
        function forwardClickToVideo(e) {
            showVideoControls(e);
            video.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: e.clientX, clientY: e.clientY }));
            if (video.paused) video.play(); else video.pause();
        }
        canvas.addEventListener('mousedown', function(e) {
            if (!isInControlBar(e.clientX, e.clientY)) return;
            if (clickIsOnElement(e.clientX, e.clientY)) return;
            showVideoControls(e);
        }, true);
        canvas.addEventListener('click', function(e) {
            var onElement = clickIsOnElement(e.clientX, e.clientY);
            var inControlBar = isInControlBar(e.clientX, e.clientY);
            if (inControlBar && !onElement) {
                e.stopPropagation();
                e.preventDefault();
                forwardClickToVideo(e);
                return;
            }
            if (!inControlBar && !onElement && !isInAddMode()) {
                e.stopPropagation();
                e.preventDefault();
                forwardClickToVideo(e);
                return;
            }
        }, true);
    })();

    canvas.addEventListener('mousedown', function(e) {
        // Anti-réentrance : éviter tout traitement si un mousedown est déjà en cours (évite stack overflow)
        if (window.isHandlingCanvasMouseDown) return;
        window.isHandlingCanvasMouseDown = true;
        try {
        // VÉRIFIER D'ABORD si le canvas est activé
        if (!canvas || canvas.style.pointerEvents === 'none') {
            return;
        }
        
        const domElement = document.elementFromPoint(e.clientX, e.clientY);
        
        // Ignorer les clics sur les boutons, menus, et autres éléments interactifs
        if (domElement && (
            domElement.id === 'toolsBtn' ||
            domElement.id === 'saveBtn' ||
            domElement.closest('#toolsBtn') ||
            domElement.closest('#saveBtn') ||
            domElement.closest('.tools-btn') ||
            domElement.closest('.delete-btn') ||
            domElement.closest('.tools-menu') ||
            domElement.closest('.tools-overlay') ||
            domElement.closest('.shapes-submenu') ||
            domElement.closest('button') ||
            domElement.closest('input') ||
            domElement.closest('select') ||
            domElement.tagName === 'BUTTON' ||
            domElement.tagName === 'INPUT' ||
            domElement.tagName === 'SELECT'
        )) {
            // Désactiver le canvas pour permettre le clic sur le bouton
            canvas.style.pointerEvents = 'none';
            canvas.style.zIndex = '50';
            return; // Ignorer ce clic
        }
        
        // Coordonnées en espace canvas (relatives à l'image) pour que les objets défilent avec la page
        const coords = getCanvasCoords(e.clientX, e.clientY);
        if (!coords) return;
        const x = coords.x;
        const y = coords.y;
        
        const currentSelected = window.selectedElement || selectedElement;
        
        if (currentSelected) {
            resizeHandle = getResizeHandleAtPosition(x, y, currentSelected);
            if (resizeHandle) {
                isResizing = true;
                if (currentSelected.type === 'line') {
                    initialElementState = {
                        x1: currentSelected.x1, y1: currentSelected.y1,
                        x2: currentSelected.x2, y2: currentSelected.y2
                    };
                } else {
                    initialElementState = {
                        x: currentSelected.x,
                        y: currentSelected.y,
                        width: currentSelected.width || (currentSelected.type === 'text' ? ctx.measureText(currentSelected.text).width : 0),
                        height: currentSelected.height || (currentSelected.type === 'text' ? currentSelected.fontSize : 0)
                    };
                }
                startX = x;
                startY = y;
                return;
            }
        }
        
        const clickedElement = getElementAtPosition(x, y);
        
        if (clickedElement && !isTextMode && !currentShape && !isDrawMode && !isMarkerMode && !currentLineType) {
            selectedElement = clickedElement;
            window.selectedElement = clickedElement;
            if (clickedElement.type === 'shape3d' && (e.shiftKey || e.altKey || window.rotateNextShape3dDrag)) {
                e.preventDefault();
                e.stopPropagation();
                isRotating = true;
                if (window.rotateNextShape3dDrag) window.rotateNextShape3dDrag = false;
                initialRotationX = clickedElement.rotationX || 0;
                initialRotationY = clickedElement.rotationY || 0;
                startX = x;
                startY = y;
                canvas.style.cursor = 'grab';
                function onDocRotateMove(ev) {
                    const c = getCanvasCoords(ev.clientX, ev.clientY);
                    if (!c) return;
                    const cur = window.selectedElement || selectedElement;
                    if (!cur || cur.type !== 'shape3d') return;
                    canvas.style.cursor = 'grabbing';
                    const dx = c.x - startX, dy = c.y - startY;
                    cur.rotationY = initialRotationY + dx * 0.012;
                    cur.rotationX = initialRotationX - dy * 0.012;
                    window.selectedElement = cur;
                    selectedElement = cur;
                    const arr = window.addedElements || [];
                    const idx = arr.findIndex(function(el) { return el.id === cur.id; });
                    if (idx !== -1) { arr[idx] = cur; window.addedElements = arr; }
                    if (typeof redrawCanvas === 'function') redrawCanvas();
                }
                function onDocRotateEnd() {
                    document.removeEventListener('mousemove', onDocRotateMove);
                    isRotating = false;
                    canvas.style.cursor = 'default';
                    if (typeof redrawCanvas === 'function') redrawCanvas();
                }
                document.addEventListener('mousemove', onDocRotateMove);
                document.addEventListener('mouseup', onDocRotateEnd, { once: true });
            } else {
                isMoving = true;
                if (clickedElement.type === 'line') {
                    initialLineMoveState = { x1: clickedElement.x1, y1: clickedElement.y1, x2: clickedElement.x2, y2: clickedElement.y2 };
                } else {
                    offsetX = x - clickedElement.x;
                    offsetY = y - clickedElement.y;
                }
                canvas.style.cursor = 'move';
            }
            setTimeout(function() {
                if (typeof redrawCanvas === 'function') redrawCanvas();
                if (typeof updateCanvasPointerEvents === 'function') updateCanvasPointerEvents();
            }, 0);
        } else if (!isTextMode && !currentShape && !isDrawMode && !isMarkerMode && !isEraserMode && !currentLineType) {
            // Désélectionner si on clique ailleurs
            selectedElement = null;
            window.selectedElement = null; // Synchroniser avec window
            // Différer pour éviter récursion
            setTimeout(function() {
                if (typeof redrawCanvas === 'function') redrawCanvas();
                if (typeof updateCanvasPointerEvents === 'function') updateCanvasPointerEvents();
            }, 0);
        } else if (isTextMode) {
            // Placer le texte à la position cliquée
            if (currentText) {
                drawTextOnCanvas(currentText, x, y);
                redrawCanvas();
            }
        } else if (isDrawMode || isMarkerMode || isEraserMode) {
            // Commencer à dessiner, colorier ou effacer
            isDrawing = true;
            lastX = x;
            lastY = y;
            
            // Pour le feutre, colorier immédiatement au clic
            if (isMarkerMode) {
                ctx.globalCompositeOperation = 'multiply';
                ctx.fillStyle = currentDrawColor;
                ctx.globalAlpha = 0.3;
                ctx.beginPath();
                ctx.arc(x, y, currentBrushSize, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1.0;
                ctx.globalCompositeOperation = 'source-over';
            } else if (isEraserMode) {
                // Mode gomme - effacer avec destination-out
                ctx.globalCompositeOperation = 'destination-out';
                ctx.beginPath();
                ctx.arc(x, y, currentBrushSize, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
            }
        } else if (currentLineType) {
            isDrawing = true;
            startX = x;
            startY = y;
        }
        } finally {
            setTimeout(function() { window.isHandlingCanvasMouseDown = false; }, 0);
        }
    });
    
    canvas.addEventListener('mousemove', function(e) {
        if (canvas.style.pointerEvents === 'none') return;
        
        // Coordonnées en espace canvas (relatives à l'image)
        const coords = getCanvasCoords(e.clientX, e.clientY);
        if (!coords) return;
        const currentX = coords.x;
        const currentY = coords.y;
        
        const currentSelectedForResize = window.selectedElement || selectedElement;
        
        if (isResizing && currentSelectedForResize && resizeHandle && initialElementState) {
            // Redimensionner l'élément
            const dx = currentX - startX;
            const dy = currentY - startY;
            
            if (currentSelectedForResize.type === 'shape' || currentSelectedForResize.type === 'shape3d') {
                switch(resizeHandle.type) {
                    case 'nw':
                        currentSelectedForResize.x = initialElementState.x + dx;
                        currentSelectedForResize.y = initialElementState.y + dy;
                        currentSelectedForResize.width = initialElementState.width - dx;
                        currentSelectedForResize.height = initialElementState.height - dy;
                        break;
                    case 'n':
                        currentSelectedForResize.y = initialElementState.y + dy;
                        currentSelectedForResize.height = initialElementState.height - dy;
                        break;
                    case 'ne':
                        currentSelectedForResize.y = initialElementState.y + dy;
                        currentSelectedForResize.width = initialElementState.width + dx;
                        currentSelectedForResize.height = initialElementState.height - dy;
                        break;
                    case 'e':
                        currentSelectedForResize.width = initialElementState.width + dx;
                        break;
                    case 'se':
                        currentSelectedForResize.width = initialElementState.width + dx;
                        currentSelectedForResize.height = initialElementState.height + dy;
                        break;
                    case 's':
                        currentSelectedForResize.height = initialElementState.height + dy;
                        break;
                    case 'sw':
                        currentSelectedForResize.x = initialElementState.x + dx;
                        currentSelectedForResize.width = initialElementState.width - dx;
                        currentSelectedForResize.height = initialElementState.height + dy;
                        break;
                    case 'w':
                        currentSelectedForResize.x = initialElementState.x + dx;
                        currentSelectedForResize.width = initialElementState.width - dx;
                        break;
                }
                
                // Limiter la taille minimale
                if (currentSelectedForResize.width < 20) currentSelectedForResize.width = 20;
                if (currentSelectedForResize.height < 20) currentSelectedForResize.height = 20;
                
                // Synchroniser avec window.selectedElement et window.addedElements
                window.selectedElement = currentSelectedForResize;
                selectedElement = currentSelectedForResize;
                const elementsArray = window.addedElements || [];
                const elementIndex = elementsArray.findIndex(el => el.id === currentSelectedForResize.id);
                if (elementIndex !== -1) {
                    elementsArray[elementIndex] = currentSelectedForResize;
                    window.addedElements = elementsArray;
                }
            } else if (currentSelectedForResize.type === 'text') {
                const scale = 1 + (dx / 100);
                currentSelectedForResize.fontSize = Math.max(12, Math.min(72, initialElementState.height * scale));
                window.selectedElement = currentSelectedForResize;
                selectedElement = currentSelectedForResize;
                const elementsArray = window.addedElements || [];
                const elementIndex = elementsArray.findIndex(el => el.id === currentSelectedForResize.id);
                if (elementIndex !== -1) {
                    elementsArray[elementIndex] = currentSelectedForResize;
                    window.addedElements = elementsArray;
                }
            } else if (currentSelectedForResize.type === 'line') {
                if (resizeHandle.type === 'start') {
                    currentSelectedForResize.x1 = currentX;
                    currentSelectedForResize.y1 = currentY;
                } else if (resizeHandle.type === 'end') {
                    currentSelectedForResize.x2 = currentX;
                    currentSelectedForResize.y2 = currentY;
                }
                window.selectedElement = currentSelectedForResize;
                selectedElement = currentSelectedForResize;
                const elementsArray = window.addedElements || [];
                const elementIndex = elementsArray.findIndex(el => el.id === currentSelectedForResize.id);
                if (elementIndex !== -1) {
                    elementsArray[elementIndex] = currentSelectedForResize;
                    window.addedElements = elementsArray;
                }
            }
            
            redrawCanvas();
            return;
        }
        
        // Rotation 3D (objet 3D sélectionné + Maj enfoncée + glisser)
        const currentSelectedForRotate = window.selectedElement || selectedElement;
        if (isRotating && currentSelectedForRotate && currentSelectedForRotate.type === 'shape3d') {
            canvas.style.cursor = 'grabbing';
            const dx = currentX - startX;
            const dy = currentY - startY;
            currentSelectedForRotate.rotationY = (initialRotationY + dx * 0.012);
            currentSelectedForRotate.rotationX = (initialRotationX - dy * 0.012);
            window.selectedElement = currentSelectedForRotate;
            selectedElement = currentSelectedForRotate;
            const elementsArray = window.addedElements || [];
            const elementIndex = elementsArray.findIndex(el => el.id === currentSelectedForRotate.id);
            if (elementIndex !== -1) {
                elementsArray[elementIndex] = currentSelectedForRotate;
                window.addedElements = elementsArray;
            }
            redrawCanvas();
            return;
        }
        
        // Déplacement
        const currentSelectedForMove = window.selectedElement || selectedElement;
        if (isMoving && currentSelectedForMove) {
            const dx = currentX - startX;
            const dy = currentY - startY;
            
            if (currentSelectedForMove.type === 'line' && initialLineMoveState) {
                currentSelectedForMove.x1 = initialLineMoveState.x1 + dx;
                currentSelectedForMove.y1 = initialLineMoveState.y1 + dy;
                currentSelectedForMove.x2 = initialLineMoveState.x2 + dx;
                currentSelectedForMove.y2 = initialLineMoveState.y2 + dy;
            } else {
                currentSelectedForMove.x = currentX - offsetX;
                currentSelectedForMove.y = currentY - offsetY;
            }
            
            window.selectedElement = currentSelectedForMove;
            selectedElement = currentSelectedForMove;
            const elementsArray = window.addedElements || [];
            const elementIndex = elementsArray.findIndex(el => el.id === currentSelectedForMove.id);
            if (elementIndex !== -1) {
                elementsArray[elementIndex] = currentSelectedForMove;
                window.addedElements = elementsArray;
            }
            redrawCanvas();
            return;
        }
        
        if (!isDrawing) {
            // Vérifier si on survole une poignée de redimensionnement
            const currentSelectedForHover = window.selectedElement || selectedElement;
            if (currentSelectedForHover) {
                const handle = getResizeHandleAtPosition(currentX, currentY, currentSelectedForHover);
                if (handle) {
                    const cursors = {
                        'nw': 'nw-resize', 'n': 'n-resize', 'ne': 'ne-resize',
                        'e': 'e-resize', 'se': 'se-resize', 's': 's-resize',
                        'sw': 'sw-resize', 'w': 'w-resize',
                        'start': 'nw-resize', 'end': 'se-resize'
                    };
                    canvas.style.cursor = cursors[handle.type] || 'default';
                    return;
                }
            }
            
            // Vérifier si on survole un élément pour changer le curseur
            const hoveredElement = getElementAtPosition(currentX, currentY);
            if (hoveredElement && !isTextMode && !currentShape && !isDrawMode && !isMarkerMode && !isEraserMode && !currentLineType) {
                canvas.style.cursor = (hoveredElement.type === 'shape3d' ? 'grab' : 'move');
            } else if (isTextMode) {
                canvas.style.cursor = 'text';
            } else if (currentShape || currentLineType || isDrawMode || isMarkerMode || isEraserMode) {
                canvas.style.cursor = isEraserMode ? 'grab' : 'crosshair';
            } else {
                canvas.style.cursor = 'default';
            }
            return;
        }
        
        if (isDrawMode) {
            // Dessiner librement avec crayon
            ctx.strokeStyle = currentDrawColor;
            ctx.lineWidth = currentBrushSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(currentX, currentY);
            ctx.stroke();
            
            lastX = currentX;
            lastY = currentY;
        } else if (isMarkerMode) {
            // Colorier avec feutre (mode remplissage semi-transparent)
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = currentDrawColor;
            ctx.globalAlpha = 0.3;
            
            ctx.beginPath();
            ctx.arc(currentX, currentY, currentBrushSize, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.globalAlpha = 1.0;
            ctx.globalCompositeOperation = 'source-over';
            
            lastX = currentX;
            lastY = currentY;
        } else if (isEraserMode) {
            // Mode gomme - effacer avec destination-out
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath();
            ctx.arc(currentX, currentY, currentBrushSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
            
            lastX = currentX;
            lastY = currentY;
        } else if (currentLineType) {
            // Redessiner le canvas pour les lignes seulement
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawLine(currentLineType, startX, startY, currentX, currentY);
        }
    });
    
    canvas.addEventListener('mouseup', function(e) {
        // Vérifier que le canvas est activé
        if (canvas.style.pointerEvents === 'none') {
            return;
        }
        
        if (isResizing) {
            isResizing = false;
            resizeHandle = null;
            initialElementState = null;
            setTimeout(function() {
                if (typeof redrawCanvas === 'function') redrawCanvas();
            }, 0);
        }
        
        if (isMoving) {
            isMoving = false;
            initialLineMoveState = null;
            canvas.style.cursor = 'default';
            setTimeout(function() {
                if (typeof redrawCanvas === 'function') redrawCanvas();
            }, 0);
        }
        
        if (isRotating) {
            isRotating = false;
            canvas.style.cursor = 'default';
            setTimeout(function() {
                if (typeof redrawCanvas === 'function') redrawCanvas();
            }, 0);
        }
        
        if (isDrawing) {
            isDrawing = false;
        }
    });
    
    canvas.addEventListener('mouseleave', function(e) {
        if (isResizing) {
            isResizing = false;
            resizeHandle = null;
            initialElementState = null;
        }
        
        if (isMoving) {
            isMoving = false;
            initialLineMoveState = null;
        }
        
        if (isRotating) {
            isRotating = false;
        }
        
        if (isDrawing) {
            isDrawing = false;
        }
    });
    
    // Gestion du zoom avec la molette de souris pour les formes sélectionnées
    canvas.addEventListener('wheel', function(e) {
        // Vérifier que le canvas est activé
        if (canvas.style.pointerEvents === 'none') {
            return;
        }
        
        // Vérifier qu'une forme est sélectionnée
        const currentSelectedElement = window.selectedElement || selectedElement;
        if (!currentSelectedElement || currentSelectedElement.type !== 'shape') {
            return;
        }
        
        // Empêcher le scroll de la page
        e.preventDefault();
        
        // Calculer le facteur de zoom (agrandir ou réduire)
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1; // Réduire si scroll vers le bas, agrandir si vers le haut
        
        // Calculer le centre de la forme
        const centerX = currentSelectedElement.x + currentSelectedElement.width / 2;
        const centerY = currentSelectedElement.y + currentSelectedElement.height / 2;
        
        // Calculer les nouvelles dimensions
        const newWidth = Math.max(20, currentSelectedElement.width * zoomFactor);
        const newHeight = Math.max(20, currentSelectedElement.height * zoomFactor);
        
        // Ajuster la position pour garder le centre fixe
        currentSelectedElement.x = centerX - newWidth / 2;
        currentSelectedElement.y = centerY - newHeight / 2;
        currentSelectedElement.width = newWidth;
        currentSelectedElement.height = newHeight;
        
        // Synchroniser avec window.selectedElement
        window.selectedElement = currentSelectedElement;
        selectedElement = currentSelectedElement;
        
        // Mettre à jour l'élément dans window.addedElements
        const elementsArray = window.addedElements || [];
        const elementIndex = elementsArray.findIndex(el => el.id === currentSelectedElement.id);
        if (elementIndex !== -1) {
            elementsArray[elementIndex] = currentSelectedElement;
            window.addedElements = elementsArray;
        }
        
        // Redessiner le canvas
        redrawCanvas();
    }, { passive: false });
    
    // Gestion du menu contextuel (clic droit)
    canvas.addEventListener('contextmenu', function(e) {
        // Vérifier que le canvas est activé
        if (canvas.style.pointerEvents === 'none') {
            return;
        }
        
        // Vérifier si on clique sur un bouton
        const clickedElement = document.elementFromPoint(e.clientX, e.clientY);
        if (clickedElement && (
            clickedElement.closest('.tools-btn') ||
            clickedElement.closest('.delete-btn') ||
            clickedElement.closest('.tools-menu') ||
            clickedElement.closest('button')
        )) {
            return; // Ignorer
        }
        
        e.preventDefault();
        
        const coords = getCanvasCoords(e.clientX, e.clientY);
        if (!coords) return;
        const x = coords.x;
        const y = coords.y;
        
        const elementAtPosition = getElementAtPosition(x, y);
        
        if (elementAtPosition && (elementAtPosition.type === 'shape' || elementAtPosition.type === 'shape3d' || elementAtPosition.type === 'text' || elementAtPosition.type === 'line')) {
            selectedElement = elementAtPosition;
            window.selectedElement = elementAtPosition;
            setTimeout(function() {
                if (typeof redrawCanvas === 'function') redrawCanvas();
            }, 0);
            
            // Afficher le menu contextuel
            const contextMenu = document.getElementById('contextMenu');
            if (contextMenu) {
                contextMenu.style.display = 'block';
                contextMenu.style.left = e.clientX + 'px';
                contextMenu.style.top = e.clientY + 'px';
                const rotateBtn = document.getElementById('contextMenuRotateShape3d');
                if (rotateBtn) rotateBtn.style.display = (elementAtPosition.type === 'shape3d') ? 'block' : 'none';
            }
        } else {
            // Masquer le menu si on clique ailleurs
            hideContextMenu();
        }
    });
    
    // Masquer le menu contextuel si on clique ailleurs
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.context-menu')) {
            hideContextMenu();
        }
    });
    } catch (error) {
        console.error('Erreur lors de la configuration des événements du canvas:', error);
    }
}

function hideContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu) {
        contextMenu.style.display = 'none';
    }
}

window.enableRotateShape3d = function() {
    window.rotateNextShape3dDrag = true;
};

window.toggleMotionTracking = function() {
    const currentSelected = window.selectedElement || selectedElement;
    if (!currentSelected) {
        alert('Aucun élément sélectionné');
        return;
    }
    
    // Basculer la propriété motionTracking
    currentSelected.motionTracking = !currentSelected.motionTracking;
    
    // Log
    const status = currentSelected.motionTracking ? 'ACTIVÉ' : 'DÉSACTIVÉ';
    console.log('Motion Tracking', status, 'pour', currentSelected.id);
    
    // Visual feedback
    alert(`Motion Tracking ${currentSelected.motionTracking ? 'ACTIVÉ' : 'DÉSACTIVÉ'} pour cet élément\n\nL'objet restera fixe à sa position et suivra les mouvements de la vidéo.`);
    
    // Redessiner pour montrer l'état
    redrawCanvas();
};

function deleteSelectedElement() {
    const currentSelected = window.selectedElement || selectedElement;
    if (currentSelected) {
        var mediaEl = getMediaEl();
        if (mediaEl && mediaEl.tagName === 'VIDEO') {
            currentSelected.removedAtTime = getCurrentMediaTime();
            selectedElement = null;
            window.selectedElement = null;
            hideContextMenu();
            redrawCanvas();
            updateCanvasPointerEvents();
        } else {
            const elementsArray = window.addedElements || [];
            const index = elementsArray.findIndex(el => el.id === currentSelected.id);
            if (index !== -1) {
                elementsArray.splice(index, 1);
                window.addedElements = elementsArray;
                selectedElement = null;
                window.selectedElement = null;
                hideContextMenu();
                redrawCanvas();
                updateCanvasPointerEvents();
            }
        }
    }
}

// Initialiser le canvas quand la page est chargée
document.addEventListener('DOMContentLoaded', function() {
    try {
        // S'assurer que le bouton "Outils" est TOUJOURS cliquable
        const toolsBtn = document.getElementById('toolsBtn');
        
        if (toolsBtn) {
            // FORCER les styles pour garantir que le bouton est au-dessus
            toolsBtn.style.cssText += 'z-index: 10001 !important; pointer-events: auto !important; position: relative !important;';
            
            // Désactiver le canvas par défaut pour ne pas bloquer le bouton
            if (canvas) {
                canvas.style.pointerEvents = 'none';
                canvas.style.zIndex = '50';
            }
            
            // Fonction pour forcer le clic
            function handleToolsClick(e) {
                // Empêcher TOUTE propagation
                if (e.stopPropagation) e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                if (e.preventDefault) e.preventDefault();
                
                // Désactiver le canvas IMMÉDIATEMENT
                if (canvas) {
                    canvas.style.pointerEvents = 'none';
                    canvas.style.zIndex = '50';
                }
                
                // Appeler la fonction directement - vérifier qu'elle existe
                console.log('handleToolsClick appelé'); // Debug
                if (typeof toggleToolsMenu === 'function') {
                    console.log('toggleToolsMenu existe, appel...'); // Debug
                    toggleToolsMenu();
                } else {
                    console.error('toggleToolsMenu n\'est pas une fonction');
                    // Essayer d'appeler directement
                    const menu = document.getElementById('toolsMenu');
                    if (menu) {
                        menu.classList.toggle('active');
                        const overlay = document.getElementById('toolsOverlay');
                        if (overlay) overlay.classList.toggle('active');
                    }
                }
                
                return false;
            }
            
            // Désactiver le canvas par défaut pour ne pas bloquer le bouton
            // Le canvas sera réactivé uniquement quand nécessaire (formes sélectionnées, etc.)
            if (canvas) {
                canvas.style.pointerEvents = 'none';
                canvas.style.zIndex = '50';
            }
            
            // Désactiver le canvas quand on survole le bouton
            toolsBtn.addEventListener('mouseenter', function() {
                if (canvas) {
                    canvas.style.pointerEvents = 'none';
                    canvas.style.zIndex = '50';
                }
            });
            
            // Réactiver le canvas quand on quitte le bouton (sauf si le menu est ouvert)
            toolsBtn.addEventListener('mouseleave', function() {
                const menu = document.getElementById('toolsMenu');
                const isMenuOpen = menu && menu.classList.contains('active');
                if (canvas && !isMenuOpen) {
                    // Ne réactiver le canvas que si une forme est sélectionnée
                    const hasSelectedElement = window.selectedElement || (window.addedElements && window.addedElements.length > 0);
                    if (hasSelectedElement) {
                        canvas.style.pointerEvents = 'auto';
                        canvas.style.zIndex = '100';
                    }
                }
            });
            
            // Gestion du bouton "Sauvegarder"
            const saveBtn = document.getElementById('saveBtn');
            if (saveBtn) {
                saveBtn.style.cssText += 'z-index: 10001 !important; pointer-events: auto !important; position: relative !important;';
                
                saveBtn.addEventListener('mouseenter', function() {
                    if (canvas) {
                        canvas.style.pointerEvents = 'none';
                        canvas.style.zIndex = '50';
                    }
                });
                
                saveBtn.addEventListener('mouseleave', function() {
                    const menu = document.getElementById('toolsMenu');
                    const isMenuOpen = menu && menu.classList.contains('active');
                    if (canvas && !isMenuOpen) {
                        const hasSelectedElement = window.selectedElement || (window.addedElements && window.addedElements.length > 0);
                        if (hasSelectedElement) {
                            canvas.style.pointerEvents = 'auto';
                            canvas.style.zIndex = '100';
                        }
                    }
                });
            }
        } else {
            // Si le bouton n'existe pas, le canvas peut être activé par défaut
            if (canvas) {
                canvas.style.pointerEvents = 'none';
                canvas.style.zIndex = '50';
            }
        }
        
        // Tracker la position de la souris pour updateCanvasPointerEvents
        if (!window.mouseX) {
            document.addEventListener('mousemove', function(e) {
                window.mouseX = e.clientX;
                window.mouseY = e.clientY;
                // Mettre à jour le canvas en temps réel
                if (canvas) {
                    updateCanvasPointerEvents();
                }
            }, true);
        }
        
        // Vérifier que l'image existe avant d'initialiser
        const imageElement = getMediaEl();
        if (!imageElement) {
            console.log('Pas d\'image à éditer');
            return;
        }
        
        // Attendre un peu que tout soit chargé
        setTimeout(function() {
            try {
                initCanvas();
                setupCanvasEvents();
            } catch (error) {
                console.error('Erreur lors de l\'initialisation du canvas:', error);
            }
        }, 300);
        
        window.addEventListener('resize', function() {
            try {
                // Mettre à jour la taille du canvas pour couvrir tout l'écran
                if (canvas && window.innerWidth > 0 && window.innerHeight > 0) {
                    canvas.width = window.innerWidth;
                    canvas.height = window.innerHeight;
                    resizeCanvas();
                }
            } catch (error) {
                console.error('Erreur lors du redimensionnement:', error);
            }
        });
    } catch (error) {
        console.error('Erreur lors de l\'initialisation:', error);
    }
});

// Script de débogage - à supprimer en production
window.testShapes = function() {
    console.log('=== TEST DES FORMES ===');
    console.log('window.selectShape:', typeof window.selectShape);
    console.log('window.canvas:', !!window.canvas, window.canvas ? {
        width: window.canvas.width,
        height: window.canvas.height,
        style: {
            display: window.canvas.style.display,
            visibility: window.canvas.style.visibility,
            zIndex: window.canvas.style.zIndex,
            pointerEvents: window.canvas.style.pointerEvents
        }
    } : null);
    console.log('window.ctx:', !!window.ctx);
    console.log('window.drawShape:', typeof window.drawShape);
    console.log('window.redrawCanvas:', typeof window.redrawCanvas);
    console.log('window.addedElements:', window.addedElements ? window.addedElements.length : 0, window.addedElements);
    
    const canvas = document.getElementById('editingCanvas');
    console.log('Canvas DOM:', !!canvas, canvas ? {
        width: canvas.width,
        height: canvas.height,
        style: {
            display: canvas.style.display,
            visibility: canvas.style.visibility,
            zIndex: canvas.style.zIndex,
            pointerEvents: canvas.style.pointerEvents,
            clipPath: canvas.style.clipPath
        }
    } : null);
    
    const image = getMediaEl();
    const ns = image ? getMediaNaturalSize(image) : null;
    console.log('Image:', !!image, image ? {
        width: ns ? ns.w : 0,
        height: ns ? ns.h : 0,
        rect: image.getBoundingClientRect()
    } : null);
    
    if (typeof window.selectShape === 'function') {
        console.log('Test: Appel de selectShape("square")...');
        window.selectShape('square');
    } else {
        console.error('window.selectShape n\'est pas une fonction!');
    }
};

// Fonction de test pour vérifier le dessin directement
window.testDrawShape = function() {
    console.log('=== TEST DRAW SHAPE DIRECT ===');
    const canvas = document.getElementById('editingCanvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    
    if (!canvas || !ctx) {
        console.error('Canvas ou contexte non disponible');
        return;
    }
    
    // Forcer la visibilité
    canvas.style.setProperty('display', 'block', 'important');
    canvas.style.setProperty('visibility', 'visible', 'important');
    canvas.style.setProperty('opacity', '1', 'important');
    canvas.style.setProperty('clip-path', 'none', 'important');
    
    // S'assurer que le canvas a une taille
    if (canvas.width === 0 || canvas.height === 0) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    
    // Dessiner un carré de test au centre
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const size = 100;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#FFD700';
    ctx.fillStyle = 'rgba(255, 215, 0, 0.55)';
    ctx.lineWidth = 3;
    ctx.fillRect(centerX - size/2, centerY - size/2, size, size);
    ctx.strokeRect(centerX - size/2, centerY - size/2, size, size);
    
    console.log('Carré de test dessiné au centre:', {centerX, centerY, size});
    console.log('Si vous voyez un carré jaune au centre, le canvas fonctionne!');
};