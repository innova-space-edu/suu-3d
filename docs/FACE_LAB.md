# SUU face laboratory — version history

Open `/face-lab` from the "Laboratorio facial" link on the home page.

The original `suu-face-v4.glb` is now served locally at `/models/suu-face-v4.glb` (91,392 vertices, 182,016 triangles). This is the previously generated experimental mesh, not a scanned or professionally sculpted head. No external model hosting or API keys are needed.

The loader corrects inward-facing source triangles, smooths the diamond-shaped side bulges into a fuller oval and softens nasal projection, then recalculates outward normals. Original eye/lip vertex colors are retained at restrained intensity. Both the depth surface and worker use this transformed geometry. A deterministic worker samples triangle areas with extra density around eyes, nose and lips, returning exactly 100,000 particles in 5,000-point batches. Each point is lifted 0.004 model units along its interpolated surface normal to prevent depth fighting. Contours are lighting accents derived from normals, not disconnected geometric lines. There are no extra contour particles beyond the 100,000 budget.

The shader relies on Three.js-injected attributes (no duplicate `color` declaration). It uses actual surface normals, normal alpha blending, and no bloom. Explicit cloud bounds avoid progressive zero-buffer culling. Loading/errors overlay the viewport and a retry button recreates the viewer. Unmount aborts the download and terminates the worker.

At V4.2, the previous conversational avatar remained on the home page. That experimental version had no morph targets or speech rig.

Validation: `npm test`, `npm run build`, and browser checks of frontal/both profile views, point counts, solid mode and retry. Build success alone is not a WebGL rendering test.


## V4.3 — reference-guided prototype

Remodels the front of the original mesh with continuous eyelid, nose, lip and cheek reliefs. Iris/pupil colors are per-vertex approximations, not rigged eyeballs. Adds separate auricle and neck surfaces to the assembled sampling geometry. These overlapping surfaces are not a watertight production sculpt. The source GLB remains unchanged; remodeling happens at load time.

At 100k, 80k samples follow existing mesh vertices and 20k are area/feature-weighted. A coprime permutation spreads progressive vertex samples over the whole model at lower display counts. The contour mode uses a blue supporting surface. Global brightness controls points and scene lights.

This is an approximation from visual references, not a recovered identical face. No facial rig or visemes. Ear anatomy, eye topology, profile likeness and regular sampling density still require improvement.

## V5 — anatomical replacement

The active model is now `public/models/suu-face-anatomical.glb`. V4's runtime ellipsoid deformation and overlapping ear/neck primitives are removed from the loader. V5 derives the connected head, ears and neck from MakeHuman's hm08 base mesh (CC0), crops at the shoulders, applies two Catmull–Clark subdivisions and adds spherical eyes inside the eyelids. It is a generic anatomical base, not an exact identity reconstruction or a rigged face.

Rebuild with `python scripts/build-anatomical-face.py /path/to/base.obj` (Python + NumPy). Source revision: `3c701a8e52f09e69922e8b598d23be2d7dfc49e3`, path `makehuman/data/3dobjs/base.obj` in `makehumancommunity/makehuman`. Source SHA-256: `8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c`.

Mesh provenance and license: https://github.com/makehumancommunity/makehuman/blob/3c701a8e52f09e69922e8b598d23be2d7dfc49e3/makehuman/data/3dobjs/base.obj . The mesh header explicitly dedicates this asset to CC0. A copy of the asset license is included as `public/models/MAKEHUMAN-CC0.txt`. No MakeHuman application code is included.

100,000 points use deterministic area-weighted Halton samples, with mild feature weighting. This avoids bright concentrations caused by dense eye/lip topology. Solid mode now truly hides points and uses a neutral material; the blue supporting surface is confined to contour mode. Global brightness drives all scene lights and point brightness. Rotating manually labels the view as free rather than incorrectly calling it frontal.


## V5 — main page integration

The approved V5 appearance now replaces the procedural avatar on the main page and in voice mode. All three views share `SuuAnatomicalHead`, its loader, sampling worker and materials. High quality displays 100,000 points; economy displays 25,000. The main viewer preserves head-orientation tracking and a subtle audio-driven brightness response. It does not animate lips, eyelids or facial expressions. Loading, errors and retry are visible in both conversation views. The old `NEXT_PUBLIC_SUU_HEAD_MODEL` override is no longer used by the main avatar.


## V5.1 — facial animation

Nine bounded procedural morph targets are built on the approved neutral mesh: jaw, smile, frown, pucker, wide lips, left/right blink and raised/lowered brows. Eyes remain rigid. These are an initial runtime rig, not hand-sculpted ARKit shapes. The worker projects each target displacement and normal delta through the same barycentric coordinates as each particle. Mesh, depth pass and particles share smoothed weights; the point shader includes Three.js morph chunks. GPU morph textures are created only once the complete point buffer is available.

