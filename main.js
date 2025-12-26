'use strict';
 
let gl;                          // The webgl context.
let surface;                     // A surface model
let shProgram;                   // A shader program (wrapper)
let spaceball;                   // Trackball
let diffuseTexture, normalTexture, specularTexture; // Textures
let textureScale = 1.0;
let textureCenter = [0.5, 0.5];

function deg2rad(angle) { return angle * Math.PI / 180; }

function isPowerOf2(value) {
    return (value & (value - 1)) === 0;
}


function loadTextureFromFile(gl, path) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

  
    const level = 0;
    const internalFormat = gl.RGBA;
    const width = 1;
    const height = 1;
    const border = 0;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    const pixel = new Uint8Array([0, 0, 255, 255]); 
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, width, height, border, srcFormat, srcType, pixel);

    const image = new Image();
    image.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, image);


        if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
 
           gl.generateMipmap(gl.TEXTURE_2D);
           gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
           gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
           gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
           gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        } else {
           gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
           gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
           gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
           gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        }

        draw(); // Перемалювати сцену після успішного завантаження
    };
    image.onerror = () => {
        console.error(`Failed to load texture from: ${path}`);
    };

    image.src = path;

    return texture;
}


function multiplyMat4Vec4(m, v) {
    return [
        m[0]*v[0] + m[4]*v[1] + m[8]*v[2] + m[12]*v[3],
        m[1]*v[0] + m[5]*v[1] + m[9]*v[2] + m[13]*v[3],
        m[2]*v[0] + m[6]*v[1] + m[10]*v[2] + m[14]*v[3],
        m[3]*v[0] + m[7]*v[1] + m[11]*v[2] + m[15]*v[3]
    ];
}

function computeNormalMatrix3(modelView) {
    const a00 = modelView[0], a01 = modelView[4], a02 = modelView[8];
    const a10 = modelView[1], a11 = modelView[5], a12 = modelView[9];
    const a20 = modelView[2], a21 = modelView[6], a22 = modelView[10];
    const det = a00*(a11*a22-a12*a21) - a01*(a10*a22-a12*a20) + a02*(a10*a21-a11*a20);
    const invDet = 1.0 / (det || 1e-9);
    const r00 = (a11*a22 - a12*a21)*invDet, r01 = -(a01*a22-a02*a21)*invDet, r02 = (a01*a12-a02*a11)*invDet;
    const r10 = -(a10*a22-a12*a20)*invDet, r11 = (a00*a22-a02*a20)*invDet, r12 = -(a00*a12-a02*a10)*invDet;
    const r20 = (a10*a21-a11*a20)*invDet, r21 = -(a00*a21-a01*a20)*invDet, r22 = (a00*a11-a01*a10)*invDet;
    return new Float32Array([r00,r10,r20, r01,r11,r21, r02,r12,r22]);
}

function rebuildSurfaceFromUI() {
    let uCount = parseInt(document.getElementById('uCount')?.value) || 60;
    let vCount = parseInt(document.getElementById('vCount')?.value) || 48;
    if (uCount < 3) uCount = 3;
    if (vCount < 2) vCount = 2;

    const uNum = document.getElementById('uCountNum'), vNum = document.getElementById('vCountNum');
    if (uNum) uNum.value = uCount;
    if (vNum) vNum.value = vCount;

    surface.createBuffersFromSurface(function(u,v){ return dingDong_param(u, v, 1.0); }, uCount, vCount);
    surface.setMaterial([0.1, 0.1, 0.1], 64.0);
    draw();
}

function draw() {
    if (!gl) return;
    gl.clearColor(0,0,0,1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const projection = m4.perspective(Math.PI/8, gl.canvas.width / gl.canvas.height, 0.1, 100.0);
    let view = (typeof spaceball !== 'undefined' && spaceball && typeof spaceball.getViewMatrix === 'function')
                ? spaceball.getViewMatrix()
                : m4.identity();
    const rotateToPointZero = m4.axisRotation([0.707,0.707,0], 0.7);
    const translateToPointZero = m4.translation(0,0,-10);
    const matAccum0 = m4.multiply(rotateToPointZero, view);
    const modelView = m4.multiply(translateToPointZero, matAccum0); 
    const modelViewProjection = m4.multiply(projection, modelView);

    shProgram.Use();

    gl.uniformMatrix4fv(shProgram.iModelViewProjectionMatrix, false, modelViewProjection);
    gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, modelView);
    const normalMat3 = computeNormalMatrix3(modelView);
    gl.uniformMatrix3fv(shProgram.iNormalMatrix, false, normalMat3);
    gl.uniform3fv(shProgram.iColorTint, [0.5, 0.5, 1.0]);

    const t = performance.now() * 0.001;
    const radius = 6.0;
    const lightWorld = [ radius * Math.cos(t), 2.0, radius * Math.sin(t), 1.0 ];
    const lightEye = multiplyMat4Vec4(modelView, lightWorld);
    gl.uniform3fv(shProgram.iLightPosEye, [lightEye[0], lightEye[1], lightEye[2]]);

    // Pass texture transformation uniforms
    gl.uniform1f(shProgram.iTextureScale, textureScale);
    gl.uniform2fv(shProgram.iTextureCenter, textureCenter);

    // Bind textures
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, diffuseTexture);
    gl.uniform1i(shProgram.iDiffuseTexture, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, specularTexture);
    gl.uniform1i(shProgram.iSpecularTexture, 1);
    
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, normalTexture);
    gl.uniform1i(shProgram.iNormalTexture, 2);

    surface.Draw();
}

