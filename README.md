# CookiGram Shopping List

Shopping List est le companion d'achat autonome de l'écosystème CookiGram.

C'est une PWA locale, simple et offline qui doit rester utile même sans CookiGram ni Home.

## Rôle

Shopping List possède l'expérience d'achat :

- listes ;
- articles ;
- quantités ;
- catégories ;
- fusion et consolidation ;
- état acheté / restant ;
- persistance locale ;
- achats culinaires et non culinaires.

Elle n'est pas limitée aux courses alimentaires.

## Autonomie

Le chemin nominal doit fonctionner sans compte et sans backend :

```text
ouvrir
  -> ajouter un article
  -> consulter la liste
  -> cocher
  -> fermer
  -> retrouver la liste plus tard
```

Home peut enrichir cette expérience avec le partage familial et la synchronisation, mais ne doit pas devenir une dépendance.

## Relation avec CookiGram

CookiGram conserve une capability shopping locale strictement culinaire.

Le développement de Shopping List bénéficie à CookiGram de deux manières.

### 1. Amélioration native

Les mécaniques Shopping utiles directement au parcours culinaire peuvent être réutilisées dans CookiGram :

- meilleure fusion des ingrédients ;
- agrégation des quantités ;
- ergonomie tactile ;
- catégorisation culinaire ;
- persistance locale ;
- état acheté / restant.

CookiGram devient ainsi meilleur même sans Shopping List.

### 2. Arrimage complet

Lorsque Shopping List est présente et arrimée, elle devient le provider shopping actif de CookiGram.

```text
CookiGram seul
  -> shopping culinaire local

CookiGram + Shopping List arrimée
  -> Shopping List remplace la capability shopping native
  -> expérience shopping complète
```

L'arrimage est réversible : si Shopping List disparaît ou est détachée, CookiGram revient à son fonctionnement local.

CookiGram reste également capable d'exporter ses besoins vers d'autres services compatibles.

## Arrimage

Le pattern produit est :

> détection automatique quand possible, consentement explicite une fois, usage implicite ensuite.

L'interface doit rester légère :

- indication discrète de l'état d'arrimage ;
- proposition lorsque CookiGram est détecté ;
- possibilité de forcer une nouvelle détection ;
- possibilité de détacher ;
- aucun écran de réglages général créé uniquement pour cela.

## Design et iconographie

Shopping List reprend le langage visuel de CookiGram lorsqu'il est pertinent.

Les icônes culinaires déjà disponibles dans CookiGram doivent être réutilisées plutôt que redessinées sans raison.

Shopping List étend ensuite ce vocabulaire avec ses propres icônes pour les achats hors cuisine, par exemple :

- entretien ;
- hygiène ;
- animaux ;
- pharmacie ;
- maison ;
- fournitures diverses.

Ces extensions restent propres à Shopping List. CookiGram n'a pas vocation à embarquer des icônes de détergent ou d'autres catégories sans rapport avec la cuisine.

## Intention d'achat

Shopping List représente d'abord une intention :

```text
"lait"
"lessive"
"tomates x4"
```

Un produit marchand précis est une résolution possible de cette intention, pas sa source de vérité.

Les futures intégrations distributeurs doivent donc rester découplées du domaine principal.

## Relation avec Home

Avec Home, Shopping List peut gagner :

- partage familial ;
- synchronisation multi-utilisateur ;
- permissions ;
- historique partagé ;
- intégrations serveur et distributeurs.

Sans Home, la PWA reste pleinement opérationnelle en local.

## Gouvernance produit

Les décisions produit sont documentées et auditables.

Lire dans cet ordre :

1. [PRODUCT_PRINCIPLES.md](PRODUCT_PRINCIPLES.md)
2. [decisions/REGISTRY.md](decisions/REGISTRY.md)
3. les PDR applicables dans [decisions/](decisions/)

Les agents et audits fonctionnels doivent comparer l'application réelle à ces documents avant de conclure qu'une évolution est conforme.

## Statut

Le premier objectif est de valider le modèle de companion :

- PWA autonome ;
- liste locale/offline ;
- échange d'articles avec CookiGram ;
- découverte et arrimage ;
- substitution de la capability shopping CookiGram ;
- design cohérent avec l'écosystème.

Le prototype doit rester simple jusqu'à validation de ces mécanismes.

### Prototype v0 (livré)

PWA mono-page autonome, sans compte ni backend : recherche/autocomplétion
locale avec tags contextuels, rituel des essentiels
(valider/rejeter/ignorer le reste), essentiels définis par
l'utilisateur (jamais imposés par le catalogue), favoris, historique,
persistance `localStorage`, catalogue culinaire CookiGram versionné +
pack d'icônes embarqués, sync catalogue nightly via CI (PR, sans
auto-merge). Aucune dépendance runtime vers CookiGram ou Home ;
l'arrimage n'est pas encore implémenté (hors scope v0).

- Démo publiée : `https://cookigram.github.io/shopping-list/`
- Lancement local : `python3 -m http.server 8080` puis ouvrir
  `http://localhost:8080/`
- Tests : `node --test tests/*.test.mjs` et
  `python3 -m unittest discover -s tests/sync`
- Limites actuelles : pas de découverte/arrimage, icônes hors cuisine
  en fallback (pas de pack dédié), checklist E2E navigateur à passer
  manuellement (`docs/e2e-checklist.md`).