The lab offers direct pose controls, neutral/reset and a clearly labeled simulated talking preview. Conversation views drive jaw opening from measured Web Audio RMS of the played audio; browser speech synthesis uses an approximate pulse fallback because its PCM stream is unavailable. LiveKit uses the remote participant audio level. There is no phoneme alignment, independent tongue animation or detailed dental rig. Blinking is automatic and camera blink/smile/mouth coefficients can drive the rig.


## V5.2 — mouth refinement

Replace the smile's discontinuous midline pull and steep V-shaped lift with a smooth lateral pull, reduced corner elevation and gentle cheek support. Lip rounding and widening have smaller bounded displacements. Jaw opening follows a curved lip seam with a wider transition through the cheeks. The serious target now coordinates slight lip compression, eyelid narrowing and brow lowering. No teeth or dental geometry are added. These remain procedural approximations requiring visual assessment, not a completed anatomical sculpt.


## V5.3 — word-timed lip shapes

`/api/voice` accepts an optional `timings:true` request and returns base64 audio plus Edge TTS word windows in seconds. The original binary audio contract is preserved when this option is absent. The browser builds letter-derived A/E/I/O/U, M/P/B closure and consonant cues inside those measured word windows, sampled from `audio.currentTime`; pauses, seeks and playback rate therefore follow the player clock. This is word-aligned, orthographic estimation, not measured phoneme alignment.

Voices without alignment use a duration-scaled estimate; browser synthesis uses word boundary events where supported with a text-duration fallback. LiveKit continues to use amplitude because its remote text/audio alignment is unavailable. Lip channels settle faster than brow/cheek channels, with fast closure and a return to rest in gaps. Longer words add a small brow emphasis. Stop and unmount clear cue sources; canceled synthesis responses cannot restart old speech. Six lab presets let users compare vowel shapes and M/P/B closure, without dental geometry.


## V5.4 — clearer articulation and attention-only camera

Increase jaw opening and vowel targets, with quicker lip transitions and preserved M/P/B closure. Add four eye-direction morph targets: the eyeball spheres rotate rigidly so their iris colors turn, while the skin remains fixed. The camera now emits only a smoothed face-position attention vector; it no longer predicts or copies expressions, jaw opening, blink, head tilt or head orientation. SUU uses that position for eye direction and a restrained attention turn. Its own speech and blinking remain autonomous.

The spoken form of the standalone name SUU is normalized to “Súu” for server voices and browser speech, leaving visible chat text untouched. This avoids acronym-style spelling and requests emphasis on the u through ordinary text; exact vowel duration still depends on the selected voice. No dental geometry is added.

## V6 — dynamics, oral cavity and multimodal articulation (experimental)

- `lib/face-physics.ts`: 13 independent bounded spring–mass facial actuators, damped with fixed integration substeps and antagonistic constraints for lips and smile/serious expressions. The existing Gaussian skin displacement fields and jaw hinge remain the deformation basis. This is **physically inspired animation**, not an anatomically calibrated finite-element simulation of facial muscles, joints or soft tissue.
- `components/SuuOralCavity.tsx`: visible upper/lower tooth rows and a separately animated tongue in the mouth opening; linked to the jaw actuator. The meshes are procedural visual proxies, not dental scans. The insert is hidden on a closed mouth and in pure particle mode.
- `lib/face-emotion.ts`: conservative deterministic affect cues extracted only from SUU's **own spoken response**, with bounded smile/brow/frown combinations, negation safeguards and a neutral default. This is not an LLM emotion classifier; camera tracking remains attention-only.
- `/api/voice`: ElevenLabs `/with-timestamps` optionally supplies measured **character boundaries**; Edge TTS still supplies measured word windows, and local/browser speech retains the estimated fallback. Measured characters are *not* phonemes.
- `deploy/dell-phonemes/` and `lib/phoneme-aligner.ts`: opt-in private Spanish MFA service. When installed with the requisite acoustic model and dictionary, it returns acoustically forced-aligned phoneme intervals, takes precedence over characters/words, and drives lip gestures plus a subset of tongue articulation. Without it, voice continues normally. **It has not been installed, benchmarked or validated on the Dell by this repository change.**

### Validation protocol

Run `npm run typecheck && npm test && npm run build`. In `/face-lab`, verify neutral, jaw opening, smiles/serious poses, brows, blink and all four gaze channels at 25k/100k points in all views. In live conversation verify that the mouth closes at pauses, queued audio does not restart after cancellation, full-screen and economy modes remain functional, and the teeth/tongue do not intersect the lips during speech. Assess acoustic synchronization on recorded Spanish utterances and compare generated phoneme intervals against hand-labeled reference samples before declaring it accurate.

There is no published objective benchmark yet for lip-sync error, expression realism, muscle mechanics or frame-rate under load. The 13 channels and point counts are implementation characteristics, not evidence of experimental accuracy.
