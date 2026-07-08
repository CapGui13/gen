// generator.js - Génération et gestion des donnes de bridge
//
// ===== ARCHITECTURE GÉNÉRALE =====
// Ce fichier orchestre la génération de donnes selon des contraintes multiples (HCP, distributions,
// séquences d'enchères, etc.). Les donnes générées sont stockées dans `generatedDeals[]` et
// réaffichées dynamiquement dans le DOM avec support de la notation FR (ARDVX) ou EN (AKQJT).
//
// ===== FLUX PRINCIPAL =====
// 1. generateDeals(append=false) : boucle de génération. Crée N donnes aléatoires, teste les
//    contraintes (checkAllConstraints), les stocke. Peut en mode "ajout" (append=true) ajouter
//    à des donnes existantes sans les effacer. Inclut un système d'animation par chunks.
// 2. renderDeals(append=false) : affiche les donnes dans le DOM. Réaffiche les tableaux DD
//    déjà calculés (grâce à deal._ddTable). En mode ajout, ne réinitialise pas le DD global.
// 3. Double mort (dds-controller.js) : calcul parallèle via Web Workers (fallback mono-thread
//    si file://). Résultats stockés dans deal._ddTable et persistés visuellement.
//
// ===== CONTRAINTES (système multi-niveaux) =====
// Définies dans `constraints[]` (global) via la modale `modal.js`. Types :
//  - HCP (mains individuelles ou lignes NS/EW)
//  - Distributions (patterns regex-like : 5332, 54xx, unicolore 6+, etc.)
//  - Séquences d'enchères (motifs d'enchères contraints, voir sequences.js)
// Chaque contrainte est vérifiée indépendamment par checkAllConstraints(deal).
// Les presets de distribution (ui dans modal.js) convertissent 54xx, 5422, etc. en notation interne.
//
// ===== NOTATIONS (EN vs FR) =====
// Interne : stockage en notation standard (AKQJT).
// Affichage : convertie via formatCardsForDisplay() selon `cardNotation` (EN ou FR).
// Exports PBN/LIN : toujours notation standard, peu importe le mode affiché.
// Persiste dans localStorage sous 'bridge-card-notation'.
//
// ===== PRÉFÉRENCES PERSISTANTES =====
// - 'bridge-theme' : 'light' ou 'dark', chargé dans loadSavedTheme()
// - 'bridge-card-notation' : 'EN' ou 'FR', chargé dans loadSavedCardNotation()
// Fallback : window.storage (artifacts Claude) puis localStorage.
//
// ===== DÉPENDANCES EXTERNES =====
// - modal.js : modales de presets (HCP, distributions), gestion des contraintes
// - dds-controller.js : calcul du double mort (orchestration Web Workers + fallback)
// - sequences.js : validation des séquences d'enchères (checkSequenceConstraint)
// - index.html : structure DOM, champs de saisie (numDeals, fixedDealer, etc.)
// - styles.css : thèmes clair/sombre, notation FR/EN

// Constantes globales
const CARD_VALUES = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const HONORS = { 'A': 4, 'K': 3, 'Q': 2, 'J': 1 };
const SUITS = ['SPADES', 'HEARTS', 'DIAMONDS', 'CLUBS'];
const SUIT_SYMBOLS = { 'SPADES': '♠', 'HEARTS': '♥', 'DIAMONDS': '♦', 'CLUBS': '♣' };

// Correspondance des figures pour l'affichage en notation française (K>R, Q>D, J>V, T>X).
// Ne concerne QUE l'affichage des mains : les exports PBN/LIN gardent la notation standard.
const CARD_LABELS_FR = { 'A': 'A', 'K': 'R', 'Q': 'D', 'J': 'V', 'T': 'X' };

// Formate une liste de cartes (ex: ['A','K','T','5']) pour l'affichage, selon la notation
// courante ('EN' : A K Q J T ; 'FR' : A R D V X). Les chiffres restent inchangés.
function formatCardsForDisplay(cards) {
    if (cardNotation === 'FR') {
        return cards.map(c => CARD_LABELS_FR[c] || c).join('');
    }
    return cards.join('');
}

// Variables globales
let constraints = [];
let generatedDeals = [];
let currentTheme = 'light';
let cardNotation = 'EN'; // 'EN' (A K Q J T) ou 'FR' (A R D V X)
let generationCancelled = false;

// Cycle standard du bridge (16 donnes)
const BRIDGE_CYCLE = [
    { dealer: 'N', vulnerable: 'None' },      // 1
    { dealer: 'E', vulnerable: 'NS' },        // 2
    { dealer: 'S', vulnerable: 'EW' },        // 3
    { dealer: 'W', vulnerable: 'Both' },      // 4
    { dealer: 'N', vulnerable: 'NS' },        // 5
    { dealer: 'E', vulnerable: 'EW' },        // 6
    { dealer: 'S', vulnerable: 'Both' },      // 7
    { dealer: 'W', vulnerable: 'None' },      // 8
    { dealer: 'N', vulnerable: 'EW' },        // 9
    { dealer: 'E', vulnerable: 'Both' },      // 10
    { dealer: 'S', vulnerable: 'None' },      // 11
    { dealer: 'W', vulnerable: 'NS' },        // 12
    { dealer: 'N', vulnerable: 'Both' },      // 13
    { dealer: 'E', vulnerable: 'None' },      // 14
    { dealer: 'S', vulnerable: 'NS' },        // 15
    { dealer: 'W', vulnerable: 'EW' }         // 16
];

function getDealerAndVulnerability(boardNumber) {
    const isRotating = document.getElementById('rotatingDealer').checked;
    
    if (isRotating) {
        const cycleIndex = (boardNumber - 1) % 16;
        return BRIDGE_CYCLE[cycleIndex];
    } else {
        const fixedDealer = document.getElementById('fixedDealer').value;
        return { dealer: fixedDealer, vulnerable: 'None' };
    }
}

// ===== FONCTIONS DE GÉNÉRATION =====

function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const value of CARD_VALUES) {
            deck.push({ suit, value });
        }
    }
    return deck;
}

