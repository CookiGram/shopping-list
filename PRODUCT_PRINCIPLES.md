# Shopping List — Product Principles

> Document de référence produit
> Product Owner: Pierre (@PierreCsn)
> Décision de référence : PDR-0001

## 1. Shopping List doit être utile seule

Shopping List est une PWA autonome. Son fonctionnement nominal ne dépend ni de CookiGram ni de Home.

Elle doit permettre au minimum de créer, modifier, cocher et conserver une liste locale sans compte ni backend obligatoire.

## 2. Simplicité d'usage avant richesse fonctionnelle

L'expérience principale doit rester immédiate :

- ouvrir ;
- ajouter un article ;
- voir la liste ;
- cocher ;
- revenir plus tard.

Les réglages généraux, écrans d'administration et abstractions techniques ne doivent pas envahir l'interface.

## 3. Local-first et offline

La liste locale est disponible hors ligne et persiste sur l'appareil.

Les fonctions de synchronisation ou de partage enrichissent cette base mais ne doivent pas devenir une condition d'utilisation.

## 4. Shopping List possède l'expérience d'achat

CookiGram peut produire des besoins d'achat. Home peut partager ou synchroniser la liste. Mais Shopping List reste propriétaire de l'UX de liste, de l'organisation des articles et de l'état acheté/non acheté.

## 5. Arrimage explicite et discret

Lorsqu'un companion compatible est détecté, Shopping List peut proposer un arrimage.

Principe UX :

> détection automatique quand possible, consentement explicite une fois, usage implicite ensuite.

L'arrimage ne justifie pas un écran de réglages général.

Une icône commune peut représenter l'état de connexion. L'utilisateur doit pouvoir forcer une nouvelle détection et détacher un companion.

## 6. Home enrichit, il ne remplace pas le local

Avec Home, Shopping List peut devenir collaborative :

- partage familial ;
- synchronisation multi-utilisateur ;
- permissions ;
- historique partagé ;
- connecteurs serveur.

Sans Home, la PWA reste pleinement fonctionnelle en local.

## 7. Intention d'achat distincte du produit marchand

La liste représente ce qu'il faut acheter, pas nécessairement un SKU marchand.

Les intégrations futures avec Carrefour, Leclerc, Auchan ou d'autres fournisseurs doivent résoudre une intention d'achat vers un produit externe sans rendre ce produit externe canonique.

## 8. Prototyper avant de généraliser

Le premier objectif est de valider le modèle de companion et l'arrimage dual-PWA avec CookiGram.

Ne pas transformer le POC en plateforme générale avant d'avoir validé l'usage réel.

## 9. Le Product Owner comme utilisateur n°1

Les arbitrages privilégient la fluidité réelle de la liste quotidienne plutôt que la richesse théorique des fonctionnalités.

> Règle de revue : un audit fonctionnel de Shopping List doit vérifier chaque évolution contre ces principes avant de conclure qu'elle est conforme au produit.
