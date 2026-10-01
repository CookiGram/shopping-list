# PDR-0001 — Shopping List comme companion autonome

## Statut

accepted

## Contexte

CookiGram doit pouvoir transmettre des besoins d'achat sans absorber l'expérience de liste de courses. Le produit Shopping List doit aussi avoir une valeur propre en dehors de la cuisine.

Le développement de Shopping List doit également pouvoir améliorer l'expérience shopping de CookiGram sans transformer CookiGram en application de courses généraliste.

## Décision

Shopping List est une PWA autonome, locale et simple.

Elle possède :

- les listes ;
- les articles ;
- les quantités ;
- les catégories ;
- l'état coché/acheté ;
- la persistance locale ;
- l'expérience d'achat ;
- les catégories et l'iconographie propres aux achats hors cuisine.

CookiGram peut lui transmettre des articles ou ingrédients via un contrat versionné et reste capable d'exporter ses besoins culinaires vers d'autres services compatibles.

Home peut ajouter identité, partage, synchronisation et intégrations serveur sans devenir requis pour l'usage local.

## Relation avec le shopping natif CookiGram

Shopping List doit bénéficier à CookiGram selon deux voies.

### Voie A — amélioration native

Les mécaniques développées dans Shopping List qui sont génériques et directement utiles au shopping culinaire peuvent être reprises dans CookiGram.

Cette réutilisation doit améliorer CookiGram lorsqu'il fonctionne seul, sans lui transférer les responsabilités générales de Shopping List.

### Voie B — arrimage complet

Lorsque Shopping List est présente et arrimée, elle devient le provider shopping actif de CookiGram et remplace son module shopping natif pour les parcours concernés.

L'expérience arrimée doit apporter davantage que le fallback local CookiGram et peut exploiter toute la richesse du domaine Shopping List.

Cette substitution reste réversible : l'absence ou le détachement de Shopping List fait revenir CookiGram à son capability shopping culinaire locale.

## Langage visuel et iconographie

Shopping List doit reprendre le langage visuel pertinent de CookiGram afin de maintenir une continuité d'écosystème.

Les icônes culinaires existantes doivent être réutilisables par Shopping List.

Shopping List peut créer son propre vocabulaire visuel pour les catégories hors cuisine.

La réutilisation est asymétrique :

- Shopping List peut consommer les assets culinaires CookiGram ;
- CookiGram n'a aucune raison d'embarquer les assets hors cuisine de Shopping List ;
- seules les mécaniques ou assets devenus réellement pertinents pour la fonction culinaire peuvent remonter dans CookiGram.

## Arrimage

L'arrimage entre applications suit le pattern :

1. découverte opportuniste ;
2. proposition explicite ;
3. consentement une fois ;
4. usage transparent ensuite ;
5. redétection manuelle toujours possible.

## Conséquences

- aucune dépendance obligatoire à CookiGram ;
- aucune dépendance obligatoire à Home ;
- CookiGram conserve un shopping local culinaire fonctionnel ;
- l'arrimage complet substitue la capability shopping de CookiGram au lieu de simplement dupliquer la liste ;
- les progrès de Shopping List peuvent améliorer le fallback natif CookiGram de manière sélective ;
- pas d'écran de réglages général créé uniquement pour l'arrimage ;
- une icône d'arrimage discrète peut exposer l'état de composition ;
- le POC privilégie un contrat simple et robuste avant toute sophistication ;
- l'intention d'achat reste distincte des produits marchands externes ;
- l'iconographie non culinaire reste propre à Shopping List.

## Critères d'audit fonctionnel

Une évolution Shopping List est conforme si elle :

1. conserve un chemin nominal local et offline ;
2. ne complique pas l'ajout et la consultation de la liste ;
3. garde l'arrimage facultatif et compréhensible ;
4. laisse Shopping List propriétaire de l'UX d'achat ;
5. ne transforme pas un fournisseur externe en source de vérité du domaine ;
6. permet aux avancées pertinentes d'améliorer CookiGram sans élargir son périmètre hors cuisine ;
7. rend l'expérience arrimée plus riche que le shopping natif CookiGram ;
8. maintient la frontière visuelle entre assets culinaires communs et assets Shopping List hors cuisine.
