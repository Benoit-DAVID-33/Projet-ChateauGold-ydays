// Gestion de la barre de recherche globale
document.addEventListener('DOMContentLoaded', function() {
    const globalSearchInput = document.getElementById('globalSearchInput');
    const sendToApiBtn = document.getElementById('sendToApiBtn');
    const apiStatusGlobal = document.getElementById('apiStatusGlobal');
    
    // Afficher le bouton ENVOYER - il doit toujours être visible pour envoyer média ou texte
    if (sendToApiBtn) {
        sendToApiBtn.style.display = 'block';
        console.log('Bouton ENVOYER affiché et prêt à être utilisé');
    }
    
    // Gestion de la recherche
    if (globalSearchInput) {
        globalSearchInput.addEventListener('keypress', async function(e) {
            if (e.key === 'Enter') {
                const query = this.value.trim();
                if (query) {
                    // Envoyer la requête à l'API externe
                    if (apiStatusGlobal) {
                        apiStatusGlobal.innerHTML = '<div class="status-message status-loading">⏳ Envoi de la requête à l\'API...</div>';
                    }
                    
                    try {
                        // Récupérer le média actuel s'il existe
                        const currentMedia = window.currentMedia;
                        let filename = null;
                        if (currentMedia && currentMedia.video) {
                            filename = currentMedia.video;
                        } else if (currentMedia && currentMedia.image) {
                            filename = currentMedia.image;
                        }
                        
                        const response = await fetch('/send-query-to-api', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ query: query, filename: filename })
                        });
                        
                        const data = await response.json();
                        
                        if (response.ok) {
                            if (apiStatusGlobal) {
                                apiStatusGlobal.innerHTML = `<div class="status-message status-success"> ${data.response || 'Requête traitée avec succès'}</div>`;
                            }
                            // Rediriger vers la page de recherche après un court délai
                            setTimeout(() => {
                                window.location.href = `/search?q=${encodeURIComponent(query)}`;
                            }, 1000);
                        } else {
                            if (apiStatusGlobal) {
                                apiStatusGlobal.innerHTML = `<div class="status-message status-error">❌ Erreur : ${data.error || 'Erreur lors du traitement'}</div>`;
                            }
                            // Rediriger quand même vers la page de recherche
                            setTimeout(() => {
                                window.location.href = `/search?q=${encodeURIComponent(query)}`;
                            }, 2000);
                        }
                    } catch (error) {
                        if (apiStatusGlobal) {
                            apiStatusGlobal.innerHTML = '<div class="status-message status-error">❌ Erreur de connexion. Assurez-vous que l\'API externe est démarrée (port 5001).</div>';
                        }
                        // Rediriger quand même vers la page de recherche
                        setTimeout(() => {
                            window.location.href = `/search?q=${encodeURIComponent(query)}`;
                        }, 2000);
                        console.error('Erreur:', error);
                    }
                }
            }
        });
    }
    
    // Gestion du bouton "Envoyer à l'API"
    if (sendToApiBtn) {
        sendToApiBtn.addEventListener('click', async function() {
            // Récupérer le texte de la barre de recherche en premier
            const searchQuery = globalSearchInput ? globalSearchInput.value.trim() : '';
            
            // Vérifier si on est sur la page d'édition d'image
            const currentPath = window.location.pathname;
            const isImagePage = currentPath === '/image' || document.body.classList.contains('image-page');
            
            let filename = null;
            let isVideo = false;
            
            // Si on est sur la page d'édition d'image, exporter l'image modifiée d'abord
            if (isImagePage && typeof window.exportImageToBlob === 'function') {
                console.log('Page d\'édition d\'image détectée, export de l\'image modifiée...');
                
                // Vérifier que l'image est bien chargée
                const imageElement = document.getElementById('editableImage');
                if (!imageElement) {
                    console.error('Image editableImage non trouvée');
                    alert('Erreur: Image non trouvée. Veuillez recharger la page.');
                    return;
                }
                
                if (!imageElement.complete || imageElement.naturalWidth === 0) {
                    console.error('Image non chargée');
                    alert('Veuillez attendre que l\'image soit complètement chargée avant d\'envoyer.');
                    return;
                }
                
                if (apiStatusGlobal) {
                    apiStatusGlobal.innerHTML = '<div class="status-message status-loading">⏳ Export de l\'image modifiée...</div>';
                }
                sendToApiBtn.disabled = true;
                sendToApiBtn.style.opacity = '0.6';
                
                try {
                    // Exporter l'image modifiée en blob (inclut toutes les modifications : formes, dessins, texte, etc.)
                    console.log('Appel de exportImageToBlob...');
                    const blob = await window.exportImageToBlob();
                    console.log('Image exportée avec succès, blob créé:', blob);
                    
                    // Sauvegarder l'image modifiée sur le serveur pour l'envoyer à l'API
                    const formData = new FormData();
                    formData.append('file', blob, 'image_modifiee.png');
                    
                    const uploadResponse = await fetch('/upload', {
                        method: 'POST',
                        body: formData
                    });
                    
                    if (!uploadResponse.ok) {
                        throw new Error('Erreur lors de la sauvegarde de l\'image modifiée.');
                    }
                    
                    // Mettre à jour le filename pour utiliser l'image modifiée
                    filename = 'image_modifiee.png';
                    isVideo = false;
                    console.log('Filename mis à jour:', filename);
                    
                    // Mettre à jour window.currentMedia pour que l'image modifiée soit reconnue
                    if (window.currentMedia) {
                        window.currentMedia.image = 'image_modifiee.png';
                    } else {
                        window.currentMedia = { video: null, image: 'image_modifiee.png' };
                    }
                    console.log('window.currentMedia mis à jour:', window.currentMedia);
                    
                    // Attendre un peu pour que le fichier soit sauvegardé sur le serveur
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Mettre à jour le message pour indiquer que l'export est terminé
                    if (apiStatusGlobal) {
                        let statusMessage = '<div class="status-message status-loading">⏳ Image modifiée exportée. Envoi à l\'API';
                        if (searchQuery) {
                            statusMessage += ` avec le texte "${searchQuery.substring(0, 30)}${searchQuery.length > 30 ? '...' : ''}"`;
                        }
                        statusMessage += '...</div>';
                        apiStatusGlobal.innerHTML = statusMessage;
                    }
                    
                } catch (error) {
                    if (apiStatusGlobal) {
                        apiStatusGlobal.innerHTML = `<div class="status-message status-error">❌ Erreur lors de l'export: ${error.message}</div>`;
                    }
                    sendToApiBtn.disabled = false;
                    sendToApiBtn.style.opacity = '1';
                    console.error('Erreur:', error);
                    return;
                }
            } else {
                // Si on n'est pas sur la page d'édition d'image, récupérer le média depuis window.currentMedia
                // window.currentMedia est initialisé dans base.html à partir des attributs data-video et data-image
                const currentMedia = window.currentMedia;
                
                console.log('currentMedia:', currentMedia);
                
                if (currentMedia) {
                    if (currentMedia.video) {
                        filename = currentMedia.video;
                        isVideo = true;
                        console.log('Vidéo détectée:', filename);
                    } else if (currentMedia.image) {
                        filename = currentMedia.image;
                        isVideo = false;
                        console.log('Image détectée:', filename);
                    }
                }
                
                // Si window.currentMedia n'a pas de média, essayer de détecter depuis l'URL
                if (!filename) {
                    const urlParams = new URLSearchParams(window.location.search);
                    const videoParam = urlParams.get('video');
                    const imageParam = urlParams.get('image');
                    
                    if (videoParam) {
                        filename = videoParam;
                        isVideo = true;
                        console.log('Vidéo détectée depuis URL:', filename);
                    } else if (imageParam) {
                        filename = imageParam;
                        isVideo = false;
                        console.log('Image détectée depuis URL:', filename);
                    }
                }
            }
            
            // Vérifier si on a quelque chose à envoyer
            console.log('Vérification finale - filename:', filename, 'searchQuery:', searchQuery, 'isVideo:', isVideo);
            if (!filename && !searchQuery) {
                console.error('Aucun média ni texte à envoyer');
                alert('Aucun média ni texte à envoyer. Veuillez charger un média ou saisir une requête dans la barre de recherche.');
                return;
            }
            
            // Si pas de média mais une requête texte, envoyer juste la requête
            if (!filename && searchQuery) {
                if (apiStatusGlobal) {
                    apiStatusGlobal.innerHTML = '<div class="status-message status-loading">⏳ Envoi de la requête à l\'API...</div>';
                }
                try {
                    const response = await fetch('/send-query-to-api', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ query: searchQuery })
                    });
                    const data = await response.json();
                    if (response.ok) {
                        if (apiStatusGlobal) {
                            apiStatusGlobal.innerHTML = `<div class="status-message status-success">✅ ${data.response || 'Requête traitée avec succès'}</div>`;
                        }
                        setTimeout(() => {
                            window.location.href = `/search?q=${encodeURIComponent(searchQuery)}`;
                        }, 1000);
                    } else {
                        if (apiStatusGlobal) {
                            apiStatusGlobal.innerHTML = `<div class="status-message status-error">❌ Erreur : ${data.error || 'Erreur lors du traitement'}</div>`;
                        }
                    }
                } catch (error) {
                    if (apiStatusGlobal) {
                        apiStatusGlobal.innerHTML = '<div class="status-message status-error">❌ Erreur de connexion.</div>';
                    }
                    console.error('Erreur:', error);
                }
                return;
            }
            
            if (!filename) {
                // Si on est sur la page d'édition d'image, on devrait avoir exporté l'image modifiée
                const currentPath = window.location.pathname;
                const isImagePage = currentPath === '/image' || document.body.classList.contains('image-page');
                if (isImagePage && typeof window.exportImageToBlob === 'function') {
                    // L'image modifiée devrait avoir été exportée, mais si ce n'est pas le cas, on peut essayer
                    alert('Aucune image modifiée à envoyer. Veuillez d\'abord modifier l\'image ou charger une image.');
                } else {
                    alert('Aucun média à envoyer. Veuillez d\'abord charger une vidéo ou une image.');
                }
                return;
            }
            
            // Afficher le statut de chargement avec indication du texte
            if (apiStatusGlobal) {
                const mediaType = isVideo ? 'vidéo' : 'image';
                let statusMessage = `<div class="status-message status-loading">⏳ Envoi de la ${mediaType}`;
                if (isImagePage) {
                    statusMessage += ' modifiée';
                }
                if (searchQuery) {
                    statusMessage += ` avec le texte "${searchQuery.substring(0, 30)}${searchQuery.length > 30 ? '...' : ''}"`;
                }
                statusMessage += '...</div>';
                apiStatusGlobal.innerHTML = statusMessage;
            }
            sendToApiBtn.disabled = true;
            sendToApiBtn.style.opacity = '0.6';
            
            try {
                // Envoyer l'image modifiée ET le texte simultanément
                const response = await fetch(`/send-to-api/${filename}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ query: searchQuery || '' })
                });
                const data = await response.json();
                
                if (response.ok) {
                    if (apiStatusGlobal) {
                        const mediaType = isVideo ? 'vidéo' : 'image';
                        let successMessage = ` ${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}`;
                        if (isImagePage) {
                            successMessage += ' modifiée';
                        }
                        successMessage += ' envoyée et traitée avec succès';
                        if (searchQuery) {
                            successMessage += ` avec le texte "${searchQuery.substring(0, 30)}${searchQuery.length > 30 ? '...' : ''}"`;
                        }
                        successMessage += ' !';
                        apiStatusGlobal.innerHTML = `<div class="status-message status-success">${successMessage}</div>`;
                    }
                    
                    // Recharger la page pour afficher le média traité
                    setTimeout(() => {
                        const currentPath = window.location.pathname;
                        if (isVideo) {
                            if (currentPath === '/video') {
                                window.location.href = `/video?video=${filename}&processed=${data.processed_video}`;
                            } else {
                                window.location.href = `/?video=${filename}&processed=${data.processed_video}`;
                            }
                        } else {
                            if (currentPath === '/image') {
                                window.location.href = `/image?image=${filename}&processed_image=${data.processed_image}`;
                            } else {
                                window.location.href = `/?image=${filename}&processed_image=${data.processed_image}`;
                            }
                        }
                    }, 1500);
                } else {
                    if (apiStatusGlobal) {
                        apiStatusGlobal.innerHTML = `<div class="status-message status-error">❌ Erreur : ${data.error || 'Erreur lors du traitement'}</div>`;
                    }
                    sendToApiBtn.disabled = false;
                    sendToApiBtn.style.opacity = '1';
                }
            } catch (error) {
                if (apiStatusGlobal) {
                    apiStatusGlobal.innerHTML = '<div class="status-message status-error">❌ Erreur de connexion. Assurez-vous que l\'API externe est démarrée (port 5001).</div>';
                }
                sendToApiBtn.disabled = false;
                sendToApiBtn.style.opacity = '1';
                console.error('Erreur:', error);
            }
        });
    }
    
    // Gestion de la reconnaissance vocale
    const micIcons = document.querySelectorAll('.mic-icon');
    let recognition = null;
    let isListening = false;
    
    // Vérifier si le navigateur supporte la reconnaissance vocale
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.lang = 'fr-FR';
        recognition.continuous = true;
        recognition.interimResults = true;
        
        recognition.onresult = function(event) {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript + ' ';
                }
            }
            if (!finalTranscript) return;
            const activeInput = document.getElementById('globalSearchInput') || document.getElementById('searchInput');
            if (activeInput) {
                const currentText = activeInput.value.trim();
                activeInput.value = currentText + (currentText ? ' ' : '') + finalTranscript.trim();
                activeInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        };
        
        recognition.onerror = function(event) {
            console.error('Erreur de reconnaissance vocale:', event.error);
            if (event.error === 'no-speech') {
                // Pas d'erreur, juste pas de parole détectée
                return;
            }
            if (apiStatusGlobal) {
                apiStatusGlobal.innerHTML = `<div class="status-message status-error">❌ Erreur microphone : ${event.error}</div>`;
            }
            stopListening();
        };
        
        recognition.onend = function() {
            isListening = false;
            updateMicIcons();
        };
        
        function startListening() {
            if (!isListening && recognition) {
                try {
                    recognition.start();
                    isListening = true;
                    updateMicIcons();
                    if (apiStatusGlobal) {
                        apiStatusGlobal.innerHTML = '<div class="status-message status-loading">🎤 Écoute en cours... Parlez maintenant</div>';
                    }
                } catch (error) {
                    console.error('Erreur lors du démarrage de la reconnaissance:', error);
                    if (apiStatusGlobal) {
                        apiStatusGlobal.innerHTML = '<div class="status-message status-error">❌ Impossible de démarrer le microphone. Vérifiez les permissions.</div>';
                    }
                }
            }
        }
        
        function stopListening() {
            if (isListening && recognition) {
                recognition.stop();
                isListening = false;
                updateMicIcons();
                if (apiStatusGlobal) {
                    apiStatusGlobal.innerHTML = '';
                }
            }
        }
        
        function updateMicIcons() {
            micIcons.forEach(icon => {
                if (isListening) {
                    icon.style.color = '#FFD700';
                    icon.style.opacity = '1';
                    icon.style.animation = 'pulse 1.5s infinite';
                } else {
                    icon.style.color = '';
                    icon.style.opacity = '0.7';
                    icon.style.animation = '';
                }
            });
        }
        
        // Ajouter l'animation pulse pour le micro actif
        if (!document.getElementById('micPulseStyle')) {
            const style = document.createElement('style');
            style.id = 'micPulseStyle';
            style.textContent = `
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `;
            document.head.appendChild(style);
        }
        
        // Gestion du clic sur les icônes microphone
        micIcons.forEach(micIcon => {
            micIcon.addEventListener('click', function() {
                if (isListening) {
                    stopListening();
                } else {
                    startListening();
                }
            });
        });
    } else {
        // Le navigateur ne supporte pas la reconnaissance vocale
        micIcons.forEach(micIcon => {
            micIcon.addEventListener('click', function() {
                alert('Votre navigateur ne supporte pas la reconnaissance vocale. Veuillez utiliser Chrome, Edge ou Safari.');
            });
    });
}
    
    // Gestion de l'icône son
    const soundIcon = document.querySelector('.sound-icon');
    if (soundIcon) {
        soundIcon.addEventListener('click', function() {
            alert('Fonctionnalité audio en cours de développement');
        });
    }
});
