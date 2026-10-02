# Dictionnaire non culinaire (Shopping List)

Ce document décrit le dictionnaire de produits non alimentaires de **Shopping List**, situé dans [`data/dictionary/non-food.fr.json`](../data/dictionary/non-food.fr.json).

---

## 1. Rôle du dictionnaire

Shopping List est une PWA autonome dédiée à la gestion de listes de courses quotidiennes. Alors que le catalogue culinaire de CookiGram est strictement axé sur la cuisine et les recettes (ingrédients bruts, épices, produits frais), le dictionnaire non culinaire de Shopping List couvre l'ensemble des besoins domestiques et familiaux :
- **Entretien & ménage** (lessive, éponges, nettoyants...) ;
- **Hygiène & soins** (dentifrice, gel douche, rasoirs...) ;
- **Papier & consommables** (papier toilette, essuie-tout, sacs congélation...) ;
- **Maison** (sacs poubelle, piles, ampoules, allumettes...) ;
- **Animaux** (litière, croquettes, friandises...) ;
- **Santé courante** (pansements, désinfectant, thermomètre...) ;
- **Bébé** (couches, lingettes, liniment...).

Ce dictionnaire sert de socle pour :
- alimenter l'**autocomplétion** et la recherche instantanée offline ;
- structurer le classement par **catégories canoniques** ;
- supporter des **aliases** naturels (ex. recherche de « sopalin » pour trouver « Essuie-tout ») ;
- associer des **clés d'icônes sémantiques** ;
- suggérer des **unités simples** et des tags pertinents ;
- amorcer les suggestions de **favoris** et de **staples** (produits récurrents).

---

## 2. Frontière : Intention d'achat vs Produit marchand

Le dictionnaire modélise des **intentions d'achat génériques**, et **non des références marchandes**.

| Dimension | Intention d'achat (Shopping List) | Produit marchand (Drive / Magasin) |
|---|---|---|
| **Exemple** | *Lessive*, *Couches pour bébé*, *Piles AA* | *Ariel Pods 3en1 Boîte 38 lavages*, *Pampers Baby-Dry Taille 4* |
| **Périmètre** | Ce que l'utilisateur écrit sur sa liste | Ce que le distributeur stocke et vend |
| **Marques** | **Aucune** marque commerciale dans le catalogue de base | Marques commerciales, marques de distributeur |
| **SKU / EAN** | Aucun | Codes barres EAN-13, identifiants SKU |
| **Prix / Stock** | Aucun | Prix unitaire, promotions, disponibilité magasin |
| **Magasins** | Neutre, indépendant du lieu d'achat | Carrefour, Leclerc, Auchan, etc. |

**Règle produit :** Les connecteurs marchands ou drives (ex. drive Carrefour, drive Leclerc) viendront *résoudre* une intention d'achat générique vers une référence externe au moment opportun. Le catalogue interne de Shopping List ne doit jamais être pollué par des références commerciales éphémères ou spécifiques à une enseigne.

---

## 3. Schéma du dictionnaire

Le fichier [`data/dictionary/non-food.fr.json`](../data/dictionary/non-food.fr.json) respecte le schéma JSON suivant :

```json
{
  "version": 1,
  "locale": "fr-FR",
  "categories": [
    {
      "id": "cleaning",
      "label": "Entretien"
    }
  ],
  "items": [
    {
      "id": "cleaning.laundry-detergent",
      "label": "Lessive",
      "aliases": [
        "lessive liquide",
        "lessive en poudre",
        "capsules de lessive",
        "détergent linge"
      ],
      "category": "cleaning",
      "icon": "laundry-detergent",
      "default_unit": "bottle",
      "tags": [
        "linge",
        "entretien"
      ]
    }
  ]
}
```

### Spécification des champs

- `version` (`number`) : version du schéma (actuellement `1`).
- `locale` (`string`) : code langue (`"fr-FR"`).
- `categories` (`array`) : liste des catégories canoniques (`id`, `label`).
- `items` (`array`) : liste ordonnée des produits :
  - `id` (`string`) : identifiant technique stable en anglais, namespacé par catégorie avec kebab-case après le point (`<category>.<item-slug>`).
  - `label` (`string`) : formulation française naturelle telle qu'un utilisateur l'écrirait.
  - `aliases` (`string[]`) : synonymes utiles pour la recherche textuelle (au moins 1, sans doublons).
  - `category` (`string`) : référence à l'identifiant canonique d'une catégorie déclarée dans `categories`.
  - `icon` (`string`) : clé sémantique d'icône en kebab-case (ex. `laundry-detergent`).
  - `default_unit` (`string`) : unité suggérée parmi l'ensemble restreint : `unit`, `pack`, `box`, `bag`, `bottle`, `roll`.
  - `tags` (`string[]`) : 1 à 3 termes secondaires utiles pour le filtrage contextuel.

