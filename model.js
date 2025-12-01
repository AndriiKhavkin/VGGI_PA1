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

    // ==== 1) генеруємо вершини сітки ====
    for (let j = 0; j <= vSeg; j++) {
        const v = vMin + dv * j;
        for (let i = 0; i <= uSeg; i++) {
            const u = uMin + du * i;
            const p = this.surfaceFunc(u, v); // [x,y,z]
            positions.push(p[0], p[1], p[2]);
        }
    }

    // ==== 2) генеруємо індекси трикутників ====
    const indices = [];

    const rowSize = uSeg + 1;
    for (let j = 0; j < vSeg; j++) {
        for (let i = 0; i < uSeg; i++) {
            const i0 = j * rowSize + i;
            const i1 = i0 + 1;
            const i2 = i0 + rowSize;
            const i3 = i2 + 1;

            // два трикутники: (i0, i2, i1) і (i1, i2, i3)
            indices.push(i0, i2, i1);
            indices.push(i1, i2, i3);
        }
    }

    this.indexCount = indices.length;

    // ==== 3) Facet average нормалі (Vertex Normal – Facet average) ====
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

        // facet normal = v1 × v2
        let nx = v1[1]*v2[2] - v1[2]*v2[1];
        let ny = v1[2]*v2[0] - v1[0]*v2[2];
        let nz = v1[0]*v2[1] - v1[1]*v2[0];

        // НОРМАЛІЗУЄМО facet-нормаль → всі трикутники з однаковою вагою (facet average)
        const len = Math.hypot(nx, ny, nz) || 1.0;
        nx /= len; ny /= len; nz /= len;

        // додаємо цю facet-нормаль до трьох вершин
        normals[ia]     += nx; normals[ia + 1] += ny; normals[ia + 2] += nz;
        normals[ib]     += nx; normals[ib + 1] += ny; normals[ib + 2] += nz;
        normals[ic]     += nx; normals[ic + 1] += ny; normals[ic + 2] += nz;
    }

    // фінальна нормалізація в кожній вершині
    for (let i = 0; i < normals.length; i += 3) {
        const nx = normals[i];
        const ny = normals[i + 1];
        const nz = normals[i + 2];
        const len = Math.hypot(nx, ny, nz) || 1.0;
        normals[i]     = nx / len;
        normals[i + 1] = ny / len;
        normals[i + 2] = nz / len;
    }

    // ==== 4) створюємо/оновлюємо буфери ====
    if (!this.positionBuffer) this.positionBuffer = gl.createBuffer();
    if (!this.normalBuffer)   this.normalBuffer   = gl.createBuffer(); // NEW
    if (!this.indexBuffer)    this.indexBuffer    = gl.createBuffer();

    // позиції
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    // нормалі
    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);

    // індекси
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    // відв’язуємо
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
};

// виклик малювання
Model.prototype.draw = function (positionAttribLocation, normalAttribLocation) {
    const gl = this.gl;

    // позиції
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.vertexAttribPointer(positionAttribLocation, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(positionAttribLocation);

    // нормалі
    if (normalAttribLocation !== undefined && this.normalBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
        gl.vertexAttribPointer(normalAttribLocation, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(normalAttribLocation);
    }

    // індекси
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
};
