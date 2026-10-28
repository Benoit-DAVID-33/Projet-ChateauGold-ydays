/**
 * PromptGenerator - Génération automatique de prompts optimisés pour l'IA générative
 * À partir des éléments géométriques placés dans l'éditeur
 */

class PromptGenerator {
    /**
     * Génère un descriptif structuré des éléments pour le prompt
     * @param {Array} elements - Les éléments de window.addedElements
     * @param {Object} mediaInfo - Infos sur le média {width, height, type: 'image'|'video'}
     * @param {string} userIntent - L'intention/instruction de l'utilisateur (optionnel)
     * @returns {Object} - Données structurées pour le prompt
     */
    static generateElementsDescription(elements = window.addedElements || [], mediaInfo = {}, userIntent = '') {
        if (!elements || elements.length === 0) {
            return { 
                description: '', 
                elements: [],
                summary: {
                    shapes: 0,
                    shape3d: 0,
                    texts: 0,
                    lines: 0,
                    totalElements: 0
                },
                userIntent: userIntent,
                mediaInfo: mediaInfo
            };
        }

        const mediaWidth = mediaInfo.width || 1280;
        const mediaHeight = mediaInfo.height || 720;
        
        let elementsList = [];
        let prompt = '';

        // Catégoriser et analyser les éléments
        const shapes = elements.filter(el => el.type === 'shape');
        const shape3d = elements.filter(el => el.type === 'shape3d');
        const texts = elements.filter(el => el.type === 'text');
        const lines = elements.filter(el => el.type === 'line');

        // === FORMES ===
        if (shapes.length > 0) {
            prompt += `🟢 **FORMES GÉOMÉTRIQUES** (${shapes.length}):\n`;
            
            shapes.forEach((shape, idx) => {
                const posXPercent = ((shape.x / mediaWidth) * 100).toFixed(1);
                const posYPercent = ((shape.y / mediaHeight) * 100).toFixed(1);
                const sizeXPercent = ((shape.width / mediaWidth) * 100).toFixed(1);
                const sizeYPercent = ((shape.height / mediaHeight) * 100).toFixed(1);
                
                // Déterminer la position (zone)
                const position = this.getPositionZone(posXPercent, posYPercent);
                const sizeCategory = this.getSizeCategory(sizeXPercent, sizeYPercent);

                const description =
                    `  ${idx + 1}. **${shape.shapeType}** (${shape.id})\n` +
                    `     Position: ${position} (${posXPercent}%, ${posYPercent}%)\n` +
                    `     Taille: ${sizeCategory} (${sizeXPercent}% × ${sizeYPercent}%)\n` +
                    `     Dimensions en pixels: ${Math.round(shape.width)}×${Math.round(shape.height)}px\n` +
                    (shape.motionTracking ? `     Motion Tracking: ACTIVÉ (suit les mouvements de la vidéo)\n` : '');

                prompt += description;
                elementsList.push({
                    type: 'shape',
                    id: shape.id,
                    shapeType: shape.shapeType,
                    position: position,
                    positionPercent: { x: parseFloat(posXPercent), y: parseFloat(posYPercent) },
                    size: sizeCategory,
                    sizePercent: { width: parseFloat(sizeXPercent), height: parseFloat(sizeYPercent) },
                    pixelDimensions: { width: shape.width, height: shape.height },
                    motionTracking: shape.motionTracking || false
                });
            });
            prompt += '\n';
        }

        // === OBJETS 3D ===
        if (shape3d.length > 0) {
            prompt += `**OBJETS 3D** (${shape3d.length}):\n`;
            
            shape3d.forEach((obj, idx) => {
                const posXPercent = ((obj.x / mediaWidth) * 100).toFixed(1);
                const posYPercent = ((obj.y / mediaHeight) * 100).toFixed(1);
                const sizeXPercent = ((obj.width / mediaWidth) * 100).toFixed(1);
                const sizeYPercent = ((obj.height / mediaHeight) * 100).toFixed(1);
                
                const position = this.getPositionZone(posXPercent, posYPercent);
                const sizeCategory = this.getSizeCategory(sizeXPercent, sizeYPercent);

                const description =
                    `  ${idx + 1}. **${obj.shape3dType}** (${obj.id})\n` +
                    `     Position: ${position} (${posXPercent}%, ${posYPercent}%)\n` +
                    `     Taille: ${sizeCategory} (${sizeXPercent}% × ${sizeYPercent}%)\n` +
                    `     Rotation X: ${(obj.rotationX || 0).toFixed(2)} rad | Rotation Y: ${(obj.rotationY || 0).toFixed(2)} rad\n` +
                    (obj.motionTracking ? `     Motion Tracking: ACTIVÉ (suit les mouvements de la vidéo)\n` : '');

                prompt += description;
                elementsList.push({
                    type: 'shape3d',
                    id: obj.id,
                    shape3dType: obj.shape3dType,
                    position: position,
                    positionPercent: { x: parseFloat(posXPercent), y: parseFloat(posYPercent) },
                    size: sizeCategory,
                    sizePercent: { width: parseFloat(sizeXPercent), height: parseFloat(sizeYPercent) },
                    rotation: { x: obj.rotationX || 0, y: obj.rotationY || 0 },
                    pixelDimensions: { width: obj.width, height: obj.height },
                    motionTracking: obj.motionTracking || false
                });
            });
            prompt += '\n';
        }

        // === TEXTES ===
        if (texts.length > 0) {
            prompt += `**TEXTES** (${texts.length}):\n`;
            
            texts.forEach((text, idx) => {
                const posXPercent = ((text.x / mediaWidth) * 100).toFixed(1);
                const posYPercent = ((text.y / mediaHeight) * 100).toFixed(1);
                const position = this.getPositionZone(posXPercent, posYPercent);

                const description =
                    `  ${idx + 1}. "${text.text}" (${text.id})\n` +
                    `     Position: ${position} (${posXPercent}%, ${posYPercent}%)\n` +
                    `     Taille police: ${text.fontSize}px\n` +
                    (text.motionTracking ? `     Motion Tracking: ACTIVÉ (suit les mouvements de la vidéo)\n` : '');

                prompt += description;
                elementsList.push({
                    type: 'text',
                    id: text.id,
                    content: text.text,
                    position: position,
                    positionPercent: { x: parseFloat(posXPercent), y: parseFloat(posYPercent) },
                    fontSize: text.fontSize,
                    motionTracking: text.motionTracking || false
                });
            });
            prompt += '\n';
        }

        // === LIGNES ===
        if (lines.length > 0) {
            prompt += `📐 **LIGNES/CONNECTEURS** (${lines.length}):\n`;
            
            lines.forEach((line, idx) => {
                const startPosX = ((line.x1 / mediaWidth) * 100).toFixed(1);
                const startPosY = ((line.y1 / mediaHeight) * 100).toFixed(1);
                const endPosX = ((line.x2 / mediaWidth) * 100).toFixed(1);
                const endPosY = ((line.y2 / mediaHeight) * 100).toFixed(1);

                const description =
                    `  ${idx + 1}. **${line.lineType}** (${line.id})\n` +
                    `     Du: (${startPosX}%, ${startPosY}%)\n` +
                    `     Au: (${endPosX}%, ${endPosY}%)\n` +
                    (line.motionTracking ? `     Motion Tracking: ACTIVÉ (suit les mouvements de la vidéo)\n` : '');

                prompt += description;
                elementsList.push({
                    type: 'line',
                    id: line.id,
                    lineType: line.lineType,
                    startPosition: { x: parseFloat(startPosX), y: parseFloat(startPosY) },
                    endPosition: { x: parseFloat(endPosX), y: parseFloat(endPosY) },
                    motionTracking: line.motionTracking || false
                });
            });
            prompt += '\n';
        }

        return {
            description: prompt,
            elements: elementsList,
            summary: {
                totalElements: elements.length,
                shapes: shapes.length,
                shape3d: shape3d.length,
                texts: texts.length,
                lines: lines.length
            },
            userIntent: userIntent,
            mediaInfo: mediaInfo
        };
    }

