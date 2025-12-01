'use strict';

let gl;                         // The webgl context.
let surface;                    // A surface model
let shProgram;                  // A shader program
let spaceball;                  // A SimpleRotator object that lets the user rotate the view by mouse.

function deg2rad(angle) {
    return angle * Math.PI / 180;
}


// Constructor from skeleton
/*function Model(name) {
    this.name = name;
    this.iVertexBuffer = gl.createBuffer();
    this.count = 0;

    this.BufferData = function(vertices) {

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW);

        this.count = vertices.length/3;
    }

    this.Draw = function() {

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribVertex);
   
        gl.drawArrays(gl.LINE_STRIP, 0, this.count);
    }
}*/

// Constructor 
function surfaceFunc(u, v) {
    const C = 1.0;
    const sqrtC = Math.sqrt(C);
    const sqrtCp1 = Math.sqrt(C + 1.0);

    const sinu = Math.sin(u);
    const cosu = Math.cos(u);
    const sinv = Math.sin(v);
    const cosv = Math.cos(v);

    // a(u,v) = 2 / (C+1 - C sin^2(v) cos^2(u))
    const sinv2 = sinv * sinv;
    const cosu2 = cosu * cosu;
    const denom = (C + 1.0 - C * sinv2 * cosu2);
    const a = 2.0 / denom;

    // φ(u) = -u / sqrt(C+1) + atan( sqrt(C+1) * tan(u) )
    const phi = -u / sqrtCp1 + Math.atan(sqrtCp1 * Math.tan(u));

    // r(u,v) = a/√C * sqrt((C+1)(1 + C sin^2(u))) * sin(v)
    const r = (a / sqrtC) * Math.sqrt((C + 1.0) * (1.0 + C * sinu * sinu)) * sinv;

    // z(u,v) = [ ln(tan(v/2)) + a(C+1)cos v ] / √C
    let tanHalf = Math.tan(0.5 * v);
    // захист від ln(0)
    if (tanHalf < 1e-4) tanHalf = 1e-4;
    const z = (Math.log(tanHalf) + a * (C + 1.0) * cosv) / sqrtC;

    let x = r * Math.cos(phi);
    let y = r * Math.sin(phi);

    // Масштаб, щоб влізло в кадр
    const scale = 0.7;
    return [x * scale, y * scale, z * scale];
}


// Constructor
function ShaderProgram(name, program) {

    this.name = name;
    this.prog = program;

    // Location of the attribute variable in the shader program.
    this.iAttribVertex = -1;
    // Location of the uniform specifying a color for the primitive.
    this.iColor = -1;
    // Location of the uniform matrix representing the combined transformation.
    this.iModelViewProjectionMatrix = -1;

    this.Use = function() {
        gl.useProgram(this.prog);
    }
}


/* Draws a colored cube, along with a set of coordinate axes.
 * (Note that the use of the above drawPrimitive function is not an efficient
 * way to draw with WebGL.  Here, the geometry is so simple that it doesn't matter.)
 */
function draw() { 
    gl.clearColor(0,0,0,1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    /* Set the values of the projection transformation */
    let projection = m4.perspective(Math.PI/8, 1, 8, 12); 
    
    /* Get the view matrix from the SimpleRotator object.*/
    let modelView = spaceball.getViewMatrix();

    // Спочатку трохи нахиляємо по X, потім повертаємо по Y
    let rotateX = m4.xRotation(-Math.PI / 6);   // -90°
    let rotateY = m4.yRotation(Math.PI / 6);    //  45°
    let rotateToPointZero = m4.multiply(rotateY, rotateX);
    let translateToPointZero = m4.translation(0,1,-10);

    let matAccum0 = m4.multiply(rotateToPointZero, modelView );
    let matAccum1 = m4.multiply(translateToPointZero, matAccum0 );
        
    /* Multiply the projection matrix times the modelview matrix to give the
       combined transformation matrix, and send that to the shader program. */
    let modelViewProjection = m4.multiply(projection, matAccum1 );

    gl.uniformMatrix4fv(shProgram.iModelViewProjectionMatrix, false, modelViewProjection );
    
    /* Draw the six faces of a cube, with different colors. */
    gl.uniform4fv(shProgram.iColor, [1,1,1,1] );
    
    surface.draw(shProgram.iAttribVertex);
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

    surface = new Model(gl, surfaceFunc, {
        uSegments: 40,
        vSegments: 40,
        uRange: { min: -1.2, max: 1.2 },
        vRange: { min: 0.1, max: 3.05 }
    });

    gl.enable(gl.DEPTH_TEST);
}


/* Creates a program for use in the WebGL context gl, and returns the
 * identifier for that program.  If an error occurs while compiling or
 * linking the program, an exception of type Error is thrown.  The error
 * string contains the compilation or linking error.  If no error occurs,
 * the program identifier is the return value of the function.
 * The second and third parameters are strings that contain the
 * source code for the vertex shader and for the fragment shader.
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

    spaceball = new TrackballRotator(canvas, draw, 0);

    draw();
}
