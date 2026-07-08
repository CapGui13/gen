// modal.js - Gestion des modales et presets de contraintes
//
// ===== SYSTÈME DE CONTRAINTES =====
// Deux types de contraintes affichées dans des modales :
// 1. MAIN (position + HCP) : une main spécifique (N, E, S, W) ou une LIGNE (NS, EW).
//    Chaque contrainte = sélection position + plage HCP (min/max ou discrète).
// 2. DISTRIBUTION : pattern de longueurs de couleurs (regex-like : 5332, 54xx, 6+, etc.).
//    Supports présets groupés (Régulières, Bicolores, Unicolore, etc.) pour accès rapide.
//
// ===== ARCHITECTURE =====
// - constraints[] (global dans generator.js) : stocke {id, type, position, hcp, ...} pour chaque contrainte
// - Chaque contrainte a un ID unique (timestamp) pour édition/suppression
// - pendingOrTarget : state temporaire pendant l'édition d'une contrainte
// - Sauvegarde dans index.html : div#constraintsList (rendu dynamique)
//
// ===== MODALES PRINCIPALES =====
// 1. handConstraintsModal : HCP min/max (curseurs), operator (AND/OR pour plusieurs plages)
// 2. distributionPresetModal : groupes de checkboxes (Régulières, Bicolores, Unicolore, etc.)
//    avec légende "D'autres combinaisons..." rappelant les notations avancées (M5m4, etc.)
//
// ===== PRESETS DE DISTRIBUTION =====
// DISTRIBUTION_PRESET_GROUPS : 4 groupes definis :
//  - Régulières : 4333, 4432, 5332, 4441
//  - Bicolores : 54xx, 5422, 5431
//  - Unicolore : 6, 6+, 7, 7+, 8, 8+
//  - Bicolores excentrés : 54+, 55xx, 64xx, 65xx, 66xx
//  - Courte : 1 (singleton), 0 (chicane)
// Présets coechés se convertissent en string de pattern (ex: "54xx 5422 5431") ajoutée au champ dist.
//
// ===== NOTATION DES DISTRIBUTIONS =====
// Support avancé pour notations précises (input manuel) :
//  - 54xx, 55xx, 64xx : bicolores (tout 4 cartes dans mineure possible)
//  - 54+, 55+, 64+ : bicolores avec seuil (au moins)
//  - 5+, 6+, 7+ : unicolore (nombre min de cartes dans une couleur)
//  - 6, 7, 8 : unicolore exact (exactement N cartes dans une couleur)
//  - 1, 0 : courte (singleton / chicane)
//  - M5m4, M6m4, M5m5 : majeure/mineure spécifiée (M=majeure, m=mineure)
// Validation : validateDistributionString() rejette patterns invalides.
//
// ===== DÉPENDANCES =====
// - generator.js : constraints[], checkAllConstraints(), renderConstraints()
// - index.html : div#constraintsList, modales HTML (handConstraintsModal, distributionPresetModal)
// - styles.css : thèmes pour modales (.modal-content, .modal-header, etc.)

function openHandConstraintsModal() {
    const modal = document.getElementById('handConstraintsModal');
    if (modal) {
        modal.style.display = 'block';
        const focusPos = (pendingOrTarget && pendingOrTarget.type === 'hand') ? pendingOrTarget.position.toLowerCase() : 'n';
        const firstField = document.getElementById(`modal-${focusPos}-hcp`);
        if (firstField) firstField.focus();
    } else {
        console.error('Modal des contraintes de main non trouvée');
        alert('Erreur : Les modales ne sont pas encore chargées. Veuillez réessayer dans un instant.');
    }
}

// Ferme la modal sans rien défaire (utilisé après une sauvegarde réussie)
function closeHandConstraintsModal() {
    document.getElementById('handConstraintsModal').style.display = 'none';
}

// Ferme la modal en annulant : si on était en train d'ajouter une variante OU non encore sauvegardée,
// on annule aussi la conversion AND->OR faite sur la contrainte d'origine
function cancelHandConstraintsModal() {
    if (pendingEditBackup && pendingEditBackup.type === 'hand') {
        // On restaure la contrainte qu'on était en train de modifier, non sauvegardée
        constraints.push(pendingEditBackup.constraint);
        pendingEditBackup = null;
        renderConstraints();
    } else if (pendingOrTarget && pendingOrTarget.type === 'hand') {
        const siblings = constraints.filter(c => c.type === 'hand' && c.position === pendingOrTarget.position && c.operator === 'OR');
        if (siblings.length === 1) {
            siblings[0].operator = 'AND';
            renderConstraints();
        }
    }
    pendingOrTarget = null;
    closeHandConstraintsModal();
}

function openLineConstraintsModal() {
    const modal = document.getElementById('lineConstraintsModal');
    if (modal) {
        modal.style.display = 'block';
        const focusLine = (pendingOrTarget && pendingOrTarget.type === 'line') ? pendingOrTarget.line.toLowerCase() : 'ns';
        const firstField = document.getElementById(`line-${focusLine}-hcp`);
        if (firstField) firstField.focus();
    } else {
        console.error('Modal des contraintes de ligne non trouvée');
        alert('Erreur : Les modales ne sont pas encore chargées. Veuillez réessayer dans un instant.');
    }
}

// Ferme la modal sans rien défaire (utilisé après une sauvegarde réussie)
function closeLineConstraintsModal() {
    document.getElementById('lineConstraintsModal').style.display = 'none';
}

// Ferme la modal en annulant : même logique que cancelHandConstraintsModal, pour les lignes
function cancelLineConstraintsModal() {
    if (pendingEditBackup && pendingEditBackup.type === 'line') {
        // On restaure la contrainte qu'on était en train de modifier, non sauvegardée
        constraints.push(pendingEditBackup.constraint);
        pendingEditBackup = null;
        renderConstraints();
    } else if (pendingOrTarget && pendingOrTarget.type === 'line') {
        const siblings = constraints.filter(c => c.type === 'line' && c.line === pendingOrTarget.line && c.operator === 'OR');
        if (siblings.length === 1) {
            siblings[0].operator = 'AND';
            renderConstraints();
        }
    }
    pendingOrTarget = null;
    closeLineConstraintsModal();
}

function openBiddingSequenceModal() {
    const modal = document.getElementById('biddingSequenceModal');
    if (modal) {
        modal.style.display = 'block';
        populateSefSequencesList();
        const firstField = document.getElementById('biddingSequenceText');
        if (firstField) firstField.focus();
    } else {
        console.error('Modal de séquence d\'enchères non trouvée');
        alert('Erreur : Les modales ne sont pas encore chargées. Veuillez réessayer dans un instant.');
    }
}

// Convertit une clé normalisée ("1P-2P-4P") vers le format de saisie attendu ("1P 2P / 4P")
function sefKeyToDisplayFormat(key) {
    const parts = key.split('-');
    if (parts.length <= 1) return key;
    return parts.slice(0, -1).join(' ') + ' / ' + parts[parts.length - 1];
}

// Remplit la datalist d'autocomplete avec les séquences connues de la base SEF
function populateSefSequencesList() {
    const datalist = document.getElementById('sefSequencesList');
    if (!datalist || typeof SEF_SEQUENCES === 'undefined') return;
    
    datalist.innerHTML = Object.keys(SEF_SEQUENCES)
        .map(key => `<option value="${sefKeyToDisplayFormat(key)}"></option>`)
        .join('');
}

function closeBiddingSequenceModal() {
    document.getElementById('biddingSequenceModal').style.display = 'none';
}

function updateBiddingForm() {
    const seqType = document.querySelector('input[name="seqType"]:checked');
    if (seqType) {
        const opponentSection = document.getElementById('opponentConstraints');
        if (opponentSection) {
            opponentSection.style.display = seqType.value === '4' ? 'block' : 'none';
        }
    }
}

