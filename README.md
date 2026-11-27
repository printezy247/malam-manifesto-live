# Malam Manifesto Live

Portrait-only local OBS production toolkit for Malam Manifesto TikTok LIVE
streams. Canvas: 1080x1920. Reskinned to the Aish Capital `MlmManifest`
design system (navy/gold/steel, Montserrat 900 italic display, Sora body).

Gaming scenes use a 3D perspective arena, diagonal capture rails, fighter
entrances and a championship crest with confetti. VS Battle, Fight Mode and
Commentary use a VS crest between opposing gold and indigo panels, with
segmented health bars, diamond round markers, low-health and K.O. states.
In **Edit draft**, turn on **Set match
health and round wins**, enter both sides’ values and publish. Point 1 and Point 2
set the names. The VS panel labels generated values **DEMO** until you provide
match values. The demo score and combo HUD appears in the draft preview.
Decorative motion respects the selected motion mode and system reduced motion.

Architecture mirrors `ezymap-live`: a loopback bridge (`apps/bridge`, port
4320) holds the published snapshot and talks to OBS WebSocket v5, a control
desk (`/control`) edits and publishes drafts, and a read-only overlay
(`/overlay`, `/overlay-transparent`) renders the program scene for OBS
browser sources.

## Commands

```bash
npm install
npm run pair:setup     # store control/overlay/obs credentials in the keyring
npm run obs:provision  # create the MM PORTRAIT OBS scene set (OBS must be open)
npm start              # bridge on http://127.0.0.1:4320
npm run check          # tests + typecheck + lint + build
```

The OBS canvas is fixed at 1080x1920 portrait. Provisioning creates independent
Backdrop, Source Frames, Header, Title, Main Graphics, Caption, Disclosure,
Versus, and Live Cue browser layers. Place them above or below captures in
the OBS Sources list. Pair through **Interact** on the Header layer.
Provisioning disables the old composite overlay after the split layers are
ready. Later runs preserve the OBS positions and order of the split graphics.
The full overlay is still available at `http://127.0.0.1:4320/overlay`.
Run provisioning with OBS output stopped. For manual setup, copy each layer URL
from **OBS scenes → Independent OBS graphics** and use a 1080×1920 Browser Source.
In **OBS scenes**, **Align scene sources** uses the selected scene’s layout
and honors its custom slot positions when a matching program or preset exists.

In **Live**, **Program Monitor** samples the current OBS scene so you can check
capture framing and layer order. **Show overlay preview** switches back to the
bridge’s published graphics. In **Edit draft**, the latest valid draft can
survive a page reload. If Program advanced while you were editing, select
**Keep draft and update revision** before publishing over it.

## Screens

`/control` control desk · `/overlay` and `/overlay-transparent` OBS browser
sources · `/gallery` 26 portrait compositions x 3 fixture kinds.

## Verification

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run validate:presets
npm run audit:overflow   # live rendered audit (needs Playwright Chromium)
```

## Composition / canvas

One composition per template, every key ending in `:portrait`. `getCanvas()`
returns `{width:1080,height:1920}` and is the only canvas the contracts,
bridge, control desk and OBS provisioning script resolve to. The control desk
has no orientation control and there is a single portrait emergency asset.
Saved landscape snapshots and presets load with portrait defaults for source
geometry and retain the authored content.

## Phone and square captures

Choose **Scene default**, **Square 1:1**, or **Phone 9:16** in **Edit draft**.
Changing the format restores the preset source positions for that format.
Fight Mode moves both devices side by side in Square and Phone layouts.
**Scene fit** follows the selected OBS scene’s default. **Fit entire source**
keeps the full input visible. **Fill frame (crop)** fills the frame and crops
source edges. Alignment clears previous manual crop and transform values on
managed capture items. The broadcast stays 1080×1920 in every mode.

**Live → Program source framing** applies changes directly to Program.
**Align matching OBS sources after publish** is on by default and applies
capture geometry to the active matching OBS scene. Turn it off to retain
manual capture transforms when publishing. From **OBS scenes**, select a
managed scene and use **Load scene into draft** to prepare it, or **Align scene
sources** to apply its saved source geometry. **Follow OBS program scene**
uses the current scene’s saved preset, if available, or the built-in framing of
the new phone and square scenes. Draft edits are kept across tab changes.

Provisioning adds Phone Duel, Square Duel, Phone Focus and Phone Duo + Host.
Bind each new phone input to a mirrored phone window in OBS Properties.

Recap & Closing uses an edge-to-edge host feed within the safe area and
translucent points above the presenter caption. The Live Shop TV slot keeps
its 16:9 shape in every capture mode. VS graphics sit between the two
resolved capture slots. Commentary layers its host camera over both trader
feeds, beneath that VS graphic. Winner shares Trader Focus framing, with the
$999 prize under the narrator camera. Reprovision to apply these source
bounds and layer order to an existing OBS collection.
