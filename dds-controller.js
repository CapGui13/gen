// dds-controller.js - Orchestration du calcul du double mort pour les donnes générées
//
// ===== ARCHITECTURE GÉNÉRALE =====
// Double mort = pour chaque case (couleur × déclarant), nombre de levées réalisables. Ce fichier
// orchestre le calcul en parallèle via Web Workers (dds-worker.js, qui load la compilation
// Emscripten de libdds de Bo Haglund). Fallback mono-thread si file:// ou Web Workers indisponibles.
//
// ===== POOL DE WORKERS =====
// - ddWorkerPool[] : liste de Workers actifs (croissance à la demande, plafonné à 8 ou nb cores)
// - ddWorkerBusy[] : booléens, suivi qui travaille
// - ddQueue[] : file partagée de {"id", "pbn"} à traiter
// - ddInFlight (Set) : IDs actuellement en attente ou en cours (anti-doublon)
// Quand un worker fini, il repioche automatiquement dans la queue (dispatch()).
//
// ===== RÉSULTATS ET STOCKAGE =====
// Résultat d'un calcul : stocké dans generatedDeals[id]._ddTable = table (objet structuré).
// Table format : { strain: { pos: tricks } } où strain ∈ {N,S,H,D,C} et pos ∈ {N,S,E,W}.
// Affiché via buildDDTableHTML(table, dealIdx), qui met en évidence le meilleur contrat.
//
// ===== MISE EN ÉVIDENCE (color-coding du meilleur contrat) =====
// Calcul par CAMP (NS vs EW indépendamment) et par PALIER (chelem > manche > partielle).
// Palier "palier le plus haut du camp" est affiché :
//  - Cases au meilleur score du palier : vert vif (dd-best-contract)
//  - Autres du même palier et même camp (manche/chelem seulement) : vert terne (dd-secondary-contract)
//  - Tout le reste (paliers inférieur, l'autre camp) : pas d'highlight
// Partielle : seule la meilleure est marquée (pas de secondaire).
// Ce pattern évite que EW écrase NS ou vice-versa dans la même table.
//
// ===== DOUBLE MORT & GÉNÉRATION =====
// - Déclenché manuellement via boutons (jamais auto après génération).
// - Bouton global : "🧮 Calculer le double mort" (toutes les donnes sans _ddTable).
// - Bouton par carte : "🧮 Calculer" (cette donne seule, si pas déjà _ddTable).
// - `resetDoubleDummyForNewGeneration()` appelé par renderDeals(append=false) : réinitialise
//   la file et ignore les résultats en vol de l'ancienne génération.
// - Mode "ajout" (append=true dans renderDeals) : ne réinitialise PAS → calculs en vol
//   pour l'ancienne génération restent valables, nouvelles donnes débutent leur propre cycle.
//
// ===== FALLBACK MONO-THREAD =====
// Si Web Workers échouent (file://), calcul sur le fil principal en chunks via requestIdleCallback.
// Banneau d'avertissement et logs en console. Raison : Web Workers ne chargent pas les scripts
// via file:// (sécurité navigateur). Solution : lancer via serveur local (python3 -m http.server).
//
// ===== DÉPENDANCES =====
// - dds-worker.js : Web Worker chargeant dds-lib.js et exécutant generateDDTable(pbn)
// - dds-lib.js : Compilation Emscripten de libdds (Bo Haglund)
// - generator.js : generatedDeals[], getDealerAndVulnerability(), buildDDTableHTML()

const STRAIN_ORDER = ['N', 'S', 'H', 'D', 'C'];
const STRAIN_DISPLAY = {
    N: { label: 'SA', class: '' },
    S: { label: '♠', class: 'spades' },
    H: { label: '♥', class: 'hearts' },
    D: { label: '♦', class: 'diamonds' },
    C: { label: '♣', class: 'clubs' }
};
const DD_POSITIONS = ['N', 'S', 'E', 'W'];

// ===== Calcul du score du meilleur contrat par case =====
//
// Pour chaque case (couleur x déclarant), on suppose que le camp du déclarant enchérit
// exactement au palier permis par le nombre de levées trouvées par le double mort (ni plus,
// ni moins de risque : le palier qui réalise tout juste le contrat, sans chute ni levée de
// mieux non demandée). On calcule alors le score de duplicate correspondant (barème SEF/FFB
// standard, non contré), en tenant compte de la vulnérabilité du camp concerné pour cette
// donne. La case dont le score est le plus élevé sur toute la table est mise en évidence.

