/**
 * Replaces a player id everywhere in a piece of state (values and object keys). Player ids are
 * long random strings, so a plain textual replacement is safe. Used when a player reconnects
 * with a new connection id but is still the same person.
 */
export function remapIds<T>(value: T, from: string, to: string): T {
  if (from === to || from === "") return value;
  return JSON.parse(JSON.stringify(value).split(from).join(to)) as T;
}
