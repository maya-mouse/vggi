'use strict';

let gl;                         // The webgl context.
let surface;                    // A surface model
let shProgram;                  // A shader program (wrapper)
let spaceball;                  // Trackball

function deg2rad(angle) { return angle * Math.PI / 180; }

// multiply 4x4 matrix (column-major) by vec4
function multiplyMat4Vec4(m, v) {
    return [
        m[0]*v[0] + m[4]*v[1] + m[8]*v[2] + m[12]*v[3],
        m[1]*v[0] + m[5]*v[1] + m[9]*v[2] + m[13]*v[3],
        m[2]*v[0] + m[6]*v[1] + m[10]*v[2] + m[14]*v[3],
        m[3]*v[0] + m[7]*v[1] + m[11]*v[2] + m[15]*v[3]
    ];
}

// compute 3x3 normal matrix (transpose(inverse(modelView3x3)))
function computeNormalMatrix3(modelView) {
    // extract upper-left 3x3 (column-major)
    const a00 = modelView[0], a01 = modelView[4], a02 = modelView[8];
    const a10 = modelView[1], a11 = modelView[5], a12 = modelView[9];
    const a20 = modelView[2], a21 = modelView[6], a22 = modelView[10];

    const det = a00*(a11*a22 - a12*a21) - a01*(a10*a22 - a12*a20) + a02*(a10*a21 - a11*a20);
    const invDet = 1.0 / (det || 1e-9);

    const r00 =  (a11*a22 - a12*a21) * invDet;
    const r01 = -(a01*a22 - a02*a21) * invDet;
    const r02 =  (a01*a12 - a02*a11) * invDet;

    const r10 = -(a10*a22 - a12*a20) * invDet;
    const r11 =  (a00*a22 - a02*a20) * invDet;
    const r12 = -(a00*a12 - a02*a10) * invDet;

    const r20 =  (a10*a21 - a11*a20) * invDet;
    const r21 = -(a00*a21 - a01*a20) * invDet;
    const r22 =  (a00*a11 - a01*a10) * invDet;

    // transpose inverse  return as column-major 3x3
    return new Float32Array([
        r00, r10, r20,
        r01, r11, r21,
        r02, r12, r22
    ]);
}

// rebuild surface from UI
function rebuildSurfaceFromUI() {
    let uCount = parseInt(document.getElementById('uCount')?.value) || 60;
    let vCount = parseInt(document.getElementById('vCount')?.value) || 48;
    if (uCount < 3) uCount = 3;
    if (vCount < 2) vCount = 2;

    // update numeric boxes if present
    const uNum = document.getElementById('uCountNum'), vNum = document.getElementById('vCountNum');
    if (uNum) uNum.value = uCount;
    if (vNum) vNum.value = vCount;

    // create mesh buffers
    surface.createBuffersFromSurface(function(u,v){ return dingDong_param(u, v, 1.0); }, uCount, vCount);
    // can set material
    surface.setMaterial([0.12,0.12,0.12],[0.95,0.6,0.95],[1.0,1.0,1.0], 64.0);

    draw();
}


function draw() {
    if (!gl) return;
    gl.clearColor(0,0,0,1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);


    const projection = m4.perspective(Math.PI/8, gl.canvas.width / gl.canvas.height, 0.1, 100.0);


    let view = (typeof spaceball !== 'undefined' && spaceball && typeof spaceball.getViewMatrix === 'function')
                ? spaceball.getViewMatrix()
                : ((typeof m4.identity === 'function') ? m4.identity() : m4.translation(0,0,0));

    const rotateToPointZero = m4.axisRotation([0.707,0.707,0], 0.7);
    const translateToPointZero = m4.translation(0,0,-10);


    const matAccum0 = m4.multiply(rotateToPointZero, view);
    const modelView = m4.multiply(translateToPointZero, matAccum0); 
    const modelViewProjection = m4.multiply(projection, modelView);

   
    shProgram.Use();

    gl.uniformMatrix4fv(shProgram.iModelViewProjectionMatrix, false, modelViewProjection);
    gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, modelView);

    // compute and set NormalMatrix (3x3)
    const normalMat3 = computeNormalMatrix3(modelView);
    gl.uniformMatrix3fv(shProgram.iNormalMatrix, false, normalMat3);

    // update moving light in world-space, then transform to eye-space using modelView
    const t = performance.now() * 0.001;
    const radius = 6.0;
    const lightWorld = [ radius * Math.cos(t), 2.0, radius * Math.sin(t), 1.0 ];
    const lightEye = multiplyMat4Vec4(modelView, lightWorld); // returns vec4
    gl.uniform3fv(shProgram.iLightPosEye, [lightEye[0], lightEye[1], lightEye[2]]);

    // set material uniforms 
    if (shProgram.iAmbient) gl.uniform3fv(shProgram.iAmbient, surface.ambient);
    if (shProgram.iDiffuse) gl.uniform3fv(shProgram.iDiffuse, surface.diffuse);
    if (shProgram.iSpecular) gl.uniform3fv(shProgram.iSpecular, surface.specular);
    if (shProgram.iShininess) gl.uniform1f(shProgram.iShininess, surface.shininess);

    // draw surface
    surface.Draw();
}