function trickPoints(strain, level) {
    if (strain === 'N') return 40 + (level - 1) * 30;
    if (strain === 'H' || strain === 'S') return level * 30;
    return level * 20; // C ou D
}

// Score total du contrat tout juste réalisé à ce palier (barème SEF/FFB standard, non contré),
// selon la vulnérabilité du camp concerné.
function contractScoreFromTrickPoints(trickPts, level, vulnerable) {
    let total = trickPts;
    total += trickPts >= 100 ? (vulnerable ? 500 : 300) : 50; // prime de manche ou de partielle
    if (level === 6) total += vulnerable ? 750 : 500;         // petit chelem
    else if (level === 7) total += vulnerable ? 1500 : 1000;  // grand chelem
    return total;
}

// Calcule, pour chaque case de la table, son score et son "palier" (chelem / manche / partielle).
// Le palier le plus rentable est déterminé SÉPARÉMENT pour chaque camp (NS et EW), puisque ce sont
// deux enchères indépendantes (l'un ne joue pas le contrat de l'autre) : le meilleur contrat NS
// n'a aucune raison d'être éclipsé par un meilleur score côté EW, et inversement.
//
// Pour un camp donné : chelem prime sur manche, qui prime sur partielle. Seules les cases du
// palier le plus haut atteint par CE camp sont mises en évidence : la ou les meilleures en vert,
// les autres cases gagnantes du même palier (moins rentables) en vert plus terne — sauf au palier
// "partielle", qui n'a pas de prime notable : on y marque uniquement la ou les meilleures cases,
// sans dégradé secondaire pour les autres partielles.
function computeDDScores(table, dealIdx) {
    const { vulnerable } = getDealerAndVulnerability(dealIdx + 1);
    const nsVuln = (vulnerable === 'NS' || vulnerable === 'Both');
    const ewVuln = (vulnerable === 'EW' || vulnerable === 'Both');

    const info = {};
    const bySide = { NS: [], EW: [] };

    for (const strain of STRAIN_ORDER) {
        info[strain] = {};
        for (const pos of DD_POSITIONS) {
            const side = (pos === 'N' || pos === 'S') ? 'NS' : 'EW';
            const tricks = table[strain][pos];
            const level = tricks - 6;

            let score = null;
            let tier = null;
            if (level >= 1) {
                const trickPts = trickPoints(strain, level);
                score = contractScoreFromTrickPoints(trickPts, level, side === 'NS' ? nsVuln : ewVuln);
                tier = level >= 6 ? 'slam' : (trickPts >= 100 ? 'game' : 'partial');
            }

            info[strain][pos] = { score, tier, side };
            if (tier) bySide[side].push({ score, tier });
        }
    }

    const sideSummary = {};
    for (const side of ['NS', 'EW']) {
        const cells = bySide[side];
        let activeTier = null;
        if (cells.some(c => c.tier === 'slam')) activeTier = 'slam';
        else if (cells.some(c => c.tier === 'game')) activeTier = 'game';
        else if (cells.some(c => c.tier === 'partial')) activeTier = 'partial';

        let bestScore = null;
        if (activeTier) {
            bestScore = Math.max(...cells.filter(c => c.tier === activeTier).map(c => c.score));
        }

        sideSummary[side] = { activeTier, bestScore };
    }

    return { info, sideSummary };
}

// ===== FILTRE D'AFFICHAGE PAR PALIER (manche / chelem) =====
//
// Filtre purement visuel, appliqué APRÈS coup sur les donnes dont le double mort a déjà été
// calculé (deal._ddTable) : ne masque/affiche que les cartes déjà rendues par renderDeals(),
// ne relance jamais de calcul. Une donne pas encore calculée est masquée tant qu'un filtre
// (autre que "Toutes") est actif, puisqu'on ne peut pas savoir si elle est éligible.
//
// Pourquoi pas une contrainte à la génération ? Le double mort se calcule via les Workers
// (async) ou, en repli, via appel synchrone sur le fil principal — dans les deux cas
// incompatible avec la boucle serrée generateDeal()/checkAllConstraints() qui teste des
// centaines de milliers de donnes candidates. Comme les donnes manche/chelem sont plus rares
// que les donnes quelconques, contraindre à la génération multiplierait les tentatives (donc
// les calculs DD complets) par un facteur élevé, avec un risque de blocage. Filtrer après
// coup reste rapide et cohérent avec le flux existant (calcul DD toujours manuel, jamais
// automatique).