// Parse une plage simple : "12-14", "12 14", "12+", "15-", "12"
function parseRange(value, defaultMax) {
    if (!value || value.trim() === '') {
        return { min: 0, max: defaultMax };
    }
    
    value = value.trim();
    
    if (value.endsWith('-')) {
        const max = parseInt(value.slice(0, -1));
        return { min: 0, max: isNaN(max) ? defaultMax : max };
    }
    
    if (value.endsWith('+')) {
        const min = parseInt(value.slice(0, -1));
        return { min: isNaN(min) ? 0 : min, max: defaultMax };
    }
    
    // Plage avec tiret : "12-14"
    if (value.includes('-')) {
        const parts = value.split('-').map(p => p.trim()).filter(p => p !== '');
        if (parts.length === 2 && !isNaN(parseInt(parts[0])) && !isNaN(parseInt(parts[1]))) {
            return { min: parseInt(parts[0]), max: parseInt(parts[1]) };
        }
    }
    
    // Plage avec espace : "12 14"
    const parts = value.split(/\s+/);
    if (parts.length === 2 && !isNaN(parseInt(parts[0])) && !isNaN(parseInt(parts[1]))) {
        return { min: parseInt(parts[0]), max: parseInt(parts[1]) };
    }
    
    // Valeur unique : "12"
    if (parts.length === 1 && !isNaN(parseInt(parts[0]))) {
        const val = parseInt(parts[0]);
        return { min: val, max: val };
    }
    
    return { min: 0, max: defaultMax };
}

// Quand défini, limite la prochaine sauvegarde de modal à une seule position/ligne,
// forcée en operator 'OR' (utilisé par le bouton "🔀 OU" sur une contrainte existante)
let pendingOrTarget = null;

// Quand on édite une contrainte existante (editHandConstraint/editLineConstraint), elle est retirée
// du tableau en attendant la sauvegarde. Si l'utilisateur annule, on la restaure via cette variable
// plutôt que de la perdre définitivement.
let pendingEditBackup = null;

// Parse une contrainte avec support du "OU" pour des plages disjointes
// Ex: "12-14 OU 18+" => { ranges: [{min:12,max:14}, {min:18,max:defaultMax}] }
function parseConstraintRanges(value, defaultMax) {
    if (!value || value.trim() === '') {
        return { min: 0, max: defaultMax };
    }
    
    const segments = value.split(/\s+OU\s+/i).map(s => s.trim()).filter(s => s !== '');
    
    if (segments.length <= 1) {
        return parseRange(value, defaultMax);
    }
    
    return { ranges: segments.map(seg => parseRange(seg, defaultMax)) };
}

function parseConstraintValue(value) {
    return parseConstraintRanges(value, 13);
}

function parseConstraintValueHCP(value) {
    return parseConstraintRanges(value, 40);
}

function saveHandConstraints() {
    const allPositions = ['n', 'e', 's', 'w'];
    const positionNames = { 'n': 'N', 'e': 'E', 's': 'S', 'w': 'W' };
    
    // Si on ajoute une variante OU pour une position précise, on ne traite que celle-ci
    const isAddingOrVariant = pendingOrTarget && pendingOrTarget.type === 'hand';
    const positions = isAddingOrVariant ? [pendingOrTarget.position.toLowerCase()] : allPositions;
    
    // Valider la syntaxe des distributions avant toute création de contrainte
    const invalidByPos = [];
    for (const pos of positions) {
        const dist = document.getElementById(`modal-${pos}-dist`).value;
        const { valid, invalidTokens } = validateDistributionString(dist);
        if (!valid) invalidByPos.push(`${positionNames[pos]} : ${invalidTokens.join(', ')}`);
    }
    if (invalidByPos.length > 0) {
        alert(`⚠️ Distribution non reconnue :\n\n${invalidByPos.join('\n')}\n\nFormats acceptés : 5431, 55xx, 6+, 54+, M5, M5+, M44, M54+, M5m4, ...`);
        return;
    }
    
    for (const pos of positions) {
        const pointType = document.querySelector(`input[name="hand-${pos}-pointType"]:checked`)?.value || 'hcp';
        const spades = document.getElementById(`modal-${pos}-spades`).value;
        const hearts = document.getElementById(`modal-${pos}-hearts`).value;
        const diamonds = document.getElementById(`modal-${pos}-diamonds`).value;
        const clubs = document.getElementById(`modal-${pos}-clubs`).value;
        const hcp = document.getElementById(`modal-${pos}-hcp`).value;
        const dist = document.getElementById(`modal-${pos}-dist`).value;
        
        if (spades || hearts || diamonds || clubs || hcp || dist) {
            const constraint = {
                id: Date.now() + Math.random(),
                type: 'hand',
                position: positionNames[pos],
                operator: isAddingOrVariant ? 'OR' : 'AND',
                pointType: pointType,
                hcp: parseConstraintValueHCP(hcp),
                suits: {
                    SPADES: parseConstraintValue(spades),
                    HEARTS: parseConstraintValue(hearts),
                    DIAMONDS: parseConstraintValue(diamonds),
                    CLUBS: parseConstraintValue(clubs)
                },
                distributions: dist.trim()
            };
            constraints.push(constraint);
        } else if (isAddingOrVariant) {
            alert('Veuillez remplir au moins un champ pour créer la variante OU.');
            return;
        }
    }
    
    renderConstraints();
    closeHandConstraintsModal();
    
    for (const pos of positions) {
        document.getElementById(`modal-${pos}-spades`).value = '';
        document.getElementById(`modal-${pos}-hearts`).value = '';
        document.getElementById(`modal-${pos}-diamonds`).value = '';
        document.getElementById(`modal-${pos}-clubs`).value = '';
        document.getElementById(`modal-${pos}-hcp`).value = '';
        document.getElementById(`modal-${pos}-dist`).value = '';
        const hcpRadio = document.querySelector(`input[name="hand-${pos}-pointType"][value="hcp"]`);
        if (hcpRadio) hcpRadio.checked = true;
    }
    
    pendingOrTarget = null;
    pendingEditBackup = null;
}

function saveLineConstraints() {
    const allLines = ['ns', 'ew'];
    const lineNames = { 'ns': 'NS', 'ew': 'EW' };
    
    const isAddingOrVariant = pendingOrTarget && pendingOrTarget.type === 'line';
    const lines = isAddingOrVariant ? [pendingOrTarget.line.toLowerCase()] : allLines;
    
    for (const line of lines) {
        const pointType = document.querySelector(`input[name="line-${line}-pointType"]:checked`)?.value || 'hcp';
        const hcp = document.getElementById(`line-${line}-hcp`).value;
        const spadesFit = document.getElementById(`line-${line}-spades-fit`).value;
        const heartsFit = document.getElementById(`line-${line}-hearts-fit`).value;
        const diamondsFit = document.getElementById(`line-${line}-diamonds-fit`).value;
        const clubsFit = document.getElementById(`line-${line}-clubs-fit`).value;
        
        if (hcp || spadesFit || heartsFit || diamondsFit || clubsFit) {
            const constraint = {
                id: Date.now() + Math.random(),
                type: 'line',
                line: lineNames[line],
                operator: isAddingOrVariant ? 'OR' : 'AND',
                pointType: pointType,
                hcp: parseConstraintValueHCP(hcp),
                fits: {
                    SPADES: parseConstraintValue(spadesFit),
                    HEARTS: parseConstraintValue(heartsFit),
                    DIAMONDS: parseConstraintValue(diamondsFit),
                    CLUBS: parseConstraintValue(clubsFit)
                }
            };
            constraints.push(constraint);
        } else if (isAddingOrVariant) {
            alert('Veuillez remplir au moins un champ pour créer la variante OU.');
            return;
        }
    }
    
    renderConstraints();
    closeLineConstraintsModal();
    
    for (const line of lines) {
        document.getElementById(`line-${line}-hcp`).value = '';
        document.getElementById(`line-${line}-spades-fit`).value = '';
        document.getElementById(`line-${line}-hearts-fit`).value = '';
        document.getElementById(`line-${line}-diamonds-fit`).value = '';
        document.getElementById(`line-${line}-clubs-fit`).value = '';
        const hcpRadio = document.querySelector(`input[name="line-${line}-pointType"][value="hcp"]`);
        if (hcpRadio) hcpRadio.checked = true;
    }
    
    pendingOrTarget = null;
    pendingEditBackup = null;
}

