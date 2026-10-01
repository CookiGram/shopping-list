# Règle produit — Gouvernance Shopping List

## Références obligatoires

Avant toute évolution fonctionnelle ou architecturale, lire :

1. `PRODUCT_PRINCIPLES.md` ;
2. `decisions/REGISTRY.md` ;
3. les PDR applicables au scope.

## Autorité produit

Le Product Owner est l'autorité finale sur les arbitrages produit.

Un agent ne doit pas transformer un prototype ou une recommandation en invariant sans décision explicite.

## Format d'arbitrage

Lorsqu'une décision structurante est nécessaire, présenter :

- **Contexte** ;
- **Evidence** ;
- **Impact utilisateur** ;
- **Options** ;
- **Recommandation** ;
- **Question** unique à trancher.

Après arbitrage accepté :

1. créer ou mettre à jour la PDR ;
2. mettre à jour `decisions/REGISTRY.md` ;
3. modifier `PRODUCT_PRINCIPLES.md` seulement si un principe durable évolue.

## Audit fonctionnel

L'audit vérifie le comportement réel de l'application contre les principes produit.

Tout écart doit être classé comme :

- conforme ;
- divergence justifiée ;
- dette produit ;
- décision PO requise.