// Palier requis pour la manche selon la couleur : 3SA (9 levées), 4 à majeure (10 levées),
// 5 à mineure (11 levées).
function gameThreshold(strain) {
    if (strain === 'N') return 9;
    if (strain === 'H' || strain === 'S') return 10;
    return 11; // D ou C
}

// Donne, pour chaque camp (NS et EW), le plus grand nombre de levées réalisables toutes
// couleurs confondues (SA, ♠, ♥, ♦, ♣) et déclarants confondus (N ou S pour NS, E ou W pour EW).
function dealMaxTricksBySide(table) {
    let ns = 0, ew = 0;
    for (const strain of STRAIN_ORDER) {
        for (const pos of DD_POSITIONS) {
            const tricks = table[strain][pos];
            if (pos === 'N' || pos === 'S') {
                if (tricks > ns) ns = tricks;
            } else {
                if (tricks > ew) ew = tricks;
            }
        }
    }
    return { NS: ns, EW: ew };
}

// Donne, pour chaque camp, si la manche est réalisable dans AU MOINS UNE couleur, en tenant
// compte du palier propre à chaque couleur (contrairement au chelem, "manche" n'est pas un
// simple seuil de levées uniforme : 9 levées suffisent à SA mais pas à trèfle).
function dealSideReachesGame(table) {
    let nsGame = false, ewGame = false;
    for (const strain of STRAIN_ORDER) {
        const threshold = gameThreshold(strain);
        for (const pos of DD_POSITIONS) {
            if (table[strain][pos] >= threshold) {
                if (pos === 'N' || pos === 'S') nsGame = true;
                else ewGame = true;
            }
        }
    }
    return { NS: nsGame, EW: ewGame };
}

// mode : 'all' (pas de filtre), 'partial' (partielle uniquement, aucun camp n'atteint la
// manche), 'game' (manche ou mieux, 3SA/4M/5m — un chelem satisfait forcément aussi le seuil
// de manche dans sa couleur), 'slam12' (petit ou grand chelem, 12+ levées), 'slam13' (grand
// chelem uniquement, 13 levées).
function dealMeetsSlamFilter(deal, mode) {
    if (mode === 'all') return true;
    if (!deal._ddTable) return false; // double mort pas encore calculé : on ne peut pas juger

    if (mode === 'partial') {
        const { NS, EW } = dealSideReachesGame(deal._ddTable);
        return !NS && !EW;
    }

    if (mode === 'game') {
        const { NS, EW } = dealSideReachesGame(deal._ddTable);
        return NS || EW;
    }

    const { NS, EW } = dealMaxTricksBySide(deal._ddTable);
    const threshold = mode === 'slam13' ? 13 : 12;
    return NS >= threshold || EW >= threshold;
}

// Applique le filtre courant (sélecteur #dealSlamFilter) à toutes les cartes déjà rendues,
// sans jamais réécrire le DOM ni relancer de calcul. À appeler après renderDeals() et après
// chaque résultat DD reçu (applyResult), pour que les cartes apparaissent/disparaissent au
// fur et à mesure que leur double mort devient disponible.
function applyDealFilter() {
    if (!generatedDeals) return;
    const select = document.getElementById('dealSlamFilter');
    const mode = select ? select.value : 'all';

    let visibleCount = 0;
    let pendingCount = 0;

    generatedDeals.forEach((deal, idx) => {
        const card = document.getElementById(`deal-card-${idx}`);
        if (!card) return;
        const visible = dealMeetsSlamFilter(deal, mode);
        card.style.display = visible ? '' : 'none';
        if (visible) visibleCount++;
        if (mode !== 'all' && !deal._ddTable) pendingCount++;
    });

    const countEl = document.getElementById('dealFilterCount');
    if (!countEl) return;
    if (mode === 'all') {
        countEl.textContent = '';
    } else {
        let txt = `${visibleCount} / ${generatedDeals.length} donne(s) affichée(s)`;
        if (pendingCount > 0) txt += ` — ${pendingCount} en attente de calcul`;
        countEl.textContent = txt;
    }
}

