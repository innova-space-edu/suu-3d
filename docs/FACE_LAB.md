# SUU V4.2 face laboratory

Open `/face-lab` from the "Nuevo rostro · 100k" link on the home page.

The original `suu-face-v4.glb` is now served locally at `/models/suu-face-v4.glb` (91,392 vertices, 182,016 triangles). This is the previously generated experimental mesh, not a scanned or professionally sculpted head. No external model hosting or API keys are needed.

The loader corrects inward-facing source triangles, smooths the diamond-shaped side bulges into a fuller oval and softens nasal projection, then recalculates outward normals. Original eye/lip vertex colors are retained at restrained intensity. Both the depth surface and worker use this transformed geometry. A deterministic worker samples triangle areas with extra density around eyes, nose and lips, returning exactly 100,000 particles in 5,000-point batches. Each point is lifted 0.004 model units along its interpolated surface normal to prevent depth fighting. Contours are lighting accents derived from normals, not disconnected geometric lines. There are no extra contour particles beyond the 100,000 budget.

The shader relies on Three.js-injected attributes (no duplicate `color` declaration). It uses actual surface normals, normal alpha blending, and no bloom. Explicit cloud bounds avoid progressive zero-buffer culling. Loading/errors overlay the viewport and a retry button recreates the viewer. Unmount aborts the download and terminates the worker.

The existing conversational avatar remains available on the home page. V4.2 has no morph targets or speech rig and must not be described as a finished replacement.

Validation: `npm test`, `npm run build`, and browser checks of frontal/both profile views, point counts, solid mode and retry. Build success alone is not a WebGL rendering test.
