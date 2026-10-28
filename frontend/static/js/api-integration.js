/**
 * APIIntegration - Intégraphs toutes les données des éléments avec l'API d'IA générative
 */

class APIIntegration {
    // Configuration
    static CONFIG = {
        API_ENDPOINT: '/process-query', // Ton endpoint Flask
        TIMEOUT: 30000,
        MAX_RETRIES: 3
    };

    /**
     * Prépare les données complètes pour envoyer à l'API
     * @param {Array} elements - window.addedElements
     * @param {string} userDescription - Description textuelle de l'utilisateur
     * @param {File|Blob} mediaFile - Le fichier vidéo/image
     * @param {Object} mediaInfo - Infos sur le média
     * @returns {FormData} - Données prêtes à envoyer
     */
    static preparePayload(elements, userDescription, mediaFile, mediaInfo = {}) {
        // Générer le prompt structuré
        const fullPrompt = PromptGenerator.generateFullPrompt(
            elements,
            userDescription,
            mediaInfo
        );

        // Générer les données structurées
        const elementsData = PromptGenerator.generateElementsDescription(elements, mediaInfo);

        // Créer FormData pour multipart upload
        const formData = new FormData();
        
        // Ajouter le média s'il existe
        if (mediaFile) {
            formData.append('file', mediaFile);
        }

        // Ajouter les données structurées
        formData.append('prompt', fullPrompt);
        formData.append('elements_json', JSON.stringify(elementsData.elements));
        formData.append('user_intent', userDescription);
        formData.append('summary', JSON.stringify(elementsData.summary));

        // Ajouter les positions comme données clé-valeur pour faciliter le traitement
        formData.append('elements_count', elementsData.summary.totalElements);
        formData.append('shapes_count', elementsData.summary.shapes);
        formData.append('texts_count', elementsData.summary.texts);
        formData.append('lines_count', elementsData.summary.lines);

        return formData;
    }

    /**
     * Envoie une requête à l'API avec les données d'éléments
     * @param {FormData} formData - Les données préparées
     * @param {Function} onProgress - Callback pour la progression
     * @returns {Promise}
     */
    static async sendToAPI(formData, onProgress = null) {
        try {
            console.log('📤 Envoi des données à l\'API...');

            const xhr = new XMLHttpRequest();

            // Suivi de la progression
            if (onProgress) {
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const percentComplete = (e.loaded / e.total) * 100;
                        onProgress({
                            status: 'uploading',
                            percent: percentComplete
                        });
                    }
                });
            }

            // Promise wrapper pour XMLHttpRequest
            return new Promise((resolve, reject) => {
                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        const response = {
                            status: xhr.status,
                            data: xhr.responseText,
                            headers: xhr.getAllResponseHeaders()
                        };
                        console.log('Réponse reçue:', response);
                        resolve(response);
                    } else {
                        reject({
                            status: xhr.status,
                            error: xhr.statusText,
                            data: xhr.responseText
                        });
                    }
                });

                xhr.addEventListener('error', () => {
                    reject(new Error('Erreur réseau lors de l\'envoi'));
                });

                xhr.addEventListener('timeout', () => {
                    reject(new Error('Délai d\'attente dépassé'));
                });

                xhr.timeout = this.CONFIG.TIMEOUT;
                xhr.open('POST', this.CONFIG.API_ENDPOINT);
                xhr.send(formData);
            });
        } catch (error) {
            console.error('❌ Erreur lors de l\'envoi à l\'API:', error);
            throw error;
        }
    }

    /**
     * Workflow complet: prépare + envoie
     * @param {Array} elements
     * @param {string} userDescription - Ce que l'utilisateur veut
     * @param {File} mediaFile
     * @param {Object} mediaInfo
     * @returns {Promise}
     */
    static async processElements(elements, userDescription, mediaFile, mediaInfo) {
        if (!elements || elements.length === 0) {
            alert('⚠️ Aucun élément à traiter. Ajoutez des formes, textes ou lignes.');
            return;
        }

        try {
            // Validation et affichage du résumé
            console.log('\n RÉSUMÉ DE LA REQUÊTE:');
            console.log(PromptGenerator.generateSummary(elements));
            console.log('Description utilisateur:', userDescription);

            // Préparer les données
            const formData = this.preparePayload(
                elements,
                userDescription,
                mediaFile,
                mediaInfo
            );

            // Afficher le prompt avant d'envoyer
            const elementsData = PromptGenerator.generateElementsDescription(elements, mediaInfo);
            console.log('\nPROMPT STRUCTURÉ QUI SERA ENVOYÉ:');
            console.log(elementsData.description);

            // Envoyer à l'API
            const response = await this.sendToAPI(formData, (progress) => {
                console.log(`⏳ Progression: ${progress.percent.toFixed(1)}%`);
            });

            console.log('Traitement réussi!');
            return response;

        } catch (error) {
            console.error('💥 Erreur:', error);
            alert(`Erreur: ${error.message}`);
            throw error;
        }
    }

    /**
     * Récupère les infos du média (largeur, hauteur)
     * @returns {Promise<Object>}
     */
    static async getMediaInfo(mediaElement) {
        return new Promise((resolve) => {
            if (mediaElement.tagName === 'IMG') {
                // Pour les images
                if (mediaElement.complete) {
                    resolve({
                        type: 'image',
                        width: mediaElement.naturalWidth,
                        height: mediaElement.naturalHeight
                    });
                } else {
                    mediaElement.onload = () => {
                        resolve({
                            type: 'image',
                            width: mediaElement.naturalWidth,
                            height: mediaElement.naturalHeight
                        });
                    };
                }
            } else if (mediaElement.tagName === 'VIDEO') {
                // Pour les vidéos
                if (mediaElement.readyState >= 1) {
                    resolve({
                        type: 'video',
                        width: mediaElement.videoWidth,
                        height: mediaElement.videoHeight,
                        duration: mediaElement.duration
                    });
                } else {
                    mediaElement.onloadedmetadata = () => {
                        resolve({
                            type: 'video',
                            width: mediaElement.videoWidth,
                            height: mediaElement.videoHeight,
                            duration: mediaElement.duration
                        });
                    };
                }
            }
        });
    }
}

// ============================================
// EXEMPLE D'UTILISATION COMPLÈTE
// ============================================

/*
// Bouton pour envoyer à l'API
window.generateAndSendPrompt = async function() {
    // Récupérer le média
    const mediaEl = document.getElementById('editableImage') || document.getElementById('editableVideo');
    if (!mediaEl) {
        alert('Aucun média trouvé');
        return;
    }

    // Récupérer la description utilisateur
    const userDescription = prompt(
        'Décrivez ce que vous voulez faire avec ces éléments\n(Ex: "Ajouter des effets lumineux et des ombres animées")'
    ) || '';

    // Récupérer les infos du média
    const mediaInfo = await APIIntegration.getMediaInfo(mediaEl);

    // Traiter
    try {
        const response = await APIIntegration.processElements(
            window.addedElements,
            userDescription,
            null,  // mediaFile (optionnel)
            mediaInfo
        );

        console.log('Réponse API:', response);
        alert('Données envoyées avec succès à l\'API!');
    } catch (error) {
        console.error('Erreur:', error);
    }
};
*/

// ============================================
// EXPORTER LA CLASSE GLOBALEMENT
// ============================================
window.APIIntegration = APIIntegration;
console.log('APIIntegration chargé et exposé globalement');