// file:// ne permet généralement pas de créer des Web Workers : autant le savoir avant
// même d'essayer, plutôt que de tenter puis échouer silencieusement à chaque calcul.
const DD_FILE_PROTOCOL = (typeof location !== 'undefined' && location.protocol === 'file:');

let ddWorkerPool = [];
let ddWorkerBusy = [];           // ddWorkerBusy[i] = true si le worker i traite une donne
let ddWorkerPoolFailed = DD_FILE_PROTOCOL;
let ddFallbackNoticeShown = false;
let ddMainThreadRunning = false;

let ddQueue = [];                // file d'attente partagée : { id, pbn }
const ddInFlight = new Set();    // ids actuellement en file ou en cours de calcul (anti-doublon)
const ddItemGeneration = new Map(); // id -> génération de donnes au moment de la mise en file
let ddCurrentGenerationId = 0;   // incrémenté à chaque nouvelle génération de donnes

// Suivi de progression pour le job global ("Calculer le double mort" pour toutes les donnes) ;
// les calculs individuels n'affichent pas de barre de progression.
let ddBatchTotal = 0;
let ddBatchDone = 0;
let ddBatchFailed = 0;
let ddBatchActive = false;

// Taille maximale du pool : un worker par cœur logique disponible, plafonné à 8.
// La taille réelle grandit progressivement selon le travail en attente (voir dispatch),
// pour ne pas payer le coût de démarrage de 8 workers quand une seule donne est demandée.
function getMaxPoolSize() {
    const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : 4;
    return Math.max(1, Math.min(cores, 8));
}

function ensureWorkerPool(size) {
    while (ddWorkerPool.length < size) {
        const idx = ddWorkerPool.length;
        const worker = new Worker('dds-worker.js');
        worker.onmessage = (event) => handleWorkerMessage(idx, event.data);
        worker.onerror = (event) => handleWorkerFatal(idx, event && event.message);
        ddWorkerPool.push(worker);
        ddWorkerBusy.push(false);
    }
}

// Construit la chaîne PBN d'une donne (même format que celui utilisé pour l'export)
function dealToPBNString(deal) {
    const hands = ['N', 'E', 'S', 'W'].map(pos => {
        return SUITS.map(suit => deal[pos][suit].join('')).join('.');
    }).join(' ');
    return 'N:' + hands;
}

