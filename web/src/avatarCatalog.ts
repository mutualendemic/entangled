export interface AvatarOption {
  id: string;
  name: string;
  author?: string;
  source?: string;
  license?: string;
  sprite: {
    slug: string;
    idleAction: string;
    moveAction: string;
    facing: "left" | "right";
    pixelArt: boolean;
    idleFps: number;
    moveFps: number;
    directional?: boolean;
    pivot?: { x: number; y: number };
    previewFrame?: { x: number; y: number; w: number; h: number };
    previewSheet?: { w: number; h: number };
    excludedFrames?: Record<string, number[]>;
  };
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  {
    id: "cozy-chef",
    name: "Cozy Shop Chef",
    author: "dotPLAYS",
    source: "https://dotplays.com",
    license: "dotPLAYS Asset License",
    sprite: {
      slug: "cozy-chef",
      idleAction: "idle",
      moveAction: "walk",
      facing: "right",
      pixelArt: false,
      idleFps: 10,
      moveFps: 15.116,
      directional: true,
      pivot: { x: 29.25 / 59, y: 107.75 / 121 },
      previewFrame: { x: 2, y: 2, w: 59, h: 121 },
      previewSheet: { w: 1588, h: 986 },
    },
  },
  { id: "cyberpunk-ninja", name: "Cyberpunk Ninja", license: "CC0 1.0", sprite: { slug: "cyberpunk-ninja", idleAction: "idle", moveAction: "run", facing: "right", pixelArt: false, idleFps: 9, moveFps: 12 } },
  { id: "pixel-knight", name: "Pixel Iron Knight", license: "CC0 1.0", sprite: { slug: "pixel-knight", idleAction: "idle", moveAction: "walk", facing: "right", pixelArt: true, idleFps: 8, moveFps: 10 } },
  { id: "cozy-witch", name: "Cozy Apothecary Witch", license: "CC0 1.0", sprite: { slug: "cozy-witch", idleAction: "idle", moveAction: "walk", facing: "right", pixelArt: false, idleFps: 8, moveFps: 10 } },
  { id: "slime-boss", name: "Crown Slime Boss", license: "CC0 1.0", sprite: { slug: "slime-boss", idleAction: "idle", moveAction: "hop", facing: "left", pixelArt: false, idleFps: 8, moveFps: 12 } },
  { id: "mech-bot", name: "Rustwalker MechBot", license: "CC0 1.0", sprite: { slug: "mech-bot", idleAction: "idle", moveAction: "march", facing: "right", pixelArt: false, idleFps: 8, moveFps: 10 } },
  { id: "pixel-rogue", name: "Pixel Shadow Rogue", license: "CC0 1.0", sprite: { slug: "pixel-rogue", idleAction: "idle", moveAction: "run", facing: "right", pixelArt: true, idleFps: 8, moveFps: 12 } },
  { id: "lantern-samurai", name: "Blue-Flame Ronin", license: "CC0 1.0", sprite: { slug: "lantern-samurai", idleAction: "idle", moveAction: "walk", facing: "right", pixelArt: false, idleFps: 8, moveFps: 10 } },
  { id: "pixel-necromancer", name: "Pixel Bone Mage", license: "CC0 1.0", sprite: { slug: "pixel-necromancer", idleAction: "idle", moveAction: "walk", facing: "right", pixelArt: true, idleFps: 8, moveFps: 10 } },
  { id: "forest-archer", name: "Sylvan Ranger", license: "CC0 1.0", sprite: { slug: "forest-archer", idleAction: "idle", moveAction: "run", facing: "right", pixelArt: false, idleFps: 8, moveFps: 12 } },
  { id: "pixel-slime-king", name: "Pixel Crystal Slime", license: "CC0 1.0", sprite: { slug: "pixel-slime-king", idleAction: "idle", moveAction: "bounce", excludedFrames: { bounce: [1, 4] }, facing: "left", pixelArt: true, idleFps: 8, moveFps: 10 } },
];

export const DEFAULT_AVATAR_ID = "cozy-chef";

export function getAvatarOption(id: string): AvatarOption {
  return AVATAR_OPTIONS.find((avatar) => avatar.id === id) ?? AVATAR_OPTIONS[0];
}