    /**
     * Génère un prompt enrichi et structuré pour l'API d'IA générative
     * @param {Array} elements - Les éléments
     * @param {string} userIntent - L'intention de l'utilisateur
     * @param {Object} mediaInfo - Infos média
     * @returns {string} - Prompt complet structuré
     */
    static generateFullPrompt(elements, userIntent = '', mediaInfo = {}) {
        const mediaType = mediaInfo.type || 'image';
        const resolution = `${mediaInfo.width || 1280}×${mediaInfo.height || 720}`;
        
        if (!elements || elements.length === 0) {
            return `
CONTEXT - Visual Effects Edition:
- Media Type: ${mediaType}
- Resolution: ${resolution}

USER INTENTION: ${userIntent || 'No specific intention provided'}

No elements defined for this task.
`;
        }

        // Categorize elements
        const shapes = elements.filter(el => el.type === 'shape');
        const shape3d = elements.filter(el => el.type === 'shape3d');
        const texts = elements.filter(el => el.type === 'text');
        const lines = elements.filter(el => el.type === 'line');

        const mediaWidth = mediaInfo.width || 1280;
        const mediaHeight = mediaInfo.height || 720;

        let prompt = `
=== VISUAL EFFECTS REQUEST FOR ${mediaType.toUpperCase()} ===

MEDIA SPECIFICATIONS:
- Type: ${mediaType === 'video' ? 'Video' : 'Image'}
- Resolution: ${resolution}
- Aspect Ratio: ${(mediaWidth / mediaHeight).toFixed(2)}:1

PRIMARY OBJECTIVE:
${userIntent || 'Enhance visual composition with AI-generated effects'}

====================================
SPATIAL LAYOUT & ELEMENTS TO ENHANCE
====================================`;

        // 3D Objects
        if (shape3d.length > 0) {
            prompt += `\n\n3D OBJECTS (${shape3d.length}):`;
            shape3d.forEach((obj, idx) => {
                const posX = obj.positionPercent?.x || 0;
                const posY = obj.positionPercent?.y || 0;
                const sizeW = obj.sizePercent?.width || 10;
                const sizeH = obj.sizePercent?.height || 10;
                const position = obj.position || 'Center';
                const size = obj.size || 'Medium';
                
                prompt += `\n${idx + 1}. ${obj.shape3dType?.toUpperCase() || 'OBJECT'}:
   - Location: ${position} (${posX.toFixed(1)}%, ${posY.toFixed(1)}%) 
   - Size: ${size} (${sizeW.toFixed(1)}% × ${sizeH.toFixed(1)}% of frame)
   - Rotation: X=${(obj.rotation?.x || 0).toFixed(2)}rad, Y=${(obj.rotation?.y || 0).toFixed(2)}rad
   - Motion Tracking: ${obj.motionTracking ? 'ENABLED (element should follow scene movement)' : 'Disabled (element is static)'}
   - Pixel Size: ${obj.pixelDimensions?.width || 'N/A'} × ${obj.pixelDimensions?.height || 'N/A'} px`;
            });
        }

        // 2D Shapes
        if (shapes.length > 0) {
            prompt += `\n\n2D GEOMETRIC SHAPES (${shapes.length}):`;
            shapes.forEach((shape, idx) => {
                const posX = ((shape.x / mediaWidth) * 100).toFixed(1);
                const posY = ((shape.y / mediaHeight) * 100).toFixed(1);
                const sizeW = ((shape.width / mediaWidth) * 100).toFixed(1);
                const sizeH = ((shape.height / mediaHeight) * 100).toFixed(1);
                const position = this.getPositionZone(posX, posY);
                
                prompt += `\n${idx + 1}. ${shape.shapeType?.toUpperCase() || 'SHAPE'}:
   - Location: ${position} (${posX}%, ${posY}%)
   - Size: ${sizeW}% × ${sizeH}% of frame
   - Color: ${shape.color || 'Default'}
   - Motion Tracking: ${shape.motionTracking ? 'ENABLED' : 'Disabled'}`;
            });
        }

        // Text Elements
        if (texts.length > 0) {
            prompt += `\n\nTEXT ELEMENTS (${texts.length}):`;
            texts.forEach((text, idx) => {
                const posX = ((text.x / mediaWidth) * 100).toFixed(1);
                const posY = ((text.y / mediaHeight) * 100).toFixed(1);
                const position = this.getPositionZone(posX, posY);
                
                prompt += `\n${idx + 1}. "${text.text}":
   - Location: ${position} (${posX}%, ${posY}%)
   - Font Size: ${text.fontSize || 'Default'}px
   - Color: ${text.color || 'Default'}
   - Motion Tracking: ${text.motionTracking ? 'ENABLED' : 'Disabled'}`;
            });
        }

        // Lines
        if (lines.length > 0) {
            prompt += `\n\nLINES & PATHS (${lines.length}):`;
            lines.forEach((line, idx) => {
                const startX = ((line.x1 / mediaWidth) * 100).toFixed(1);
                const startY = ((line.y1 / mediaHeight) * 100).toFixed(1);
                const endX = ((line.x2 / mediaWidth) * 100).toFixed(1);
                const endY = ((line.y2 / mediaHeight) * 100).toFixed(1);
                
                prompt += `\n${idx + 1}. ${line.lineType?.toUpperCase() || 'LINE'}:
   - From: (${startX}%, ${startY}%) To: (${endX}%, ${endY}%)
   - Style: ${line.lineType || 'Solid'}
   - Motion Tracking: ${line.motionTracking ? 'ENABLED' : 'Disabled'}`;
            });
        }

        // Summary stats
        prompt += `\n\n====================================
ELEMENT SUMMARY
====================================
- Total Elements: ${elements.length}
- 3D Objects: ${shape3d.length}
- 2D Shapes: ${shapes.length}
- Text Elements: ${texts.length}
- Lines/Paths: ${lines.length}
- Elements with Motion Tracking: ${elements.filter(e => e.motionTracking).length}

====================================
INSTRUCTIONS FOR GENERATIVE AI
====================================
1. Respect all spatial coordinates provided (position, size, rotation)
2. Apply effects in the specified zones/areas
3. For motion-tracked elements: ensure the effect follows the element/scene movement
4. For static elements: keep the effect in the exact position specified
5. Scale effects appropriately based on element sizes
6. Maintain visual harmony across all elements
7. Execute the primary objective: ${userIntent || 'Improve visual composition'}

====================================
EXPECTED RESULT
====================================
A ${mediaType === 'video' ? 'video' : 'high-resolution image'} with:
- All specified effects applied at exact coordinates
- Seamless integration of visual enhancements
- Professional-quality output matching input resolution (${resolution})
- Consistency with the user's creative vision

Start generation now.`;

        return prompt;
    }