function buildDDTableHTML(table, dealIdx) {
    if (!table) return '';
    const { info, sideSummary } = computeDDScores(table, dealIdx);
    const rows = STRAIN_ORDER.map(strain => {
        const strainInfo = STRAIN_DISPLAY[strain];
        const cells = DD_POSITIONS.map(pos => {
            const cellInfo = info[strain][pos];
            const summary = sideSummary[cellInfo.side];
            let cls = '';
            if (summary.activeTier && cellInfo.tier === summary.activeTier) {
                if (cellInfo.score === summary.bestScore) {
                    cls = ' class="dd-best-contract"';
                } else if (summary.activeTier !== 'partial') {
                    cls = ' class="dd-secondary-contract"';
                }
            }
            return `<td${cls}>${table[strain][pos]}</td>`;
        }).join('');
        return `<tr><th class="${strainInfo.class}">${strainInfo.label}</th>${cells}</tr>`;
    }).join('');
    return `
        <table class="dd-table">
            <thead>
                <tr><th></th>${DD_POSITIONS.map(p => `<th>${p}</th>`).join('')}</tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function setDDCellContent(idx, html) {
    const el = document.getElementById(`dd-table-${idx}`);
    if (el) el.innerHTML = html;
}

// Placeholder par défaut d'une carte de donne : un bouton pour lancer le calcul de CETTE
// donne uniquement (le calcul n'est jamais automatique).
function ddPlaceholderHTML(idx) {
    return `<button type="button" class="btn btn-secondary dd-compute-btn" onclick="computeDoubleDummyForDeal(${idx})">🧮 Calculer le double mort</button>`;
}

function ddLoadingHTML(label) {
    return `<div class="dd-table-placeholder">⏳ ${label || 'Calcul...'}</div>`;
}

function ensureDDProgressElement() {
    let bar = document.getElementById('ddProgressBar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'ddProgressBar';
    bar.className = 'dd-progress-bar';
    const actions = document.querySelector('#resultsPanel .header-actions');
    if (actions) actions.parentNode.insertBefore(bar, actions.nextSibling);
    return bar;
}

function updateDDProgress() {
    if (!ddBatchActive) return;
    const bar = document.getElementById('ddProgressBar');
    if (!bar) return;
    const cancelBtn = document.getElementById('ddCancelBtn');

    if (ddBatchDone >= ddBatchTotal) {
        const suffix = ddBatchFailed > 0 ? ` (${ddBatchFailed} erreur(s))` : '';
        bar.textContent = `✓ Double mort calculé pour ${ddBatchTotal} donne(s)${suffix}`;
        ddBatchActive = false;
        if (cancelBtn) cancelBtn.style.display = 'none';
        setTimeout(() => {
            if (bar.textContent.startsWith('✓')) bar.style.display = 'none';
        }, 4000);
    } else {
        bar.style.display = 'block';
        if (cancelBtn) cancelBtn.style.display = '';
        const modeSuffix = ddWorkerPoolFailed ? ' (mode séquentiel, un seul cœur)' : '';
        bar.textContent = `⏳ Calcul du double mort...${modeSuffix} ${ddBatchDone} / ${ddBatchTotal}`;
    }
}

// Explique une seule fois, en console et dans l'UI, pourquoi le calcul tourne en mode
// séquentiel (un seul cœur) plutôt qu'en parallèle sur plusieurs Workers.
function notifyDDFallback(reason) {
    console.warn(
        `[double mort] Calcul parallèle indisponible (${reason}) — repli sur un seul cœur, ce qui est plus lent. ` +
        `Pour activer le calcul multi-cœurs, ouvre la page via un petit serveur local (ex: "python3 -m http.server" ` +
        `puis http://localhost:8000/) plutôt qu'en double-cliquant sur le fichier.`
    );

    if (ddFallbackNoticeShown) return;
    ddFallbackNoticeShown = true;

    const banner = document.createElement('div');
    banner.className = 'dd-fallback-notice';
    banner.innerHTML = `
        ⚠️ Double mort calculé sur un seul cœur (Web Workers indisponibles en ouverture directe du fichier).
        Pour accélérer, lance la page via un serveur local (ex : <code>python3 -m http.server</code>) au lieu du double-clic.
        <button type="button" class="dd-fallback-notice-close" onclick="this.parentElement.remove()">✕</button>
    `;
    const actions = document.querySelector('#resultsPanel .header-actions');
    if (actions) actions.parentNode.insertBefore(banner, actions.nextSibling);
}

// ===== File d'attente partagée =====

// Ajoute des donnes à la file et lance/poursuit leur traitement.
// trackBatch : si vrai, ces donnes comptent dans la barre de progression globale.
function enqueueDDItems(items, trackBatch) {
    if (items.length === 0) return;

    if (trackBatch) {
        ddBatchActive = true;
        ensureDDProgressElement();
        updateDDProgress();
    }

    for (const item of items) {
        if (ddInFlight.has(item.id)) continue; // déjà en file ou en cours, pas de doublon
        ddInFlight.add(item.id);
        ddItemGeneration.set(item.id, ddCurrentGenerationId);
        ddQueue.push(item);
    }

    dispatch();
}

function dispatch() {
    if (ddQueue.length === 0) return;

    if (ddWorkerPoolFailed) {
        dispatchMainThread();
        return;
    }

    // La taille du pool grandit selon le travail en attente, sans jamais dépasser le
    // plafond (cœurs disponibles, max 8) ni redescendre.
    const desired = Math.min(getMaxPoolSize(), Math.max(ddWorkerPool.length, ddQueue.length));
    try {
        ensureWorkerPool(desired);
    } catch (err) {
        // new Worker(...) a levé une exception synchrone (ex : sécurité file://)
        ddWorkerPoolFailed = true;
        ddWorkerPool = [];
        ddWorkerBusy = [];
        notifyDDFallback('échec de création des Web Workers : ' + (err && err.message ? err.message : String(err)));
        dispatchMainThread();
        return;
    }

    for (let i = 0; i < ddWorkerPool.length && ddQueue.length > 0; i++) {
        if (ddWorkerBusy[i]) continue;
        const item = ddQueue.shift();
        ddWorkerBusy[i] = true;
        ddWorkerPool[i].postMessage({ type: 'solve', id: item.id, pbn: item.pbn });
    }
}

