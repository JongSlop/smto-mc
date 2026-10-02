/** Direction names in 3D data value order (matches `Direction.get3DDataValue()` in vanilla). */
export const DIRECTIONS = ['down', 'up', 'north', 'south', 'west', 'east'] as const;

export function directionIndex(name: string): number | undefined {
  const i = DIRECTIONS.indexOf(name.toLowerCase() as (typeof DIRECTIONS)[number]);
  return i < 0 ? undefined : i;
}
