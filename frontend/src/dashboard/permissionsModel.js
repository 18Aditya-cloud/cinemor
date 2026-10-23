/**
 * What a job role may use, as plain data (no React here, so the API file can use it too).
 *
 * A role has two lists:
 *   features  the Cinemor capabilities it can use (a fixed list of 9, below), stored as their ids
 *   tools     the organization's own tools (from the Tools page) it can use, stored as tool ids
 * Everything that is not in a list is not allowed. A brand-new role starts with both lists empty (the safe way to start).
 */
export const FEATURE_IDS = [
  'storyCreation',
  'storyboardCreation',
  'characterCreation',
  'sceneCreation',
  'shotCreation',
  'videoGeneration',
];

const unique = (list) => [...new Set(list)];

/** Keeps only known feature ids and numeric tool ids, so a role saved earlier (or by another version) still works. */
export function normalizePermissions(role) {
  return {
    features: unique((Array.isArray(role?.features) ? role.features : []).filter((id) => FEATURE_IDS.includes(id))),
    tools: unique((Array.isArray(role?.tools) ? role.tools : []).map(Number).filter(Number.isFinite)),
  };
}