function handleWorkerMessage(workerIndex, msg) {
    if (!msg) return;

    if (msg.type === 'fatal') {
        handleWorkerFatal(workerIndex, msg.message);
        return;
    }

    ddWorkerBusy[workerIndex] = false;

    if (msg.type === 'result') {
        applyResult(msg.id, msg.table, null);
    } else if (msg.type === 'error') {
        applyResult(msg.id, null, msg.message);
    }

    dispatch(); // ce worker est libre : lui donner la suite de la file s'il y en a
}

function handleWorkerFatal(workerIndex, message) {
    // Un worker n'a pas pu charger dds-lib.js (ex: sécurité file://) : on abandonne tout
    // le pool et on repasse toute la file d'attente au calcul sur le fil principal.
    if (ddWorkerPoolFailed) return;
    ddWorkerPoolFailed = true;
    ddWorkerPool.forEach(w => w.terminate());
    ddWorkerPool = [];
    ddWorkerBusy = [];
    notifyDDFallback(message || 'erreur d\'un Web Worker en cours d\'exécution');
    dispatchMainThread();
}

// --- Repli fil principal (sans Worker), même file d'attente partagée ---
// On utilise requestIdleCallback quand il est disponible pour ne travailler que pendant
// les temps morts du navigateur ; sinon setTimeout(0) avec un budget dur par tranche,
// pour ne jamais geler l'interface même sur un calcul long.
const ddScheduleIdle = (typeof requestIdleCallback === 'function')
    ? (cb) => requestIdleCallback(cb, { timeout: 200 })
    : (cb) => setTimeout(() => cb({ timeRemaining: () => 0, didTimeout: true }), 0);

function dispatchMainThread() {
    if (ddMainThreadRunning) return;
    ddMainThreadRunning = true;
    ddScheduleIdle(stepMainThread);
}

function stepMainThread() {
    const BATCH_BUDGET_MS = 32; // borne dure par tranche, même si le temps mort signalé est long
    const start = Date.now();
    while (ddQueue.length > 0 && Date.now() - start < BATCH_BUDGET_MS) {
        const { id, pbn } = ddQueue.shift();
        try {
            const raw = Module.cwrap('generateDDTable', 'string', ['string'])(pbn);
            applyResult(id, JSON.parse(raw), null);
        } catch (err) {
            applyResult(id, null, err && err.message ? err.message : String(err));
        }
    }

    if (ddQueue.length > 0) {
        ddScheduleIdle(stepMainThread);
    } else {
        ddMainThreadRunning = false;
    }
}

// --- Application d'un résultat, quelle que soit sa provenance (worker ou fil principal) ---
function applyResult(id, table, errorMessage) {
    ddInFlight.delete(id);
    const itemGeneration = ddItemGeneration.get(id);
    ddItemGeneration.delete(id);

    if (itemGeneration !== ddCurrentGenerationId) return; // donne d'une génération précédente : on ignore

    if (ddBatchActive) {
        ddBatchDone++;
        if (!table) ddBatchFailed++;
    }

    if (table) {
        generatedDeals[id]._ddTable = table;
        setDDCellContent(id, buildDDTableHTML(table, id));
    } else {
        setDDCellContent(id, '<div class="dd-table-error">Erreur de calcul</div>');
    }

    if (ddBatchActive) updateDDProgress();

    // La donne vient peut-être de devenir éligible (ou non) au filtre par palier actif.
    applyDealFilter();
}