function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function generateDeal() {
    const deck = shuffle(createDeck());
    const deal = {
        N: { SPADES: [], HEARTS: [], DIAMONDS: [], CLUBS: [] },
        E: { SPADES: [], HEARTS: [], DIAMONDS: [], CLUBS: [] },
        S: { SPADES: [], HEARTS: [], DIAMONDS: [], CLUBS: [] },
        W: { SPADES: [], HEARTS: [], DIAMONDS: [], CLUBS: [] }
    };
    
    const positions = ['N', 'E', 'S', 'W'];
    deck.forEach((card, i) => {
        const pos = positions[i % 4];
        deal[pos][card.suit].push(card.value);
    });
    
    for (const pos of positions) {
        for (const suit of SUITS) {
            deal[pos][suit].sort((a, b) => CARD_VALUES.indexOf(a) - CARD_VALUES.indexOf(b));
        }
    }
    
    return deal;
}

function rotateDeal180(deal) {
    // Rotation à 180° : N↔S et E↔W
    return {
        N: deal.S,
        E: deal.W,
        S: deal.N,
        W: deal.E
    };
}

// ===== FONCTIONS DE CALCUL =====

function calculateHCP(hand) {
    let total = 0;
    for (const suit of SUITS) {
        for (const card of hand[suit]) {
            total += HONORS[card] || 0;
        }
    }
    return total;
}

function calculateHL(hand) {
    let hcp = calculateHCP(hand);
    let lengthPoints = 0;
    
    for (const suit of SUITS) {
        const length = hand[suit].length;
        if (length > 4) {
            lengthPoints += (length - 4);
        }
    }
    
    return hcp + lengthPoints;
}

function calculateHLD(hand, fitSuit) {
    let hcp = calculateHCP(hand);
    let distPoints = 0;
    
    if (fitSuit) {
        for (const suit of SUITS) {
            if (suit !== fitSuit) {
                const length = hand[suit].length;
                if (length === 0) distPoints += 3;       // chicane
                else if (length === 1) distPoints += 2;  // singleton
                else if (length === 2) distPoints += 1;  // doubleton
            }
        }
    }
    
    return hcp + distPoints;
}

function getDistribution(hand) {
    const lengths = SUITS.map(suit => hand[suit].length).sort((a, b) => b - a);
    return lengths.join('');
}

// ===== VALIDATION DES CONTRAINTES =====

function checkPointsInRange(value, rangeObj) {
    // Si c'est un objet avec plusieurs plages (OU)
    if (rangeObj.ranges) {
        return rangeObj.ranges.some(range => value >= range.min && value <= range.max);
    }
    // Sinon, c'est une seule plage
    return value >= rangeObj.min && value <= rangeObj.max;
}

function isRegularDistribution(handLengths, distStr) {
    // Vérifie si la main correspond à une des distributions listées (sans tenir compte de l'ordre des couleurs)
    const sorted = [...handLengths].sort((a, b) => b - a);
    const patterns = distStr.split(/\s+/).filter(d => d);
    for (const dist of patterns) {
        const pattern = dist.split('').map(Number);
        if (pattern.length !== 4) continue;
        pattern.sort((a, b) => b - a);
        if (JSON.stringify(sorted) === JSON.stringify(pattern)) return true;
    }
    return false;
}

// Teste un token "raccourci" du type "6+" ou "54+" directement sur les longueurs de la main
// (triées décroissant), sans passer par la génération de patterns concrets — ce qui gère aussi
// correctement les couleurs à 10+ cartes, impossibles à écrire sur un seul caractère.
// - "6+"   => au moins une couleur à 6 cartes ou plus (n'importe laquelle)
// - "54+"  => au moins ce bicolore ou mieux (plus longue >= 5, seconde plus longue >= 4)
// Renvoie true/false si le token est de ce format, ou null si ce n'en est pas un (à traiter normalement).
function checkPlusToken(token, sortedHandLengths) {
    let m = token.match(/^(\d)\+$/);
    if (m) {
        const n = parseInt(m[1], 10);
        return sortedHandLengths[0] >= n;
    }

    m = token.match(/^(\d)(\d)\+$/);
    if (m) {
        let a = parseInt(m[1], 10);
        let b = parseInt(m[2], 10);
        if (b > a) [a, b] = [b, a]; // le plus long des deux jeux en premier
        return sortedHandLengths[0] >= a && sortedHandLengths[1] >= b;
    }

    return null;
}

