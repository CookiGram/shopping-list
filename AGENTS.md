# Directives agents — `shopping-list`

Ce dépôt porte **Shopping List**, la PWA d'achat autonome de l'écosystème CookiGram.

Avant toute évolution, préserver trois propriétés : autonomie locale, simplicité de la liste, composition explicite avec CookiGram et Home.

## Sources d'autorité

Lire dans cet ordre :

1. [README.md](README.md) pour le rôle du dépôt ;
2. [PRODUCT_PRINCIPLES.md](PRODUCT_PRINCIPLES.md) pour les invariants produit ;
3. [decisions/REGISTRY.md](decisions/REGISTRY.md) puis les PDR applicables ;
4. les règles et skills dans [`.agents/`](.agents/).

Une issue ou un prototype ne remplace pas une décision produit acceptée.

## Frontières

Shopping List possède :

- listes, articles, quantités et catégories ;
- fusion/consolidation ;
- état acheté/restant ;
- persistance locale ;
- expérience d'achat générale ;
- iconographie hors cuisine.

Shopping List ne doit pas absorber :

- les recettes ou le moteur culinaire de CookiGram ;
- l'identité, les permissions, le planning ou les secrets serveur de Home ;
- un modèle marchand spécifique comme source de vérité.

## Arrimage MVP

Pour le MVP, gérer :

- découverte ;
- proposition ;
- consentement ;
- mémorisation ;
- usage enrichi ;
- redétection manuelle.

Ne pas élargir spontanément au désarrimage ou à la révocation : ces cas ne font pas partie du scope actuel.

Une provenance CookiGram peut être conservée et affichée lorsque CookiGram est arrimé.

## Skills repo-locales

- [product-governance](.agents/skills/product-governance/SKILL.md) : arbitrages et audit fonctionnel.
- [companion-integration](.agents/skills/companion-integration/SKILL.md) : arrimage, provenance, substitution de capability et frontières inter-app.

Utiliser le skill le plus spécifique au changement.

## Règles de travail

1. Conserver un chemin nominal local/offline sans compte.
2. Ne pas ajouter une UI d'écosystème lorsqu'aucun companion n'est présent.
3. Ne pas dupliquer dans Shopping List une responsabilité appartenant à CookiGram ou Home.
4. Préférer des métadonnées optionnelles aux dépendances structurelles vers un companion.
5. Ne pas inventer de contrat inter-app : documenter et versionner toute nouvelle surface.
6. Garder les changements ciblés et auditables.

## Avant PR

Tant que le runtime n'est pas stabilisé, ne pas inventer de commandes de validation.

Pour chaque PR :

- relire les principes/PDR applicables ;
- décrire le comportement réellement livré ;
- préciser les frontières inter-app touchées ;
- ajouter ou adapter les tests dès qu'une implémentation testable existe ;
- signaler explicitement toute décision produit encore ouverte.