function saveBiddingSequence() {
    const seqType = document.querySelector('input[name="seqType"]:checked').value;
    const openerSide = document.querySelector('input[name="openerSide"]:checked').value;
    const sequenceText = document.getElementById('biddingSequenceText').value.trim();
    
    if (!sequenceText) {
        alert('Veuillez saisir une séquence d\'enchères');
        return;
    }
    
    // Normaliser la séquence : enlever le "/" et remplacer les espaces par des tirets,
    // puis convertir les symboles ♠♥♦♣ en P/C/K/T
    let normalizedSequence = sequenceText.replace(/\s*\/\s*/g, '-').replace(/\s+/g, '-').trim();
    if (typeof normalizeSequence === 'function') {
        normalizedSequence = normalizeSequence(normalizedSequence);
    }
    
    const openerPos = openerSide === 'NS' ? 'N' : 'E';
    const responderPos = openerSide === 'NS' ? 'S' : 'W';
    const opp1Pos = openerSide === 'NS' ? 'E' : 'S';
    const opp2Pos = openerSide === 'NS' ? 'W' : 'N';
    
    // Vérifier si la séquence existe dans la base SEF
    let autoConstraints = null;
    if (typeof getSequenceConstraints === 'function') {
        autoConstraints = getSequenceConstraints(normalizedSequence);
        
        if (autoConstraints.found) {
            // Utiliser les contraintes automatiques de la base SEF
            if (autoConstraints.opener) {
                const openerConstraint = createConstraintFromSEF(
                    openerPos, 
                    autoConstraints.opener, 
                    normalizedSequence, 
                    'Ouvreur'
                );
                constraints.push(openerConstraint);
            }
            
            if (autoConstraints.responder) {
                const responderConstraint = createConstraintFromSEF(
                    responderPos, 
                    autoConstraints.responder, 
                    normalizedSequence, 
                    'Répondant'
                );
                constraints.push(responderConstraint);
            }
            
            // Afficher un message de confirmation
            alert(`✅ Séquence "${sequenceText}" reconnue !\n\nContraintes automatiques appliquées selon le SEF.`);
            renderConstraints();
            closeBiddingSequenceModal();
            resetBiddingForm();
            return;
        } else {
            // Séquence non reconnue, utiliser les contraintes manuelles
            alert(`⚠️ Séquence "${sequenceText}" non reconnue dans la base SEF.\n\nFormat normalisé recherché : "${normalizedSequence}"\n\nVous pouvez saisir les contraintes manuellement ci-dessous.`);
        }
    }
    
    // Mode manuel : utiliser les contraintes saisies par l'utilisateur
    
    // Valider la syntaxe des distributions avant toute création de contrainte
    const distFieldLabels = {
        bidOpenerDist: 'Ouvreur',
        bidResponderDist: 'Répondant',
        bidOpp1Dist: 'Adversaire 1',
        bidOpp2Dist: 'Adversaire 2'
    };
    const distFieldsToCheck = ['bidOpenerDist', 'bidResponderDist'];
    if (seqType === '4') {
        distFieldsToCheck.push('bidOpp1Dist', 'bidOpp2Dist');
    }
    const invalidByField = [];
    for (const fieldId of distFieldsToCheck) {
        const { valid, invalidTokens } = validateDistributionString(document.getElementById(fieldId).value);
        if (!valid) invalidByField.push(`${distFieldLabels[fieldId]} : ${invalidTokens.join(', ')}`);
    }
    if (invalidByField.length > 0) {
        alert(`⚠️ Distribution non reconnue :\n\n${invalidByField.join('\n')}\n\nFormats acceptés : 5431, 55xx, 6+, 54+, M5, M5+, M44, M54+, M5m4, ...`);
        return;
    }
    
    const openerPointType = document.querySelector('input[name="bidOpenerPointType"]:checked')?.value || 'hl';
    const openerHcp = document.getElementById('bidOpenerHcp').value;
    const openerSpades = document.getElementById('bidOpenerSpades').value;
    const openerHearts = document.getElementById('bidOpenerHearts').value;
    const openerDiamonds = document.getElementById('bidOpenerDiamonds').value;
    const openerClubs = document.getElementById('bidOpenerClubs').value;
    const openerDist = document.getElementById('bidOpenerDist').value;
    
    if (openerHcp || openerSpades || openerHearts || openerDiamonds || openerClubs || openerDist) {
        const constraint = {
            id: Date.now() + Math.random(),
            type: 'hand',
            position: openerPos,
            operator: 'AND',
            pointType: openerPointType,
            hcp: parseConstraintValueHCP(openerHcp),
            suits: {
                SPADES: parseConstraintValue(openerSpades),
                HEARTS: parseConstraintValue(openerHearts),
                DIAMONDS: parseConstraintValue(openerDiamonds),
                CLUBS: parseConstraintValue(openerClubs)
            },
            distributions: openerDist,
            biddingSequence: normalizedSequence,
            biddingRole: 'Ouvreur'
        };
        constraints.push(constraint);
    }
    
    const responderPointType = document.querySelector('input[name="bidResponderPointType"]:checked')?.value || 'hld';
    const responderHcp = document.getElementById('bidResponderHcp').value;
    const responderSpades = document.getElementById('bidResponderSpades').value;
    const responderHearts = document.getElementById('bidResponderHearts').value;
    const responderDiamonds = document.getElementById('bidResponderDiamonds').value;
    const responderClubs = document.getElementById('bidResponderClubs').value;
    const responderDist = document.getElementById('bidResponderDist').value;
    
    if (responderHcp || responderSpades || responderHearts || responderDiamonds || responderClubs || responderDist) {
        const constraint = {
            id: Date.now() + Math.random(),
            type: 'hand',
            position: responderPos,
            operator: 'AND',
            pointType: responderPointType,
            hcp: parseConstraintValueHCP(responderHcp),
            suits: {
                SPADES: parseConstraintValue(responderSpades),
                HEARTS: parseConstraintValue(responderHearts),
                DIAMONDS: parseConstraintValue(responderDiamonds),
                CLUBS: parseConstraintValue(responderClubs)
            },
            distributions: responderDist,
            biddingSequence: normalizedSequence,
            biddingRole: 'Répondant'
        };
        constraints.push(constraint);
    }
    
    if (seqType === '4') {
        const opp1PointType = document.querySelector('input[name="bidOpp1PointType"]:checked')?.value || 'hl';
        const opp1Hcp = document.getElementById('bidOpp1Hcp').value;
        const opp1Spades = document.getElementById('bidOpp1Spades').value;
        const opp1Hearts = document.getElementById('bidOpp1Hearts').value;
        const opp1Diamonds = document.getElementById('bidOpp1Diamonds').value;
        const opp1Clubs = document.getElementById('bidOpp1Clubs').value;
        const opp1Dist = document.getElementById('bidOpp1Dist').value;
        
        if (opp1Hcp || opp1Spades || opp1Hearts || opp1Diamonds || opp1Clubs || opp1Dist) {
            const constraint = {
                id: Date.now() + Math.random(),
                type: 'hand',
                position: opp1Pos,
                operator: 'AND',
                pointType: opp1PointType,
                hcp: parseConstraintValueHCP(opp1Hcp),
                suits: {
                    SPADES: parseConstraintValue(opp1Spades),
                    HEARTS: parseConstraintValue(opp1Hearts),
                    DIAMONDS: parseConstraintValue(opp1Diamonds),
                    CLUBS: parseConstraintValue(opp1Clubs)
                },
                distributions: opp1Dist,
                biddingSequence: normalizedSequence,
                biddingRole: 'Adversaire 1'
            };
            constraints.push(constraint);
        }
        
        const opp2PointType = document.querySelector('input[name="bidOpp2PointType"]:checked')?.value || 'hl';
        const opp2Hcp = document.getElementById('bidOpp2Hcp').value;
        const opp2Spades = document.getElementById('bidOpp2Spades').value;
        const opp2Hearts = document.getElementById('bidOpp2Hearts').value;
        const opp2Diamonds = document.getElementById('bidOpp2Diamonds').value;
        const opp2Clubs = document.getElementById('bidOpp2Clubs').value;
        const opp2Dist = document.getElementById('bidOpp2Dist').value;
        
        if (opp2Hcp || opp2Spades || opp2Hearts || opp2Diamonds || opp2Clubs || opp2Dist) {
            const constraint = {
                id: Date.now() + Math.random(),
                type: 'hand',
                position: opp2Pos,
                operator: 'AND',
                pointType: opp2PointType,
                hcp: parseConstraintValueHCP(opp2Hcp),
                suits: {
                    SPADES: parseConstraintValue(opp2Spades),
                    HEARTS: parseConstraintValue(opp2Hearts),
                    DIAMONDS: parseConstraintValue(opp2Diamonds),
                    CLUBS: parseConstraintValue(opp2Clubs)
                },
                distributions: opp2Dist,
                biddingSequence: normalizedSequence,
                biddingRole: 'Adversaire 2'
            };
            constraints.push(constraint);
        }
    }
    
    renderConstraints();
    closeBiddingSequenceModal();
    resetBiddingForm();
}

