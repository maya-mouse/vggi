
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
    this.uBufferData = { buffer: null, lines: [] }; // lines: array of { start, count }
    this.vBufferData = { buffer: null, lines: [] };
    //colors by default
    this.uColor = [1.0, 0.2, 0.2, 1.0]; 
    this.vColor = [0.2, 0.7, 1.0, 1.0]; 

    // clear buffers (call before repeating building)
    this._clearLines = function() {
        if (this.uBufferData.buffer) {
            gl.deleteBuffer(this.uBufferData.buffer);
        }
        if (this.vBufferData.buffer) {
            gl.deleteBuffer(this.vBufferData.buffer);
        }
        this.uBufferData = { buffer: null, lines: [] };
        this.vBufferData = { buffer: null, lines: [] };
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
        
        // Combine all vertices for U-lines into one array
        let all_u_verts = [];
        let u_current_start = 0;
        for (let i = 0; i < uCount; ++i) {
            let line_verts = [];
            for (let j = 0; j < vCount; ++j) {
                line_verts.push(grid[i][j][0], grid[i][j][1], grid[i][j][2]);
            }
            all_u_verts.push(...line_verts);
            this.uBufferData.lines.push({ start: u_current_start, count: line_verts.length / 3 });
            u_current_start += line_verts.length / 3;
        }

        // Create and buffer U-lines data
        this.uBufferData.buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.uBufferData.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(all_u_verts), gl.STATIC_DRAW);

        // Combine all vertices for V-lines into one array
        let all_v_verts = [];
        let v_current_start = 0;
        for (let j = 0; j < vCount; ++j) {
            let line_verts = [];
            for (let i = 0; i < uCount; ++i) {
                line_verts.push(grid[i][j][0], grid[i][j][1], grid[i][j][2]);
            }
            all_v_verts.push(...line_verts);
            this.vBufferData.lines.push({ start: v_current_start, count: line_verts.length / 3 });
            v_current_start += line_verts.length / 3;
        }
        
        // Create and buffer V-lines data
        this.vBufferData.buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vBufferData.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(all_v_verts), gl.STATIC_DRAW);
    };

    // set colors
    this.setColors = function(uColorRGBA, vColorRGBA) {
        if (uColorRGBA && uColorRGBA.length === 4) this.uColor = uColorRGBA.slice();
        if (vColorRGBA && vColorRGBA.length === 4) this.vColor = vColorRGBA.slice();
    };

    // drawing all lines
    this.Draw = function() {
        if (!shProgram) return;

        // u-polylines
        if (this.uBufferData.buffer && this.uBufferData.lines.length > 0) {
            if (shProgram.iColor !== -1) {
                gl.uniform4fv(shProgram.iColor, this.uColor);
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, this.uBufferData.buffer);
            gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(shProgram.iAttribVertex);
            
            for (let line of this.uBufferData.lines) {
                gl.drawArrays(gl.LINE_STRIP, line.start, line.count);
            }
        }

        // v-polylines
        if (this.vBufferData.buffer && this.vBufferData.lines.length > 0) {
            if (shProgram.iColor !== -1) {
                gl.uniform4fv(shProgram.iColor, this.vColor);
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, this.vBufferData.buffer);
            gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(shProgram.iAttribVertex);

            for (let line of this.vBufferData.lines) {
                gl.drawArrays(gl.LINE_STRIP, line.start, line.count);
            }
        }
    };
}

// export for using model in main.js
window.Model = Model;
window.dingDong_param = dingDong_param;
