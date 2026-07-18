/** Programmatic CLI helpers (validate / pack / deploy). */
export { detectPackageKind, resolvePackageRoot } from './detect.js';
export type { PackageKind } from './detect.js';
export { validateThemeDirectory, printValidateResult, listThemePackageFiles } from './validate.js';
export {
  validateComponentDirectory,
  printComponentValidateResult,
  listComponentPackageFiles,
} from './validate-component.js';
export { packThemeDirectory } from './pack.js';
export { packComponentDirectory } from './pack-component.js';
export { deployPackageDirectory, deployThemeDirectory } from './deploy.js';
export { initAgencySite, initTravelAgency, initComponent } from './init.js';
export {
  loadGlobalConfig,
  saveGlobalConfig,
  loadProjectConfig,
  normalizeApiBase,
  apiUrl,
} from './config.js';
export type {
  PresenceAccount,
  PresenceGlobalConfig,
  PresenceProjectConfig,
  ValidateIssue,
  ValidateResult,
} from './types.js';