// Fonction pour créer une contrainte à partir des données SEF
function createConstraintFromSEF(position, sefData, sequenceText, role) {
    const constraint = {
        id: Date.now() + Math.random(),
        type: 'hand',
        position: position,
        operator: 'AND',
        biddingSequence: sequenceText,
        biddingRole: role,
        suits: {
            SPADES: { min: 0, max: 13 },
            HEARTS: { min: 0, max: 13 },
            DIAMONDS: { min: 0, max: 13 },
            CLUBS: { min: 0, max: 13 }
        }
    };
    
    // Support des contraintes OR
    if (sefData.OR) {
        constraint.OR = sefData.OR;
        return constraint;
    }

    // Déterminer le type de points (HCP, HL, ou HLD)
    if (sefData.hcp) {
        constraint.pointType = 'hcp';
        constraint.hcp = { min: sefData.hcp[0], max: sefData.hcp[1] };
    } else if (sefData.hl) {
        constraint.pointType = 'hl';
        constraint.hcp = { min: sefData.hl[0], max: sefData.hl[1] };
    } else if (sefData.hld) {
        constraint.pointType = 'hld';
        constraint.hcp = { min: sefData.hld[0], max: sefData.hld[1] };
    } else {
        constraint.pointType = 'hcp';
        constraint.hcp = { min: 0, max: 40 };
    }
    
    // Ajouter les contraintes de couleurs
    if (sefData.spades) {
        constraint.suits.SPADES = { min: sefData.spades[0], max: sefData.spades[1] };
    }
    if (sefData.hearts) {
        constraint.suits.HEARTS = { min: sefData.hearts[0], max: sefData.hearts[1] };
    }
    if (sefData.diamonds) {
        constraint.suits.DIAMONDS = { min: sefData.diamonds[0], max: sefData.diamonds[1] };
    }
    if (sefData.clubs) {
        constraint.suits.CLUBS = { min: sefData.clubs[0], max: sefData.clubs[1] };
    }
    
    // Ajouter la distribution
    constraint.distributions = sefData.distribution || '';
    
    // Ajouter les distributions exclues
    if (sefData.excludeDistributions) {
        constraint.excludeDistributions = sefData.excludeDistributions;
    }

    // Ajouter les comparaisons relatives entre couleurs
    if (sefData.suitComparison) {
        constraint.suitComparison = sefData.suitComparison;
    }
    
    return constraint;
}

// Fonction pour réinitialiser le formulaire d'enchères
function resetBiddingForm() {
    document.getElementById('biddingSequenceText').value = '';
    document.getElementById('bidOpenerHcp').value = '';
    document.getElementById('bidOpenerSpades').value = '';
    document.getElementById('bidOpenerHearts').value = '';
    document.getElementById('bidOpenerDiamonds').value = '';
    document.getElementById('bidOpenerClubs').value = '';
    document.getElementById('bidOpenerDist').value = '';
    document.getElementById('bidResponderHcp').value = '';
    document.getElementById('bidResponderSpades').value = '';
    document.getElementById('bidResponderHearts').value = '';
    document.getElementById('bidResponderDiamonds').value = '';
    document.getElementById('bidResponderClubs').value = '';
    document.getElementById('bidResponderDist').value = '';
    document.getElementById('bidOpp1Hcp').value = '';
    document.getElementById('bidOpp1Spades').value = '';
    document.getElementById('bidOpp1Hearts').value = '';
    document.getElementById('bidOpp1Diamonds').value = '';
    document.getElementById('bidOpp1Clubs').value = '';
    document.getElementById('bidOpp1Dist').value = '';
    document.getElementById('bidOpp2Hcp').value = '';
    document.getElementById('bidOpp2Spades').value = '';
    document.getElementById('bidOpp2Hearts').value = '';
    document.getElementById('bidOpp2Diamonds').value = '';
    document.getElementById('bidOpp2Clubs').value = '';
    document.getElementById('bidOpp2Dist').value = '';
}

// (L'ancienne fermeture au clic sur le fond via window.addEventListener('click', ...) a été retirée :
// elle se déclenchait aussi lors d'une sélection de texte qui dépasse le cadre de la modale.
// Voir setupOverlayCloseOnClickOutside / initOverlayCloseHandlers plus bas.)

window.addEventListener('keydown', function(event) {
    if (event.key !== 'Escape') return;
    
    const handModal = document.getElementById('handConstraintsModal');
    const lineModal = document.getElementById('lineConstraintsModal');
    const biddingModal = document.getElementById('biddingSequenceModal');
    const statsModal = document.getElementById('statsModal');
    
    if (handModal && handModal.style.display === 'block') {
        cancelHandConstraintsModal();
    } else if (lineModal && lineModal.style.display === 'block') {
        cancelLineConstraintsModal();
    } else if (biddingModal && biddingModal.style.display === 'block') {
        closeBiddingSequenceModal();
    } else if (statsModal && statsModal.style.display === 'block') {
        closeStatsModal();
    }
});

function removeConstraint(id) {
    constraints = constraints.filter(c => c.id !== id);
    renderConstraints();
}

// Démarre l'ajout d'une variante OU pour une contrainte de main existante :
// ouvre la modal vide, ciblée sur la même position, sans toucher à la contrainte d'origine
// (sauf à la convertir en OR si elle était encore en AND, pour que l'alternative soit réelle)
function addOrVariantHand(id) {
    const c = constraints.find(x => x.id === id);
    if (!c || c.type !== 'hand') return;
    
    c.operator = 'OR';
    pendingOrTarget = { type: 'hand', position: c.position };
    renderConstraints();
    openHandConstraintsModal();
}

// Démarre l'ajout d'une variante OU pour une contrainte de ligne existante
function addOrVariantLine(id) {
    const c = constraints.find(x => x.id === id);
    if (!c || c.type !== 'line') return;
    
    c.operator = 'OR';
    pendingOrTarget = { type: 'line', line: c.line };
    renderConstraints();
    openLineConstraintsModal();
}

// Exporte les contraintes actuelles dans un fichier JSON téléchargeable
function exportConstraintsPreset() {
    if (constraints.length === 0) {
        alert('Aucune contrainte à exporter.');
        return;
    }
    
    const json = JSON.stringify(constraints, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'presets-bridge.json';
    a.click();
    URL.revokeObjectURL(url);
}

// Importe un fichier JSON de contraintes, en remplaçant les contraintes actuelles (avec confirmation)
function importConstraintsPreset(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        let imported;
        try {
            imported = JSON.parse(e.target.result);
        } catch (err) {
            alert('Erreur : le fichier n\'est pas un JSON valide.');
            event.target.value = '';
            return;
        }
        
        if (!Array.isArray(imported)) {
            alert('Erreur : le fichier ne contient pas une liste de contraintes valide.');
            event.target.value = '';
            return;
        }
        
        if (constraints.length > 0) {
            const confirmed = confirm(
                `Vous avez ${constraints.length} contrainte(s) en cours. ` +
                `L'import va les remplacer entièrement par les ${imported.length} contrainte(s) du fichier. Continuer ?`
            );
            if (!confirmed) {
                event.target.value = '';
                return;
            }
        }
        
        constraints = imported;
        renderConstraints();
        event.target.value = '';
    };
    reader.readAsText(file);
}

