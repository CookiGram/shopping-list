# Registre des décisions produit — Shopping List

Ce registre donne l'état canonique des décisions produit structurantes de Shopping List.

## Statuts

- `proposed` : en discussion ;
- `experimental` : testé par prototype ;
- `accepted` : contractuel pour le produit ;
- `superseded` : remplacé par une décision plus récente ;
- `retired` : retiré sans remplacement direct.

## Registre

| ID | Titre | Statut | Portée | Remplace |
|---|---|---|---|---|
| PDR-0001 | Shopping List comme companion autonome | accepted | produit / UX / arrimage | — |
| PDR-0002 | Provenance CookiGram et scope MVP de l'arrimage | accepted | provenance / arrimage / MVP | — |

## Règle de gouvernance

Toute décision qui change un invariant de `PRODUCT_PRINCIPLES.md`, une frontière avec CookiGram ou Home, ou le comportement d'arrimage doit être matérialisée par une PDR et enregistrée ici.

Les audits fonctionnels partent de `PRODUCT_PRINCIPLES.md` puis consultent les PDR applicables.
