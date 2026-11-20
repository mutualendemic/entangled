# Animated avatar assets

All selectable player characters use animated sprite atlases. Static image avatars have been removed from the selector and from the bundled avatar assets.

## Cozy Shop Chef

The 8-direction chef uses idle and walk animations from the `CozyShopStreet_FREE` pack by dotPLAYS. The app includes the `@128` sheets, which contain eight directional rows with a shared foot pivot. The original pack license is kept at `web/public/sprites/cozy-chef/LICENSE.txt`.

- Source: CozyShopStreet_FREE by [dotPLAYS](https://dotplays.com)
- License: dotPLAYS Asset License (free for use in games/apps; do not redistribute the assets as a standalone pack)
- Runtime assets: `web/public/sprites/cozy-chef/`

## SpriteCanvas characters

The existing SpriteCanvas characters are animated sprite atlases under `web/public/sprites/`. Their individual folders contain the CC0 1.0 license and AI disclosure. The available characters are Cyberpunk Ninja, Pixel Iron Knight, Cozy Apothecary Witch, Crown Slime Boss, Rustwalker MechBot, Pixel Shadow Rogue, Blue-Flame Ronin, Pixel Bone Mage, Sylvan Ranger, and Pixel Crystal Slime.

For legacy accounts with a previous static avatar ID, the client displays the new default animated avatar; selecting and saving a new character updates the account to a supported animated ID.