// Reconvertit un objet range ({min,max} ou {ranges:[...]}) en texte éditable pour un champ
function rangeToInputText(range, defaultMax) {
    if (!range) return '';
    
    const single = (r) => {
        if (r.min === 0 && r.max === defaultMax) return '';
        if (r.min === r.max) return `${r.min}`;
        if (r.min === 0) return `${r.max}-`;
        if (r.max === defaultMax) return `${r.min}+`;
        return `${r.min}-${r.max}`;
    };
    
    if (range.ranges) {
        return range.ranges.map(single).join(' OU ');
    }
    return single(range);
}

// Préremplit la modal de contrainte de main avec une contrainte existante, pour édition
function editHandConstraint(id) {
    const c = constraints.find(x => x.id === id);
    if (!c || c.type !== 'hand') return;
    
    const pos = c.position.toLowerCase();
    
    document.getElementById(`modal-${pos}-hcp`).value = rangeToInputText(c.hcp, 40);
    document.getElementById(`modal-${pos}-spades`).value = rangeToInputText(c.suits.SPADES, 13);
    document.getElementById(`modal-${pos}-hearts`).value = rangeToInputText(c.suits.HEARTS, 13);
    document.getElementById(`modal-${pos}-diamonds`).value = rangeToInputText(c.suits.DIAMONDS, 13);
    document.getElementById(`modal-${pos}-clubs`).value = rangeToInputText(c.suits.CLUBS, 13);
    document.getElementById(`modal-${pos}-dist`).value = c.distributions || '';
    
    const pointTypeRadio = document.querySelector(`input[name="hand-${pos}-pointType"][value="${c.pointType}"]`);
    if (pointTypeRadio) pointTypeRadio.checked = true;
    
    // Si la contrainte d'origine était une variante OU, on préserve ce statut pour la ressauvegarde
    pendingOrTarget = (c.operator === 'OR') ? { type: 'hand', position: c.position } : null;
    
    // On garde une copie pour pouvoir la restaurer si l'utilisateur annule au lieu de sauvegarder
    pendingEditBackup = { type: 'hand', constraint: c };
    
    // Supprime l'ancienne contrainte : saveHandConstraints() en créera une nouvelle à sa place
    constraints = constraints.filter(x => x.id !== id);
    renderConstraints();
    
    openHandConstraintsModal();
}

// Préremplit la modal de contrainte de ligne avec une contrainte existante, pour édition
function editLineConstraint(id) {
    const c = constraints.find(x => x.id === id);
    if (!c || c.type !== 'line') return;
    
    const line = c.line.toLowerCase();
    
    document.getElementById(`line-${line}-hcp`).value = rangeToInputText(c.hcp, 40);
    document.getElementById(`line-${line}-spades-fit`).value = rangeToInputText(c.fits.SPADES, 13);
    document.getElementById(`line-${line}-hearts-fit`).value = rangeToInputText(c.fits.HEARTS, 13);
    document.getElementById(`line-${line}-diamonds-fit`).value = rangeToInputText(c.fits.DIAMONDS, 13);
    document.getElementById(`line-${line}-clubs-fit`).value = rangeToInputText(c.fits.CLUBS, 13);
    
    const pointTypeRadio = document.querySelector(`input[name="line-${line}-pointType"][value="${c.pointType}"]`);
    if (pointTypeRadio) pointTypeRadio.checked = true;
    
    // Si la contrainte d'origine était une variante OU, on préserve ce statut pour la ressauvegarde
    pendingOrTarget = (c.operator === 'OR') ? { type: 'line', line: c.line } : null;
    
    // On garde une copie pour pouvoir la restaurer si l'utilisateur annule au lieu de sauvegarder
    pendingEditBackup = { type: 'line', constraint: c };
    
    // Supprime l'ancienne contrainte : saveLineConstraints() en créera une nouvelle à sa place
    constraints = constraints.filter(x => x.id !== id);
    renderConstraints();
    
    openLineConstraintsModal();
}

// Formatte une plage (simple ou multiple "OU") pour l'affichage
function formatRangeValue(range, defaultMax) {
    if (range.ranges) {
        return range.ranges.map(r => formatRangeValue(r, defaultMax)).join(' ou ');
    }
    if (range.min === range.max) return `${range.min}`;
    if (range.min === 0) return `${range.max}-`;
    if (defaultMax !== undefined && range.max === defaultMax) return `${range.min}+`;
    return `${range.min}-${range.max}`;
}

// Indique si une plage représente une contrainte active (≠ "tout autorisé")
function isRangeActive(range, defaultMax) {
    if (range.ranges) return true;
    return range.min > 0 || range.max < defaultMax;
}

function getConstraintText(c) {
    if (c.type === 'line') {
        const lineName = c.line === 'NS' ? 'Nord-Sud' : 'Est-Ouest';
        const pointTypeLabel = c.pointType === 'hl' ? 'HL' : 'HCP';
        let parts = [`Ligne ${lineName} (${pointTypeLabel})`];
        
        if (c.hcp && isRangeActive(c.hcp, 40)) {
            parts.push(`${pointTypeLabel}: ${formatRangeValue(c.hcp, 40)}`);
        }
        
        if (c.fits) {
            const fitParts = [];
            for (const [suit, range] of Object.entries(c.fits)) {
                if (isRangeActive(range, 13)) {
                    fitParts.push(`${SUIT_SYMBOLS[suit]} fit ${formatRangeValue(range, 13)}`);
                }
            }
            if (fitParts.length > 0) {
                parts.push(fitParts.join(', '));
            }
        }
        
        return parts.join(' • ');
    }
    
    // Contrainte OR : afficher un résumé
    if (c.OR && Array.isArray(c.OR)) {
        const seqPart = c.biddingSequence ? `Séquence "${c.biddingSequence}" - ${c.biddingRole} • ` : '';
        const branches = c.OR.map(branch => {
            const pts = branch.hcp ? `HCP ${branch.hcp[0]}-${branch.hcp[1]}`
                      : branch.hl  ? `HL ${branch.hl[0]}-${branch.hl[1]}`
                      : branch.hld ? `HLD ${branch.hld[0]}-${branch.hld[1]}`
                      : '';
            return pts;
        }).filter(Boolean);
        return `${seqPart}Conditions OU : [${branches.join('] ou [')}]`;
    }
    
    let parts = [];
    
    if (c.biddingSequence) {
        parts.push(`Séquence "${c.biddingSequence}" - ${c.biddingRole}`);
    }
    
    const pointTypeLabel = c.pointType === 'hcp' ? 'HCP' : (c.pointType === 'hl' ? 'HL' : 'HLD');
    
    if (isRangeActive(c.hcp, 40)) {
        parts.push(`${pointTypeLabel}: ${formatRangeValue(c.hcp, 40)}`);
    }
    
    const suitParts = [];
    for (const [suit, range] of Object.entries(c.suits)) {
        if (isRangeActive(range, 13)) {
            suitParts.push(`${SUIT_SYMBOLS[suit]} ${formatRangeValue(range, 13)}`);
        }
    }
    if (suitParts.length > 0) {
        parts.push(suitParts.join(', '));
    }
    
    if (c.distributions) {
        parts.push(`Distribution: ${c.distributions}`);
    }
    
    return parts.length > 0 ? parts.join(' • ') : 'Aucune contrainte spécifique';
}

