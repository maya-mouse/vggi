
'use strict';

// Parametric function ding-dong surface 
function dingDong_param(u, v, a = 1.0) {
    // u in radians, v real but must be < 1
    if (v >= 1.0) v = 0.999999;
    let oneMinusV = 1.0 - v;
    if (oneMinusV < 0) oneMinusV = 0;
    let r = a * v * Math.sqrt(oneMinusV);
    let x = r * Math.cos(u);
    let y = r * Math.sin(u);
    let z = a * v;
    return [x, y, z];
}

// Model — save buffers for u and v 
function Model(name) {
    this.name = name;
    this.uLines = []; // array of { buffer, count }
    this.vLines = [];
    //colors by default
    this.uColor = [1.0, 0.2, 0.2, 1.0]; 
    this.vColor = [0.2, 0.7, 1.0, 1.0]; 

    // clear buffers (call before repeating building)
    this._clearLines = function() {
        this.uLines = [];
        this.vLines = [];
    };

    /*
      createBuffersFromSurface(generateFunc, uCount, vCount)
      generateFunc(u, v) => [x,y,z]
      u is mapped from 0..2π
      v is mapped from vMin..vMax (practical truncation of (-inf,1) )
    */
    this.createBuffersFromSurface = function(generateFunc, uCount, vCount) {
        this._clearLines();
        // parameters limits
        let uMin = 0.0;
        let uMax = 2.0 * Math.PI;
        // practical v-range for ding-dong: v in (-inf, 1)
        let vMin = -2.0;
        let vMax = 0.9999;

        // define step (delta)
        let deltaU = (uMax - uMin) / (uCount - 1); 
        let deltaV = (vMax - vMin) / (vCount - 1); 

        // creating grid
        let grid = new Array(uCount);
        for (let i = 0, u = uMin; i < uCount; ++i, u += deltaU) {
          grid[i] = new Array(vCount);
           for (let j = 0, v = vMin; j < vCount; ++j, v += deltaV) {
            grid[i][j] = generateFunc(u, v);
           }
        }

        // u-polylines (fixed u, changed v) - horizontal lines
        for (let i = 0; i < uCount; ++i) {
            let verts = [];
            for (let j = 0; j < vCount; ++j) {
                verts.push(grid[i][j][0], grid[i][j][1], grid[i][j][2]);
            }
            let buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
            this.uLines.push({ buffer: buf, count: verts.length / 3 });
        }

        // v-polylines (fixed v, changing u) - vertical lines
        for (let j = 0; j < vCount; ++j) {
            let verts = [];
            for (let i = 0; i < uCount; ++i) {
                verts.push(grid[i][j][0], grid[i][j][1], grid[i][j][2]);
            }
            let buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
            this.vLines.push({ buffer: buf, count: verts.length / 3 });
        }
    };

    // set colors
    this.setColors = function(uColorRGBA, vColorRGBA) {
        if (uColorRGBA && uColorRGBA.length === 4) this.uColor = uColorRGBA.slice();
        if (vColorRGBA && vColorRGBA.length === 4) this.vColor = vColorRGBA.slice();
    };

    // drawing all lines
    this.Draw = function() {
        // u-polylines
        if (shProgram && shProgram.iColor !== -1) {
            gl.uniform4fv(shProgram.iColor, this.uColor);
        }
        for (let line of this.uLines) {
            gl.bindBuffer(gl.ARRAY_BUFFER, line.buffer);
            gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(shProgram.iAttribVertex);
            gl.drawArrays(gl.LINE_STRIP, 0, line.count);
        }
        // v-polylines
        if (shProgram && shProgram.iColor !== -1) {
            gl.uniform4fv(shProgram.iColor, this.vColor);
        }
        for (let line of this.vLines) {
            gl.bindBuffer(gl.ARRAY_BUFFER, line.buffer);
            gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(shProgram.iAttribVertex);
            gl.drawArrays(gl.LINE_STRIP, 0, line.count);
        }
    };
}

// export for using model in main.js
window.Model = Model;
window.dingDong_param = dingDong_param;
