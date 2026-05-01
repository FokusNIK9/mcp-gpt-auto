# Local Dev Agent Confirm Guard

Firefox WebExtension that auto-confirms only allowlisted ChatGPT tool-call dialogs for the local Action Bridge.

It does not click every `Confirm` / `Подтвердить` button. It clicks only when the dialog text contains one of:

- `heroism-petri-causal.ngrok-free.dev`
- `heroism_petri_causal_ngrok_free_dev__jit_plugin.queueTask`
- `Local Dev Agent`

## Install Temporarily In Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click `Load Temporary Add-on...`.
3. Select `manifest.json` from this folder.
4. Keep the tab/browser session open. Temporary add-ons are removed when Firefox restarts.

## Test

Open ChatGPT and trigger a Local Dev Agent tool call. The extension should click `Подтвердить` only for the allowlisted Action Bridge dialog.