function buildConstraintSummary() {
    const el = document.getElementById('constraintSummary');
    if (!el) return;
    
    if (constraints.length === 0) {
        el.style.display = 'none';
        return;
    }
    
    function groupKey(c) {
        return c.type === 'line' ? `line:${c.line}` : `hand:${c.position}`;
    }
    function posLabel(c) {
        if (c.type === 'line') return c.line === 'NS' ? 'Ligne NS' : 'Ligne EO';
        const names = { N:'Nord', E:'Est', S:'Sud', W:'Ouest' };
        return names[c.position] || c.position;
    }
    
    // Regrouper : groupes OR par clé, AND individuels
    const groups = {}; // key -> { label, items: [c], isOr }
    const order = [];
    
    constraints.forEach(c => {
        const key = c.operator === 'OR' ? `or:${groupKey(c)}` : `and:${c.id}`;
        if (!groups[key]) {
            groups[key] = { label: posLabel(c), items: [], isOr: c.operator === 'OR' };
            order.push(key);
        }
        groups[key].items.push(c);
    });
    
    const parts = order.map(key => {
        const g = groups[key];
        if (!g.isOr) {
            const c = g.items[0];
            // Contrainte OR interne (structure SEF) : affichage simplifié
            if (c.OR && Array.isArray(c.OR)) {
                const branches = c.OR.map(branch => {
                    const pts = branch.hcp ? `HCP ${branch.hcp[0]}-${branch.hcp[1]}`
                              : branch.hl  ? `HL ${branch.hl[0]}-${branch.hl[1]}`
                              : branch.hld ? `HLD ${branch.hld[0]}-${branch.hld[1]}`
                              : '';
                    return pts;
                }).filter(Boolean);
                return `<strong>${g.label}</strong> : ${branches.join(' <em style="color:#e67e22">ou</em> ')}`;
            }
            const txt = getConstraintText(c).replace(/^Ligne (Nord-Sud|Est-Ouest) \([^)]+\) • /, '');
            return `<strong>${g.label}</strong> : ${txt}`;
        } else {
            // Pour les groupes OR, extraire juste les valeurs en évitant de répéter le préfixe (ex: "HCP: 12 ou 18" au lieu de "HCP: 12 ou HCP: 18")
            const pointTypeLabel = g.items[0].pointType === 'hcp' ? 'HCP' : (g.items[0].pointType === 'hl' ? 'HL' : 'HLD');
            const hcpValues = g.items.map(c => {
                const hcpActive = isRangeActive(c.hcp, 40);
                return hcpActive ? formatRangeValue(c.hcp, 40) : null;
            }).filter(Boolean);
            
            const suitParts = g.items.map(c => {
                const parts = [];
                for (const [suit, range] of Object.entries(c.suits)) {
                    if (isRangeActive(range, 13)) parts.push(`${SUIT_SYMBOLS[suit]}${formatRangeValue(range, 13)}`);
                }
                return parts.join(' ');
            }).filter(Boolean);
            
            const variantTexts = g.items.map((c, i) => {
                const hcpActive = isRangeActive(c.hcp, 40);
                const suitActive = Object.entries(c.suits).some(([, r]) => isRangeActive(r, 13));
                const hcpStr = hcpActive ? formatRangeValue(c.hcp, 40) : '';
                const suitStr = Object.entries(c.suits).filter(([, r]) => isRangeActive(r, 13))
                    .map(([s, r]) => `${SUIT_SYMBOLS[s]}${formatRangeValue(r, 13)}`).join(' ');
                return [hcpStr, suitStr].filter(Boolean).join(' ');
            });
            
            // Si toutes les variantes ne diffèrent que par les points, condenser : "HCP: 12 ou 18"
            const allOnlyHcp = g.items.every(c => {
                return isRangeActive(c.hcp, 40) && !Object.entries(c.suits).some(([, r]) => isRangeActive(r, 13));
            });
            
            let summary;
            if (allOnlyHcp && hcpValues.length > 1) {
                summary = `${pointTypeLabel}: ${hcpValues.join(' <em style="color:#e67e22">ou</em> ')}`;
            } else {
                summary = variantTexts.join(' <em style="color:#e67e22">ou</em> ');
            }
            return `<strong>${g.label}</strong> : ${summary}`;
        }
    });
    
    el.style.display = 'block';
    el.innerHTML = `
        <div style="font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; opacity: 0.7;">🔍 Résumé des contraintes</div>
        ${parts.map(p => `<div style="padding: 3px 0; border-bottom: 1px solid rgba(52,152,219,0.2);">${p}</div>`).join('')}
    `;
}

function renderConstraints() {
    const list = document.getElementById('constraintList');
    if (constraints.length === 0) {
        list.innerHTML = '<div style="color: #7f8c8d; font-style: italic;">Aucune contrainte définie</div>';
        return;
    }
    
    function groupKey(c) {
        return c.type === 'line' ? `line:${c.line}` : `hand:${c.position}`;
    }
    
    function positionLabel(c) {
        return c.type === 'line'
            ? `Ligne ${c.line === 'NS' ? 'Nord-Sud' : 'Est-Ouest'}`
            : getPositionName(c.position);
    }
    
    // Construire les groupes OR et garder les AND dans leur ordre
    // Un groupe OR est identifié par sa clé (position/ligne) — on les regroupe ensemble
    const orGroups = {}; // groupKey -> [constraints]
    const orGroupOrder = []; // ordre d'apparition des groupes dans le tableau original
    const andConstraints = []; // {constraint, originalIndex}
    
    constraints.forEach((c, i) => {
        if (c.operator === 'OR') {
            const key = groupKey(c);
            if (!orGroups[key]) {
                orGroups[key] = [];
                orGroupOrder.push({ key, firstIndex: i });
            }
            orGroups[key].push(c);
        } else {
            andConstraints.push({ c, originalIndex: i });
        }
    });
    
    // Reconstruire l'ordre d'affichage : intercaler groupes OU et contraintes AND
    // selon leur position relative dans le tableau d'origine
    const renderItems = []; // chaque item est soit {type:'and', c} soit {type:'orGroup', key, members}
    
    orGroupOrder.forEach(g => {
        renderItems.push({ type: 'orGroup', key: g.key, members: orGroups[g.key], firstIndex: g.firstIndex });
    });
    andConstraints.forEach(({ c, originalIndex }) => {
        renderItems.push({ type: 'and', c, firstIndex: originalIndex });
    });
    
    // Trier par première apparition dans le tableau original
    renderItems.sort((a, b) => a.firstIndex - b.firstIndex);
    
    let html = '';
    
    renderItems.forEach(item => {
        if (item.type === 'and') {
            const c = item.c;
            const editFn = c.type === 'line' ? 'editLineConstraint' : 'editHandConstraint';
            const orVariantFn = c.type === 'line' ? 'addOrVariantLine' : 'addOrVariantHand';
            html += `
                <div class="constraint-item">
                    <div class="constraint-header">
                        <span class="constraint-position">${positionLabel(c)}</span>
                        <div>
                            <button class="btn btn-secondary" onclick="${orVariantFn}(${c.id})">🔀 OU</button>
                            <button class="btn btn-secondary" onclick="${editFn}(${c.id})">✏️ Modifier</button>
                            <button class="btn btn-danger" onclick="removeConstraint(${c.id})">✕ Supprimer</button>
                        </div>
                    </div>
                    <div class="constraint-details">${getConstraintText(c)}</div>
                </div>
            `;
        } else {
            // Groupe OU : un bloc englobant avec titre
            const members = item.members;
            const total = members.length;
            const label = positionLabel(members[0]);
            const editFn = members[0].type === 'line' ? 'editLineConstraint' : 'editHandConstraint';
            const orVariantFn = members[0].type === 'line' ? 'addOrVariantLine' : 'addOrVariantHand';
            
            html += `
                <div style="border: 2px solid #e67e22; border-radius: 10px; padding: 12px; margin-bottom: 10px; background: rgba(230,126,34,0.07);">
                    <div style="font-size: 13px; font-weight: bold; color: #e67e22; margin-bottom: 10px; letter-spacing: 0.5px;">
                        🔀 Groupe alternatif — ${label} (${total} variante${total > 1 ? 's' : ''})
                    </div>
            `;
            
            members.forEach((c, idx) => {
                html += `
                    <div class="constraint-item" style="border: 1px dashed #e67e22; margin-bottom: ${idx < total - 1 ? '0' : '0'};">
                        <div class="constraint-header">
                            <span class="constraint-position">
                                ${label}
                                <span style="color: #e67e22; font-size: 12px; font-weight: normal;">
                                    — variante ${idx + 1}/${total}
                                </span>
                            </span>
                            <div>
                                <button class="btn btn-secondary" onclick="${orVariantFn}(${c.id})">🔀 OU</button>
                                <button class="btn btn-secondary" onclick="${editFn}(${c.id})">✏️ Modifier</button>
                                <button class="btn btn-danger" onclick="removeConstraint(${c.id})">✕ Supprimer</button>
                            </div>
                        </div>
                        <div class="constraint-details">${getConstraintText(c)}</div>
                    </div>
                    ${idx < total - 1 ? `<div style="text-align: center; font-weight: bold; color: #e67e22; padding: 4px 0;">— OU —</div>` : ''}
                `;
            });
            
            html += `</div>`;
        }
    });
    
    list.innerHTML = html;
    buildConstraintSummary();
}

