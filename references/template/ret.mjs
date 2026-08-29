/**
 * OPTIONAL but strongly recommended — Interface field tables: when a port is one call or one structured
 * message, list what it actually contains here.
 * The key is "<diagramId>/<blockId>/out:<index>" or ".../in:<index>"; the value is
 * [fieldName, dataType, meaning]. It expands when that port is hovered. Every field must come from a
 * real definition in the source — do not invent them.
 *
 * The index must point at a port that is **actually written out** (both build and verify check this).
 * If the input port in question is one the engine synthesized from a link (the target block declares no
 * `in`), attach the field table to the **source block's out:N** instead — the engine carries the table
 * across when it synthesizes, so it is visible on hover from either end.
 */
export const RET_TABLES = {
  'L1/CORE/in:0': [
    ['<field>', '<real type>', '<meaning + why this constraint>'],
  ],
};
