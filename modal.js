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
//  - M5x4, M5x5, M6x4, M6x5 : majeure + une autre couleur quelconque (l'autre majeure ou une
//    mineure), la couleur du "x" n'étant pas restreinte
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
        // On restaure toutes les contraintes qu'on était en train de modifier, non sauvegardées
        constraints.push(...pendingEditBackup.constraints);
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
        // On restaure toutes les contraintes qu'on était en train de modifier, non sauvegardées
        constraints.push(...pendingEditBackup.constraints);
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

// ===== GESTION DES BLOCS DE CONTRAINTES (scénarios alternatifs) =====
//
// activeGroupId (générator.js) détermine dans quel bloc atterrissent les prochaines contraintes
// créées via les modales. Les fonctions ci-dessous gèrent la création/suppression/bascule ET↔OU
// des blocs, et le rendu des onglets au-dessus de la liste de contraintes.

// ===== MODALE DE CONFIRMATION GÉNÉRIQUE =====
//
// Remplace les popups confirm() natives du navigateur (grises, non stylées, incohérentes avec
// le reste de l'interface) par une modale cohérente avec le design de l'appli. Retourne une
// Promise<boolean> : `if (await showConfirmDialog('...')) { ... }`.
let _confirmDialogResolve = null;

function showConfirmDialog(message, okLabel = 'Confirmer') {
    return new Promise(resolve => {
        _confirmDialogResolve = resolve;
        document.getElementById('confirmDialogMessage').textContent = message;
        const okBtn = document.getElementById('confirmDialogOkBtn');
        if (okBtn) okBtn.textContent = okLabel;
        document.getElementById('confirmDialogModal').style.display = 'flex';
    });
}

function resolveConfirmDialog(result) {
    document.getElementById('confirmDialogModal').style.display = 'none';
    if (_confirmDialogResolve) {
        _confirmDialogResolve(result);
        _confirmDialogResolve = null;
    }
}

function newGroupId() {
    return 'g' + Date.now() + '-' + Math.floor(Math.random() * 10000);
}

// Crée un nouveau bloc (scénario alternatif), l'active, et bascule dessus : les prochaines
// contraintes ajoutées via "+ Contraintes de main" etc. y atterriront. Par défaut en OU,
// puisque le but même d'un nouveau bloc est d'exprimer une alternative au(x) précédent(s)
// (pour un simple ET, ajouter la contrainte dans le bloc déjà actif suffit).
function createConstraintGroup(operator = 'OR') {
    const id = newGroupId();
    constraintGroups.push({ id, operator });
    activeGroupId = id;
    renderConstraints();
}

function setActiveGroup(id) {
    if (!constraintGroups.find(g => g.id === id)) return;
    activeGroupId = id;
    renderConstraints();
}

// Le premier scénario n'a pas d'opérateur affiché (rien avant lui à combiner) : rien à régler.
function setGroupOperator(id, operator) {
    if (id === defaultGroupId()) return;
    const g = constraintGroups.find(x => x.id === id);
    if (!g || g.operator === operator) return;
    g.operator = operator;
    renderConstraints();
}

// Déplace un scénario d'un cran (direction : -1 = vers la gauche/avant, +1 = vers la droite/après).
// Comme l'évaluation se lit en chaîne de gauche à droite (voir checkAllConstraints), réordonner
// change concrètement la logique ET/OU — c'est le but, mais ça mérite d'être su : le scénario qui
// se retrouve en première position perd son opérateur affiché (plus rien avant lui à combiner).
function moveConstraintGroup(id, direction) {
    const idx = constraintGroups.findIndex(g => g.id === id);
    if (idx === -1) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= constraintGroups.length) return;
    const tmp = constraintGroups[idx];
    constraintGroups[idx] = constraintGroups[newIdx];
    constraintGroups[newIdx] = tmp;
    renderConstraints();
}

// Supprime un bloc et ses contraintes (avec confirmation stylée s'il n'est pas vide). Le premier
// scénario ne peut pas être supprimé : il reste toujours au moins un scénario "de base".
async function deleteConstraintGroup(id) {
    if (id === defaultGroupId() || constraintGroups.length <= 1) return;
    const idx = constraintGroups.findIndex(g => g.id === id);
    if (idx === -1) return;

    const dgid = defaultGroupId();
    const groupConstraints = constraints.filter(c => (c.groupId || dgid) === id);
    if (groupConstraints.length > 0) {
        const confirmed = await showConfirmDialog(
            `Ce scénario contient ${groupConstraints.length} contrainte(s). Les supprimer avec le scénario ?`,
            'Supprimer'
        );
        if (!confirmed) return;
    }

    constraints = constraints.filter(c => (c.groupId || dgid) !== id);
    constraintGroups.splice(idx, 1);
    if (activeGroupId === id) activeGroupId = defaultGroupId();
    renderConstraints();
}

