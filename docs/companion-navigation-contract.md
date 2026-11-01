# Contrat de navigation CookiGram ↔ CookiList

État vérifié le 1er novembre 2026. Ce document distingue les décisions UX
acceptées, le protocole v1 actuellement proposé en PR et les capacités
effectivement livrées.

## 1. UX acceptée

- Chaque application conserve son identité et ses actions métier.
- Le bouton Home se place immédiatement après l'identité et n'apparaît que
  lorsque Home est détecté et arrimé.
- Les actions métier restent groupées à droite. Dans CookiGram, le panier
  ouvre le shopping natif, ou CookiList quand celle-ci est arrimée.
- CookiList reste utilisable seule, localement et hors ligne.

Cette grammaire est définie dans `PRODUCT_PRINCIPLES.md` et PDR-0001. Le
parcours CookiGram mono-recette et Ma sélection → courses multi-recettes a
été livré dans CookiGram au titre de Core#244 ; il appartient à l'expérience
CookiGram.

## 2. Contrat v1 proposé, non fusionné

CookiList#43 propose un transfert explicite vers une URL HTTPS CookiList dont
le fragment est `#cookigram-transfer=<base64url(JSON UTF-8)>`. Le receiver
présente un aperçu et attend le consentement avant d'ajouter des articles ; le
contrat documenté prévoit aussi des limites de payload et une provenance de
recette optionnelle. Il n'utilise pas de clés `localStorage` partagées ni les
internals de CookiGram. La spec complète est dans la
[branche de #43](https://github.com/CookiGram/shopping-list/blob/chatgpt/docking-mvp-receiver-20261031/docs/cookigram-transfer-v1.md).

Ce contrat reste une proposition disponible dans les PR, pas un contrat livré :

- [CookiList#43](https://github.com/CookiGram/shopping-list/pull/43) propose
  la spec et le receiver ; elle est ouverte, non fusionnée.
- [CookiList#44](https://github.com/CookiGram/shopping-list/pull/44) est une PR
  draft dépendante de #43 qui corrige l'atomicité des écritures ; elle est
  ouverte, non fusionnée.
- [Core#403](https://github.com/CookiGram/cookigram-core/pull/403) propose le
  sender qui adopte v1 ; il est ouvert, non fusionné.

## 3. Interface livrée et garanties runtime

- CookiList persiste ses articles dans `localStorage` sous
  `shopping-list:items:v1` (`docs/store-api.md`).
- CookiGram persiste sa sélection de recettes sous
  `cookigram:recipe-selection` et publie un événement local au document
  (`docs/cookigram-contract.md`, §4–5).
- Les déploiements GitHub Pages sont sous le même hôte mais des chemins
  distincts (`/cookigram/` et `/shopping-list/`). `localStorage` est partagé
  par origine, mais les clés et événements actuellement livrés n'établissent
  aucun échange d'articles. Les événements `CustomEvent` sont locaux au document.
- L'interface existante entre les dépôts est la synchronisation du catalogue
  culinaire versionné vers le snapshot CookiList. Elle n'échange pas de listes
  ni de sélection de recettes.

Les PR #43, #44 et Core#403 ne garantissent pas encore un receiver ou sender
disponible en production, ni leur présence sur GitHub Pages. Aucune
substitution runtime du provider shopping CookiGram par CookiList n'est livrée
par ces PR. Cette substitution reste la sémantique produit acceptée lorsque
l'arrimage est actif ; son activation déployée n'est pas établie. Le chemin
local/offline de CookiList reste utilisable indépendamment du transfert.
