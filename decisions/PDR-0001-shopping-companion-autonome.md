# PDR-0001 — Shopping List comme companion autonome

## Statut

accepted

## Contexte

CookiGram doit pouvoir transmettre des besoins d'achat sans absorber l'expérience de liste de courses. Le produit Shopping List doit aussi avoir une valeur propre en dehors de la cuisine.

## Décision

Shopping List est une PWA autonome, locale et simple.

Elle possède :

- les listes ;
- les articles ;
- les quantités ;
- les catégories ;
- l'état coché/acheté ;
- la persistance locale ;
- l'expérience d'achat.

CookiGram peut lui transmettre des articles ou ingrédients via un contrat versionné.

Home peut ajouter identité, partage, synchronisation et intégrations serveur sans devenir requis pour l'usage local.

L'arrimage entre applications suit le pattern :

1. découverte opportuniste ;
2. proposition explicite ;
3. consentement une fois ;
4. usage transparent ensuite ;
5. redétection manuelle toujours possible.

## Conséquences

- aucune dépendance obligatoire à CookiGram ;
- aucune dépendance obligatoire à Home ;
- pas d'écran de réglages général créé uniquement pour l'arrimage ;
- une icône d'arrimage discrète peut exposer l'état de composition ;
- le POC privilégie un contrat simple et robuste avant toute sophistication ;
- l'intention d'achat reste distincte des produits marchands externes.

## Critères d'audit fonctionnel

Une évolution Shopping List est conforme si elle :

1. conserve un chemin nominal local et offline ;
2. ne complique pas l'ajout et la consultation de la liste ;
3. garde l'arrimage facultatif et compréhensible ;
4. laisse Shopping List propriétaire de l'UX d'achat ;
5. ne transforme pas un fournisseur externe en source de vérité du domaine.
