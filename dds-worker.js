// dds-worker.js - Calcul du double mort (Double Dummy) en arrière-plan
//
// Ce Worker charge la bibliothèque DDS (dds-lib.js, une compilation de la
// référence libdds de Bo Haglund) et calcule, à la demande, la table complète
// des levées réalisables (5 chelems x 4 déclarants = 20 valeurs) d'une donne.
//
// Protocole "une donne à la fois" (le contrôleur renvoie immédiatement la
// suivante dès qu'une réponse arrive, ce qui permet de mélanger sans souci
// un calcul global et des calculs individuels dans la même file d'attente) :
//   Reçu   : { type: 'solve', id, pbn }
//   Envoyé : { type: 'result', id, table } ou { type: 'error', id, message }
//   En cas d'échec de chargement de dds-lib.js : { type: 'fatal', message }

var Module = {};

// La lib réserve Module.TOTAL_MEMORY (256 Mo par défaut) en un bloc dès son chargement.
// DDS n'a pas besoin d'autant : on redescend à 64 Mo pour permettre plusieurs workers
// en parallèle sur mobile sans dépasser la limite mémoire de l'onglet. Si des erreurs
// "Cannot enlarge memory arrays" apparaissent sur certaines donnes, remonter cette
// valeur (par paliers de 16 Mo) et réduire en contrepartie le cap mobile du pool
// dans dds-controller.js pour garder un budget total raisonnable (~250-400 Mo).
Module.TOTAL_MEMORY = 67108864; // 64 Mo

try {
    importScripts('dds-lib.js');
} catch (err) {
    postMessage({ type: 'fatal', message: 'Impossible de charger dds-lib.js : ' + err.message });
}

let _calcDDTable = null;

function getCalcDDTable() {
    if (!_calcDDTable) {
        _calcDDTable = Module.cwrap('generateDDTable', 'string', ['string']);
    }
    return _calcDDTable;
}

self.onmessage = function (event) {
    const msg = event.data;
    if (!msg || msg.type !== 'solve') return;

    const { id, pbn } = msg;
    try {
        const calcDDTable = getCalcDDTable();
        const raw = calcDDTable(pbn);
        const table = JSON.parse(raw);
        postMessage({ type: 'result', id, table });
    } catch (err) {
        postMessage({ type: 'error', id, message: err && err.message ? err.message : String(err) });
    }
};
