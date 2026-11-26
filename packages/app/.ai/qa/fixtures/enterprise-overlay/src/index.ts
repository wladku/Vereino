// Public entry of the Vereino Enterprise package fixture (enterprise package spec DD-E01, DD-E11). The app never
// imports it (`forbidden-packages:check`); the platform generator imports `@vereino/enterprise/modules/<id>/…`.

/** The modules of this package; `src/modules.ts` lists the same ids inside its `enterprise-switch` block. */
export const ENTERPRISE_MODULE_IDS = ['enterprise_demo'] as const
