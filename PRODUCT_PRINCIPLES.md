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

## 5. Shopping List doit faire progresser CookiGram de deux manières

Le développement de Shopping List doit bénéficier à CookiGram par deux voies complémentaires.

### Amélioration native

Lorsqu'une mécanique shopping générique améliore directement l'usage culinaire sans élargir le périmètre de CookiGram, elle doit pouvoir être réutilisée ou adaptée dans le module shopping natif CookiGram.

Exemples :

- consolidation de doublons ;
- agrégation de quantités ;
- catégorisation culinaire ;
- ergonomie tactile ;
- état acheté/restant ;
- persistance locale robuste.

Cette voie doit rendre CookiGram meilleur même lorsque Shopping List n'est pas installée.

### Arrimage complet

Lorsque Shopping List est présente et arrimée, elle devient le provider shopping actif de CookiGram et remplace sa capability shopping native pour les parcours concernés.

Cette voie doit apporter plus de valeur que le module natif : expérience d'achat complète, liste générale, logique avancée, continuité d'état et futures capacités propres au domaine shopping.

Le développement de Shopping List ne doit donc jamais avoir pour objectif de maintenir artificiellement CookiGram dans un état inférieur. Les progrès utiles au culinaire peuvent remonter dans CookiGram ; la richesse propre au domaine shopping reste fournie par l'arrimage.

## 6. Arrimage explicite et discret

Lorsqu'un companion compatible est détecté, Shopping List peut proposer un arrimage.

Principe UX :

> détection automatique quand possible, consentement explicite une fois, usage implicite ensuite.

L'arrimage ne justifie pas un écran de réglages général.

Une icône commune peut représenter l'état de connexion. L'utilisateur doit pouvoir forcer une nouvelle détection et détacher un companion.

## 7. Identité visuelle commune, vocabulaire étendu

Shopping List reprend les codes visuels pertinents de CookiGram afin que les deux applications forment un même écosystème.

Les icônes culinaires existantes de CookiGram doivent être réutilisées lorsqu'elles conviennent, plutôt que recréées indépendamment.

Shopping List peut créer et posséder des icônes supplémentaires pour les achats hors cuisine : entretien, hygiène, animaux, pharmacie, maison ou autres catégories générales.

Ces extensions restent propres à Shopping List et ne doivent pas être réimportées dans CookiGram sauf si elles deviennent réellement pertinentes pour la fonction culinaire.

## 8. Home enrichit, il ne remplace pas le local

Avec Home, Shopping List peut devenir collaborative :

- partage familial ;
- synchronisation multi-utilisateur ;
- permissions ;
- historique partagé ;
- connecteurs serveur.

Sans Home, la PWA reste pleinement fonctionnelle en local.

## 9. Intention d'achat distincte du produit marchand

La liste représente ce qu'il faut acheter, pas nécessairement un SKU marchand.

Les intégrations futures avec Carrefour, Leclerc, Auchan ou d'autres fournisseurs doivent résoudre une intention d'achat vers un produit externe sans rendre ce produit externe canonique.

## 10. Prototyper avant de généraliser

Le premier objectif est de valider le modèle de companion et l'arrimage dual-PWA avec CookiGram.

Ne pas transformer le POC en plateforme générale avant d'avoir validé l'usage réel.

## 11. Le Product Owner comme utilisateur n°1

Les arbitrages privilégient la fluidité réelle de la liste quotidienne plutôt que la richesse théorique des fonctionnalités.

> Règle de revue : un audit fonctionnel de Shopping List doit vérifier chaque évolution contre ces principes avant de conclure qu'elle est conforme au produit.


## Navigation companion stable et Home contextuel

CookiGram et Shopping List partagent un même principe de layout pour leur header :

```text
[ identité de l'app ] [ Home si présent ]                 [ navigation métier ]
```

Dans CookiGram, la navigation métier habituelle reste groupée à droite et conserve ses repères :

- livre de recettes -> CookiGram ;
- panier -> module shopping natif ou Shopping List si elle est arrimée ;
- planner -> comportement local tant que Home n'est pas présent, puis planner Home lorsque Home est arrimé.

Le bouton Home n'est pas une quatrième action métier. Il est placé immédiatement à droite de l'identité de l'application et apparaît seulement lorsque Home est détecté et arrimé.

Cette position distingue clairement :

- **le contexte d'écosystème** : retour vers Home ;
- **la navigation métier** : actions propres à l'application.

Shopping List doit reprendre le même squelette : identité à gauche, Home contextuel juste après, navigation métier à droite.

Le layout détaillé du planner dans Home n'est pas encore fixé. Seul le routage vers le planner Home depuis les companions est acté. Le layout du planner reste expérimental jusqu'à un arbitrage ultérieur.
