"use strict";

// Об'єкт Model для зберігання U/V поліліній і малювання wireframe-поверхні
function Model(gl, surfaceFunc, options) {
    this.gl = gl;
    this.surfaceFunc = surfaceFunc;

    options = options || {};
    this.uSegments = options.uSegments || 40;
    this.vSegments = options.vSegments || 40;
    this.uRange = options.uRange || { min: -1.0, max: 1.0 };
    this.vRange = options.vRange || { min: -1.0, max: 1.0 };

    // Логічні структури 
    this.uLines = []; // масив поліліній уздовж u
    this.vLines = []; // масив поліліній уздовж v

    // WebGL-буфери для відрізків
    this.uBuffer = null;
    this.vBuffer = null;
    this.uVertexCount = 0;
    this.vVertexCount = 0;

    this._buildGrid();
    this._createBuffers();
}

Model.prototype._buildGrid = function () {
    const uSeg = this.uSegments;
    const vSeg = this.vSegments;
    const uMin = this.uRange.min;
    const uMax = this.uRange.max;
    const vMin = this.vRange.min;
    const vMax = this.vRange.max;

    const du = (uMax - uMin) / uSeg;
    const dv = (vMax - vMin) / vSeg;

    // U-полілінії: фіксований u, проходимо всі v
    for (let i = 0; i <= uSeg; i++) {
        const u = uMin + i * du;
        const poly = [];
        for (let j = 0; j <= vSeg; j++) {
            const v = vMin + j * dv;
            const p = this.surfaceFunc(u, v); // [x, y, z]
            poly.push(p[0], p[1], p[2]);
        }
        this.uLines.push(poly);
    }

    // V-полілінії: фіксований v, проходимо всі u
    for (let j = 0; j <= vSeg; j++) {
        const v = vMin + j * dv;
        const poly = [];
        for (let i = 0; i <= uSeg; i++) {
            const u = uMin + i * du;
            const p = this.surfaceFunc(u, v);
            poly.push(p[0], p[1], p[2]);
        }
        this.vLines.push(poly);
    }
};

Model.prototype._createBuffers = function () {
    const gl = this.gl;
    const uLineSegments = [];
    const vLineSegments = [];

    // Кожну полілінію розбиваємо на відрізки (для gl.LINES)
    for (let k = 0; k < this.uLines.length; k++) {
        const poly = this.uLines[k];
        for (let i = 0; i < poly.length - 3; i += 3) {
            uLineSegments.push(
                poly[i],     poly[i + 1],     poly[i + 2],
                poly[i + 3], poly[i + 4],     poly[i + 5]
            );
        }
    }

    for (let k = 0; k < this.vLines.length; k++) {
        const poly = this.vLines[k];
        for (let i = 0; i < poly.length - 3; i += 3) {
            vLineSegments.push(
                poly[i],     poly[i + 1],     poly[i + 2],
                poly[i + 3], poly[i + 4],     poly[i + 5]
            );
        }
    }

    this.uVertexCount = uLineSegments.length / 3;
    this.vVertexCount = vLineSegments.length / 3;

    // U-буфер
    this.uBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uLineSegments), gl.STATIC_DRAW);

    // V-буфер
    this.vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vLineSegments), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
};

// Малювання U+V сітки
Model.prototype.draw = function (positionAttribLocation) {
    const gl = this.gl;

    gl.enableVertexAttribArray(positionAttribLocation);

    // U-лінії
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uBuffer);
    gl.vertexAttribPointer(positionAttribLocation, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.LINES, 0, this.uVertexCount);

    // V-лінії
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vBuffer);
    gl.vertexAttribPointer(positionAttribLocation, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.LINES, 0, this.vVertexCount);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
};
