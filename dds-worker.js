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

// IMPORTANT : ne pas réduire Module.TOTAL_MEMORY en dessous de la valeur par défaut
// de la lib (256 Mo) sans validation rigoureuse. Un heap trop petit ne fait pas
// forcément planter proprement le calcul (abort "Cannot enlarge memory arrays") :
// le code C peut aussi écrire hors des bornes du buffer alloué et corrompre des
// données internes en silence, ce qui produit des tables de double mort FAUSSES
// sans aucune erreur visible. C'est ce qui s'est produit avec 64 Mo. On repart
// donc sur la taille par défaut de la lib (ne pas définir TOTAL_MEMORY revient à
// utiliser 268435456, cf. dds-lib.js).

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
