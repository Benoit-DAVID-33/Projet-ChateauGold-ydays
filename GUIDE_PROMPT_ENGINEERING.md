# 📋 Guide Complet - Extraction de Données d'Éléments Géométriques pour Prompt Engineering

## 🎯 Ce que tu as maintenant

Tu as une **système automatisé et complet** qui :

1. ✅ **Capture les données** de tous les éléments géométriques que tu ajoutes
2. ✅ **Génère des prompts structurés** à partir de ces données
3. ✅ **Facilite le prompt engineering** en automatisant la description de la composition
4. ✅ **Exporte en JSON** pour intégration API

---

## 📊 Structure des Données Capturées

### Chaque élément contient :

**FORMES (Shapes):**
```json
{
  "type": "shape",
  "id": "shape_xxx",
  "shapeType": "circle|rectangle|triangle|etc",
  "x": 100,
  "y": 150,
  "width": 200,
  "height": 200
}
```

**TEXTES (Text):**
```json
{
  "type": "text",
  "id": "text_xxx",
  "text": "Le texte affiché",
  "x": 100,
  "y": 200,
  "fontSize": 16
}
```

**LIGNES (Lines):**
```json
{
  "type": "line",
  "id": "line_xxx",
  "lineType": "straight|dashed|etc",
  "x1": 100,
  "y1": 100,
  "x2": 300,
  "y2": 300
}
```

---

## 🚀 Comment Utiliser le Gestionnaire de Prompts

### 1️⃣ **Ajouter les éléments géométriques**
- Clique sur **🔧 Outils**
- Sélectionne des formes, textes ou lignes
- Positionne-les sur ta vidéo/image

### 2️⃣ **Ouvrir le Gestionnaire de Prompts**
- Clique sur le bouton **✨ Assistant IA** (orange)

### 3️⃣ **Dans le panel:**

#### 📊 **Résumé des éléments**
- Affiche le nombre et type d'éléments ajoutés
- Utile pour vérifier ta composition

#### 📝 **Décris ce que tu veux faire**
Quelques exemples:
- "Ajouter des lueurs subtiles autour des cercles"
- "Créer un éclairage directionnel depuis la gauche"
- "Animer les textes avec un effet de survol"
- "Ajouter des ombres portées dynamiques"
- "Créer des transitions fluides entre les éléments"

#### 🎯 **Aperçu du Prompt**
- Montre comment les éléments seront décrits à l'IA
- Se met à jour en temps réel

#### 📤 **Export structuré**
- **Télécharger JSON** → Fichier au format JSON avec toutes les données
- **Voir JSON** → Afficher les données structurées dans une modale

#### 🚀 **Envoyer à l'API**
- Envoie le prompt complet + données structurées
- Nécessite ta clé API de Runway (ou autre service)

---

## 🔍 Exemple Concret

### Avant (sans assistance):
```
Je veux ajouter un cercle bleu avec une ombre en haut à gauche, 
et un texte blanc en dessous avec un effet de lueur. 
Le texte doit être au centre et le cercle doit être à 30% de la largeur...
```

### Après (avec PromptGenerator):
```
CONTEXTE - Édition vidéo/Image avec effets visuels:
- Type de média: image
- Résolution: 1280×720
- Nombre d'éléments à traiter: 2

🟢 FORMES GÉOMÉTRIQUES (1):
  1. circle (shape_xxx)
     Position: Haut-Gauche (30.5%, 25.0%)
     Taille: Moyen (15.6% × 15.6%)
     Dimensions en pixels: 200×200px

📝 TEXTES (1):
  1. "Mon texte blanc" (text_xxx)
     Position: Centre (50.0%, 60.0%)
     Taille police: 24px

TÂCHE:
Génère des instructions détaillées pour appliquer les effets visuels...
```

**Le tout est généré automatiquement!** 💡

---

## 🔌 Intégration avec une API d'IA Générative

### Flux de données:

```
┌─────────────────────────┐
│  Éléments géométriques  │
│  (ajoutés dans l'UI)    │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  PromptGenerator.js     │
│  (Structure le prompt)  │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  APIIntegration.js      │
│  (Envoie à l'API)       │
└──────────┬──────────────┘
           │
           ▼
    ┌──────────────┐
    │  API Runway  │
    │  (IA généra) │
    └──────────────┘
```

### Données envoyées à l'API:

```javascript
{
  "prompt": "PROMPT COMPLET STRUCTURÉ",
  "elements_json": "[array d'éléments structurés]",
  "user_intent": "Ce que l'utilisateur veut faire",
  "summary": {
    "totalElements": 5,
    "shapes": 2,
    "texts": 2,
    "lines": 1
  },
  "elements_count": 5,
  "shapes_count": 2,
  "texts_count": 2,
  "lines_count": 1
}
```

