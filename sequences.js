// sequences.js - Base de données des séquences d'enchères SEF (version enrichie et complète)
//
// ===== ARCHITECTURE =====
// Contrainte "séquence d'enchères" : restriction sur les encherissements N/E/S/W.
// Une séquence SEF = suite de noms (P=Pique, C=Coeur, K=Carreau, T=Trèfle, SA=Sans-Atout)
// correspondant à des bids successifs de ouvreur-répondant (ou autre pattern bilatéral).
//
// ===== STRUCTURE DES SÉQUENCES =====
// SEF_SEQUENCES = {
//   "1P-1SA-2P": {
//     "opener": { hcp: [12,20], spades: [6,13] },
//     "responder": { hcp: [6,10], spades: [0,2] }
//   }
// }
// Clé = notation SEF (noms de bids successifs, - séparateur).
// Valeur = objet détaillant les exigences pour chaque main (ouvreur/répondant/etc).
// Critères : hcp, hld (honors + longueurs distribution), spades/hearts/diamonds/clubs, etc.
//
// ===== NOTATION =====
// P = Pique, C = Coeur, K = Carreau, T = Trèfle, SA = Sans-Atout, X/Y = intermédiaires.
// Longueurs : ranges [min, max] pour un costume donné ou globalement.
//
// ===== UTILISATION =====
// Appelée lors de checkAllConstraints() via checkSequenceConstraint(deal, seq_name).
// Valide si la main du joueur matche les fourchettes pour chaque position demandée.
// Permet de générer des donnes "réalistes" selon des enchères connues (FFB, USBF, etc.).
//
// ===== DÉPENDANCES =====
// - generator.js : checkSequenceConstraint() qui itère les critères d'une séquence
// - modal.js : choix de séquences dans la modale (pas encore UI mais prêt)