// Initialize GL, compile shaders, get locations
function initGL() {
    const prog = createProgram(gl, vertexShaderSource, fragmentShaderSource);
    shProgram = new ShaderProgram('Phong', prog);
    shProgram.Use();

    shProgram.iAttribVertex = gl.getAttribLocation(prog, "vertex");
    shProgram.iAttribNormal = gl.getAttribLocation(prog, "normal");

    shProgram.iModelViewProjectionMatrix = gl.getUniformLocation(prog, "ModelViewProjectionMatrix");
    shProgram.iModelViewMatrix = gl.getUniformLocation(prog, "ModelViewMatrix");
    shProgram.iNormalMatrix = gl.getUniformLocation(prog, "NormalMatrix");

    shProgram.iLightPosEye = gl.getUniformLocation(prog, "lightPosEye");
    shProgram.iAmbient = gl.getUniformLocation(prog, "ambientColor");
    shProgram.iDiffuse = gl.getUniformLocation(prog, "diffuseColor");
    shProgram.iSpecular = gl.getUniformLocation(prog, "specularColor");
    shProgram.iShininess = gl.getUniformLocation(prog, "shininess");

    // create model
    surface = new Model('Surface');

    // wire filled: build indexed mesh
    rebuildSurfaceFromUI();

    // connect controls
    const uRange = document.getElementById('uCount');
    const vRange = document.getElementById('vCount');
    const uNum = document.getElementById('uCountNum');
    const vNum = document.getElementById('vCountNum');


    if (uRange && uNum) {
        uRange.addEventListener('input', () => { uNum.value = uRange.value; });
        uNum.addEventListener('change', () => { uRange.value = uNum.value; });
    }
    if (vRange && vNum) {
        vRange.addEventListener('input', () => { vNum.value = vRange.value; });
        vNum.addEventListener('change', () => { vRange.value = vNum.value; });
    }

    uRange.addEventListener('input', rebuildSurfaceFromUI);
    uNum.addEventListener('change', rebuildSurfaceFromUI);
    vRange.addEventListener('input', rebuildSurfaceFromUI);
    vNum.addEventListener('change', rebuildSurfaceFromUI);


    gl.enable(gl.DEPTH_TEST);
}


function ShaderProgram(name, program) {
    this.name = name;
    this.prog = program;
    this.iAttribVertex = -1;
    this.iAttribNormal = -1;
    this.iModelViewProjectionMatrix = -1;
    this.iModelViewMatrix = -1;
    this.iNormalMatrix = -1;
    this.iLightPosEye = -1;
    this.iAmbient = -1;
    this.iDiffuse = -1;
    this.iSpecular = -1;
    this.iShininess = -1;
    this.Use = function() { gl.useProgram(this.prog); };
}


function createProgram(gl, vShader, fShader) {
    let vsh = gl.createShader( gl.VERTEX_SHADER );
    gl.shaderSource(vsh,vShader);
    gl.compileShader(vsh);
    if ( ! gl.getShaderParameter(vsh, gl.COMPILE_STATUS) ) {
        throw new Error("Error in vertex shader:  " + gl.getShaderInfoLog(vsh));
     }
    let fsh = gl.createShader( gl.FRAGMENT_SHADER );
    gl.shaderSource(fsh, fShader);
    gl.compileShader(fsh);
    if ( ! gl.getShaderParameter(fsh, gl.COMPILE_STATUS) ) {
       throw new Error("Error in fragment shader:  " + gl.getShaderInfoLog(fsh));
    }
    let prog = gl.createProgram();
    gl.attachShader(prog,vsh);
    gl.attachShader(prog, fsh);
    gl.linkProgram(prog);
    if ( ! gl.getProgramParameter( prog, gl.LINK_STATUS) ) {
       throw new Error("Link error in program:  " + gl.getProgramInfoLog(prog));
    }
    return prog;
}

/**
 * initialization function that will be called when the page has loaded
 */
function init() {
    let canvas;
    try {
        canvas = document.getElementById("webglcanvas");
        gl = canvas.getContext("webgl");
        if ( ! gl ) {
            throw "Browser does not support WebGL";
        }
    } catch (e) {
        document.getElementById("canvas-holder").innerHTML =
            "<p>Sorry, could not get a WebGL graphics context.</p>";
        return;
    }

    try {
        initGL();  // initialize the WebGL graphics context
    } catch (e) {
        document.getElementById("canvas-holder").innerHTML =
            "<p>Sorry, could not initialize the WebGL graphics context: " + e + "</p>";
        return;
    }

    // create trackball and start drawing
    spaceball = new TrackballRotator(canvas, draw, 0);
    // simple render loop so light moves
    function animate() {
        draw();
        requestAnimationFrame(animate);
    }
    animate();
}