---

## 🔧 Pour intégrer avec ta clé API Runway

### Dans `backend/app.py` ou ton endpoint Flask:

```python
@app.route('/process-query', methods=['POST'])
def process_query():
    # Récupérer les données du prompt
    prompt = request.form.get('prompt')
    elements_json = request.form.get('elements_json')
    user_intent = request.form.get('user_intent')
    
    # Ajouter ta clé API
    API_KEY = os.environ.get('RUNWAY_API_KEY')  # ← À configurer
    
    # Appeler l'API Runway avec le prompt structuré
    headers = {
        'Authorization': f'Bearer {API_KEY}',
        'Content-Type': 'application/json'
    }
    
    payload = {
        'prompt': prompt,
        'elements_description': elements_json,
        'user_intent': user_intent,
        # Autres paramètres selon l'API
    }
    
    response = requests.post(
        'https://api.runway.com/v1/generate',  # À adapter
        json=payload,
        headers=headers
    )
    
    return jsonify(response.json())
```

---

## 📐 Comment les Positions/Tailles sont Calculées

### Positions (en % de la vidéo):
```javascript
positionXPercent = (elementX / mediaWidth) × 100
positionYPercent = (elementY / mediaHeight) × 100
```

### Zones (relative positioning):
- **Haut** = 0-33% vertical
- **Bas** = 66-100% vertical
- **Centre** = 33-66% vertical
- **Gauche** = 0-33% horizontal
- **Droite** = 66-100% horizontal

### Catégories de taille:
- **Très petit** = moyenne < 10%
- **Petit** = 10-20%
- **Moyen** = 20-40%
- **Grand** = 40-60%
- **Très grand** = > 60%

---

## 💡 Avantages pour tes Utilisateurs

1. **Pas besoin de prompt de 50+ lignes** ✅
2. **Description précise de la composition** ✅
3. **Export peut être réutilisé** ✅
4. **Données structurées pour la programmi** ✅
5. **Intégration transparente avec l'API** ✅

---

## 🎓 Cas d'usage

### Cas 1: Ajouter des effets lumineux
```
Utilisateur: "Ajouter une lumière directionnelle depuis le coin haut-gauche"
↓
Système génère:
"Appliquer un éclairage dramatique depuis (5%, 10%) illuminant le cercle 
situé à (30%, 25%) avec des ombres portées douces opposées..."
```

### Cas 2: Animation d'éléments
```
Utilisateur: "Faire entrer les éléments avec un effet de délai en cascade"
↓
Système génère:
"Créer une animation d'entrée pour 5 éléments avec délai progressif:
- Ciracle: 0ms
- Texte 1: 200ms
- Texte 2: 400ms
- Ligne 1: 600ms
- Ligne 2: 800ms"
```

### Cas 3: Effets 3D
```
Utilisateur: "Donner une profondeur 3D aux éléments"
↓
Système génère:
"Appliquer une perspective 3D avec:
- Cercle (30%, 25%) en avant-plan (z: 100)
- Textes à mi-plan (z: 50)
- Lignes en arrière-plan (z: 10)"
```

---

## 📚 Fichiers Ajoutés

1. **`frontend/static/js/prompt-generator.js`** (340 lignes)
   - Génération de prompts structurés
   - Calcul des positions relatives
   - Export JSON

2. **`frontend/static/js/api-integration.js`** (280 lignes)
   - Préparation des payloads
   - Envoi à l'API
   - Gestion des réponses

3. **`frontend/static/css/prompt-manager.css`** (200 lignes)
   - Styling du panel
   - Animations
   - Responsive

4. **`frontend/templates/image.html`** (mis à jour)
   - Ajout du bouton Assistant IA
   - Interface du gestionnaire de prompts
   - Scripts d'intégration

---

## 🚀 Prochaines Étapes

1. **Configurer ta clé API Runway** → Dans `.env`
2. **Tester le flux complet** → Ajouter éléments → Générer prompt → Envoyer
3. **Améliorer les prompts** → Adapter les descriptions selon tes besoins
4. **Intégrer les réponses** → Appliquer les effets générés

---

## 🤔 FAQ

**Q: Pourquoi générer un prompt structuré?**
A: Parce que les modèles d'IA générent des résultats constants et précis quand la composition est bien décrite.

**Q: Je dois mémoriser les coordonnées?**
A: Non! C'est automatique. Tu places où tu veux, on calcule les positions.

**Q: Ça marche sans API?**
A: Oui! Tu peux copier le prompt et l'utiliser n'importe où manuellement.

**Q: Les positions sont en pixels ou en %?**
A: Les deux! On te donne les deux pour plus de flexibilité.

---

**Happy Prompting! 🎨✨**
