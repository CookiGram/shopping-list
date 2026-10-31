# Contrat de navigation CookiGram ↔ CookiList

État vérifié le 31 octobre 2026. Ce document consigne le contrat UX accepté
et la frontière technique observée ; il ne définit pas de protocole d'échange
entre les deux PWA.

## UX accepté

- Chaque application conserve son identité et ses actions métier.
- Le bouton Home se place immédiatement après l'identité et n'apparaît que
  lorsque Home est détecté et arrimé.
- Les actions métier restent groupées à droite. Dans CookiGram, le panier
  ouvre le shopping natif, ou CookiList quand celle-ci est arrimée.
- CookiList reste utilisable seule, localement et hors ligne.

Cette grammaire est définie dans `PRODUCT_PRINCIPLES.md` et PDR-0001. Le
parcours CookiGram mono-recette et Ma sélection → courses multi-recettes est
déjà livré dans Core#244 ; il appartient à l'expérience CookiGram.

## Interface actuellement observée

- CookiList persiste ses articles dans `localStorage` sous
  `shopping-list:items:v1` (`docs/store-api.md`).
- CookiGram persiste sa sélection de recettes sous
  `cookigram:recipe-selection` et publie un événement local au document
  (`docs/cookigram-contract.md`, §4–5).
- Les déploiements GitHub Pages sont sous le même hôte mais des chemins
  distincts (`/cookigram/` et `/shopping-list/`). `localStorage` est partagé
  par origine, mais les clés et événements actuellement documentés n'établissent
  aucun échange d'articles. Les événements `CustomEvent` sont locaux au document.
- L'interface existante entre les dépôts est la synchronisation du catalogue
  culinaire versionné vers le snapshot CookiList. Elle n'échange pas de listes
  ni de sélection de recettes.

## Limite du contrat

Aucune interface d'entrée CookiList ni aucun mécanisme de découverte ou de
consentement inter-app n'est défini ici. En particulier, il n'existe pas de
contrat confirmé pour une URL de retour, une charge utile d'articles ou la
provenance d'une recette dans un transfert. La substitution du provider
shopping lorsque CookiList est arrimée est une sémantique produit acceptée ;
son activation technique entre ces deux PWA n'est pas définie.

Un bouton vers CookiGram, un lien de hand-off ou un import automatique ne peut
pas être implémenté sur la seule base du contrat UX : il faut d'abord fixer et
versionner l'interface inter-app ainsi que son comportement lorsque l'autre
PWA n'est pas installée ou accessible. Le chemin local de CookiList reste le
comportement nominal jusque-là.
