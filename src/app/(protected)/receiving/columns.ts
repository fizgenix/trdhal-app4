/**
 * Column layout of the Receiving table, shared by the header on the page
 * and each LogReceivingForm row. Lives outside the "use client" form
 * module: a server component importing a plain value from a client module
 * gets a client reference, not the string. The last (button) column is a
 * fixed width rather than `auto`, so the empty header cell lines up with
 * the rows' Log buttons.
 */
export const RECEIVING_COLUMNS =
  "grid-cols-[44px_minmax(0,1.8fr)_minmax(130px,0.8fr)_0.8fr_0.9fr_0.9fr_1fr_88px]";