function initGL() {
    const prog = createProgram(gl, vertexShaderSource, fragmentShaderSource);
    shProgram = new ShaderProgram('NormalMapping', prog);
    shProgram.Use();

    shProgram.iAttribVertex = gl.getAttribLocation(prog, "vertex");
    shProgram.iAttribNormal = gl.getAttribLocation(prog, "normal");
    shProgram.iAttribTexCoord = gl.getAttribLocation(prog, "a_texcoord");
    shProgram.iAttribTangent = gl.getAttribLocation(prog, "a_tangent");
    
    shProgram.iModelViewProjectionMatrix = gl.getUniformLocation(prog, "ModelViewProjectionMatrix");
    shProgram.iModelViewMatrix = gl.getUniformLocation(prog, "ModelViewMatrix");
    shProgram.iNormalMatrix = gl.getUniformLocation(prog, "NormalMatrix");

    shProgram.iLightPosEye = gl.getUniformLocation(prog, "lightPosEye");
    shProgram.iAmbient = gl.getUniformLocation(prog, "ambientColor");
    shProgram.iShininess = gl.getUniformLocation(prog, "shininess");
    
    shProgram.iDiffuseTexture = gl.getUniformLocation(prog, "u_diffuse_texture");
    shProgram.iSpecularTexture = gl.getUniformLocation(prog, "u_specular_texture");
    shProgram.iNormalTexture = gl.getUniformLocation(prog, "u_normal_texture");
    shProgram.iColorTint = gl.getUniformLocation(prog, "u_color_tint");
    shProgram.iTextureScale = gl.getUniformLocation(prog, "u_texture_scale");
    shProgram.iTextureCenter = gl.getUniformLocation(prog, "u_texture_center");

    // --- ЗАВАНТАЖЕННЯ ТЕКСТУР З ПАПКИ textures/ ---
    diffuseTexture = loadTextureFromFile(gl, "textures/diffuse.jpg");
    specularTexture = loadTextureFromFile(gl, "textures/specular.jpg");
    normalTexture = loadTextureFromFile(gl, "textures/normal.jpg");
    // ---------------------------------------------

    surface = new Model('Surface');
    rebuildSurfaceFromUI();

    const uRange = document.getElementById('uCount'), vRange = document.getElementById('vCount');
    const uNum = document.getElementById('uCountNum'), vNum = document.getElementById('vCountNum');
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
    
        const uPointRange = document.getElementById('uPoint'), vPointRange = document.getElementById('vPoint');
        const scaleRange = document.getElementById('scale');
        const uPointNum = document.getElementById('uPointNum'), vPointNum = document.getElementById('vPointNum');
        const scaleNum = document.getElementById('scaleNum');
    
        function setupSlider(rangeEl, numEl, isScale) {
            rangeEl.addEventListener('input', () => {
                const value = parseFloat(rangeEl.value);
                numEl.value = value;
                if(isScale) textureScale = value;
                else {
                    if(rangeEl.id.startsWith('u')) textureCenter[0] = value;
                    else textureCenter[1] = value;
                }
            });
            numEl.addEventListener('change', () => {
                const value = parseFloat(numEl.value);
                rangeEl.value = value;
                if(isScale) textureScale = value;
                else {
                    if(numEl.id.startsWith('u')) textureCenter[0] = value;
                    else textureCenter[1] = value;
                }
            });
        }
    
        setupSlider(uPointRange, uPointNum, false);
        setupSlider(vPointRange, vPointNum, false);
        setupSlider(scaleRange, scaleNum, true);
    
        gl.enable(gl.DEPTH_TEST);
    }

function ShaderProgram(name, program) {
    this.name = name;
    this.prog = program;
    this.iAttribVertex = -1;
    this.iAttribNormal = -1;
    this.iAttribTexCoord = -1;
    this.iAttribTangent = -1;
    this.iModelViewProjectionMatrix = -1;
    this.iModelViewMatrix = -1;
    this.iNormalMatrix = -1;
    this.iLightPosEye = -1;
    this.iAmbient = -1;
    this.iShininess = -1;
    this.iDiffuseTexture = -1;
    this.iSpecularTexture = -1;
    this.iNormalTexture = -1;
    this.iColorTint = -1;
    this.iTextureScale = -1;
    this.iTextureCenter = -1;
    this.Use = function() { gl.useProgram(this.prog); };
}

function createProgram(gl, vShader, fShader) {
    let vsh = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vsh,vShader);
    gl.compileShader(vsh);
    if (!gl.getShaderParameter(vsh, gl.COMPILE_STATUS)) {
        throw new Error("Error in vertex shader: " + gl.getShaderInfoLog(vsh));
    }
    let fsh = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fsh, fShader);
    gl.compileShader(fsh);
    if (!gl.getShaderParameter(fsh, gl.COMPILE_STATUS)) {
        throw new Error("Error in fragment shader: " + gl.getShaderInfoLog(fsh));
    }
    let prog = gl.createProgram();
    gl.attachShader(prog,vsh);
    gl.attachShader(prog, fsh);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error("Link error in program: " + gl.getProgramInfoLog(prog));
    }
    return prog;
}

function init() {
    let canvas;
    try {
        canvas = document.getElementById("webglcanvas");
        gl = canvas.getContext("webgl");
        if (!gl) throw "Browser does not support WebGL";
    } catch(e) {
        document.getElementById("canvas-holder").innerHTML = "<p>Sorry, could not get a WebGL graphics context.</p>";
        return;
    }
    try {
        initGL();
    } catch(e) {
        document.getElementById("canvas-holder").innerHTML = "<p>Sorry, could not initialize the WebGL graphics context: " + e + "</p>";
        return;
    }
    spaceball = new TrackballRotator(canvas, draw, 0);

    function animate() {
        draw();
        requestAnimationFrame(animate);
    }
    animate();
}