// ===== Annulation du calcul du double mort =====
//
// Arrête tout calcul du double mort en cours ou en attente : vide la file, termine
// immédiatement les Workers actifs (le calcul DD est sans état — un Worker relancé plus tard
// repart de zéro proprement) et laisse le repli mono-thread s'éteindre de lui-même (sa boucle
// vérifie ddQueue à chaque tranche : la file étant vidée ici, elle s'arrête au prochain passage
// sans autre intervention). Les donnes dont le calcul était en vol reviennent au placeholder
// "🧮 Calculer" plutôt que de rester bloquées en "⏳ Calcul...".
function cancelDoubleDummyBatch() {
    ddQueue = [];

    if (ddWorkerPool.length > 0) {
        ddWorkerPool.forEach(w => w.terminate());
        ddWorkerPool = [];
        ddWorkerBusy = [];
    }

    for (const id of ddInFlight) {
        setDDCellContent(id, ddPlaceholderHTML(id));
    }
    ddInFlight.clear();
    ddItemGeneration.clear();

    // Nouvelle génération logique : tout résultat tardif d'un calcul déjà en vol (peu probable
    // après terminate(), mais possible côté fil principal) sera ignoré par applyResult().
    ddCurrentGenerationId++;

    ddBatchActive = false;
    ddBatchTotal = 0;
    ddBatchDone = 0;
    ddBatchFailed = 0;

    const bar = document.getElementById('ddProgressBar');
    if (bar) {
        bar.textContent = '⏹ Calcul du double mort arrêté';
        bar.style.display = 'block';
        setTimeout(() => {
            if (bar.textContent.startsWith('⏹')) bar.style.display = 'none';
        }, 3000);
    }
    const cancelBtn = document.getElementById('ddCancelBtn');
    if (cancelBtn) cancelBtn.style.display = 'none';

    applyDealFilter();
}

// ===== API appelée depuis generator.js / index.html =====

// À appeler une fois par nouvelle génération de donnes (dans renderDeals), pour repartir
// sur une file propre et ignorer tout résultat en vol appartenant à l'ancien lot de donnes.
function resetDoubleDummyForNewGeneration() {
    ddCurrentGenerationId++;
    ddQueue = [];
    ddInFlight.clear();
    ddItemGeneration.clear();
    ddBatchTotal = 0;
    ddBatchDone = 0;
    ddBatchFailed = 0;
    ddBatchActive = false;
    const bar = document.getElementById('ddProgressBar');
    if (bar) bar.style.display = 'none';

    // Nouvelle génération : plus aucune donne n'a de _ddTable, le filtre par palier n'a
    // donc plus de sens tant que rien n'est recalculé. On le remet à "Toutes".
    const select = document.getElementById('dealSlamFilter');
    if (select) select.value = 'all';
    const countEl = document.getElementById('dealFilterCount');
    if (countEl) countEl.textContent = '';
}

// Calcule le double mort pour toutes les donnes générées (bouton global "🧮 Calculer le double mort")
// Calcule le double mort pour toutes les donnes générées qui n'ont pas encore de résultat
// (bouton global "🧮 Calculer le double mort"). Les donnes déjà calculées sont laissées telles quelles.
function computeDoubleDummyForAllDeals() {
    if (!generatedDeals || generatedDeals.length === 0) return;

    const items = generatedDeals
        .map((deal, idx) => ({ deal, idx }))
        .filter(({ deal }) => !deal._ddTable)
        .map(({ deal, idx }) => ({ id: idx, pbn: dealToPBNString(deal) }));

    if (items.length === 0) return;

    // Total et "déjà fait" comptent TOUTES les donnes, pas seulement celles qu'on relance :
    // si un calcul précédent a été arrêté à 3/10, relancer affiche "3/10" (puis avance vers
    // 10/10) plutôt qu'un trompeur "0/7" qui ferait perdre la trace des 3 déjà calculées.
    ddBatchTotal = generatedDeals.length;
    ddBatchDone = generatedDeals.length - items.length;
    ddBatchFailed = 0;

    items.forEach(item => setDDCellContent(item.id, ddLoadingHTML('Calcul du double mort...')));
    enqueueDDItems(items, true);
}

// Calcule le double mort pour une seule donne (bouton "🧮 Calculer" sur une carte).
// Ne relance rien si le résultat est déjà disponible.
function computeDoubleDummyForDeal(idx) {
    if (!generatedDeals || !generatedDeals[idx]) return;
    if (generatedDeals[idx]._ddTable) return;

    setDDCellContent(idx, ddLoadingHTML('Calcul...'));
    enqueueDDItems([{ id: idx, pbn: dealToPBNString(generatedDeals[idx]) }], false);
}
