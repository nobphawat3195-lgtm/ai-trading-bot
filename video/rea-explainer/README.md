# REA Explained (TikTok 9:16, 45 s)

Canvas film rendered with the `motion-reel` skill. Excluded from git: `audio/` (music.wav, sfx.wav, mix.wav are regenerated), rendered video (`out/`), `node_modules`.

Notes
- `assets/rea-hopper-analysis.png` and `assets/rea-investigation-flow.svg` come from github.com/morluto/rea (MIT).
- `assets/real_rea_inspect_output.json` is the real output of `rea inspect` on a synthetic (random-bytes) file named `.ex5`, not a real EA.
- Fonts: Kanit and JetBrains Mono (SIL OFL).
- Voice-over: not yet included. Script is in `docs/narration_th.md`.

Rebuild (from a project folder with `playwright` installed):
```
uv run <skill>/scripts/beats.py rea-explainer --synth --flavor lofi --mode minor --tonic A --bpm 120 --duration 45
node <skill>/scripts/render.mjs --film rea-explainer --format 9x16 --video-only
node <skill>/scripts/sfx.mjs rea-explainer && node <skill>/scripts/mix.mjs rea-explainer
```
