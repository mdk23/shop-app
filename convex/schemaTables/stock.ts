// Stock is held per branch (variantStock / inventoryMovements); there is no finer
// location. Damage and loss are stock adjustments (reasons DAMAGED /
// MISSING): ledger movements of referenceType "stock_adjustment" with their reason.
export const stockTables = {};