const SEF_SEQUENCES = {
    // ========================================
    // SÉQUENCES APRÈS OUVERTURE DE 1♠
    // ========================================
    "1P-1SA-2P": {
        opener: { hl: [12, 20], spades: [6, 13] },
        responder: { hcp: [6, 10], spades: [0, 2] }
    },
    "1P-2P-2SA": {
        opener: { hl: [15, 17], spades: [5, 13] },
        responder: { hld: [6, 10], spades: [3, 13] }
    },
    "1P-2P-3P": {
        opener: { hl: [15, 17], spades: [6, 13] },
        responder: { hld: [6, 10], spades: [3, 13] }
    },
    "1P-2P-3SA": {
        opener: { hcp: [18, 19], spades: [5, 13], distribution: "5332" },
        responder: { hld: [6, 10], spades: [3, 13] }
    },
    "1P-2P-4P": {
        opener: { hl: [18, 21], spades: [5, 13] },
        responder: { hld: [6, 10], spades: [3, 13] }
    },
    "1P-3P-3SA": {
        opener: { hcp: [15, 17], spades: [5, 13] },
        responder: { hld: [10, 12], spades: [4, 13] }
    },
    "1P-3P-4P": {
        opener: { hl: [12, 17], spades: [5, 13] },
        responder: { hld: [10, 12], spades: [4, 13] }
    },
    "1P-4P-P": {
        opener: { hl: [12, 17], spades: [5, 13] },
        responder: { hld: [10, 15], spades: [5, 13] }
    },
    
    // ========================================
    // SÉQUENCES APRÈS OUVERTURE DE 1♥
    // ========================================
    "1C-1SA-2C": {
        opener: { hl: [12, 20], hearts: [6, 13] },
        responder: { hcp: [6, 10], hearts: [0, 2] }
    },
    "1C-2C-2SA": {
        opener: { hl: [15, 17], hearts: [5, 13] },
        responder: { hld: [6, 10], hearts: [3, 13] }
    },
    "1C-2C-3C": {
        opener: { hl: [15, 17], hearts: [6, 13] },
        responder: { hld: [6, 10], hearts: [3, 13] }
    },
    "1C-2C-3SA": {
        opener: { hcp: [18, 19], hearts: [5, 13], distribution: "5332" },
        responder: { hld: [6, 10], hearts: [3, 13] }
    },
    "1C-2C-4C": {
        opener: { hl: [18, 21], hearts: [5, 13] },
        responder: { hld: [6, 10], hearts: [3, 13] }
    },
    "1C-3C-3SA": {
        opener: { hcp: [15, 17], hearts: [5, 13] },
        responder: { hld: [10, 12], hearts: [4, 13] }
    },
    "1C-3C-4C": {
        opener: { hl: [12, 17], hearts: [5, 13] },
        responder: { hld: [10, 12], hearts: [4, 13] }
    },
    "1C-4C-P": {
        opener: { hl: [12, 17], hearts: [5, 13] },
        responder: { hld: [10, 15], hearts: [5, 13] }
    },
    
    // ========================================
    // SÉQUENCES APRÈS OUVERTURE DE 1♦
    // ========================================
    "1K-2K-2SA": {
        opener: { hl: [15, 17], diamonds: [4, 13], excludeDistributions: "4333 4432 5332" },
        responder: { hld: [6, 10], diamonds: [4, 13] }
    },
    "1K-2K-3K": {
        opener: { hl: [15, 17], diamonds: [5, 13], excludeDistributions: "4333 4432 5332" },
        responder: { hld: [6, 10], diamonds: [4, 13] }
    },
    "1K-3K-3SA": {
        opener: { hl: [15, 17], diamonds: [4, 13], excludeDistributions: "4333 4432 5332" },
        responder: { hld: [10, 12], diamonds: [5, 13] }
    },
    "1K-3K-5K": {
        opener: { hl: [18, 21], diamonds: [4, 13], excludeDistributions: "4333 4432 5332" },
        responder: { hld: [10, 12], diamonds: [5, 13] }
    },
    
    // ========================================
    // SÉQUENCES APRÈS OUVERTURE DE 1♣
    // ========================================
    "1T-2T-2SA": {
        opener: { OR: [
            { hl: [15, 17], clubs: [3, 13], spades: [0, 4], hearts: [0, 4], suitComparison: "clubs > diamonds", excludeDistributions: "4333 4432 5332" },
            { hcp: [12, 14], clubs: [4, 13], spades: [0, 4], hearts: [0, 4], suitComparison: "clubs > diamonds" },
            { hcp: [12, 14], clubs: [3, 3],  diamonds: [3, 3], spades: [0, 4], hearts: [0, 4] },
            { hcp: [18, 19], clubs: [4, 13], spades: [0, 4], hearts: [0, 4], suitComparison: "clubs > diamonds" },
            { hcp: [18, 19], clubs: [3, 3],  diamonds: [3, 3], spades: [0, 4], hearts: [0, 4] }
        ]},
        responder: { hld: [6, 10], clubs: [4, 13], spades: [0, 3], hearts: [0, 3], diamonds: [0, 3], excludeDistributions: "4333 4432 5332" }
    },
    "1T-2T-3T": {
        opener: { OR: [
            { hl: [15, 17], clubs: [4, 13], spades: [0, 4], hearts: [0, 4], suitComparison: "clubs > diamonds", excludeDistributions: "4333 4432 5332" },
            { hcp: [12, 14], clubs: [4, 13], spades: [0, 4], hearts: [0, 4], suitComparison: "clubs > diamonds" },
            { hcp: [18, 19], clubs: [4, 13], spades: [0, 4], hearts: [0, 4], suitComparison: "clubs > diamonds" }
        ]},
        responder: { hld: [6, 10], clubs: [4, 13], spades: [0, 3], hearts: [0, 3], diamonds: [0, 3], excludeDistributions: "4333 4432 5332" }
    },
    "1T-3T-3SA": {
        opener: { OR: [
            { hl: [15, 17], clubs: [3, 13], spades: [0, 4], hearts: [0, 4], suitComparison: "clubs > diamonds", excludeDistributions: "4333 4432 5332" },
            { hcp: [12, 14], clubs: [4, 13], spades: [0, 4], hearts: [0, 4], suitComparison: "clubs > diamonds" },
            { hcp: [12, 14], clubs: [3, 3],  diamonds: [3, 3], spades: [0, 4], hearts: [0, 4] },
            { hcp: [18, 19], clubs: [4, 13], spades: [0, 4], hearts: [0, 4], suitComparison: "clubs > diamonds" },
            { hcp: [18, 19], clubs: [3, 3],  diamonds: [3, 3], spades: [0, 4], hearts: [0, 4] }
        ]},
        responder: { hld: [10, 12], clubs: [5, 13], spades: [0, 3], hearts: [0, 3], diamonds: [0, 3], excludeDistributions: "4333 4432 5332" }
    },
    "1T-3T-5T": {
        opener: { OR: [
            { hl: [18, 21], clubs: [3, 13], spades: [0, 4], hearts: [0, 4], suitComparison: "clubs > diamonds", excludeDistributions: "4333 4432 5332" },
            { hcp: [12, 14], clubs: [4, 13], spades: [0, 4], hearts: [0, 4], suitComparison: "clubs > diamonds" },
            { hcp: [12, 14], clubs: [3, 3],  diamonds: [3, 3], spades: [0, 4], hearts: [0, 4] }
        ]},
        responder: { hld: [10, 12], clubs: [5, 13], spades: [0, 3], hearts: [0, 3], diamonds: [0, 3], excludeDistributions: "4333 4432 5332" }
    },
    
    // ========================================
    // SÉQUENCES APRÈS 1SA
    // ========================================
    "1SA-2SA-3SA": {
        opener: { hcp: [15, 17], distribution: "4432 4333 5332" },
        responder: { hcp: [8, 9] }
    },
    "1SA-3SA-P": {
        opener: { hcp: [15, 17], distribution: "4432 4333 5332" },
        responder: { hcp: [10, 14] }
    },
    "1SA-2C-2K": {
        opener: { hcp: [15, 17], hearts: [0, 3], spades: [0, 3] },
        responder: { hcp: [0, 40] }
    },
    "1SA-2C-2P": {
        opener: { hcp: [15, 17], hearts: [0, 3], spades: [4, 13] },
        responder: { hcp: [0, 40] }
    },
    
    // ========================================
    // SÉQUENCES 2/1 (Forcing de manche)
    // ========================================
    "1P-2C-2SA": {
        opener: { hl: [12, 14], spades: [5, 13] },
        responder: { hcp: [13, 40], hearts: [5, 13] }
    },
    "1P-2K-2SA": {
        opener: { hl: [12, 14], spades: [5, 13] },
        responder: { hcp: [13, 40], diamonds: [4, 13] }
    },
    "1P-2T-2SA": {
        opener: { hl: [12, 14], spades: [5, 13] },
        responder: { hcp: [13, 40], clubs: [4, 13] }
    },
    "1C-2K-2SA": {
        opener: { hl: [12, 14], hearts: [5, 13] },
        responder: { hcp: [13, 40], diamonds: [4, 13] }
    },
    "1C-2T-2SA": {
        opener: { hl: [12, 14], hearts: [5, 13] },
        responder: { hcp: [13, 40], clubs: [4, 13] }
    },
    
    // ========================================
    // SÉQUENCES 1 SUR 1
    // ========================================
    "1T-1P-1SA": {
        opener: { OR: [
            { hcp: [12, 14], clubs: [4, 13], spades: [0, 3], hearts: [0, 4], suitComparison: "clubs > diamonds" },
            { hcp: [12, 14], clubs: [3, 3], diamonds: [3, 3], spades: [0, 3], hearts: [0, 4] }
        ]},
        responder: { hcp: [6, 40], spades: [4, 13] }
    },
    "1T-1C-1SA": {
        opener: { OR: [
            { hcp: [12, 14], clubs: [4, 13], hearts: [0, 3], spades: [0, 4], suitComparison: "clubs > diamonds" },
            { hcp: [12, 14], clubs: [3, 3], diamonds: [3, 3], hearts: [0, 3], spades: [0, 4] }
        ]},
        responder: { hcp: [6, 40], hearts: [4, 13] }
    },
    "1K-1P-1SA": {
        opener: { hcp: [12, 14], diamonds: [4, 13], spades: [0, 3] },
        responder: { hcp: [6, 40], spades: [4, 13] }
    },
    "1K-1C-1SA": {
        opener: { hcp: [12, 14], diamonds: [4, 13], hearts: [0, 3] },
        responder: { hcp: [6, 40], hearts: [4, 13] }
    },
    
    // ========================================
    // SÉQUENCES 1♠ - REDEMANDES APRÈS 1SA
    // ========================================
    "1P-1SA-2C": {
        opener: { hl: [12, 20], spades: [5, 13], hearts: [4, 13] },
        responder: { hcp: [6, 10], spades: [0, 2] }
    },
    "1P-1SA-2K": {
        opener: { hl: [12, 20], spades: [5, 13], diamonds: [4, 13] },
        responder: { hcp: [6, 10], spades: [0, 2] }
    },
    "1P-1SA-2T": {
        opener: { hl: [12, 20], spades: [5, 13], clubs: [4, 13] },
        responder: { hcp: [6, 10], spades: [0, 2] }
    },
    "1P-1SA-2SA": {
        opener: { hcp: [18, 19], spades: [5, 13], distribution: "5332" },
        responder: { hcp: [6, 10], spades: [0, 2] }
    },
    "1P-1SA-3SA": {
        opener: { hcp: [20, 21], spades: [5, 13], distribution: "5332" },
        responder: { hcp: [6, 10], spades: [0, 2] }
    },
    
    // ========================================
    // SÉQUENCES 1♥ - REDEMANDES APRÈS 1SA
    // ========================================
    "1C-1SA-2K": {
        opener: { hl: [12, 20], hearts: [5, 13], diamonds: [4, 13] },
        responder: { hcp: [6, 10], hearts: [0, 2] }
    },
    "1C-1SA-2T": {
        opener: { hl: [12, 20], hearts: [5, 13], clubs: [4, 13] },
        responder: { hcp: [6, 10], hearts: [0, 2] }
    },
    "1C-1SA-2P": {
        opener: { hl: [12, 20], hearts: [5, 13], spades: [4, 13] },
        responder: { hcp: [6, 10], hearts: [0, 2] }
    },
    "1C-1SA-2SA": {
        opener: { hcp: [18, 19], hearts: [5, 13], distribution: "5332" },
        responder: { hcp: [6, 10], hearts: [0, 2] }
    },
    "1C-1SA-3SA": {
        opener: { hcp: [20, 21], hearts: [5, 13], distribution: "5332" },
        responder: { hcp: [6, 10], hearts: [0, 2] }
    },
    
    // ========================================
    // SÉQUENCES 1♠ - 2 SUR 1
    // ========================================
    "1P-2C-2P": {
        opener: { hl: [12, 20], spades: [6, 13] },
        responder: { hcp: [13, 40], hearts: [5, 13] }
    },
    "1P-2C-3C": {
        opener: { hl: [12, 20], spades: [5, 13], hearts: [4, 13] },
        responder: { hcp: [13, 40], hearts: [5, 13] }
    },
    "1P-2C-3P": {
        opener: { hl: [15, 20], spades: [6, 13] },
        responder: { hcp: [13, 40], hearts: [5, 13] }
    },
    "1P-2K-2P": {
        opener: { hl: [12, 20], spades: [6, 13] },
        responder: { hcp: [13, 40], diamonds: [4, 13] }
    },
    "1P-2K-3K": {
        opener: { hl: [12, 20], spades: [5, 13], diamonds: [4, 13] },
        responder: { hcp: [13, 40], diamonds: [4, 13] }
    },
    "1P-2T-2P": {
        opener: { hl: [12, 20], spades: [6, 13] },
        responder: { hcp: [13, 40], clubs: [4, 13] }
    },
    "1P-2T-3T": {
        opener: { hl: [12, 20], spades: [5, 13], clubs: [4, 13] },
        responder: { hcp: [13, 40], clubs: [4, 13] }
    },
    
    // ========================================
    // SÉQUENCES 1♥ - 2 SUR 1
    // ========================================
    "1C-2K-2C": {
        opener: { hl: [12, 20], hearts: [6, 13] },
        responder: { hcp: [13, 40], diamonds: [4, 13] }
    },
    "1C-2K-3K": {
        opener: { hl: [12, 20], hearts: [5, 13], diamonds: [4, 13] },
        responder: { hcp: [13, 40], diamonds: [4, 13] }
    },
    "1C-2K-3C": {
        opener: { hl: [15, 20], hearts: [6, 13] },
        responder: { hcp: [13, 40], diamonds: [4, 13] }
    },
    "1C-2T-2C": {
        opener: { hl: [12, 20], hearts: [6, 13] },
        responder: { hcp: [13, 40], clubs: [4, 13] }
    },
    "1C-2T-3T": {
        opener: { hl: [12, 20], hearts: [5, 13], clubs: [4, 13] },
        responder: { hcp: [13, 40], clubs: [4, 13] }
    },
    "1C-2T-3C": {
        opener: { hl: [15, 20], hearts: [6, 13] },
        responder: { hcp: [13, 40], clubs: [4, 13] }
    },
    
    // ========================================
    // SÉQUENCES TEXAS APRÈS 1SA
    // ========================================
    "1SA-2K-2C": {
        opener: { hcp: [15, 17], distribution: "4432 4333 5332" },
        responder: { hcp: [0, 40], hearts: [5, 13] }
    },
    "1SA-2K-2C-P": {
        opener: { hcp: [15, 17], distribution: "4432 4333 5332" },
        responder: { hcp: [0, 9], hearts: [5, 13] }
    },
    "1SA-2K-2C-3SA": {
        opener: { hcp: [15, 17], distribution: "4432 4333 5332" },
        responder: { hcp: [10, 15], hearts: [5, 13] }
    },
    "1SA-2K-2C-4C": {
        opener: { hcp: [15, 17], distribution: "4432 4333 5332" },
        responder: { hcp: [10, 40], hearts: [6, 13] }
    },
    "1SA-2C-2P-P": {
        opener: { hcp: [15, 17], distribution: "4432 4333 5332" },
        responder: { hcp: [0, 9], spades: [5, 13] }
    },
    "1SA-2C-2P-3SA": {
        opener: { hcp: [15, 17], distribution: "4432 4333 5332" },
        responder: { hcp: [10, 15], spades: [5, 13] }
    },
    "1SA-2C-2P-4P": {
        opener: { hcp: [15, 17], distribution: "4432 4333 5332" },
        responder: { hcp: [10, 40], spades: [6, 13] }
    },
    
    // ========================================
    // STAYMAN APRÈS 1SA
    // ========================================
    "1SA-2T-2K": {
        opener: { hcp: [15, 17], hearts: [0, 3], spades: [0, 3] },
        responder: { hcp: [8, 40] }
    },
    "1SA-2T-2K-2SA": {
        opener: { hcp: [15, 17], hearts: [0, 3], spades: [0, 3] },
        responder: { hcp: [8, 9] }
    },
    "1SA-2T-2K-3SA": {
        opener: { hcp: [15, 17], hearts: [0, 3], spades: [0, 3] },
        responder: { hcp: [10, 15] }
    },
    "1SA-2T-2C": {
        opener: { hcp: [15, 17], hearts: [4, 13] },
        responder: { hcp: [8, 40], hearts: [4, 13] }
    },
    "1SA-2T-2C-3SA": {
        opener: { hcp: [15, 17], hearts: [4, 13] },
        responder: { hcp: [8, 9], hearts: [2, 3] }
    },
    "1SA-2T-2C-4C": {
        opener: { hcp: [15, 17], hearts: [4, 13] },
        responder: { hcp: [10, 40], hearts: [4, 13] }
    },
    "1SA-2T-2P": {
        opener: { hcp: [15, 17], spades: [4, 13] },
        responder: { hcp: [8, 40], spades: [4, 13] }
    },
    "1SA-2T-2P-3SA": {
        opener: { hcp: [15, 17], spades: [4, 13] },
        responder: { hcp: [8, 9], spades: [2, 3] }
    },
    "1SA-2T-2P-4P": {
        opener: { hcp: [15, 17], spades: [4, 13] },
        responder: { hcp: [10, 40], spades: [4, 13] }
    },
    
    // ========================================
    // SÉQUENCES 1♣ - RÉPONSES ET REDEMANDES
    // ========================================
    "1T-1K-1SA": {
        opener: { OR: [
            { hcp: [12, 14], clubs: [4, 13], hearts: [0, 3], spades: [0, 3], suitComparison: "clubs > diamonds" },
            { hcp: [12, 14], clubs: [3, 3], diamonds: [3, 3], hearts: [0, 3], spades: [0, 3] }
        ]},
        responder: { hcp: [6, 40], diamonds: [4, 13] }
    },
    "1T-1K-2T": {
        opener: { OR: [
            { hl: [15, 17], clubs: [4, 13], spades: [0, 4], hearts: [0, 4], suitComparison: "clubs > diamonds", excludeDistributions: "4333 4432 5332" },
            { hcp: [12, 14], clubs: [4, 13], spades: [0, 4], hearts: [0, 4], suitComparison: "clubs > diamonds" },
            { hcp: [18, 19], clubs: [4, 13], spades: [0, 4], hearts: [0, 4], suitComparison: "clubs > diamonds" }
        ]},
        responder: { hcp: [6, 40], diamonds: [4, 13] }
    },
    "1T-1K-2K": {
        opener: { OR: [
            { hl: [15, 17], diamonds: [4, 13], clubs: [3, 13], spades: [0, 4], hearts: [0, 4], suitComparison: "clubs > diamonds", excludeDistributions: "4333 4432 5332" },
            { hcp: [18, 19], diamonds: [4, 13], clubs: [3, 13], spades: [0, 4], hearts: [0, 4], suitComparison: "clubs > diamonds" }
        ]},
        responder: { hcp: [6, 40], diamonds: [4, 13] }
    },
    "1T-1C-2T": {
        opener: { OR: [
            { hl: [15, 17], clubs: [4, 13], spades: [0, 4], hearts: [0, 4], suitComparison: "clubs > diamonds", excludeDistributions: "4333 4432 5332" },
            { hcp: [12, 14], clubs: [4, 13], spades: [0, 4], hearts: [0, 4], suitComparison: "clubs > diamonds" },
            { hcp: [18, 19], clubs: [4, 13], spades: [0, 4], hearts: [0, 4], suitComparison: "clubs > diamonds" }
        ]},
        responder: { hcp: [6, 40], hearts: [4, 13] }
    },
    "1T-1C-2C": {
        opener: { OR: [
            { hl: [15, 17], hearts: [4, 13], clubs: [3, 13], spades: [0, 4], suitComparison: "clubs > diamonds", excludeDistributions: "4333 4432 5332" },
            { hcp: [18, 19], hearts: [4, 13], clubs: [3, 13], spades: [0, 4], suitComparison: "clubs > diamonds" }
        ]},
        responder: { hcp: [6, 40], hearts: [4, 13] }
    },
    "1T-1P-2T": {
        opener: { OR: [
            { hl: [15, 17], clubs: [4, 13], spades: [0, 4], hearts: [0, 4], suitComparison: "clubs > diamonds", excludeDistributions: "4333 4432 5332" },
            { hcp: [12, 14], clubs: [4, 13], spades: [0, 4], hearts: [0, 4], suitComparison: "clubs > diamonds" },
            { hcp: [18, 19], clubs: [4, 13], spades: [0, 4], hearts: [0, 4], suitComparison: "clubs > diamonds" }
        ]},
        responder: { hcp: [6, 40], spades: [4, 13] }
    },
    "1T-1P-2P": {
        opener: { OR: [
            { hl: [15, 17], spades: [4, 13], clubs: [3, 13], hearts: [0, 4], suitComparison: "clubs > diamonds", excludeDistributions: "4333 4432 5332" },
            { hcp: [18, 19], spades: [4, 13], clubs: [3, 13], hearts: [0, 4], suitComparison: "clubs > diamonds" }
        ]},
        responder: { hcp: [6, 40], spades: [4, 13] }
    },
    
    // ========================================
    // SÉQUENCES 1♦ - RÉPONSES ET REDEMANDES
    // ========================================
    "1K-1C-2K": {
        opener: { hl: [12, 20], diamonds: [5, 13], excludeDistributions: "4333 4432 5332" },
        responder: { hcp: [6, 40], hearts: [4, 13] }
    },
    "1K-1C-2C": {
        opener: { hl: [15, 20], hearts: [4, 13], excludeDistributions: "4333 4432 5332" },
        responder: { hcp: [6, 40], hearts: [4, 13] }
    },
    "1K-1P-2K": {
        opener: { hl: [12, 20], diamonds: [5, 13], excludeDistributions: "4333 4432 5332" },
        responder: { hcp: [6, 40], spades: [4, 13] }
    },
    "1K-1P-2P": {
        opener: { hl: [15, 20], spades: [4, 13], excludeDistributions: "4333 4432 5332" },
        responder: { hcp: [6, 40], spades: [4, 13] }
    },
    "1K-2T-2K": {
        opener: { hl: [12, 20], diamonds: [5, 13], excludeDistributions: "4333 4432 5332" },
        responder: { hcp: [13, 40], clubs: [4, 13] }
    },
    "1K-2T-3T": {
        opener: { hl: [12, 20], diamonds: [4, 13], clubs: [4, 13], excludeDistributions: "4333 4432 5332" },
        responder: { hcp: [13, 40], clubs: [4, 13] }
    },
    
    // ========================================
    // FIT MAJEUR IMMÉDIAT (SÉQUENCES À 3) - SUITE
    // ========================================
    "1P-3P-4T": {
        opener: { hl: [15, 40], spades: [5, 13] },
        responder: { hld: [10, 12], spades: [4, 13] }
    },
    "1C-3C-4T": {
        opener: { hl: [15, 40], hearts: [5, 13] },
        responder: { hld: [10, 12], hearts: [4, 13] }
    },
    
    // ========================================
    // BARRAGES
    // ========================================
    "2P-P-P": {
        opener: { hl: [6, 10], spades: [6, 13] },
        responder: { hcp: [0, 15] }
    },
    "2P-2SA-3P": {
        opener: { hl: [6, 10], spades: [6, 13] },
        responder: { hcp: [16, 40] }
    },
    "2P-3P-P": {
        opener: { hl: [6, 10], spades: [6, 13] },
        responder: { hld: [6, 15], spades: [3, 13] }
    },
    "2P-4P-P": {
        opener: { hl: [6, 10], spades: [6, 13] },
        responder: { hld: [11, 40], spades: [3, 13] }
    },
    "2C-P-P": {
        opener: { hl: [6, 10], hearts: [6, 13] },
        responder: { hcp: [0, 15] }
    },
    "2C-2SA-3C": {
        opener: { hl: [6, 10], hearts: [6, 13] },
        responder: { hcp: [16, 40] }
    },
    "2C-3C-P": {
        opener: { hl: [6, 10], hearts: [6, 13] },
        responder: { hld: [6, 15], hearts: [3, 13] }
    },
    "2C-4C-P": {
        opener: { hl: [6, 10], hearts: [6, 13] },
        responder: { hld: [11, 40], hearts: [3, 13] }
    },
    "2K-P-P": {
        opener: { hl: [6, 10], diamonds: [6, 13] },
        responder: { hcp: [0, 15] }
    },
    "2K-3K-P": {
        opener: { hl: [6, 10], diamonds: [6, 13] },
        responder: { hld: [6, 15], diamonds: [3, 13] }
    },
    "3T-P-P": {
        opener: { hl: [6, 10], clubs: [7, 13] },
        responder: { hcp: [0, 15] }
    },
    "3T-3SA-P": {
        opener: { hl: [6, 10], clubs: [7, 13] },
        responder: { hcp: [16, 40] }
    },
    "3T-5T-P": {
        opener: { hl: [6, 10], clubs: [7, 13] },
        responder: { hld: [11, 40], clubs: [3, 13] }
    },
    "3P-P-P": {
        opener: { hl: [6, 10], spades: [7, 13] },
        responder: { hcp: [0, 15] }
    },
    "3C-P-P": {
        opener: { hl: [6, 10], hearts: [7, 13] },
        responder: { hcp: [0, 15] }
    },
    "3K-P-P": {
        opener: { hl: [6, 10], diamonds: [7, 13] },
        responder: { hcp: [0, 15] }
    },
    
    // ========================================
    // 2SA D'OUVERTURE
    // ========================================
    "2SA-3SA-P": {
        opener: { hcp: [20, 21], distribution: "4432 4333 5332" },
        responder: { hcp: [4, 11] }
    },
    "2SA-4C-P": {
        opener: { hcp: [20, 21], distribution: "4432 4333 5332" },
        responder: { hcp: [4, 40], hearts: [6, 13] }
    },
    "2SA-4P-P": {
        opener: { hcp: [20, 21], distribution: "4432 4333 5332" },
        responder: { hcp: [4, 40], spades: [6, 13] }
    },
    "2SA-3T-3K": {
        opener: { hcp: [20, 21], hearts: [0, 3], spades: [0, 3] },
        responder: { hcp: [4, 40] }
    },
    "2SA-3T-3C": {
        opener: { hcp: [20, 21], hearts: [4, 13] },
        responder: { hcp: [4, 40], hearts: [4, 13] }
    },
    "2SA-3T-3P": {
        opener: { hcp: [20, 21], spades: [4, 13] },
        responder: { hcp: [4, 40], spades: [4, 13] }
    }
};

// Convertit les symboles unicode et variantes en lettres normalisées P/C/K/T
function normalizeSequence(seq) {
    return seq
        .replace(/♠/g, 'P')
        .replace(/♥/g, 'C')
        .replace(/♦/g, 'K')
        .replace(/♣/g, 'T')
        .replace(/SA/gi, 'SA')
        .toUpperCase();
}

// Fonction pour parser la séquence et récupérer les contraintes
function getSequenceConstraints(normalizedSequence) {
    // La séquence est déjà normalisée (avec tirets)
    // Chercher dans la base
    const constraints = SEF_SEQUENCES[normalizedSequence];
    
    if (constraints) {
        return {
            opener: constraints.opener || null,
            responder: constraints.responder || null,
            found: true
        };
    }
    
    return {
        opener: null,
        responder: null,
        found: false
    };
}