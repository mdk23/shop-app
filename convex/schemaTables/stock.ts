// Stock is held per branch (variantStock / inventoryMovements); there is no finer
// location. Damage and loss are recorded as stockAdjustments (reasons DAMAGED /
// MISSING), which write the matching ledger movements.
export const stockTables = {};
