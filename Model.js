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
function vec3_dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
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
    this.texcoordBuffer = null;
    this.tangentBuffer = null;
    this.indexBuffer = null;
    this.indexCount = 0;

    // material colors
    this.ambient = [0.15, 0.15, 0.15];
    this.shininess = 32.0;

    // clear old buffers (JS references)
    this._clearBuffers = function() {
        this.vertexBuffer = null;
        this.normalBuffer = null;
        this.texcoordBuffer = null;
        this.tangentBuffer = null;
        this.indexBuffer = null;
        this.indexCount = 0;
    };

    // Build indexed mesh + facet-average normals and upload to GPU
    this.createBuffersFromSurface = function(generateFunc, uCount, vCount) {
        this._clearBuffers();

        const uMin = 0.0, uMax = 2.0 * Math.PI;
        const vMin = -2.0, vMax = 0.99999;
        const deltaU = (uMax - uMin) / uCount;
        const deltaV = (vMax - vMin) / (vCount - 1);

        const positions = new Float32Array(uCount * vCount * 3);
        const texcoords = new Float32Array(uCount * vCount * 2);
        const tangents = new Float32Array(positions.length);

        const idx = (i, j) => (i % uCount) * vCount + j;

        // fill positions, texcoords, and tangents
        for (let i = 0, u = uMin; i < uCount; ++i, u += deltaU) {
            for (let j = 0, v = vMin; j < vCount; ++j, v += deltaV) {
                const k = idx(i,j);
                
                // positions
                const p = generateFunc(u, v);
                positions[k*3] = p[0]; positions[k*3+1] = p[1]; positions[k*3+2] = p[2];
                
                // texcoords
                texcoords[k*2] = u / uMax;
                texcoords[k*2+1] = (v - vMin) / (vMax - vMin);

                // tangents (using finite differences)
                const p_u = generateFunc(u + 1e-4, v);
                const t = vec3_normalize(vec3_sub(p_u, p));
                tangents[k*3] = t[0]; tangents[k*3+1] = t[1]; tangents[k*3+2] = t[2];
            }
        }

        const indices = [];
        for (let i = 0; i < uCount; ++i) {
            for (let j = 0; j < vCount - 1; ++j) {
                const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1);
                indices.push(a, b, c);
                indices.push(a, c, d);
            }
        }

        const normals = new Float32Array(positions.length).fill(0);
        for (let t = 0; t < indices.length; t += 3) {
            const ai = indices[t], bi = indices[t+1], ci = indices[t+2];
            const pA = positions.subarray(ai*3, ai*3+3);
            const pB = positions.subarray(bi*3, bi*3+3);
            const pC = positions.subarray(ci*3, ci*3+3);
            const faceNormal = vec3_cross(vec3_sub(pB, pA), vec3_sub(pC, pA));
            
            normals[ai*3] += faceNormal[0]; normals[ai*3+1] += faceNormal[1]; normals[ai*3+2] += faceNormal[2];
            normals[bi*3] += faceNormal[0]; normals[bi*3+1] += faceNormal[1]; normals[bi*3+2] += faceNormal[2];
            normals[ci*3] += faceNormal[0]; normals[ci*3+1] += faceNormal[1]; normals[ci*3+2] += faceNormal[2];
        }

        const vertCount = positions.length / 3;
        for (let i = 0; i < vertCount; ++i) {
            const n_orig = vec3_normalize([normals[i*3], normals[i*3+1], normals[i*3+2]]);
            const t_orig = vec3_normalize([tangents[i*3], tangents[i*3+1], tangents[i*3+2]]);

            // Gram-Schmidt orthogonalization (prioritize tangent)
            let t = t_orig;
            let n = vec3_sub(n_orig, vec3_scale(t, vec3_dot(n_orig, t)));
            n = vec3_normalize(n);

            tangents[i*3] = t[0]; tangents[i*3+1] = t[1]; tangents[i*3+2] = t[2];
            normals[i*3] = n[0]; normals[i*3+1] = n[1]; normals[i*3+2] = n[2];
        }

        this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        this.normalBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);

        this.texcoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, texcoords, gl.STATIC_DRAW);
        
        this.tangentBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.tangentBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, tangents, gl.STATIC_DRAW);

        let indexArray;
        if (positions.length / 3 > 65535) {
            const ext = gl.getExtension('OES_element_index_uint');
            if (!ext) throw new Error('Too many vertices and OES_element_index_uint not available.');
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
    };

    this.setMaterial = function(ambient, shininess) {
        if (ambient) this.ambient = ambient.slice();
        if (shininess) this.shininess = shininess;
    };

    this.Draw = function() {
        if (!this.vertexBuffer || !this.normalBuffer || !this.texcoordBuffer || !this.tangentBuffer || !this.indexBuffer) return;

        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribVertex);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
        gl.vertexAttribPointer(shProgram.iAttribNormal, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribNormal);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordBuffer);
        gl.vertexAttribPointer(shProgram.iAttribTexCoord, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribTexCoord);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.tangentBuffer);
        gl.vertexAttribPointer(shProgram.iAttribTangent, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribTangent);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

        if (shProgram.iAmbient) gl.uniform3fv(shProgram.iAmbient, this.ambient);
        if (shProgram.iShininess) gl.uniform1f(shProgram.iShininess, this.shininess);

        gl.drawElements(gl.TRIANGLES, this.indexCount, this._indexType, 0);
    };
}

window.Model = Model;
window.dingDong_param = dingDong_param;
