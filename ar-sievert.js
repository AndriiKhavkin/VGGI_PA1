'use strict';

/*
 * MSVR Control Task — AR registration template.
 * The same analytical Sievert's Surface used in PA#1 is rebuilt as a Three.js
 * BufferGeometry and rendered above a custom AR.js pattern marker.
 */

function sievertSurfaceFunc(u, v) {
    const C = 1.0;
    const sqrtC = Math.sqrt(C);
    const sqrtCp1 = Math.sqrt(C + 1.0);

    const sinu = Math.sin(u);
    const cosu = Math.cos(u);
    const sinv = Math.sin(v);
    const cosv = Math.cos(v);

    const sinv2 = sinv * sinv;
    const cosu2 = cosu * cosu;
    const denom = (C + 1.0 - C * sinv2 * cosu2);
    const a = 2.0 / denom;

    const phi = -u / sqrtCp1 + Math.atan(sqrtCp1 * Math.tan(u));

    const r = (a / sqrtC) * Math.sqrt((C + 1.0) * (1.0 + C * sinu * sinu)) * sinv;

    let tanHalf = Math.tan(0.5 * v);
    if (tanHalf < 1e-4) tanHalf = 1e-4;

    const z = (Math.log(tanHalf) + a * (C + 1.0) * cosv) / sqrtC;

    const x = r * Math.cos(phi);
    const y = r * Math.sin(phi);

    return [x, y, z];
}

function buildSievertGeometry(uSegments, vSegments, scale) {
    const uMin = -1.2;
    const uMax = 1.2;
    const vMin = 0.1;
    const vMax = 3.05;

    const positions = [];
    const uvs = [];
    const indices = [];

    const rowSize = uSegments + 1;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    const raw = [];

    for (let j = 0; j <= vSegments; j++) {
        const v = vMin + (vMax - vMin) * (j / vSegments);
        for (let i = 0; i <= uSegments; i++) {
            const u = uMin + (uMax - uMin) * (i / uSegments);
            const p = sievertSurfaceFunc(u, v);

            raw.push(p);

            minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
            minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
            minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
        }
    }

    const cx = 0.5 * (minX + maxX);
    const cy = 0.5 * (minY + maxY);
    const cz = 0.5 * (minZ + maxZ);
    const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1.0;
    const s = scale / maxDim;

    let minSceneY = Infinity;

    for (let idx = 0; idx < raw.length; idx++) {
        const p = raw[idx];

        // WebGL PA#1 used Z as the vertical axis. In A-Frame / AR.js, Y is up.
        const x = (p[0] - cx) * s;
        const y = (p[2] - cz) * s;
        const z = (p[1] - cy) * s;

        positions.push(x, y, z);
        minSceneY = Math.min(minSceneY, y);

        const i = idx % rowSize;
        const j = Math.floor(idx / rowSize);
        uvs.push(i / uSegments, j / vSegments);
    }

    // Put the lowest part of the surface slightly above the physical marker.
    for (let k = 1; k < positions.length; k += 3) {
        positions[k] -= minSceneY;
    }

    for (let j = 0; j < vSegments; j++) {
        for (let i = 0; i < uSegments; i++) {
            const i0 = j * rowSize + i;
            const i1 = i0 + 1;
            const i2 = i0 + rowSize;
            const i3 = i2 + 1;

            indices.push(i0, i2, i1);
            indices.push(i1, i2, i3);
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    return geometry;
}

AFRAME.registerComponent('sievert-surface', {
    schema: {
        uSegments: { type: 'int', default: 48 },
        vSegments: { type: 'int', default: 48 },
        scale: { type: 'number', default: 0.55 },
        wireframe: { type: 'boolean', default: true }
    },

    init: function () {
        const data = this.data;
        const geometry = buildSievertGeometry(data.uSegments, data.vSegments, data.scale);

        const material = new THREE.MeshStandardMaterial({
            color: 0x67d6ff,
            metalness: 0.18,
            roughness: 0.42,
            side: THREE.DoubleSide
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = false;
        this.mesh.receiveShadow = false;
        this.el.object3D.add(this.mesh);

        if (data.wireframe) {
            const wireGeometry = new THREE.WireframeGeometry(geometry);
            const wireMaterial = new THREE.LineBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.42
            });

            this.wire = new THREE.LineSegments(wireGeometry, wireMaterial);
            this.el.object3D.add(this.wire);
        }
    },

    tick: function (time) {
        const t = time * 0.001;
        this.el.object3D.rotation.y = t * 0.35;
    },

    remove: function () {
        if (this.mesh) {
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
        if (this.wire) {
            this.wire.geometry.dispose();
            this.wire.material.dispose();
        }
    }
});
