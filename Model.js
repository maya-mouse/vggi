'use strict';


function dingDong_param(u, v, a = 1.0) {
    if (v >= 1.0) v = 0.999999;
    let oneMinusV = 1.0 - v;
    if (oneMinusV < 0) oneMinusV = 0;
    let r = a * v * Math.sqrt(oneMinusV);
    let x = r * Math.cos(u);
    let y = r * Math.sin(u);
    let z = a * v;
    return [x, y, z];
}

// small vector helpers
function vec3_sub(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function vec3_add(a, b) { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
function vec3_scale(a, s) { return [a[0]*s, a[1]*s, a[2]*s]; }
function vec3_len(a) { return Math.hypot(a[0], a[1], a[2]); }
function vec3_normalize(a) { let L = vec3_len(a)||1.0; return [a[0]/L, a[1]/L, a[2]/L]; }
function vec3_cross(a, b) {
    return [
        a[1]*b[2] - a[2]*b[1],
        a[2]*b[0] - a[0]*b[2],
        a[0]*b[1] - a[1]*b[0]
    ];
}

// Model constructor
function Model(name) {
    this.name = name;

    // GPU buffers
    this.vertexBuffer = null;
    this.normalBuffer = null;
    this.indexBuffer = null;
    this.indexCount = 0;

    // material colors
    this.ambient = [0.15, 0.15, 0.15];
    this.diffuse = [0.8, 0.5, 0.9];
    this.specular = [1.0, 1.0, 1.0];
    this.shininess = 32.0;

    // clear old buffers (JS references)
    this._clearBuffers = function() {
        this.vertexBuffer = null;
        this.normalBuffer = null;
        this.indexBuffer = null;
        this.indexCount = 0;
    };

    // Build indexed mesh + facet-average normals and upload to GPU
    // uCount, vCount integers
    this.createBuffersFromSurface = function(generateFunc, uCount, vCount) {
        this._clearBuffers();

        // parameter ranges (hardcoded safe defaults)
        const uMin = 0.0, uMax = 2.0 * Math.PI;
        const vMin = -2.0, vMax = 0.99999;

        // step sizes
        // so u = uMin + i * deltaU, i = 0..uCount-1
        const deltaU = (uMax - uMin) / uCount;
        const deltaV = (vMax - vMin) / (vCount - 1);

        // positions array (flat)
        const positions = new Float32Array(uCount * vCount * 3);

        // helper index
        const idx = (i, j) => i * vCount + j;

        // fill positions
        for (let i = 0, u = uMin; i < uCount; ++i, u += deltaU) {
            for (let j = 0, v = vMin; j < vCount; ++j, v += deltaV) {
                const p = generateFunc(u, v);
                const k = idx(i,j) * 3;
                positions[k] = p[0]; positions[k+1] = p[1]; positions[k+2] = p[2];
            }
        }

        // build indices (two triangles per cell)
        const indices = [];
        for (let i = 0; i < uCount; ++i) {
            const iNext = (i + 1) % uCount; 
            for (let j = 0; j < vCount - 1; ++j) {
                
                const a = idx(i, j);
                const b = idx(iNext, j);
                const c = idx(iNext, j+1);
                const d = idx(i, j+1);
                
                indices.push(a, b, c);
                indices.push(a, c, d);
            }
        }

        // compute facet-average normals:
        const normals = new Float32Array(positions.length); // initially zeros

        function addFaceNormal(ai, bi, ci) {
            const ax = positions[ai*3], ay = positions[ai*3+1], az = positions[ai*3+2];
            const bx = positions[bi*3], by = positions[bi*3+1], bz = positions[bi*3+2];
            const cx = positions[ci*3], cy = positions[ci*3+1], cz = positions[ci*3+2];
            const ABx = bx - ax, ABy = by - ay, ABz = bz - az;
            const ACx = cx - ax, ACy = cy - ay, ACz = cz - az;
            const nx = ABy * ACz - ABz * ACy;
            const ny = ABz * ACx - ABx * ACz;
            const nz = ABx * ACy - ABy * ACx;
            normals[ai*3]   += nx; normals[ai*3+1] += ny; normals[ai*3+2] += nz;
            normals[bi*3]   += nx; normals[bi*3+1] += ny; normals[bi*3+2] += nz;
            normals[ci*3]   += nx; normals[ci*3+1] += ny; normals[ci*3+2] += nz;
        }

        for (let t = 0; t < indices.length; t += 3) {
            addFaceNormal(indices[t], indices[t+1], indices[t+2]);
        }

        // normalize normals
        const vertCount = positions.length / 3;
        for (let vi = 0; vi < vertCount; ++vi) {
            const nx = normals[vi*3], ny = normals[vi*3+1], nz = normals[vi*3+2];
            const L = Math.hypot(nx, ny, nz) || 1.0;
            normals[vi*3] = nx / L;
            normals[vi*3+1] = ny / L;
            normals[vi*3+2] = nz / L;
        }

        // upload to GPU
        this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        this.normalBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);

        let indexArray;
        if (positions.length / 3 > 65535) {
            // request extension
            const ext = gl.getExtension('OES_element_index_uint');
            if (!ext) {
                throw new Error('Too many vertices and extension OES_element_index_uint not available.');
            }
            indexArray = new Uint32Array(indices);
            this._indexType = gl.UNSIGNED_INT;
        } else {
            indexArray = new Uint16Array(indices);
            this._indexType = gl.UNSIGNED_SHORT;
        }

        this.indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexArray, gl.STATIC_DRAW);

        this.indexCount = indices.length;

        // store some arrays
        this._positions = positions;
        this._normals = normals;
        this._indices = indexArray;
    };

    // optionally set material
    this.setMaterial = function(ambient, diffuse, specular, shininess) {
        if (ambient) this.ambient = ambient.slice();
        if (diffuse) this.diffuse = diffuse.slice();
        if (specular) this.specular = specular.slice();
        if (shininess) this.shininess = shininess;
    };

    // draw mesh
    this.Draw = function() {
        if (!this.vertexBuffer || !this.normalBuffer || !this.indexBuffer) return;

        // positions
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribVertex);

        // normals
        gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
        gl.vertexAttribPointer(shProgram.iAttribNormal, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribNormal);

        // indices
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

        // set material uniforms (if available)
        if (shProgram.iAmbient) gl.uniform3fv(shProgram.iAmbient, this.ambient);
        if (shProgram.iDiffuse) gl.uniform3fv(shProgram.iDiffuse, this.diffuse);
        if (shProgram.iSpecular) gl.uniform3fv(shProgram.iSpecular, this.specular);
        if (shProgram.iShininess) gl.uniform1f(shProgram.iShininess, this.shininess);

        // draw triangles
        gl.drawElements(gl.TRIANGLES, this.indexCount, this._indexType, 0);
    };
}

window.Model = Model;
window.dingDong_param = dingDong_param;
