/**
 * Exemplo de snapshots de cartão — SEM dados financeiros reais.
 * Copie o padrão para card-snapshots.local.js (gitignored).
 *
 * Futuro RTDB: /users/{uid}/cardSnapshots/{snapshotId}
 */
window.CFM = window.CFM || {};

CFM.cardSnapshotsLocal = [];

CFM.cardLimitOverridesLocal = [
  {
    cardNameIncludes: ["cartão demo", "cartao demo"],
    limitCents: 1500000,
    note: "Exemplo genérico — substitua localmente"
  }
];