    /**
     * Détermine la zone de positionnement (haut, bas, centre, etc.)
     */
    static getPositionZone(percentX, percentY) {
        const x = parseFloat(percentX);
        const y = parseFloat(percentY);
        
        let vertical = 'Centre';
        let horizontal = 'Centre';

        if (y < 33) vertical = 'Haut';
        else if (y > 66) vertical = 'Bas';

        if (x < 33) horizontal = 'Gauche';
        else if (x > 66) horizontal = 'Droite';

        if (vertical === 'Centre' && horizontal === 'Centre') return 'Centre';
        return `${vertical}-${horizontal}`;
    }

    /**
     * Catégorise la taille relative
     */
    static getSizeCategory(percentWidth, percentHeight) {
        const size = (parseFloat(percentWidth) + parseFloat(percentHeight)) / 2;
        
        if (size < 10) return 'Très petit';
        if (size < 20) return 'Petit';
        if (size < 40) return 'Moyen';
        if (size < 60) return 'Grand';
        return 'Très grand';
    }

    /**
     * Exporte les données en JSON pour l'API
     */
    static exportAsJSON(elements = window.addedElements || [], mediaInfo = {}) {
        const data = this.generateElementsDescription(elements, mediaInfo);
        return JSON.stringify(data, null, 2);
    }

