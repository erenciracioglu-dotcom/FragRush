// Mesh worker: chunk/parca mesh'lerini ana is parcacigini bloklamadan uretir.
import { meshVoxels, setPalette } from './mesher.js';

self.onmessage = (e) => {
  const d = e.data;
  if (d.type === 'palette') { setPalette(d.palette); return; }
  if (d.type === 'mesh') {
    const r = meshVoxels(d.mats, d.dmgs, d.nx, d.ny, d.nz, d.ox, d.oy, d.oz, d.vs);
    self.postMessage(
      { type: 'mesh', job: d.job, pos: r.pos, nrm: r.nrm, col: r.col, mat: r.mat, idx: r.idx, vcount: r.vcount, mats: d.mats, dmgs: d.dmgs },
      [r.pos.buffer, r.nrm.buffer, r.col.buffer, r.mat.buffer, r.idx.buffer, d.mats.buffer, d.dmgs.buffer],
    );
  }
};