// Affiche les onglets de scénarios au-dessus de la liste de contraintes. Reste discret (ne
// s'affiche pas du tout) tant qu'il n'y a qu'un unique scénario vide : la notion de "scénarios"
// n'a d'intérêt que dès qu'on en a au moins deux, ou que le premier contient déjà quelque chose.
function renderConstraintGroupTabs() {
    const el = document.getElementById('constraintGroupTabs');
    if (!el) return;

    if (constraintGroups.length <= 1 && constraints.length === 0) {
        el.innerHTML = '';
        return;
    }

    const dgid = defaultGroupId();
    const lastIdx = constraintGroups.length - 1;

    const chips = constraintGroups.map((g, idx) => {
        const count = constraints.filter(c => (c.groupId || dgid) === g.id).length;
        const isActive = g.id === activeGroupId;

        // Switch ET/OU à deux états visibles (plus explicite qu'une pastille à un seul état
        // qu'il fallait deviner cliquable).
        const opSwitch = idx === 0 ? '' : `
            <div class="group-op-switch" onclick="event.stopPropagation();">
                <span class="group-op-option ${g.operator === 'AND' ? 'selected' : ''}" onclick="setGroupOperator('${g.id}', 'AND')">ET</span>
                <span class="group-op-option ${g.operator === 'OR' ? 'selected' : ''}" onclick="setGroupOperator('${g.id}', 'OR')">OU</span>
            </div>`;

        const moveLeftBtn = idx > 0 ? `
            <span class="group-move" onclick="event.stopPropagation(); moveConstraintGroup('${g.id}', -1)" title="Déplacer avant">◀</span>` : '';
        const moveRightBtn = idx < lastIdx ? `
            <span class="group-move" onclick="event.stopPropagation(); moveConstraintGroup('${g.id}', 1)" title="Déplacer après">▶</span>` : '';
        const delBtn = constraintGroups.length > 1 && idx !== 0 ? `
            <span class="group-delete" onclick="event.stopPropagation(); deleteConstraintGroup('${g.id}')" title="Supprimer ce scénario">✕</span>` : '';

        return `
            <div class="constraint-group-chip ${isActive ? 'active' : ''}" onclick="setActiveGroup('${g.id}')">
                ${opSwitch}
                <span>Scénario ${idx + 1}${count > 0 ? ` (${count})` : ''}</span>
                <span class="group-move-pair">${moveLeftBtn}${moveRightBtn}</span>
                ${delBtn}
            </div>
        `;
    }).join('');

    el.innerHTML = `
        <div class="constraint-group-tabs-row">
            ${chips}
            <button type="button" class="btn btn-secondary constraint-group-add" onclick="createConstraintGroup('OR')">+ Scénario alternatif (OU)</button>
        </div>
        <div class="constraint-group-hint">Les contraintes ajoutées via les boutons ci-dessus rejoignent le scénario actif (surligné). Cliquez un scénario pour l'activer ; ◀▶ pour le réordonner (l'ordre compte : ET/OU se lit de gauche à droite).</div>
    `;
}

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
                groupId: activeGroupId,
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

