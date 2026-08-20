# Credits

Third-party assets used by the project, grouped by license. Paths are relative to
`lg_rpg_server/public/assets/`.

## CC BY 4.0 International ([license](https://creativecommons.org/licenses/by/4.0/))

- **Elementals: Water Priestess** by chierit
  - Source: https://chierit.itch.io/elementals-water-priestess
  - Used for: the player character (`players/cherit/`)
  - Changes: repacked/resized into a game-ready sprite sheet and animation tileset metadata.

## CC0 1.0 ([license](https://creativecommons.org/publicdomain/zero/1.0/))

- **Ninja Adventure Asset Pack** by Pixel-Boy and AAA
  - Source: https://pixel-boy.itch.io/ninja-adventure-asset-pack
  - Used for: music and sound effects (`audio/`), weather, buff and attack effects (`fx/`),
    and the map tilesets under `maps/shared_assets/ninja_adventure/`
- **Monsters Creatures Fantasy 1 and 2** by LuizMelo
  - Source: https://luizmelo.itch.io/
  - Used for: every enemy except the boss — bat, flying eye, goblin, mimic, mushroom,
    rat, skeleton and slime (`enemies/`)
- **Debts in the Depths Asset Pack** by Reaktori
  - Source: https://reaktori.itch.io/debts-in-the-depths-asset-pack
  - Used for: the dragon boss and its fire projectile (`enemies/boss/`), and the huntress
    special-attack projectiles — firebolt, explosion, acid, magic bolt, ghost orb, sparkle —
    repacked into the `players/huntress/proj_*.png` sheets
  - Changes: effect strips combined into uniform flight+impact sprite sheets, some frames
    upscaled with nearest-neighbor
- **Dungeon Tileset II Extended** by Niji (based on 0x72's Dungeon Tileset II)
  - Source: https://nijikokun.itch.io/dungeontileset-ii-extended
  - Used for: map tilesets under `maps/shared_assets/dungeon/`
- **Lucifer Pickups** by FoozleCC
  - Source: https://foozlecc.itch.io/lucifer-pickups
  - Used for: gem and gold pickups under `maps/shared_assets/lucifer_pickups/`
- **Ninja Jail Castle whatever Platformer Tiles** by R3tr0BoiDX
  - Source: https://opengameart.org/content/ninja-jail-castle-whatever-platformer-tiles
  - Used for: the wall tileset in both PvP maps (`maps/shared_assets/pvp/wall.png`)

---

## Licensing summary

The project's own source code is MIT licensed (see [LICENSE](./LICENSE)). Everything
listed above is third-party work under its own license and is **not** covered by MIT:

- **CC BY 4.0** assets may be reused and modified, but require credit to the original
  artist and a note that changes were made.
- **CC0 1.0** assets are in the public domain and carry no attribution requirement —
  they are credited here anyway.

If you fork this project, keep this file (or an equivalent credits page) with it.
