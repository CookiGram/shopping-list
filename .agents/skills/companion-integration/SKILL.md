---
name: companion-integration
description: Concevoir ou modifier les interactions Shopping List avec CookiGram ou Home. Utiliser pour l'arrimage, la découverte de companions, la provenance des besoins, le routage inter-app, la substitution de capability shopping et les contrats d'interopérabilité.
---

# Shopping List — Companion Integration

## Autorité

Lire avant toute modification :

1. `PRODUCT_PRINCIPLES.md` ;
2. `decisions/REGISTRY.md` ;
3. PDR-0001 et PDR-0002 ;
4. le contrat inter-app réellement implémenté, s'il existe.

## Workflow

1. Identifier la configuration concernée : Shopping List seule, + CookiGram, + Home.
2. Vérifier que Shopping List reste utilisable seule.
3. Définir la capability concernée et son owner.
4. Modéliser les données inter-app comme références optionnelles et stables.
5. Prévoir un fallback lorsque le companion n'est pas disponible.
6. Ne pas implémenter le désarrimage dans le MVP sans nouvelle décision produit.
7. Ajouter les tests du comportement seul et arrimé.

## Règles

- CookiGram est source culinaire, pas backend shopping.
- Home fédère identité, partage, sync et services serveur.
- Shopping List possède l'expérience d'achat.
- Une provenance recette peut survivre à la fusion d'articles.
- Ne jamais afficher une affordance CookiGram/Home vide lorsque la source n'existe pas.
- L'arrimage remplace la capability shopping CookiGram lorsqu'il est actif ; il ne crée pas une deuxième liste concurrente.
- Préférer un contrat versionné et minimal à une connaissance directe des internals d'un autre repo.

## Sortie attendue

Pour un changement d'intégration, documenter :

- configuration(s) couvertes ;
- owner de la capability ;
- payload/référence échangée ;
- fallback autonome ;
- tests ajoutés ;
- éventuelle décision produit manquante.
