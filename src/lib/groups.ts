/** Group labels offered in the UI; anything else is rejected so tables stay tidy. */
export const GROUP_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export function cleanGroupName(value: unknown): string | null {
  const clean = String(value ?? '').trim().toUpperCase();
  if (!clean) return null;
  if (!GROUP_NAMES.includes(clean)) {
    throw new Error(`Group must be one of ${GROUP_NAMES.join(', ')}`);
  }
  return clean;
}