### Contrat linguistique (`.fr.json`)

- **Identifiants techniques :** Les champs structurels et stables restent en anglais (`id`, `category`, `icon`, `default_unit`).
- **Données présentées à l'utilisateur :** Tous les libellés visibles doivent être formulés en français naturel (`label` produit, `label` de catégorie, `tags`).
- **Non-pollution anglophone :** Aucun nom anglais brut de produit (ex. `bleach`, `laundry detergent`, `paper towels`) ne peut servir de label canonique affiché.
- **Aliases de recherche :** Les synonymes français sont prioritaires. Des emprunts ou termes anglophones spécifiques (ex. recherche technique) ne sont admissibles que s'ils augmentent la découvrabilité sans jamais se substituer à la forme française affichée.

---

## 4. Comment ajouter une nouvelle entrée

Pour ajouter un produit non culinaire :

1. **Vérifier l'éligibilité :**
   - Le produit est-il non culinaire ? (Si c'est un aliment, un ingrédient ou une épice, il appartient au catalogue CookiGram).
   - Est-ce un produit de consommation courante non soumis à prescription médicale ?
   - Est-ce une intention générique (pas de marque) ?
2. **Choisir la catégorie canonique :**
   - L'une des 7 catégories existantes (`cleaning`, `hygiene`, `paper`, `household`, `pets`, `health`, `baby`).
3. **Définir l'ID :**
   - Préfixer obligatoirement par `<category>.` suivi du slug technique anglais en kebab-case (ex. `household.matches`).
4. **Rédiger le label et les aliases :**
   - `label` : Nom d'usage courant en français avec majuscule initiale (ex. `Allumettes`).
   - `aliases` : 2 à 4 synonymes ou variantes de recherche réelles (ex. `["boîte d'allumettes", "allumettes longues"]`).
5. **Choisir l'icône sémantique :**
   - Une clé kebab-case décrivant le concept (ex. `matches`). Si un concept similaire existe déjà, réutiliser la clé (ex. `batteries` pour AA et AAA).
6. **Choisir l'unité par défaut :**
   - Une valeur parmi `unit`, `pack`, `box`, `bag`, `bottle`, `roll`.
7. **Ajouter les tags :**
   - 2 à 3 mots-clés simples en minuscules (ex. `["feu", "cuisine"]`).
8. **Placer l'entrée dans le fichier :**
   - Insérer l'item dans `items` en conservant le tri déterministe alphabétique par `id`.
9. **Exécuter les tests :**
   ```bash
   node --test tests/*.test.mjs
   ```

---

## 5. Comment ajouter une catégorie

L'ajout d'une nouvelle catégorie doit rester exceptionnel afin d'éviter la sur-taxonomie et la dispersion :

1. **Critère :** Au moins 3 à 5 produits réels indispensables ne peuvent être rattachés de manière cohérente à l'une des 7 catégories existantes.
2. **Déclaration :**
   - Ajouter un objet `{ "id": "<id>", "label": "<Label>" }` dans le tableau `categories` de `non-food.fr.json`.
   - `id` en minuscules simples (ex. `gardening`, `stationery`).
   - `label` en français clair (ex. `Jardinage`, `Papeterie`).
3. **Mise à jour des tests et du mapping de rayon :**
   - Mettre à jour `CANONICAL_CATEGORIES` dans `tests/non-food-dictionary.test.mjs`.
   - Si pertinent, déclarer le rayon associé dans la configuration des rayons (`data/aisles.json`).

---

## 6. Comment gérer une icon key manquante

Les entrées du dictionnaire portent une clé sémantique (ex. `laundry-detergent`, `toilet-paper`, `cat-litter`).

### Règle d'affichage et fallback
- L'application cherche l'asset visuel dans `assets/icons/<icon>.svg`.
- **Si l'icône SVG existe :** elle est affichée via `<img src="assets/icons/<icon>.svg" alt="..." />`.
- **Si l'icône SVG n'existe pas encore :** l'interface utilise un fallback gracieux (ex. puce neutre, première lettre ou icône de repli de la catégorie parente). Aucune erreur bloquante n'est déclenchée.

### Pipeline de production d'icônes
Lorsqu'un lot d'icônes vectorielles est produit pour Shopping List :
1. Respecter le gabarit visuel CookiGram : `viewBox="0 0 32 32"`, tracés nets, contour sombre `#382a25`, aplats de couleurs chaleureuses.
2. Déposer le fichier SVG sous `assets/icons/<icon>.svg`.
3. Ajouter le chemin au precache du Service Worker dans `sw.js` pour la disponibilité hors ligne.
