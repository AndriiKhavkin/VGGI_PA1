"use strict";

/// Об'єкт Model для трикутної сітки поверхні
function Model(gl, surfaceFunc, options) {
    this.gl = gl;
    this.surfaceFunc = surfaceFunc;

    const opts = options || {};
    this.uSegments = opts.uSegments || 40;
    this.vSegments = opts.vSegments || 40;
    this.uRange = opts.uRange || { min: -1.2, max: 1.2 };
    this.vRange = opts.vRange || { min: 0.1,  max: 3.05 };

    // буфери
    this.positionBuffer = null;
    this.normalBuffer   = null;   // NEW: буфер нормалей
    this.indexBuffer    = null;
    // нові буферри для Control task
    this.texcoordBuffer = null;
    this.tangentBuffer  = null;

    this.indexCount = 0;

    this.buildMesh();
}


Model.prototype.buildMesh = function () {
    const gl = this.gl;

    const uSeg = this.uSegments;
    const vSeg = this.vSegments;

    const uMin = this.uRange.min;
    const uMax = this.uRange.max;
    const vMin = this.vRange.min;
    const vMax = this.vRange.max;

    const du = (uMax - uMin) / uSeg;
    const dv = (vMax - vMin) / vSeg;

    const positions = [];
    const texcoords = [];

    // ==== 1) генеруємо вершини сітки + UV ====
    for (let j = 0; j <= vSeg; j++) {
        const v = vMin + dv * j;
        const v01 = j / vSeg;            // 0..1
        for (let i = 0; i <= uSeg; i++) {
            const u = uMin + du * i;
            const p = this.surfaceFunc(u, v); // [x,y,z]
            positions.push(p[0], p[1], p[2]);

            const u01 = i / uSeg;        // 0..1
            texcoords.push(u01, v01);
        }
    }

    const vertexCount = positions.length / 3;

    // ==== 2) індекси трикутників ====
    const indices = [];
    const rowSize = uSeg + 1;

    for (let j = 0; j < vSeg; j++) {
        for (let i = 0; i < uSeg; i++) {
            const i0 = j * rowSize + i;
            const i1 = i0 + 1;
            const i2 = i0 + rowSize;
            const i3 = i2 + 1;

            indices.push(i0, i2, i1);
            indices.push(i1, i2, i3);
        }
    }

    this.indexCount = indices.length;

    // ==== 3) Facet average нормалі ====
    const normals = new Array(positions.length).fill(0);

    for (let k = 0; k < indices.length; k += 3) {
        const ia = indices[k] * 3;
        const ib = indices[k + 1] * 3;
        const ic = indices[k + 2] * 3;

        const p0 = [positions[ia],     positions[ia + 1],     positions[ia + 2]];
        const p1 = [positions[ib],     positions[ib + 1],     positions[ib + 2]];
        const p2 = [positions[ic],     positions[ic + 1],     positions[ic + 2]];

        const v1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        const v2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];

        let nx = v1[1]*v2[2] - v1[2]*v2[1];
        let ny = v1[2]*v2[0] - v1[0]*v2[2];
        let nz = v1[0]*v2[1] - v1[1]*v2[0];

        const len = Math.hypot(nx, ny, nz) || 1.0;
        nx /= len; ny /= len; nz /= len;

        normals[ia]     += nx; normals[ia + 1] += ny; normals[ia + 2] += nz;
        normals[ib]     += nx; normals[ib + 1] += ny; normals[ib + 2] += nz;
        normals[ic]     += nx; normals[ic + 1] += ny; normals[ic + 2] += nz;
    }

    // фінальна нормалізація нормалей
    for (let i = 0; i < normals.length; i += 3) {
        const nx = normals[i];
        const ny = normals[i + 1];
        const nz = normals[i + 2];
        const len = Math.hypot(nx, ny, nz) || 1.0;
        normals[i]     = nx / len;
        normals[i + 1] = ny / len;
        normals[i + 2] = nz / len;
    }

    // ==== 4) Tangents + Gram–Schmidt (prioritize normal) ====
    const tangents = new Float32Array(positions.length);

    function normalize3(x, y, z) {
        const len = Math.hypot(x, y, z);
        if (len < 1e-8) return [0, 0, 0];
        return [x/len, y/len, z/len];
    }

    for (let j = 0; j <= vSeg; j++) {
        for (let i = 0; i <= uSeg; i++) {
            const idx = j * rowSize + i;
            const pIndex = 3 * idx;

            const px = positions[pIndex];
            const py = positions[pIndex + 1];
            const pz = positions[pIndex + 2];

            // сусід по U
            let iu = (i < uSeg) ? i + 1 : i - 1;
            const nIdx = j * rowSize + iu;
            const npIndex = 3 * nIdx;
            const npx = positions[npIndex];
            const npy = positions[npIndex + 1];
            const npz = positions[npIndex + 2];

            let tx = npx - px;
            let ty = npy - py;
            let tz = npz - pz;

            let nx = normals[pIndex];
            let ny = normals[pIndex + 1];
            let nz = normals[pIndex + 2];
            [nx, ny, nz] = normalize3(nx, ny, nz);

            // PRIORITIZE NORMAL: ортогоналізуємо T відносно N
            const dotNT = nx*tx + ny*ty + nz*tz;
            tx -= dotNT * nx;
            ty -= dotNT * ny;
            tz -= dotNT * nz;

            [tx, ty, tz] = normalize3(tx, ty, tz);

            tangents[pIndex]     = tx;
            tangents[pIndex + 1] = ty;
            tangents[pIndex + 2] = tz;
        }
    }

    // ==== 5) створюємо/оновлюємо буфери ====
    if (!this.positionBuffer) this.positionBuffer = gl.createBuffer();
    if (!this.normalBuffer)   this.normalBuffer   = gl.createBuffer();
    if (!this.indexBuffer)    this.indexBuffer    = gl.createBuffer();
    if (!this.texcoordBuffer) this.texcoordBuffer = gl.createBuffer();
    if (!this.tangentBuffer)  this.tangentBuffer  = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texcoords), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.tangentBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, tangents, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
};


// виклик малювання
Model.prototype.draw = function (posLoc, normLoc, texLoc, tanLoc) {
    const gl = this.gl;

    // positions
    if (posLoc !== undefined) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(posLoc);
    }

    // normals
    if (normLoc !== undefined) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
        gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(normLoc);
    }

    // texcoords
    if (texLoc !== undefined) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordBuffer);
        gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(texLoc);
    }

    // tangents
    if (tanLoc !== undefined) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.tangentBuffer);
        gl.vertexAttribPointer(tanLoc, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(tanLoc);
    }

    // --- TEXTURES ---
    if (this.idTextureDiffuse) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.idTextureDiffuse);
    }
    if (this.idTextureSpecular) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.idTextureSpecular);
    }
    if (this.idTextureNormal) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.idTextureNormal);
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
};