    /**
     * Crée un résumé simplifié pour l'utilisateur
     */
    static generateSummary(elements = window.addedElements || []) {
        const data = this.generateElementsDescription(elements);
        
        // Vérifier que data.summary existe
        if (!data || !data.summary) {
            return `Composition actuelle:\n   • 0 forme(s)\n   • 0 objet(s) 3D\n   • 0 texte(s)\n   • 0 ligne(s)\n   Total: 0 éléments`;
        }
        
        const shape3dText = data.summary.shape3d > 0 ? `\n   • ${data.summary.shape3d} objet(s) 3D` : '';
        return `Composition actuelle:\n   • ${data.summary.shapes} forme(s)${shape3dText}\n   • ${data.summary.texts} texte(s)\n   • ${data.summary.lines} ligne(s)\n   Total: ${data.summary.totalElements} éléments`;
    }
}

// ============================================
// EXPORTER LA CLASSE GLOBALEMENT
// ============================================
window.PromptGenerator = PromptGenerator;
console.log('PromptGenerator chargé et exposé globalement');

// ============================================
// EXEMPLE D'UTILISATION
// ============================================

/*
// 1. Afficher le descriptif des éléments
const description = PromptGenerator.generateElementsDescription(window.addedElements);
console.log(description.description);

// 2. Générer un prompt complet pour l'API
const fullPrompt = PromptGenerator.generateFullPrompt(
    window.addedElements,
    "Ajouter des animations subtiles aux éléments",
    { width: 1280, height: 720, type: 'video' }
);
console.log(fullPrompt);

// 3. Exporter en JSON
const jsonData = PromptGenerator.exportAsJSON(window.addedElements);
console.log(jsonData);

// 4. Afficher un résumé
console.log(PromptGenerator.generateSummary());
*/