// Quand "Pas de fit majeur" est coché, les champs de fit manuels à Pique/Cœur
// n'ont plus de sens (la contrainte impose déjà max 7 cartes dans chacune) :
// on les vide et on les désactive pour éviter toute contradiction.
function toggleNoMajorFit(line) {
    const checked = document.getElementById(`line-${line}-no-major-fit`).checked;
    const spadesInput = document.getElementById(`line-${line}-spades-fit`);
    const heartsInput = document.getElementById(`line-${line}-hearts-fit`);
    [spadesInput, heartsInput].forEach(input => {
        input.disabled = checked;
        if (checked) input.value = '';
    });
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
        const anyFit = document.getElementById(`line-${line}-any-fit`).value;
        const noMajorFit = document.getElementById(`line-${line}-no-major-fit`).checked;
        
        if (hcp || spadesFit || heartsFit || diamondsFit || clubsFit || anyFit || noMajorFit) {
            const constraint = {
                id: Date.now() + Math.random(),
                type: 'line',
                line: lineNames[line],
                operator: isAddingOrVariant ? 'OR' : 'AND',
                groupId: activeGroupId,
                pointType: pointType,
                hcp: parseConstraintValueHCP(hcp),
                fits: {
                    SPADES: parseConstraintValue(spadesFit),
                    HEARTS: parseConstraintValue(heartsFit),
                    DIAMONDS: parseConstraintValue(diamondsFit),
                    CLUBS: parseConstraintValue(clubsFit),
                    ANY: parseConstraintValue(anyFit)
                },
                noMajorFit: noMajorFit
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
        document.getElementById(`line-${line}-any-fit`).value = '';
        document.getElementById(`line-${line}-no-major-fit`).checked = false;
        toggleNoMajorFit(line);
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
            groupId: activeGroupId,
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
            groupId: activeGroupId,
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
                groupId: activeGroupId,
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
                groupId: activeGroupId,
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
        groupId: activeGroupId,
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
    activeGroupId = c.groupId || defaultGroupId();
    pendingOrTarget = { type: 'hand', position: c.position };
    renderConstraints();
    openHandConstraintsModal();
}

// Démarre l'ajout d'une variante OU pour une contrainte de ligne existante
function addOrVariantLine(id) {
    const c = constraints.find(x => x.id === id);
    if (!c || c.type !== 'line') return;
    
    c.operator = 'OR';
    activeGroupId = c.groupId || defaultGroupId();
    pendingOrTarget = { type: 'line', line: c.line };
    renderConstraints();
    openLineConstraintsModal();
}

// Exporte les contraintes actuelles dans un fichier JSON téléchargeable.
// Format { constraints, constraintGroups } : conserve les scénarios (blocs) à l'export/import.
// Compatible en LECTURE avec l'ancien format (simple tableau plat de contraintes, sans blocs) —
// voir importConstraintsPreset.
function exportConstraintsPreset() {
    if (constraints.length === 0) {
        alert('Aucune contrainte à exporter.');
        return;
    }
    
    const payload = { constraints, constraintGroups };
    const json = JSON.stringify(payload, null, 2);
    downloadBlob(json, 'application/json', 'presets-bridge.json');
}

// Importe un fichier JSON de contraintes, en remplaçant les contraintes actuelles (avec confirmation)
function importConstraintsPreset(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        let imported;
        try {
            imported = JSON.parse(e.target.result);
        } catch (err) {
            alert('Erreur : le fichier n\'est pas un JSON valide.');
            event.target.value = '';
            return;
        }
        
        let importedConstraints;
        let importedGroups;

        if (Array.isArray(imported)) {
            // Ancien format : simple tableau plat de contraintes (sans notion de scénarios).
            // Toutes rejoignent un unique scénario par défaut — comportement identique à avant
            // l'introduction des scénarios alternatifs.
            importedConstraints = imported;
            importedGroups = [{ id: newGroupId(), operator: 'AND' }];
        } else if (imported && Array.isArray(imported.constraints)) {
            // Nouveau format : { constraints, constraintGroups }
            importedConstraints = imported.constraints;
            importedGroups = Array.isArray(imported.constraintGroups) && imported.constraintGroups.length > 0
                ? imported.constraintGroups
                : [{ id: newGroupId(), operator: 'AND' }];
        } else {
            alert('Erreur : le fichier ne contient pas une liste de contraintes valide.');
            event.target.value = '';
            return;
        }
        
        if (constraints.length > 0) {
            const confirmed = await showConfirmDialog(
                `Vous avez ${constraints.length} contrainte(s) en cours. ` +
                `L'import va les remplacer entièrement par les ${importedConstraints.length} contrainte(s) du fichier. Continuer ?`,
                'Remplacer'
            );
            if (!confirmed) {
                event.target.value = '';
                return;
            }
        }
        
        // Les contraintes sans groupId (venant de l'ancien format, ou d'un export antérieur
        // à cette fonctionnalité) rejoignent le premier scénario importé.
        const firstImportedGroupId = importedGroups[0].id;
        importedConstraints.forEach(c => { if (!c.groupId) c.groupId = firstImportedGroupId; });

        constraints = importedConstraints;
        constraintGroups = importedGroups;
        activeGroupId = firstImportedGroupId;
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

// Préremplit la modal de contrainte de main pour édition. Pour une contrainte "de base" (pas
// une variante OU), on réédite TOUTES les positions du même bloc en une fois — c'est comme ça
// qu'elles ont été créées à l'origine (un seul passage dans "Contraintes de main" remplissant
// N et S ensemble par ex.), donc "Modifier" doit rouvrir la même vue d'ensemble plutôt que de
// forcer une main à la fois. Les variantes OU restent éditées seules (elles sont scopées à une
// position précise par nature).
function editHandConstraint(id) {
    const c = constraints.find(x => x.id === id);
    if (!c || c.type !== 'hand') return;

    const isOrVariant = c.operator === 'OR';
    const gid = c.groupId || defaultGroupId();
    const siblings = isOrVariant
        ? [c]
        : constraints.filter(x => x.type === 'hand' && x.operator !== 'OR' && (x.groupId || defaultGroupId()) === gid);

    // On repart de champs vides pour éviter qu'une saisie non sauvegardée d'une précédente
    // ouverture de la modal ne traîne sur une position qu'on ne réédite pas ici.
    ['n', 'e', 's', 'w'].forEach(pos => {
        document.getElementById(`modal-${pos}-hcp`).value = '';
        document.getElementById(`modal-${pos}-spades`).value = '';
        document.getElementById(`modal-${pos}-hearts`).value = '';
        document.getElementById(`modal-${pos}-diamonds`).value = '';
        document.getElementById(`modal-${pos}-clubs`).value = '';
        document.getElementById(`modal-${pos}-dist`).value = '';
        const hcpRadio = document.querySelector(`input[name="hand-${pos}-pointType"][value="hcp"]`);
        if (hcpRadio) hcpRadio.checked = true;
    });

    siblings.forEach(sc => {
        const pos = sc.position.toLowerCase();
        document.getElementById(`modal-${pos}-hcp`).value = rangeToInputText(sc.hcp, 40);
        document.getElementById(`modal-${pos}-spades`).value = rangeToInputText(sc.suits.SPADES, 13);
        document.getElementById(`modal-${pos}-hearts`).value = rangeToInputText(sc.suits.HEARTS, 13);
        document.getElementById(`modal-${pos}-diamonds`).value = rangeToInputText(sc.suits.DIAMONDS, 13);
        document.getElementById(`modal-${pos}-clubs`).value = rangeToInputText(sc.suits.CLUBS, 13);
        document.getElementById(`modal-${pos}-dist`).value = sc.distributions || '';

        const pointTypeRadio = document.querySelector(`input[name="hand-${pos}-pointType"][value="${sc.pointType}"]`);
        if (pointTypeRadio) pointTypeRadio.checked = true;
    });

    // Si la contrainte d'origine était une variante OU, on préserve ce statut pour la ressauvegarde
    pendingOrTarget = isOrVariant ? { type: 'hand', position: c.position } : null;
    
    // On garde une copie de TOUTES les contraintes retirées pour pouvoir les restaurer si
    // l'utilisateur annule au lieu de sauvegarder
    pendingEditBackup = { type: 'hand', constraints: siblings };
    
    // La contrainte réédite doit se resauvegarder dans son bloc d'origine, pas dans le bloc
    // actuellement actif si l'utilisateur a changé d'onglet entre-temps.
    activeGroupId = gid;
    
    // Supprime les anciennes contraintes : saveHandConstraints() en recréera à leur place
    // (une par position encore renseignée dans le formulaire au moment de la sauvegarde)
    const idsToRemove = new Set(siblings.map(sc => sc.id));
    constraints = constraints.filter(x => !idsToRemove.has(x.id));
    renderConstraints();
    
    openHandConstraintsModal();
}

// Préremplit la modal de contrainte de ligne pour édition. Même logique que editHandConstraint :
// réédite NS et EO ensemble si les deux existent dans le même bloc (hors variantes OU, éditées seules).
function editLineConstraint(id) {
    const c = constraints.find(x => x.id === id);
    if (!c || c.type !== 'line') return;

    const isOrVariant = c.operator === 'OR';
    const gid = c.groupId || defaultGroupId();
    const siblings = isOrVariant
        ? [c]
        : constraints.filter(x => x.type === 'line' && x.operator !== 'OR' && (x.groupId || defaultGroupId()) === gid);

    ['ns', 'ew'].forEach(line => {
        document.getElementById(`line-${line}-hcp`).value = '';
        document.getElementById(`line-${line}-spades-fit`).value = '';
        document.getElementById(`line-${line}-hearts-fit`).value = '';
        document.getElementById(`line-${line}-diamonds-fit`).value = '';
        document.getElementById(`line-${line}-clubs-fit`).value = '';
        document.getElementById(`line-${line}-any-fit`).value = '';
        document.getElementById(`line-${line}-no-major-fit`).checked = false;
        toggleNoMajorFit(line);
        const hcpRadio = document.querySelector(`input[name="line-${line}-pointType"][value="hcp"]`);
        if (hcpRadio) hcpRadio.checked = true;
    });

    siblings.forEach(sc => {
        const line = sc.line.toLowerCase();
        document.getElementById(`line-${line}-hcp`).value = rangeToInputText(sc.hcp, 40);
        document.getElementById(`line-${line}-spades-fit`).value = rangeToInputText(sc.fits.SPADES, 13);
        document.getElementById(`line-${line}-hearts-fit`).value = rangeToInputText(sc.fits.HEARTS, 13);
        document.getElementById(`line-${line}-diamonds-fit`).value = rangeToInputText(sc.fits.DIAMONDS, 13);
        document.getElementById(`line-${line}-clubs-fit`).value = rangeToInputText(sc.fits.CLUBS, 13);
        document.getElementById(`line-${line}-any-fit`).value = sc.fits.ANY ? rangeToInputText(sc.fits.ANY, 13) : '';
        document.getElementById(`line-${line}-no-major-fit`).checked = !!sc.noMajorFit;
        toggleNoMajorFit(line);

        const pointTypeRadio = document.querySelector(`input[name="line-${line}-pointType"][value="${sc.pointType}"]`);
        if (pointTypeRadio) pointTypeRadio.checked = true;
    });
    
    // Si la contrainte d'origine était une variante OU, on préserve ce statut pour la ressauvegarde
    pendingOrTarget = isOrVariant ? { type: 'line', line: c.line } : null;
    
    // On garde une copie de TOUTES les contraintes retirées pour pouvoir les restaurer si
    // l'utilisateur annule au lieu de sauvegarder
    pendingEditBackup = { type: 'line', constraints: siblings };
    
    // La contrainte réédite doit se resauvegarder dans son bloc d'origine, pas dans le bloc
    // actuellement actif si l'utilisateur a changé d'onglet entre-temps.
    activeGroupId = gid;
    
    // Supprime les anciennes contraintes : saveLineConstraints() en recréera à leur place
    const idsToRemove = new Set(siblings.map(sc => sc.id));
    constraints = constraints.filter(x => !idsToRemove.has(x.id));
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
                if (!isRangeActive(range, 13)) continue;
                const label = suit === 'ANY' ? '🌈 (n\'importe quelle couleur)' : SUIT_SYMBOLS[suit];
                fitParts.push(`${label} fit ${formatRangeValue(range, 13)}`);
            }
            if (fitParts.length > 0) {
                parts.push(fitParts.join(', '));
            }
        }
        
        if (c.noMajorFit) {
            parts.push('Pas de fit majeur (♠/♥ ≤ 7)');
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

// Construit les lignes de résumé (tableau de chaînes HTML) pour un sous-ensemble de contraintes
// appartenant à UN SEUL bloc. Logique de regroupement OU par clé (position/ligne) inchangée par
// rapport à avant l'introduction des blocs.
function buildConstraintSummaryParts(items) {
    function posLabel(c) {
        if (c.type === 'line') return c.line === 'NS' ? 'Ligne NS' : 'Ligne EO';
        const names = { N:'Nord', E:'Est', S:'Sud', W:'Ouest' };
        return names[c.position] || c.position;
    }

    // Regrouper : groupes OR par clé, AND individuels
    const groups = {}; // key -> { label, items: [c], isOr }
    const order = [];

    items.forEach(c => {
        const key = c.operator === 'OR' ? `or:${groupKey(c)}` : `and:${c.id}`;
        if (!groups[key]) {
            groups[key] = { label: posLabel(c), items: [], isOr: c.operator === 'OR' };
            order.push(key);
        }
        groups[key].items.push(c);
    });

    return order.map(key => {
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

            const variantTexts = g.items.map((c, i) => {
                const hcpActive = isRangeActive(c.hcp, 40);
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
}

function buildConstraintSummary() {
    const el = document.getElementById('constraintSummary');
    if (!el) return;
    
    if (constraints.length === 0) {
        el.style.display = 'none';
        return;
    }

    const dgid = defaultGroupId();

    const bodyHtml = constraintGroups.map((group, idx) => {
        const items = constraints.filter(c => (c.groupId || dgid) === group.id);
        if (items.length === 0) return '';
        const opBadge = idx === 0 ? '' : `<span style="color:#e67e22; font-weight:bold; margin-right:6px;">${group.operator === 'OR' ? 'OU' : 'ET'} —</span>`;
        const parts = buildConstraintSummaryParts(items);
        return `
            <div style="margin-top: ${idx === 0 ? '0' : '8px'};">
                <div style="font-size: 12px; opacity: 0.8; margin-bottom: 2px;">${opBadge}Scénario ${idx + 1}</div>
                ${parts.map(p => `<div style="padding: 3px 0 3px 10px; border-bottom: 1px solid rgba(52,152,219,0.2);">${p}</div>`).join('')}
            </div>
        `;
    }).join('');

    el.style.display = 'block';
    el.innerHTML = `
        <div style="font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; opacity: 0.7;">🔍 Résumé des contraintes</div>
        ${bodyHtml}
    `;
}

function groupKey(c) {
    return c.type === 'line' ? `line:${c.line}` : `hand:${c.position}`;
}

function positionLabel(c) {
    return c.type === 'line'
        ? `Ligne ${c.line === 'NS' ? 'Nord-Sud' : 'Est-Ouest'}`
        : getPositionName(c.position);
}

// Construit le HTML d'une liste de contraintes appartenant à UN SEUL bloc (déjà filtrées en
// amont par renderConstraints). Reprend la logique historique de regroupement visuel des
// variantes OU par position/ligne, inchangée — seule la portée (un bloc plutôt que la totalité)
// a changé.
function buildConstraintItemsHTML(items) {
    const orGroups = {}; // groupKey -> [constraints]
    const orGroupOrder = []; // ordre d'apparition des groupes dans le tableau d'origine
    const andConstraints = []; // {constraint, originalIndex}

    items.forEach((c, i) => {
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

    return html;
}

// Affiche la liste de contraintes, groupée par scénario (constraintGroups). Chaque scénario est
// TOUJOURS entouré d'un cadre avec son propre en-tête (numéro + opérateur ET/OU par rapport aux
// scénarios précédents) — y compris s'il n'y en a qu'un seul, pour que le regroupement des
// contraintes qui se sauvegardent/s'éditent ensemble (ex. N+S créées dans la même session) soit
// visible d'un coup d'œil plutôt que de se révéler seulement au moment de cliquer "Modifier".
function renderConstraints() {
    const list = document.getElementById('constraintList');
    renderConstraintGroupTabs();

    if (constraints.length === 0 && constraintGroups.length <= 1) {
        list.innerHTML = '<div style="color: #7f8c8d; font-style: italic;">Aucune contrainte définie</div>';
        buildConstraintSummary();
        return;
    }

    const dgid = defaultGroupId();
    let html = '';

    constraintGroups.forEach((group, idx) => {
        const groupItems = constraints.filter(c => (c.groupId || dgid) === group.id);

        const opLabel = idx === 0 ? '' : `<span class="constraint-block-op constraint-block-op-${group.operator.toLowerCase()}">${group.operator === 'OR' ? 'OU' : 'ET'}</span>`;
        html += `
            <div class="constraint-block ${group.id === activeGroupId ? 'active' : ''}">
                <div class="constraint-block-header">
                    ${opLabel}
                    <span>Scénario ${idx + 1}</span>
                </div>
                ${groupItems.length > 0
                    ? buildConstraintItemsHTML(groupItems)
                    : `<div style="color:#7f8c8d; font-style:italic; padding: 4px 0;">Scénario vide — cliquez dessus dans les onglets ci-dessus puis utilisez les boutons "+ Contraintes..." pour le remplir.</div>`}
            </div>
        `;
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
const DISTRIBUTION_PRESET_LEGEND = "D'autres combinaisons sont possibles en saisie manuelle : M5m4, M5m5, M6m4, M4m6, M6+, m7, M5x5, etc.";

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
