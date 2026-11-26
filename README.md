# Malam Manifesto Live

Local OBS production toolkit for Malam Manifesto streams, reskinned to the
Aish Capital `MlmManifest` design system (navy/gold/steel, Montserrat 900
italic display, Sora body).

Architecture mirrors `ezymap-live`: a loopback bridge (`apps/bridge`, port
4320) holds the published snapshot and talks to OBS WebSocket v5, a control
desk (`/control`) edits and publishes drafts, and a read-only overlay
(`/overlay`, `/overlay-transparent`) renders the program scene for OBS
browser sources.

## Commands

```bash
npm install
npm run pair:setup     # store control/overlay/obs credentials in the keyring
npm run obs:provision  # create the MM-prefixed OBS scene set (OBS must be open)
npm start              # bridge on http://127.0.0.1:4320
npm run check          # tests + typecheck + lint + build
```

OBS browser sources point at `http://127.0.0.1:4320/overlay`
(or `/overlay-transparent` for capture slots). The `/placeholder#<kind>`
page marks sources the provisioning script created.