// Teste un token à un seul chiffre sans suffixe (ex: "6", "7", "8") : vrai si une couleur
// quelconque de la main a EXACTEMENT cette longueur. Complète checkPlusToken (qui gère
// uniquement les seuils "N+"). Renvoie true/false si le token est de ce format, ou null sinon.
function checkExactToken(token, sortedHandLengths) {
    const m = token.match(/^(\d)$/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return sortedHandLengths.includes(n);
}

const MAJOR_SUITS = ['SPADES', 'HEARTS'];
const MINOR_SUITS = ['DIAMONDS', 'CLUBS'];

// Teste les raccourcis ciblant spécifiquement les majeures (M) ou les mineures (m) :
// - "M5", "M5+", "M6", "M6+", "M7", "M7+", "M8"  => une majeure (resp. mineure avec "m") a
//   exactement (ou au moins, avec "+") cette longueur, l'autre majeure n'étant pas contrainte
// - "M44", "M54", "M54+", "M55", "M55+", "M65", "M65+", "M66" (et équivalents en "m")
//   => les deux majeures (ou mineures) prises ensemble, triées décroissant, correspondent
//   exactement à ce couple de longueurs, ou au moins à ce couple ("+")
// - "M5m4", "M5m5", "M6m5", "M5m6", "M6m6" => une majeure a cette longueur ET une mineure
//   a cette longueur, indépendamment l'une de l'autre
// Renvoie true/false si le token est de ce format, ou null si ce n'en est pas un.
function checkSuitGroupToken(token, hand) {
    const majorLengths = MAJOR_SUITS.map(s => hand[s].length);
    const minorLengths = MINOR_SUITS.map(s => hand[s].length);

    // Croisement majeure/mineure : M5m4, M6m5, M5m6, M6m6, ...
    let m = token.match(/^M(\d)m(\d)$/);
    if (m) {
        const majorLen = parseInt(m[1], 10);
        const minorLen = parseInt(m[2], 10);
        return majorLengths.includes(majorLen) && minorLengths.includes(minorLen);
    }

    // Deux couleurs de la même famille : M44, M54, M54+, M55, M55+, M65, M65+, M66
    // et m54, m54+, m55, m55+, m65, m65+, m66
    m = token.match(/^([Mm])(\d)(\d)(\+)?$/);
    if (m) {
        const lengths = (m[1] === 'M' ? majorLengths : minorLengths).slice().sort((a, b) => b - a);
        let a = parseInt(m[2], 10);
        let b = parseInt(m[3], 10);
        if (b > a) [a, b] = [b, a];
        if (m[4]) {
            return lengths[0] >= a && lengths[1] >= b;
        }
        return lengths[0] === a && lengths[1] === b;
    }

    // Une seule couleur de la famille : M5, M5+, M6, M6+, M7, M7+, M8
    // et m5, m5+, m6, m6+, m7, m7+
    m = token.match(/^([Mm])(\d)(\+)?$/);
    if (m) {
        const lengths = m[1] === 'M' ? majorLengths : minorLengths;
        const n = parseInt(m[2], 10);
        return m[3] ? lengths.some(l => l >= n) : lengths.some(l => l === n);
    }

    return null;
}

// Vérifie la syntaxe d'une chaîne de distribution saisie par l'utilisateur (ex: "5431 M54+ 6+")
// et renvoie les tokens non reconnus, s'il y en a. Un token est valide s'il correspond à l'un
// des formats supportés : pattern classique à 4 caractères (chiffres/x), seuil sur toute la
// main ("6+", "54+"), ou raccourci majeure/mineure ("M5", "M5+", "M44", "M54+", "M5m4", ...).
function validateDistributionString(distributionStr) {
    if (!distributionStr || !distributionStr.trim()) {
        return { valid: true, invalidTokens: [] };
    }

    const tokens = distributionStr.trim().split(/\s+/).filter(Boolean);
    const invalidTokens = [];

    for (const token of tokens) {
        const isClassicPattern = /^[0-9x]{4}$/.test(token);
        const isWholeHandThreshold = /^\d\+$/.test(token) || /^\d{2}\+$/.test(token);
        const isWholeHandExact = /^\d$/.test(token);
        const isSuitGroupToken = /^M\dm\d$/.test(token)
            || /^[Mm]\d{2}\+?$/.test(token)
            || /^[Mm]\d\+?$/.test(token);

        if (!isClassicPattern && !isWholeHandThreshold && !isWholeHandExact && !isSuitGroupToken) {
            invalidTokens.push(token);
        }
    }

    return { valid: invalidTokens.length === 0, invalidTokens };
}

function matchesDistribution(hand, distributionStr, suitConstraints, excludeDistributionStr) {
    const handLengths = SUITS.map(suit => hand[suit].length);

    // Vérifier les distributions exclues
    if (excludeDistributionStr && isRegularDistribution(handLengths, excludeDistributionStr)) {
        return false;
    }

    if (!distributionStr) return true;

    const sortedHandLengths = [...handLengths].sort((a, b) => b - a);
    const rawTokens = distributionStr.split(/\s+/).filter(d => d);

    // Tokens "+" (seuils) et raccourcis M/m : évalués directement, les autres passent
    // par le matching classique ci-dessous
    const allowedDistributions = [];
    for (const token of rawTokens) {
        const plusResult = checkPlusToken(token, sortedHandLengths);
        if (plusResult === true) return true;
        if (plusResult === false) continue;

        const exactResult = checkExactToken(token, sortedHandLengths);
        if (exactResult === true) return true;
        if (exactResult === false) continue;

        const suitGroupResult = checkSuitGroupToken(token, hand);
        if (suitGroupResult === true) return true;
        if (suitGroupResult === null) allowedDistributions.push(token);
        // suitGroupResult === false : ce token ne matche pas cette main, on continue avec les autres
    }
    
    const constrainedSuits = [];
    for (const suit of SUITS) {
        const sc = suitConstraints[suit];
        if (sc.ranges || sc.min > 0 || sc.max < 13) {
            constrainedSuits.push(suit);
        }
    }
    
    for (const dist of allowedDistributions) {
        const pattern = dist.split('').map(c => c === 'x' ? null : parseInt(c));
        
        if (pattern.length !== 4) continue;
        
        const expandPattern = (pat) => {
            const xIndex = pat.indexOf(null);
            if (xIndex === -1) return [pat];
            
            const results = [];
            for (let i = 0; i <= 13; i++) {
                const newPat = [...pat];
                newPat[xIndex] = i;
                results.push(...expandPattern(newPat));
            }
            return results;
        };
        
        const possibleDistributions = expandPattern(pattern);
        
        for (const targetLengths of possibleDistributions) {
            if (targetLengths.reduce((a, b) => a + b, 0) !== 13) continue;
            
            const sortedTarget = [...targetLengths].sort((a, b) => b - a);
            
            if (constrainedSuits.length > 0) {
                const actualLengths = [...handLengths];
                const used = new Array(4).fill(false);
                let valid = true;
                
                for (const suit of constrainedSuits) {
                    const suitIdx = SUITS.indexOf(suit);
                    const length = actualLengths[suitIdx];
                    
                    let found = false;
                    for (let i = 0; i < sortedTarget.length; i++) {
                        if (!used[i] && sortedTarget[i] === length) {
                            used[i] = true;
                            found = true;
                            break;
                        }
                    }
                    
                    if (!found) {
                        valid = false;
                        break;
                    }
                }
                
                if (!valid) continue;
                
                const remainingActual = [];
                const remainingTarget = [];
                
                for (let i = 0; i < 4; i++) {
                    if (!constrainedSuits.includes(SUITS[i])) {
                        remainingActual.push(actualLengths[i]);
                    }
                    if (!used[i]) {
                        remainingTarget.push(sortedTarget[i]);
                    }
                }
                
                remainingActual.sort((a, b) => b - a);
                remainingTarget.sort((a, b) => b - a);
                
                if (JSON.stringify(remainingActual) === JSON.stringify(remainingTarget)) {
                    return true;
                }
            } else {
                const sortedHandLengths = [...handLengths].sort((a, b) => b - a);
                if (JSON.stringify(sortedHandLengths) === JSON.stringify(sortedTarget)) {
                    return true;
                }
            }
        }
    }
    
    return false;
}


function checkHandSEF(hand, sefData) {
    // Vérifie une main contre un objet de contraintes SEF brut (hcp/hl/hld, suits, distributions, suitComparison)
    const pointType = sefData.pointType || (sefData.hcp ? 'hcp' : sefData.hl ? 'hl' : sefData.hld ? 'hld' : 'hcp');
    const range = sefData.hcp || sefData.hl || sefData.hld;
    
    if (range) {
        let value;
        if (pointType === 'hcp' || sefData.hcp) {
            value = calculateHCP(hand);
        } else if (pointType === 'hl' || sefData.hl) {
            value = calculateHL(hand);
        } else if (pointType === 'hld' || sefData.hld) {
            // trouver le fitSuit
            let fitSuit = null;
            for (const [suit, r] of Object.entries(sefData)) {
                if (['spades','hearts','diamonds','clubs'].includes(suit) && Array.isArray(r) && r[0] >= 3) {
                    fitSuit = suit.toUpperCase();
                    break;
                }
            }
            value = calculateHLD(hand, fitSuit);
        }
        const rangeObj = { min: range[0], max: range[1] };
        if (!checkPointsInRange(value, rangeObj)) return false;
    }
    
    // Vérifier les longueurs de couleurs
    const SUIT_MAP = { spades: 'SPADES', hearts: 'HEARTS', diamonds: 'DIAMONDS', clubs: 'CLUBS' };
    for (const [key, val] of Object.entries(sefData)) {
        if (SUIT_MAP[key] && Array.isArray(val)) {
            const length = hand[SUIT_MAP[key]].length;
            if (length < val[0] || length > val[1]) return false;
        }
    }
    
    // Vérifier distributions exclues
    const handLengths = SUITS.map(s => hand[s].length);
    if (sefData.excludeDistributions && isRegularDistribution(handLengths, sefData.excludeDistributions)) return false;
    
    // Vérifier distributions autorisées
    if (sefData.distribution) {
        const suits = { SPADES: {min:0,max:13}, HEARTS: {min:0,max:13}, DIAMONDS: {min:0,max:13}, CLUBS: {min:0,max:13} };
        if (!matchesDistribution(hand, sefData.distribution, suits, null)) return false;
    }
    
    // Vérifier suitComparison
    if (sefData.suitComparison) {
        const comparisons = Array.isArray(sefData.suitComparison) ? sefData.suitComparison : [sefData.suitComparison];
        for (const expr of comparisons) {
            const match = expr.match(/(\w+)\s*(>=|>|<=|<|==)\s*(\w+)/);
            if (!match) continue;
            const [, left, op, right] = match;
            const leftLen  = hand[SUIT_MAP[left]]?.length  ?? 0;
            const rightLen = hand[SUIT_MAP[right]]?.length ?? 0;
            const ok = op === '>'  ? leftLen >  rightLen
                     : op === '>=' ? leftLen >= rightLen
                     : op === '<'  ? leftLen <  rightLen
                     : op === '<=' ? leftLen <= rightLen
                     :               leftLen === rightLen;
            if (!ok) return false;
        }
    }
    
    return true;
}

function checkConstraint(deal, constraint) {
    if (constraint.type === 'line') {
        const positions = constraint.line === 'NS' ? ['N', 'S'] : ['E', 'W'];
        const pointType = constraint.pointType || 'hcp';
        
        if (pointType === 'hcp') {
            if (constraint.hcp) {
                const totalHCP = positions.reduce((sum, pos) => sum + calculateHCP(deal[pos]), 0);
                if (!checkPointsInRange(totalHCP, constraint.hcp)) {
                    return false;
                }
            }
        } else if (pointType === 'hl') {
            if (constraint.hcp) {
                const totalHL = positions.reduce((sum, pos) => sum + calculateHL(deal[pos]), 0);
                if (!checkPointsInRange(totalHL, constraint.hcp)) {
                    return false;
                }
            }
        }
        
        if (constraint.fits) {
            for (const [suit, range] of Object.entries(constraint.fits)) {
                if (range.ranges || range.min > 0 || range.max < 26) {
                    const totalCards = positions.reduce((sum, pos) => sum + deal[pos][suit].length, 0);
                    if (!checkPointsInRange(totalCards, range)) {
                        return false;
                    }
                }
            }
        }
        
        return true;
    }
    
    const hand = deal[constraint.position];
    
    // Support des contraintes OR : la main doit satisfaire au moins un des sous-objets
    if (constraint.OR && Array.isArray(constraint.OR)) {
        return constraint.OR.some(sefData => checkHandSEF(hand, sefData));
    }
    
    const pointType = constraint.pointType || 'hcp';
    
    if (pointType === 'hcp') {
        const hcp = calculateHCP(hand);
        if (!checkPointsInRange(hcp, constraint.hcp)) {
            return false;
        }
    } else if (pointType === 'hl') {
        const hl = calculateHL(hand);
        if (!checkPointsInRange(hl, constraint.hcp)) {
            return false;
        }
    } else if (pointType === 'hld') {
        let fitSuit = null;
        for (const [suit, range] of Object.entries(constraint.suits)) {
            if (range.min >= 3) {
                fitSuit = suit;
                break;
            }
        }
        const hld = calculateHLD(hand, fitSuit);
        if (!checkPointsInRange(hld, constraint.hcp)) {
            return false;
        }
    }
    
    for (const [suit, range] of Object.entries(constraint.suits)) {
        const length = hand[suit].length;
        if (!checkPointsInRange(length, range)) {
            return false;
        }
    }
    
    if (!matchesDistribution(hand, constraint.distributions, constraint.suits, constraint.excludeDistributions)) {
        return false;
    }

    // Contraintes relatives entre couleurs, ex: "clubs > diamonds", "clubs >= diamonds"
    if (constraint.suitComparison) {
        const SUIT_MAP = { spades: 'SPADES', hearts: 'HEARTS', diamonds: 'DIAMONDS', clubs: 'CLUBS' };
        const comparisons = Array.isArray(constraint.suitComparison)
            ? constraint.suitComparison
            : [constraint.suitComparison];
        for (const expr of comparisons) {
            const match = expr.match(/(\w+)\s*(>=|>|<=|<|==)\s*(\w+)/);
            if (!match) continue;
            const [, left, op, right] = match;
            const leftLen  = hand[SUIT_MAP[left]]?.length  ?? 0;
            const rightLen = hand[SUIT_MAP[right]]?.length ?? 0;
            const ok = op === '>'  ? leftLen >  rightLen
                     : op === '>=' ? leftLen >= rightLen
                     : op === '<'  ? leftLen <  rightLen
                     : op === '<=' ? leftLen <= rightLen
                     :               leftLen === rightLen;
            if (!ok) return false;
        }
    }

    return true;
}

function checkAllConstraints(deal) {
    if (constraints.length === 0) return true;
    
    const andConstraints = constraints.filter(c => c.operator === 'AND');
    const orConstraints = constraints.filter(c => c.operator === 'OR');
    
    const andResult = andConstraints.length === 0 || andConstraints.every(c => checkConstraint(deal, c));
    const orResult = orConstraints.length === 0 || orConstraints.some(c => checkConstraint(deal, c));
    
    return andResult && orResult;
}

// ===== GÉNÉRATION PRINCIPALE =====

// append=false : génère `numDeals` donnes en remplaçant celles déjà présentes.
// append=true  : génère `numDeals` donnes SUPPLÉMENTAIRES, ajoutées à la suite des existantes
//                (mêmes contraintes, numérotation des donnes qui continue naturellement).
function generateDeals(append = false) {
    const numDeals = parseInt(document.getElementById('numDeals').value);
    const isRotating = document.getElementById('rotatingDealer').checked;
    const fixedDealer = document.getElementById('fixedDealer').value;
    
    if (!isRotating && !fixedDealer) {
        alert('Veuillez sélectionner un donneur fixe ou cocher "Donneur rotatif"');
        return;
    }
    
    document.getElementById('loadingPanel').style.display = 'block';
    if (!append) {
        document.getElementById('resultsPanel').style.display = 'none';
    }
    
    const cancelBtn = document.getElementById('cancelGenBtn');
    if (cancelBtn) {
        cancelBtn.disabled = false;
        cancelBtn.textContent = '⏹ Annuler la génération';
    }
    
    generationCancelled = false;
    
    const baseCount = append ? generatedDeals.length : 0;
    const targetCount = baseCount + numDeals;
    updateProgressCounter(0, 0, numDeals);
    
    if (!append) {
        generatedDeals = [];
    }
    let attempts = 0;
    const maxAttempts = 1000000;
    const batchSize = 1000;
    
    function generateBatch() {
        if (generationCancelled) {
            finishGeneration(attempts, generatedDeals.length - baseCount, numDeals, true, append);
            return;
        }
        
        const startTime = Date.now();
        const randomizeLinesCheckbox = document.getElementById('randomizeLines');
        const randomizeLines = randomizeLinesCheckbox && randomizeLinesCheckbox.checked;
        
        while (generatedDeals.length < targetCount && attempts < maxAttempts) {
            let deal = generateDeal();
            
            if (checkAllConstraints(deal)) {
                // Appliquer la rotation aléatoire si activée
                let rotated = false;
                if (randomizeLines && Math.random() < 0.5) {
                    deal = rotateDeal180(deal);
                    rotated = true;
                }
                // Stocker l'info de rotation avec la donne
                deal._rotated = rotated;
                generatedDeals.push(deal);
            }
            attempts++;
            
            if (attempts % batchSize === 0 || Date.now() - startTime > 50) {
                break;
            }
        }
        
        updateProgressCounter(attempts, generatedDeals.length - baseCount, numDeals);
        
        if (generatedDeals.length < targetCount && attempts < maxAttempts && !generationCancelled) {
            requestAnimationFrame(generateBatch);
        } else {
            finishGeneration(attempts, generatedDeals.length - baseCount, numDeals, generationCancelled, append);
        }
    }
    
    setTimeout(() => generateBatch(), 100);
}

// Ajoute `numDeals` donnes supplémentaires à la suite de celles déjà générées, sans rien effacer
// (bouton "➕ Ajouter des donnes").
function addDeals() {
    generateDeals(true);
}

function cancelGeneration() {
    generationCancelled = true;
    const btn = document.getElementById('cancelGenBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏹ Annulation en cours...';
    }
}

function finishGeneration(attempts, found, target, cancelled = false, append = false) {
    document.getElementById('loadingPanel').style.display = 'none';
    
    if (generatedDeals.length > 0) {
        renderDeals(append);
        document.getElementById('resultsPanel').style.display = 'block';
    }
    
    const verbe = append ? 'ajoutée(s)' : 'générée(s)';
    
    if (cancelled) {
        alert(`⏹ Génération annulée.\n\n${found} donne(s) ${verbe} sur ${target} demandée(s) après ${attempts.toLocaleString()} tentatives.`);
    } else if (found < target) {
        alert(`Seulement ${found} donnes ${verbe} sur ${target} demandées après ${attempts.toLocaleString()} tentatives.\n\nLes contraintes sont peut-être trop restrictives.`);
    } else {
        alert(`✅ ${found} donnes ${verbe} avec succès après ${attempts.toLocaleString()} tentatives !`);
    }
}

function updateProgressCounter(attempts, found, target) {
    const loadingContent = document.getElementById('loadingContent');
    const percentage = Math.min((found / target) * 100, 100);
    loadingContent.innerHTML = `
        <div style="font-size: 18px; color: #2c3e50; margin-bottom: 10px;">
            Génération en cours...
        </div>
        <div style="font-size: 16px; color: #555;">
            <strong>${found}</strong> / ${target} donnes trouvées
        </div>
        <div style="font-size: 14px; color: #7f8c8d; margin-top: 5px;">
            ${attempts.toLocaleString()} tentatives
        </div>
        <div style="margin-top: 15px; background: #ecf0f1; border-radius: 10px; height: 20px; overflow: hidden;">
            <div style="background: #3498db; height: 100%; width: ${percentage}%; transition: width 0.3s;"></div>
        </div>
    `;
}

// ===== AFFICHAGE =====

// append=true : on vient d'ajouter des donnes à la suite des existantes — on ne réinitialise
// PAS le double mort (les calculs déjà faits ou en cours pour les anciennes donnes restent valables).
function renderDeals(append = false) {
    const container = document.getElementById('dealsContainer');
    document.getElementById('resultsTitle').textContent = `${generatedDeals.length} donne(s) générée(s)`;
    
    if (!append) {
        resetDoubleDummyForNewGeneration();
    }
    
    container.innerHTML = generatedDeals.map((deal, idx) => {
        const boardNumber = idx + 1;
        let { dealer, vulnerable } = getDealerAndVulnerability(boardNumber);
        
        // Si la donne a été pivotée à 180°, inverser le donneur
        if (deal._rotated) {
            const dealerMap = { 'N': 'S', 'S': 'N', 'E': 'W', 'W': 'E' };
            dealer = dealerMap[dealer];
        }
        
        const renderHand = (pos, posClass) => {
            const hand = deal[pos];
            
            return `
                <div class="hand ${posClass}">
                    <div class="hand-cards">
                        <div class="card-line">
                            <span class="suit-symbol spades">♠</span>
                            <span class="cards">${formatCardsForDisplay(hand.SPADES) || '—'}</span>
                        </div>
                        <div class="card-line">
                            <span class="suit-symbol hearts">♥</span>
                            <span class="cards">${formatCardsForDisplay(hand.HEARTS) || '—'}</span>
                        </div>
                        <div class="card-line">
                            <span class="suit-symbol diamonds">♦</span>
                            <span class="cards">${formatCardsForDisplay(hand.DIAMONDS) || '—'}</span>
                        </div>
                        <div class="card-line">
                            <span class="suit-symbol clubs">♣</span>
                            <span class="cards">${formatCardsForDisplay(hand.CLUBS) || '—'}</span>
                        </div>
                    </div>
                </div>
            `;
        };
        
        let vulnDisplay;
        if (vulnerable === 'None') {
            vulnDisplay = '<span class="vuln-text">Vul : Pers</span>';
        } else if (vulnerable === 'Both') {
            vulnDisplay = '<span class="vuln-all">Vul : Tous</span>';
        } else if (vulnerable === 'NS') {
            vulnDisplay = '<span class="vuln-text">Vul</span> : <span class="vuln-red">NS</span>';
        } else {
            vulnDisplay = '<span class="vuln-text">Vul</span> : <span class="vuln-red">EO</span>';
        }
        
        const nPoints = calculateHCP(deal.N);
        const ePoints = calculateHCP(deal.E);
        const sPoints = calculateHCP(deal.S);
        const wPoints = calculateHCP(deal.W);
        
        let centerBoxClass = '';
        if (vulnerable === 'NS') {
            centerBoxClass = 'vuln-ns';
        } else if (vulnerable === 'EW') {
            centerBoxClass = 'vuln-ew';
        } else if (vulnerable === 'Both') {
            centerBoxClass = 'vuln-all';
        }
        
        return `
            <div class="deal-card" id="deal-card-${idx}">
                <div class="deal-header">
                    <div class="deal-number">Donne #${boardNumber}</div>
                    <div class="deal-header-right">
                        <div class="deal-info">
                            <div>Donneur : ${dealer}</div>
                            <div>${vulnDisplay}</div>
                        </div>
                        <div class="deal-download-wrapper">
                            <button type="button" class="deal-download-btn" title="Télécharger cette donne" onclick="toggleDealDownloadMenu(event, ${idx})">⬇</button>
                            <div class="deal-download-menu" id="deal-download-menu-${idx}">
                                <button type="button" onclick="downloadDealAsPBN(${idx}); closeAllDealDownloadMenus();">PBN</button>
                                <button type="button" onclick="downloadDealAsLIN(${idx}); closeAllDealDownloadMenus();">LIN</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="deal-visual">
                    <div class="deal-grid">
                        ${renderHand('N', 'north')}
                        ${renderHand('W', 'west')}
                        <div class="center-box ${centerBoxClass}">${boardNumber}</div>
                        ${renderHand('E', 'east')}
                        ${renderHand('S', 'south')}
                    </div>
                    <div class="all-points">
                        <div class="point-item point-n">${nPoints}</div>
                        <div class="point-item point-e">${ePoints}</div>
                        <div class="point-item point-center">${boardNumber}</div>
                        <div class="point-item point-s">${sPoints}</div>
                        <div class="point-item point-w">${wPoints}</div>
                    </div>
                </div>
                <div class="dd-table-container" id="dd-table-${idx}">
                    ${deal._ddTable ? buildDDTableHTML(deal._ddTable, idx) : ddPlaceholderHTML(idx)}
                </div>
            </div>
        `;
    }).join('');

    // Applique le filtre par palier actuellement sélectionné (utile en mode "ajout" :
    // les nouvelles donnes doivent respecter le filtre déjà en place).
    applyDealFilter();
}

// ===== EXPORT PBN =====

// Construit le bloc PBN d'une seule donne (réutilisé pour l'export global et l'export individuel).
function buildPBNBlock(deal, boardNumber) {
    let { dealer, vulnerable } = getDealerAndVulnerability(boardNumber);

    // Si la donne a été pivotée, inverser le donneur pour l'export
    if (deal._rotated) {
        const dealerMap = { 'N': 'S', 'S': 'N', 'E': 'W', 'W': 'E' };
        dealer = dealerMap[dealer];
    }

    const hands = ['N', 'E', 'S', 'W'].map(pos => {
        return SUITS.map(suit => deal[pos][suit].join('')).join('.');
    }).join(' ');

    let pbn = '';
    pbn += `[Event "Generated Deal"]\n`;
    pbn += `[Site "Bridge Generator"]\n`;
    pbn += `[Board "${boardNumber}"]\n`;
    pbn += `[Dealer "${dealer}"]\n`;
    pbn += `[Vulnerable "${vulnerable}"]\n`;
    pbn += `[Deal "N:${hands}"]\n\n`;
    return pbn;
}

function downloadBlob(content, mimeType, filename) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function exportToPBN() {
    let pbn = '';
    generatedDeals.forEach((deal, idx) => {
        pbn += buildPBNBlock(deal, idx + 1);
    });
    downloadBlob(pbn, 'text/plain', 'bridge_deals.pbn');
}

// Télécharge une seule donne au format PBN (bouton ⬇ sur la carte de la donne)
function downloadDealAsPBN(idx) {
    if (!generatedDeals || !generatedDeals[idx]) return;
    const boardNumber = idx + 1;
    const pbn = buildPBNBlock(generatedDeals[idx], boardNumber);
    downloadBlob(pbn, 'text/plain', `donne_${boardNumber}.pbn`);
}

// ===== EXPORT LIN =====

const LIN_SUIT_LETTERS = { SPADES: 'S', HEARTS: 'H', DIAMONDS: 'D', CLUBS: 'C' };
const LIN_DEALER_NUM_MAP = { 'S': '1', 'W': '2', 'N': '3', 'E': '4' };
const LIN_VULN_MAP = { 'None': '-', 'NS': 'n', 'EW': 'e', 'Both': 'b' };

// Construit la ligne LIN "qx|..." d'une seule donne (réutilisé pour l'export global et individuel).
function buildLINBlock(deal, boardNumber) {
    let { dealer, vulnerable } = getDealerAndVulnerability(boardNumber);

    // Si la donne a été pivotée, inverser le donneur pour l'export
    if (deal._rotated) {
        const dealerMap = { 'N': 'S', 'S': 'N', 'E': 'W', 'W': 'E' };
        dealer = dealerMap[dealer];
    }

    const dealerNum = LIN_DEALER_NUM_MAP[dealer];
    const vulnCode = LIN_VULN_MAP[vulnerable];

    // Le format LIN attend Sud, Ouest puis Nord (Est est déduit des 3 autres mains)
    const positions = ['S', 'W', 'N'];
    const hands = positions.map(pos => {
        return SUITS.map(suit => LIN_SUIT_LETTERS[suit] + deal[pos][suit].join('')).join('');
    }).join(',');

    return `qx|o${boardNumber}|md|${dealerNum}${hands}|sv|${vulnCode}|pg||\n`;
}

function exportToLIN() {
    let lin = 'pn|South,West,North,East|\n';
    generatedDeals.forEach((deal, idx) => {
        lin += buildLINBlock(deal, idx + 1);
    });
    downloadBlob(lin, 'text/plain', 'bridge_deals.lin');
}

// Télécharge une seule donne au format LIN (bouton ⬇ sur la carte de la donne)
function downloadDealAsLIN(idx) {
    if (!generatedDeals || !generatedDeals[idx]) return;
    const boardNumber = idx + 1;
    const lin = 'pn|South,West,North,East|\n' + buildLINBlock(generatedDeals[idx], boardNumber);
    downloadBlob(lin, 'text/plain', `donne_${boardNumber}.lin`);
}

// ===== Menu de téléchargement individuel (bouton ⬇ sur chaque carte de donne) =====

function closeAllDealDownloadMenus() {
    document.querySelectorAll('.deal-download-menu.open').forEach(menu => menu.classList.remove('open'));
}

function toggleDealDownloadMenu(event, idx) {
    event.stopPropagation();
    const menu = document.getElementById(`deal-download-menu-${idx}`);
    if (!menu) return;
    const wasOpen = menu.classList.contains('open');
    closeAllDealDownloadMenus();
    if (!wasOpen) menu.classList.add('open');
}

// Ferme le menu ouvert dès qu'on clique n'importe où ailleurs sur la page.
document.addEventListener('click', closeAllDealDownloadMenus);

// ===== STATISTIQUES =====

function factorial(n) {
    let f = 1;
    for (let i = 2; i <= n; i++) f *= i;
    return f;
}

function nCr(n, r) {
    if (r < 0 || r > n) return 0;
    let result = 1;
    for (let i = 0; i < r; i++) {
        result *= (n - i) / (i + 1);
    }
    return result;
}

// Calcule le tableau théorique des probabilités de forme (39 formes possibles),
// en pourcentage, à partir d'un calcul combinatoire exact (indépendant du nombre
// de donnes générées : c'est la probabilité "vraie" pour une main tirée au hasard).
function getTheoreticalShapeTable() {
    const total52 = nCr(52, 13);
    const shapes = [];

    for (let a = 13; a >= 0; a--) {
        for (let b = 0; b <= a; b++) {
            for (let c = 0; c <= b; c++) {
                const d = 13 - a - b - c;
                if (d < 0 || d > c) continue;

                const counts = {};
                [a, b, c, d].forEach(v => counts[v] = (counts[v] || 0) + 1);
                let denom = 1;
                for (const k in counts) denom *= factorial(counts[k]);
                const perm = factorial(4) / denom;

                const prob = perm * nCr(13, a) * nCr(13, b) * nCr(13, c) * nCr(13, d) / total52;
                shapes.push({ pattern: `${a}${b}${c}${d}`, percent: prob * 100 });
            }
        }
    }

    shapes.sort((x, y) => y.percent - x.percent);
    return shapes;
}

// Calcule les statistiques réelles à partir des donnes générées :
// - décompte des honneurs (As/Rois/Dames/Valets) et H moyen par position
// - décompte des formes de main (4333, 4432, etc.)
function computeGeneratedStats() {
    const positions = ['N', 'E', 'S', 'W'];
    const shapeCounts = {};
    const honorCounts = {
        N: { A: 0, K: 0, Q: 0, J: 0 },
        E: { A: 0, K: 0, Q: 0, J: 0 },
        S: { A: 0, K: 0, Q: 0, J: 0 },
        W: { A: 0, K: 0, Q: 0, J: 0 }
    };
    const hcpSums = { N: 0, E: 0, S: 0, W: 0 };

    generatedDeals.forEach(deal => {
        positions.forEach(pos => {
            const hand = deal[pos];

            const pattern = getDistribution(hand);
            shapeCounts[pattern] = (shapeCounts[pattern] || 0) + 1;

            hcpSums[pos] += calculateHCP(hand);

            for (const suit of SUITS) {
                for (const card of hand[suit]) {
                    if (card === 'A') honorCounts[pos].A++;
                    else if (card === 'K') honorCounts[pos].K++;
                    else if (card === 'Q') honorCounts[pos].Q++;
                    else if (card === 'J') honorCounts[pos].J++;
                }
            }
        });
    });

    const nbDeals = generatedDeals.length;
    const avgHCP = {};
    positions.forEach(pos => avgHCP[pos] = nbDeals > 0 ? (hcpSums[pos] / nbDeals) : 0);

    return { shapeCounts, honorCounts, avgHCP, nbDeals };
}

function renderStatsHonorsTable(stats) {
    const posLabels = { S: 'Sud', N: 'Nord', W: 'Ouest', E: 'Est' };
    const posOrder = ['S', 'N', 'W', 'E'];

    const row = (label, key) => `
        <tr>
            <td>${label}</td>
            ${posOrder.map(p => `<td>${stats.honorCounts[p][key]}</td>`).join('')}
        </tr>
    `;

    const avgNS = stats.avgHCP.N + stats.avgHCP.S;
    const avgEW = stats.avgHCP.E + stats.avgHCP.W;

    return `
        <table class="stats-table">
            <thead>
                <tr><th></th>${posOrder.map(p => `<th>${posLabels[p]}</th>`).join('')}</tr>
            </thead>
            <tbody>
                ${row('As', 'A')}
                ${row('Roi', 'K')}
                ${row('Dame', 'Q')}
                ${row('Valet', 'J')}
                <tr class="stats-total-row">
                    <td>H moyen</td>
                    ${posOrder.map(p => `<td>${stats.avgHCP[p].toFixed(2)}</td>`).join('')}
                </tr>
            </tbody>
        </table>
        <div class="stats-cumulated-hcp">
            <span><strong>H cumulés Nord-Sud :</strong> ${avgNS.toFixed(2)}</span>
            <span><strong>H cumulés Est-Ouest :</strong> ${avgEW.toFixed(2)}</span>
        </div>
    `;
}

function renderStatsShapeTable(stats, theoreticalShapes) {
    const nbHands = stats.nbDeals * 4;

    const rows = theoreticalShapes
        .filter(s => (stats.shapeCounts[s.pattern] || 0) > 0)
        .map(s => {
            const count = stats.shapeCounts[s.pattern] || 0;
            const pctReal = nbHands > 0 ? (count / nbHands) * 100 : 0;
            return { pattern: s.pattern, count, pctReal, pctTheo: s.percent };
        });

    return `
        <table class="stats-table">
            <thead>
                <tr><th>Main</th><th>Nombre</th><th>% réel</th><th>% théorique</th></tr>
            </thead>
            <tbody>
                ${rows.map(r => `
                    <tr>
                        <td>${r.pattern}</td>
                        <td>${r.count}</td>
                        <td>${r.pctReal.toFixed(2)}</td>
                        <td>${r.pctTheo.toFixed(2)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function openStatsModal() {
    if (generatedDeals.length === 0) {
        alert('Générez d\'abord des donnes pour voir les statistiques.');
        return;
    }

    const stats = computeGeneratedStats();
    const theoreticalShapes = getTheoreticalShapeTable();

    document.getElementById('statsSubtitle').textContent =
        `Basé sur ${stats.nbDeals} donne(s) générée(s) (${stats.nbDeals * 4} mains)`;
    document.getElementById('statsHonorsBody').innerHTML = renderStatsHonorsTable(stats);
    document.getElementById('statsShapeBody').innerHTML = renderStatsShapeTable(stats, theoreticalShapes);

    document.getElementById('statsModal').style.display = 'block';
}

function closeStatsModal() {
    document.getElementById('statsModal').style.display = 'none';
}

// ===== GESTION DU THÈME =====

// Sauvegarde une préférence (essaie window.storage puis localStorage, silencieux si aucun des deux
// n'est disponible — ex: navigation privée).
async function persistPreference(key, value) {
    try {
        if (window.storage) {
            await window.storage.set(key, value);
            return;
        }
    } catch (e) {
        // window.storage indisponible ou en échec, on retente avec localStorage ci-dessous
    }
    try {
        localStorage.setItem(key, value);
    } catch (err) {
        console.log(`Impossible de sauvegarder la préférence "${key}"`);
    }
}

async function toggleTheme() {
    const body = document.body;
    const themeIcon = document.getElementById('themeIcon');
    
    body.classList.toggle('dark-mode');
    
    if (body.classList.contains('dark-mode')) {
        themeIcon.textContent = '☀️';
        currentTheme = 'dark';
    } else {
        themeIcon.textContent = '🌙';
        currentTheme = 'light';
    }
    await persistPreference('bridge-theme', currentTheme);
}

async function loadSavedTheme() {
    let savedTheme = null;
    
    // Essayer window.storage d'abord (Claude.ai)
    if (window.storage) {
        try {
            const result = await window.storage.get('bridge-theme');
            if (result && result.value) {
                savedTheme = result.value;
            }
        } catch (e) {
            // Pas de thème sauvegardé dans window.storage
        }
    }
    
    // Si pas trouvé, essayer localStorage (local)
    if (!savedTheme) {
        try {
            savedTheme = localStorage.getItem('bridge-theme');
        } catch (e) {
            // localStorage pas disponible
        }
    }
    
    // Appliquer le thème sauvegardé
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        const themeIcon = document.getElementById('themeIcon');
        if (themeIcon) {
            themeIcon.textContent = '☀️';
        }
        currentTheme = 'dark';
    }
}

// ===== GESTION DE LA NOTATION DES CARTES (EN / FR) =====

async function toggleCardNotation() {
    cardNotation = (cardNotation === 'FR') ? 'EN' : 'FR';

    const notationBtn = document.getElementById('cardNotationBtn');
    if (notationBtn) {
        notationBtn.textContent = cardNotation === 'FR' ? 'FR' : 'EN';
    }

    await persistPreference('bridge-card-notation', cardNotation);

    // Si des donnes sont déjà affichées, les redessiner pour appliquer la nouvelle notation
    // (renderDeals réaffiche directement les tableaux de double mort déjà calculés).
    if (generatedDeals && generatedDeals.length > 0) {
        renderDeals(true);
    }
}

async function loadSavedCardNotation() {
    let saved = null;

    if (window.storage) {
        try {
            const result = await window.storage.get('bridge-card-notation');
            if (result && result.value) saved = result.value;
        } catch (e) {
            // Pas de préférence sauvegardée dans window.storage
        }
    }

    if (!saved) {
        try {
            saved = localStorage.getItem('bridge-card-notation');
        } catch (e) {
            // localStorage pas disponible
        }
    }

    if (saved === 'FR') {
        cardNotation = 'FR';
        const notationBtn = document.getElementById('cardNotationBtn');
        if (notationBtn) {
            notationBtn.textContent = 'FR';
        }
    }
}

// ===== INITIALISATION =====

window.addEventListener('DOMContentLoaded', async () => {
    // Charger le thème et la notation des cartes sauvegardés
    await loadSavedTheme();
    await loadSavedCardNotation();
    
    // Initialiser l'affichage des contraintes
    if (typeof renderConstraints === 'function') {
        renderConstraints();
    }
});