function getPositionName(pos) {
    const names = { 'N': 'Nord', 'E': 'Est', 'S': 'Sud', 'W': 'Ouest' };
    return names[pos];
}

// ========================================
// PRESETS DE DISTRIBUTION (bouton + sous-menu cochable)
// ========================================

// Groupes de presets affichés dans le sous-menu. "x" = joker (n'importe quelle longueur).
const DISTRIBUTION_PRESET_GROUPS = [
    {
        label: 'Régulières',
        items: [
            { pattern: '4333', label: '4-3-3-3' },
            { pattern: '4432', label: '4-4-3-2' },
            { pattern: '5332', label: '5-3-3-2' },
            { pattern: '4441', label: '4-4-4-1' }
        ]
    },
    {
        label: 'Bicolores',
        items: [
            { pattern: '54xx', label: '5-4' },
            { pattern: '5422', label: '5-4-2-2' },
            { pattern: '5431', label: '5-4-3-1' }
        ]
    },
    {
        label: 'Unicolore',
        items: [
            { pattern: '6', label: 'Exactement 6 cartes' },
            { pattern: '6+', label: 'Au moins 6 cartes' },
            { pattern: '7', label: 'Exactement 7 cartes' },
            { pattern: '7+', label: 'Au moins 7 cartes' },
            { pattern: '8', label: 'Exactement 8 cartes' },
            { pattern: '8+', label: 'Au moins 8 cartes' }
        ]
    },
    {
        label: 'Bicolores excentrés',
        items: [
            { pattern: '54+', label: '5-4 ou mieux' },
            { pattern: '55xx', label: '5-5' },
            { pattern: '64xx', label: '6-4' },
            { pattern: '65xx', label: '6-5' },
            { pattern: '66xx', label: '6-6' }
        ]
    },
    {
        label: 'Courte',
        items: [
            { pattern: '1', label: 'Singleton' },
            { pattern: '0', label: 'Chicane' }
        ]
    }
];

// Note affichée dans la modal pour rappeler que d'autres combinaisons précises
// (couleur majeure/mineure spécifiée) restent saisissables à la main, hors presets.
const DISTRIBUTION_PRESET_LEGEND = "D'autres combinaisons sont possibles en saisie manuelle : M5m4, M5m5, M6m4, M4m6, M6+, m7, etc.";

// Champs de distribution sur lesquels attacher le bouton presets
const DISTRIBUTION_PRESET_FIELDS = [
    'modal-n-dist', 'modal-e-dist', 'modal-s-dist', 'modal-w-dist',
    'bidOpenerDist', 'bidResponderDist', 'bidOpp1Dist', 'bidOpp2Dist'
];

// Id du champ actuellement ciblé par la modal de presets (une seule modal partagée par tous les champs)
let distPresetTargetInputId = null;

function initDistributionPresets() {
    createDistributionPresetModal();
    DISTRIBUTION_PRESET_FIELDS.forEach(attachDistributionPresetButton);
}

// Affiche/masque un message d'erreur sous le champ si un ou plusieurs tokens de la
// distribution saisie ne sont pas reconnus (ex: faute de frappe, format inconnu).
function validateDistributionField(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return true;

    const { valid, invalidTokens } = validateDistributionString(input.value);
    const container = input.closest('.dist-preset-wrapper') || input;
    let errorEl = document.getElementById(`${inputId}-error`);

    if (!valid) {
        input.classList.add('input-error');
        if (!errorEl) {
            errorEl = document.createElement('div');
            errorEl.id = `${inputId}-error`;
            errorEl.className = 'dist-error-msg';
            container.parentNode.insertBefore(errorEl, container.nextSibling);
        }
        errorEl.textContent = `⚠️ Non reconnu : ${invalidTokens.join(', ')}`;
    } else {
        input.classList.remove('input-error');
        if (errorEl) errorEl.remove();
    }

    return valid;
}

function initDistributionValidation() {
    DISTRIBUTION_PRESET_FIELDS.forEach(id => {
        const input = document.getElementById(id);
        if (!input || input.dataset.validationAttached) return;
        input.dataset.validationAttached = '1';
        input.addEventListener('input', () => validateDistributionField(id));
        input.addEventListener('blur', () => validateDistributionField(id));
    });
}

// Ajoute juste un petit bouton ⚙️ à côté du champ existant, sans changer son id/comportement
function attachDistributionPresetButton(inputId) {
    const input = document.getElementById(inputId);
    if (!input || input.dataset.presetAttached) return;
    input.dataset.presetAttached = '1';

    const wrapper = document.createElement('div');
    wrapper.className = 'dist-preset-wrapper';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dist-preset-btn';
    btn.title = 'Presets de distribution';
    btn.textContent = '⚙️';
    btn.onclick = (e) => {
        e.stopPropagation();
        openDistributionPresetModal(inputId);
    };
    wrapper.appendChild(btn);
}

// Crée la modal partagée une seule fois (ajoutée à la fin du body, centrée comme les autres modales)
function createDistributionPresetModal() {
    if (document.getElementById('distPresetModal')) return;

    const modal = document.createElement('div');
    modal.id = 'distPresetModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 640px;">
            <div class="modal-header">
                <div class="modal-title">📊 Presets de distribution</div>
                <button class="close-btn" onclick="closeDistributionPresetModal()">&times;</button>
            </div>
            <div id="distPresetModalBody" class="dist-preset-body-grid">
                ${DISTRIBUTION_PRESET_GROUPS.map(group => `
                    <div class="dist-preset-group">
                        <div class="dist-preset-group-label">${group.label}</div>
                        ${group.items.map(item => `
                            <label class="dist-preset-item">
                                <input type="checkbox" data-pattern="${item.pattern}">
                                <span class="dist-preset-pattern">${item.pattern}</span>
                                <span class="dist-preset-item-label">${item.label}</span>
                            </label>
                        `).join('')}
                    </div>
                `).join('')}
                <div class="dist-preset-legend">${DISTRIBUTION_PRESET_LEGEND}</div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeDistributionPresetModal()">Annuler</button>
                <button class="btn btn-success" onclick="applyDistributionPresetModal()">✓ Valider</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Fermer si on clique sur l'overlay, en dehors du contenu (cf. setupOverlayCloseOnClickOutside)
    setupOverlayCloseOnClickOutside(modal, closeDistributionPresetModal);
}

function openDistributionPresetModal(inputId) {
    distPresetTargetInputId = inputId;
    const input = document.getElementById(inputId);
    const tokens = (input.value || '').trim().split(/\s+/).filter(Boolean);

    const modal = document.getElementById('distPresetModal');
    modal.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        const patternTokens = cb.dataset.pattern.split(/\s+/);
        cb.checked = patternTokens.every(t => tokens.includes(t));
    });

    modal.style.display = 'block';
}

