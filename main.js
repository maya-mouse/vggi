// main.js
'use strict';

let gl;                         // The webgl context.
let surface;                    // A surface model
let shProgram;                  // A shader program
let spaceball;                  // A SimpleRotator object that lets the user rotate the view by mouse.

function deg2rad(angle) {
    return angle * Math.PI / 180;
}

// creating grid using UI values (uCount and vCount)
function rebuildSurfaceFromUI() {
    // read values from UI or using default
    let uCount = parseInt(document.getElementById('uCount')?.value) || 60;
    let vCount = parseInt(document.getElementById('vCount')?.value) || 48;

    // correction values
    if (uCount < 3) uCount = 3;
    if (vCount < 2) vCount = 2;

    // creating or recreacting buffers
    surface.createBuffersFromSurface(
        function(u,v){ return dingDong_param(u, v, 1.0); },
        uCount, vCount
    );
    surface.setColors([ 1, 0.4, 0.8901960784313725, 1 ], [ 0.2, 0.7019607843137254, 1, 1 ]);

    // redrawing
    draw();
}

// draw() with security (when spaceball not initialized)
function draw() {
    gl.clearColor(0,0,0,1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    /* Set the values of the projection transformation */
    let projection = m4.perspective(Math.PI/8, 1, 8, 12);

    /* Get the view matrix from the SimpleRotator object.
       If spaceball is not ready yet, use an identity-like view matrix. */
    let modelView;
    if (typeof spaceball !== 'undefined' && spaceball && typeof spaceball.getViewMatrix === 'function') {
        modelView = spaceball.getViewMatrix();
    } else {
        // Fallback: якщо m4.identity існує — використовуємо її, інакше translation(0,0,0)
        modelView = (typeof m4.identity === 'function') ? m4.identity() : m4.translation(0,0,0);
    }

    let rotateToPointZero = m4.axisRotation([0.707,0.707,0], 0.7);
    let translateToPointZero = m4.translation(0,0,-10);

    let matAccum0 = m4.multiply(rotateToPointZero, modelView );
    let matAccum1 = m4.multiply(translateToPointZero, matAccum0 );

    /* Multiply the projection matrix times the modelview matrix to give the
       combined transformation matrix, and send that to the shader program. */
    let modelViewProjection = m4.multiply(projection, matAccum1 );

    gl.uniformMatrix4fv(shProgram.iModelViewProjectionMatrix, false, modelViewProjection );

    // draw model
    surface.Draw();
}

function CreateSurfaceData()
{
    let vertexList = [];

    for (let i=0; i<360; i+=5) {
        vertexList.push( Math.sin(deg2rad(i)), 1, Math.cos(deg2rad(i)) );
        vertexList.push( Math.sin(deg2rad(i)), 0, Math.cos(deg2rad(i)) );
    }

    return vertexList;
}

/* Initialize the WebGL context. Called from init() */
function initGL() {
    let prog = createProgram( gl, vertexShaderSource, fragmentShaderSource );

    shProgram = new ShaderProgram('Basic', prog);
    shProgram.Use();

    shProgram.iAttribVertex              = gl.getAttribLocation(prog, "vertex");
    shProgram.iModelViewProjectionMatrix = gl.getUniformLocation(prog, "ModelViewProjectionMatrix");
    shProgram.iColor                     = gl.getUniformLocation(prog, "color");

    surface = new Model('Surface');

    // building by default
    rebuildSurfaceFromUI();

   
    //rebuild when changed uCount or vCount
    ['uCount','vCount'].forEach(id => {
        let el = document.getElementById(id);
        if (el) el.addEventListener('change', rebuildSurfaceFromUI);
    });

    gl.enable(gl.DEPTH_TEST);
}

/* Creates a program for use in the WebGL context gl, and returns the
 * identifier for that program.
 */
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


// Constructor for shader wrapper (left as in original)
function ShaderProgram(name, program) {
    this.name = name;
    this.prog = program;
    this.iAttribVertex = -1;
    this.iColor = -1;
    this.iModelViewProjectionMatrix = -1;
    this.Use = function() {
        gl.useProgram(this.prog);
    }
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
    }
    catch (e) {
        document.getElementById("canvas-holder").innerHTML =
            "<p>Sorry, could not get a WebGL graphics context.</p>";
        return;
    }
    try {
        initGL();  // initialize the WebGL graphics context
    }
    catch (e) {
        document.getElementById("canvas-holder").innerHTML =
            "<p>Sorry, could not initialize the WebGL graphics context: " + e + "</p>";
        return;
    }

    // creating trackball after initialization GL/ fast render
    spaceball = new TrackballRotator(canvas, draw, 0);

    draw();
}
