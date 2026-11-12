export interface AvatarOption {
  id: string;
  name: string;
  author?: string;
  image?: string;
  source?: string;
  license?: string;
}

export const BUILTIN_AVATARS: AvatarOption[] = [
  { id: "moss", name: "Musgo" },
  { id: "ember", name: "Brasa" },
  { id: "wave", name: "Onda" },
  { id: "sun", name: "Sol" },
  { id: "comet", name: "Cometa" },
  { id: "bloom", name: "Flor" },
  { id: "girl8", name: "Girl 8" },
];

export const OGA_AVATARS: AvatarOption[] = [
  { id: "oga-01", name: "Base character", author: "pondomaniac", image: "/avatars/oga/oga-01.png", source: "https://opengameart.org/content/base-character", license: "CC0 1.0" },
  { id: "oga-02", name: "Hero", author: "pondomaniac", image: "/avatars/oga/oga-02.png", source: "https://opengameart.org/content/hero-0", license: "CC0 1.0" },
  { id: "oga-03", name: "School Girl", author: "diamonddmgirl", image: "/avatars/oga/oga-03.png", source: "https://opengameart.org/content/school-girl", license: "CC0 1.0" },
  { id: "oga-04", name: "Top down player sprite sheet (Julia)", author: "ArlanTR", image: "/avatars/oga/oga-04.gif", source: "https://opengameart.org/content/top-down-player-sprite-sheet-julia", license: "CC0 1.0" },
  { id: "oga-05", name: "16x16 minimalistic rpg sprites+some tiles", author: "Joyeuse", image: "/avatars/oga/oga-05.png", source: "https://opengameart.org/content/16x16-minimalistic-rpg-spritessome-tiles", license: "CC0 1.0" },
  { id: "oga-06", name: "8bit rpg hero", author: "danbu", image: "/avatars/oga/oga-06.png", source: "https://opengameart.org/content/8bit-rpg-hero", license: "CC0 1.0" },
  { id: "oga-07", name: "16x16 Mage", author: "saint11", image: "/avatars/oga/oga-07.png", source: "https://opengameart.org/content/16x16-mage", license: "CC0 1.0" },
  { id: "oga-08", name: "Base character spritesheet 16x16", author: "Cough-E", image: "/avatars/oga/oga-08.png", source: "https://opengameart.org/content/base-character-spritesheet-16x16", license: "CC0 1.0" },
  { id: "oga-09", name: "Zombie and Skeleton 32x48", author: "Reemax", image: "/avatars/oga/oga-09.png", source: "https://opengameart.org/content/zombie-and-skeleton-32x48", license: "CC0 1.0" },
  { id: "oga-10", name: "Undead King", author: "Reemax", image: "/avatars/oga/oga-10.png", source: "https://opengameart.org/content/undead-king", license: "CC0 1.0" },
  { id: "oga-11", name: "24x32 Bases", author: "diamonddmgirl", image: "/avatars/oga/oga-11.png", source: "https://opengameart.org/content/24x32-bases-0", license: "CC0 1.0" },
  { id: "oga-12", name: "Chick", author: "AntumDeluge", image: "/avatars/oga/oga-12.png", source: "https://opengameart.org/content/chick", license: "CC0 1.0" },
  { id: "oga-13", name: "Chicken Sprites", author: "Shepardskin", image: "/avatars/oga/oga-13.gif", source: "https://opengameart.org/content/chicken-sprites", license: "CC0 1.0" },
  { id: "oga-14", name: "Kiwi Sprites", author: "Shepardskin", image: "/avatars/oga/oga-14.gif", source: "https://opengameart.org/content/kiwi-sprites", license: "CC0 1.0" },
  { id: "oga-15", name: "Eddie Project", author: "Desgraciat", image: "/avatars/oga/oga-15.gif", source: "https://opengameart.org/content/eddie-project", license: "CC0 1.0" },
  { id: "oga-16", name: "Fire cat sprite", author: "Gabiszon", image: "/avatars/oga/oga-16.png", source: "https://opengameart.org/content/fire-cat-sprite", license: "CC0 1.0" },
  { id: "oga-17", name: "guy in coat animated set", author: "kotnaszynce", image: "/avatars/oga/oga-17.gif", source: "https://opengameart.org/content/guy-in-coat-animated-set", license: "CC0 1.0" },
  { id: "oga-18", name: "cute duck animated set", author: "kotnaszynce", image: "/avatars/oga/oga-18.gif", source: "https://opengameart.org/content/cute-duck-animated-set", license: "CC0 1.0" },
  { id: "oga-19", name: "RPG character sprites", author: "GrafxKid", image: "/avatars/oga/oga-19.png", source: "https://opengameart.org/content/rpg-character-sprites", license: "CC0 1.0" },
  { id: "oga-20", name: "Character sprite + walk animation", author: "Belohlavek", image: "/avatars/oga/oga-20.png", source: "https://opengameart.org/content/character-sprite-walk-animation", license: "CC0 1.0" },
  { id: "oga-21", name: "32x32 RPG Character Sprites", author: "Eldiran", image: "/avatars/oga/oga-21.png", source: "https://opengameart.org/content/32x32-rpg-character-sprites", license: "CC0 1.0" },
  { id: "oga-22", name: "Elliot RPG", author: "software_atelier", image: "/avatars/oga/oga-22.png", source: "https://opengameart.org/content/elliot-rpg", license: "CC0 1.0" },
  { id: "oga-23", name: "RPG sprite - 8 direction human male 16x16", author: "TheNess", image: "/avatars/oga/oga-23.png", source: "https://opengameart.org/content/rpg-sprite-8-direction-human-male-16x16", license: "CC0 1.0" },
  { id: "oga-24", name: "Pixel Characters & Tiles - AI", author: "dorage", image: "/avatars/oga/oga-24.png", source: "https://opengameart.org/content/pixel-characters-tiles-ai", license: "CC0 1.0" },
  { id: "oga-25", name: "Characters", author: "pondomaniac", image: "/avatars/oga/oga-25.png", source: "https://opengameart.org/content/characters-2", license: "CC0 1.0" },
  { id: "oga-26", name: "Various Walkcycle (8 characters)", author: "Skab", image: "/avatars/oga/oga-26.png", source: "https://opengameart.org/content/various-walkcycle-8-characters", license: "CC0 1.0" },
  { id: "oga-27", name: "Simple 32x48 base sprite.", author: "BlazingMagpie", image: "/avatars/oga/oga-27.gif", source: "https://opengameart.org/content/simple-32x48-base-sprite", license: "CC0 1.0" },
  { id: "oga-28", name: "Hunter full spritesheet", author: "ghpaetzold", image: "/avatars/oga/oga-28.png", source: "https://opengameart.org/content/hunter-full-spritesheet", license: "CC0 1.0" },
  { id: "oga-29", name: "Jam Sprites", author: "Mophs", image: "/avatars/oga/oga-29.png", source: "https://opengameart.org/content/jam-sprites", license: "CC0 1.0" },
  { id: "oga-30", name: "Gum Bot sprites", author: "GrafxKid", image: "/avatars/oga/oga-30.png", source: "https://opengameart.org/content/gum-bot-sprites", license: "CC0 1.0" },
  { id: "oga-31", name: "Modern RPG Guy", author: "OVFudj", image: "/avatars/oga/oga-31.png", source: "https://opengameart.org/content/modern-rpg-guy", license: "CC0 1.0" },
  { id: "oga-32", name: "Gladiator", author: "Healy", image: "/avatars/oga/oga-32.png", source: "https://opengameart.org/content/gladiator-0", license: "CC0 1.0" },
  { id: "oga-33", name: "2D Female Character Animated Mavia", author: "nyarlko", image: "/avatars/oga/oga-33.png", source: "https://opengameart.org/content/2d-female-character-animated-mavia", license: "CC0 1.0" },
  { id: "oga-34", name: "2D Female Character Animated Zenobia", author: "nyarlko", image: "/avatars/oga/oga-34.png", source: "https://opengameart.org/content/2d-female-character-animated-zenobia", license: "CC0 1.0" },
];

export const AVATAR_OPTIONS: AvatarOption[] = [...BUILTIN_AVATARS, ...OGA_AVATARS];

export function getAvatarOption(id: string): AvatarOption | undefined {
  return AVATAR_OPTIONS.find((avatar) => avatar.id === id);
}
