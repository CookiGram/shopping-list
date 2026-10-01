# PDR-0002 — Provenance CookiGram et scope MVP de l'arrimage

## Statut

accepted

## Contexte

L'arrimage CookiGram + Shopping List doit apporter une valeur visible au-delà du simple transfert d'articles.

Un besoin d'achat issu d'une recette possède une provenance utile : elle permet à l'utilisateur de comprendre pourquoi l'article est présent et de revenir directement à la recette.

En parallèle, le premier prototype doit rester concentré sur la validation de l'arrimage lui-même. Gérer dès maintenant le désarrimage, la révocation et toutes leurs conséquences ajouterait un cycle de vie non nécessaire à la preuve de concept.

## Décision

### Provenance

Shopping List peut conserver sur un article ou une contribution d'article une métadonnée de provenance optionnelle, par exemple :

- application source ;
- identifiant stable de la recette ;
- libellé de la recette ;
- référence ou deep link compatible.

Lorsque CookiGram est installé et arrimé, Shopping List peut afficher cette provenance et permettre d'ouvrir la recette source.

Lorsqu'un article agrège plusieurs besoins, plusieurs provenances peuvent être conservées.

Si Shopping List est utilisée seule et qu'aucune provenance n'existe, aucune zone CookiGram vide ou décorative ne doit apparaître.

La provenance est une donnée du besoin d'achat, pas une dépendance obligatoire du cœur de Shopping List.

### Scope MVP de l'arrimage

Le MVP gère :

1. découverte d'un companion compatible ;
2. proposition d'arrimage ;
3. consentement explicite ;
4. mémorisation de l'arrimage ;
5. activation des comportements enrichis ;
6. redétection manuelle si nécessaire.

Le MVP ne gère pas encore :

- désarrimage ;
- révocation ;
- nettoyage de métadonnées après détachement ;
- migration d'état liée à la disparition volontaire d'un companion.

Ces cas seront traités seulement lorsqu'un besoin réel les justifiera.

## Invariant

> L'arrimage MVP est un chemin d'activation, pas encore un cycle de vie complet.

## Critères d'audit fonctionnel

Une implémentation est conforme si :

1. une provenance CookiGram transmise peut être conservée ;
2. elle peut être affichée et utilisée comme lien vers la recette lorsque CookiGram est arrimé ;
3. aucune UI de provenance n'apparaît artificiellement pour une liste autonome sans source ;
4. plusieurs sources peuvent être représentées lorsque la consolidation l'exige ;
5. aucun mécanisme de désarrimage complet n'est requis pour valider le MVP.
