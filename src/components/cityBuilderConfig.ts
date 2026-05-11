export type BuildType = "house" | "road" | "factory";

export type BuildingPlacement = {
  x: number;
  z: number;
  type: BuildType;
};

export const GRID_SIZE = 18;
export const CELL_SIZE = 2;
export const HALF_GRID = (GRID_SIZE * CELL_SIZE) / 2;
export const BUILD_AREA_SIZE = GRID_SIZE * CELL_SIZE;

export const FIXED_ROADS = [
  ...Array.from({ length: GRID_SIZE }, (_, x) => ({ x, z: 8 })),
  ...Array.from({ length: GRID_SIZE }, (_, z) => ({ x: 8, z })),
  ...Array.from({ length: 6 }, (_, x) => ({ x: 1 + x, z: 3 })),
  ...Array.from({ length: 4 }, (_, z) => ({ x: 4, z: 4 + z })),
];

export const FIXED_HOUSES = [
  { x: 2, z: 1, tint: "#f97316" },
  { x: 3, z: 1, tint: "#ef4444" },
  { x: 1, z: 2, tint: "#fb7185" },
  { x: 2, z: 2, tint: "#a78bfa" },
];

export const TREES = [
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: 3, z: 2 },
  { x: 4, z: 1 },
  { x: 14, z: 2 },
  { x: 15, z: 3 },
  { x: 16, z: 4 },
  { x: 2, z: 14 },
  { x: 3, z: 15 },
  { x: 4, z: 16 },
  { x: 13, z: 15 },
  { x: 15, z: 14 },
  { x: 16, z: 13 },
];

export const LAMP_POSTS = [
  { x: 6, z: 7 },
  { x: 10, z: 7 },
  { x: 7, z: 10 },
  { x: 9, z: 12 },
  { x: 4, z: 5 },
];

const RESERVED_CELL_KEYS = new Set(
  [
    ...FIXED_ROADS,
    ...FIXED_HOUSES.map(({ x, z }) => ({ x, z })),
    ...TREES,
    ...LAMP_POSTS,
    { x: 1, z: 5 },
  ].map(({ x, z }) => `${x}:${z}`),
);

export const RESERVED_CELL_COUNT = RESERVED_CELL_KEYS.size;

export function isReservedCell(x: number, z: number) {
  return RESERVED_CELL_KEYS.has(`${x}:${z}`);
}

export function toWorld(value: number) {
  return -HALF_GRID + CELL_SIZE / 2 + value * CELL_SIZE;
}