function closeDistributionPresetModal() {
    const modal = document.getElementById('distPresetModal');
    if (modal) modal.style.display = 'none';
    distPresetTargetInputId = null;
}

function applyDistributionPresetModal() {
    if (!distPresetTargetInputId) return;
    const input = document.getElementById(distPresetTargetInputId);
    const modal = document.getElementById('distPresetModal');
    if (!input || !modal) return;

    // On retire les patterns presets connus de la saisie actuelle (pour ne pas les dupliquer),
    // en conservant toute saisie manuelle qui n'est pas un preset, puis on rajoute les cases cochées
    const knownPatterns = DISTRIBUTION_PRESET_GROUPS.flatMap(g => g.items.flatMap(i => i.pattern.split(/\s+/)));
    const tokens = (input.value || '').trim().split(/\s+/).filter(Boolean);
    const remaining = tokens.filter(t => !knownPatterns.includes(t));

    const resultSet = new Set(remaining);
    modal.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        cb.dataset.pattern.split(/\s+/).forEach(t => resultSet.add(t));
    });

    input.value = Array.from(resultSet).join(' ');
    closeDistributionPresetModal();
}

document.addEventListener('DOMContentLoaded', initDistributionPresets);
document.addEventListener('DOMContentLoaded', initDistributionValidation);

// ========================================
// PRESETS DE POINTS (HCP) — bouton + modal cochable, sur le même principe que les distributions
// ========================================

const HCP_PRESET_GROUPS = [
    {
        label: 'Ouvertures',
        items: [
            { pattern: '6-10', label: '6-10' },
            { pattern: '12-14', label: '12-14' },
            { pattern: '15-17', label: '15-17' },
            { pattern: '18-19', label: '18-19' },
            { pattern: '20-21', label: '20-21' },
            { pattern: '22-23', label: '22-23' },
            { pattern: '24+', label: '24+' }
        ]
    },
    {
        label: 'Réponses',
        items: [
            { pattern: '0-5', label: '0-5' },
            { pattern: '6-10', label: '6-10' },
            { pattern: '10-11', label: '10-11' },
            { pattern: '12-15', label: '12-15' },
            { pattern: '16-17', label: '16-17' },
            { pattern: '18-19', label: '18-19' },
            { pattern: '20+', label: '20+' }
        ]
    }
];

// Champs de points sur lesquels attacher le bouton presets
const HCP_PRESET_FIELDS = [
    'modal-n-hcp', 'modal-e-hcp', 'modal-s-hcp', 'modal-w-hcp',
    'line-ns-hcp', 'line-ew-hcp',
    'bidOpenerHcp', 'bidResponderHcp', 'bidOpp1Hcp', 'bidOpp2Hcp'
];

let hcpPresetTargetInputId = null;

function initHcpPresets() {
    createHcpPresetModal();
    HCP_PRESET_FIELDS.forEach(attachHcpPresetButton);
}

// Ajoute juste un petit bouton 🎯 à côté du champ existant, sans changer son id/comportement
function attachHcpPresetButton(inputId) {
    const input = document.getElementById(inputId);
    if (!input || input.dataset.presetAttached) return;
    input.dataset.presetAttached = '1';

    const wrapper = document.createElement('div');
    wrapper.className = 'dist-preset-wrapper';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dist-preset-btn';
    btn.title = 'Presets de points';
    btn.textContent = '🎯';
    btn.onclick = (e) => {
        e.stopPropagation();
        openHcpPresetModal(inputId);
    };
    wrapper.appendChild(btn);
}

// Crée la modal partagée une seule fois (réutilise les mêmes styles que la modal de distributions)
function createHcpPresetModal() {
    if (document.getElementById('hcpPresetModal')) return;

    const modal = document.createElement('div');
    modal.id = 'hcpPresetModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 480px;">
            <div class="modal-header">
                <div class="modal-title">🎯 Presets de points</div>
                <button class="close-btn" onclick="closeHcpPresetModal()">&times;</button>
            </div>
            <div id="hcpPresetModalBody">
                ${HCP_PRESET_GROUPS.map(group => `
                    <div class="dist-preset-group">
                        <div class="dist-preset-group-label">${group.label}</div>
                        ${group.items.map(item => `
                            <label class="dist-preset-item">
                                <input type="checkbox" data-pattern="${item.pattern}">
                                <span class="dist-preset-pattern">${item.pattern}</span>
                                <span class="dist-preset-item-label">${item.label}</span>
                            </label>
                        `).join('')}
                    </div>
                `).join('')}
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeHcpPresetModal()">Annuler</button>
                <button class="btn btn-success" onclick="applyHcpPresetModal()">✓ Valider</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    setupOverlayCloseOnClickOutside(modal, closeHcpPresetModal);
}

function openHcpPresetModal(inputId) {
    hcpPresetTargetInputId = inputId;
    const input = document.getElementById(inputId);
    const segments = (input.value || '').split(/\s+OU\s+/i).map(s => s.trim()).filter(Boolean);

    const modal = document.getElementById('hcpPresetModal');
    modal.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = segments.includes(cb.dataset.pattern);
    });

    modal.style.display = 'block';
}

function closeHcpPresetModal() {
    const modal = document.getElementById('hcpPresetModal');
    if (modal) modal.style.display = 'none';
    hcpPresetTargetInputId = null;
}

function applyHcpPresetModal() {
    if (!hcpPresetTargetInputId) return;
    const input = document.getElementById(hcpPresetTargetInputId);
    const modal = document.getElementById('hcpPresetModal');
    if (!input || !modal) return;

    // On retire les presets connus de la saisie actuelle (pour ne pas les dupliquer), on garde
    // toute plage manuelle qui n'est pas un preset, puis on rajoute les cases cochées
    const knownPatterns = HCP_PRESET_GROUPS.flatMap(g => g.items.map(i => i.pattern));
    const segments = (input.value || '').split(/\s+OU\s+/i).map(s => s.trim()).filter(Boolean);
    const remaining = segments.filter(s => !knownPatterns.includes(s));

    modal.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        if (!remaining.includes(cb.dataset.pattern)) remaining.push(cb.dataset.pattern);
    });

    input.value = remaining.join(' OU ');
    closeHcpPresetModal();
}

document.addEventListener('DOMContentLoaded', initHcpPresets);

// ========================================
// FERMETURE DES MODALES : clic en dehors, sans casser la sélection de texte
// ========================================
//
// Avant : onclick="if(event.target===this) close()" sur le fond de la modale.
// Problème : quand on sélectionne du texte dans un champ en cliquant-glissant, si le curseur
// dépasse le cadre de la modale, le mouseup se produit sur le fond -> la modale se ferme.
// Fix : on ne ferme que si le mousedown ET le mouseup ont tous les deux démarré/fini sur le fond
// lui-même (donc pas un clic-glissé commencé à l'intérieur du contenu).
function setupOverlayCloseOnClickOutside(overlay, closeFn) {
    let mouseDownOnOverlay = false;

    overlay.addEventListener('mousedown', (e) => {
        mouseDownOnOverlay = (e.target === overlay);
    });

    overlay.addEventListener('mouseup', (e) => {
        if (mouseDownOnOverlay && e.target === overlay) {
            closeFn();
        }
        mouseDownOnOverlay = false;
    });
}

function initOverlayCloseHandlers() {
    const handModal = document.getElementById('handConstraintsModal');
    if (handModal) setupOverlayCloseOnClickOutside(handModal, cancelHandConstraintsModal);

    const lineModal = document.getElementById('lineConstraintsModal');
    if (lineModal) setupOverlayCloseOnClickOutside(lineModal, cancelLineConstraintsModal);

    const biddingModal = document.getElementById('biddingSequenceModal');
    if (biddingModal) setupOverlayCloseOnClickOutside(biddingModal, closeBiddingSequenceModal);

    const statsModal = document.getElementById('statsModal');
    if (statsModal) setupOverlayCloseOnClickOutside(statsModal, closeStatsModal);
}

document.addEventListener('DOMContentLoaded', initOverlayCloseHandlers);
