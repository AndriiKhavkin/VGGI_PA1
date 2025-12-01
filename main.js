'use strict';

let gl;                         // The webgl context.
let surface;                    // A surface model
let shProgram;                  // A shader program
let spaceball;                  // A SimpleRotator object that lets the user rotate the view by mouse.

function deg2rad(angle) {
    return angle * Math.PI / 180;
}

function mat3FromMat4(m) {
    // беремо верхній лівий 3x3 з 4x4
    return new Float32Array([
        m[0], m[1], m[2],
        m[4], m[5], m[6],
        m[8], m[9], m[10]
    ]);
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

    // Атрибути
    this.iAttribVertex = -1;
    this.iAttribNormal = -1;   // NEW

    // Матриці
    this.iModelViewProjectionMatrix = -1;
    this.iModelViewMatrix          = -1;  // NEW
    this.iNormalMatrix             = -1;  // NEW (mat3)

    // Освітлення / матеріал
    this.iLightPosition = -1;    // NEW
    this.iAmbientColor  = -1;    // NEW
    this.iDiffuseColor  = -1;    // NEW
    this.iSpecularColor = -1;    // NEW
    this.iShininess     = -1;    // NEW

    this.Use = function() {
        gl.useProgram(this.prog);
    }
}


/* Draws a colored cube, along with a set of coordinate axes.
 * (Note that the use of the above drawPrimitive function is not an efficient
 * way to draw with WebGL.  Here, the geometry is so simple that it doesn't matter.)
 */
function draw() { 
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 1. Projection
    let projection = m4.perspective(Math.PI/8, 1, 8, 12); 

    // 2. View від spaceball
    let modelView = spaceball.getViewMatrix();

    // Додаткові повороти/зсуви, як було
    let rotateX = m4.xRotation(-Math.PI / 6);
    let rotateY = m4.yRotation(Math.PI / 6);
    let rotateToPointZero = m4.multiply(rotateY, rotateX);
    let translateToPointZero = m4.translation(0, 1, -10);

    // ModelViewMatrix
    let matAccum0 = m4.multiply(rotateToPointZero, modelView);
    let matAccum1 = m4.multiply(translateToPointZero, matAccum0);
    let modelViewMatrix = matAccum1;

    // 3. ModelViewProjectionMatrix
    let modelViewProjection = m4.multiply(projection, modelViewMatrix);

    // 4. NormalMatrix = inverse-transpose(upper-left 3x3 of ModelViewMatrix)
    let invModelView = m4.inverse(modelViewMatrix);
    let invTransModelView = m4.transpose(invModelView);
    let normalMatrix = mat3FromMat4(invTransModelView);

    // 5. Анімація точкового світла (у координатах камери)
    let t = performance.now() * 0.001; // секунди
    let radius = 8.0;
    let lightX = radius * Math.cos(t);
    let lightZ = radius * Math.sin(t);
    let lightY = 4.0; // трохи над поверхнею

    gl.uniform3fv(shProgram.iLightPosition, new Float32Array([lightX, lightY, lightZ]));

    // 6. Відправляємо матриці в шейдери
    gl.uniformMatrix4fv(shProgram.iModelViewProjectionMatrix, false, modelViewProjection);
    gl.uniformMatrix4fv(shProgram.iModelViewMatrix,          false, modelViewMatrix);
    gl.uniformMatrix3fv(shProgram.iNormalMatrix,             false, normalMatrix);

    // 7. Малюємо поверхню (позиції + нормалі, індекси всередині Model.draw)
    surface.draw(shProgram.iAttribVertex, shProgram.iAttribNormal);

    // 8. Запит наступного кадру для анімації світла
    requestAnimationFrame(draw);
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
    let prog = createProgram(gl, vertexShaderSource, fragmentShaderSource);

    shProgram = new ShaderProgram('Basic', prog);
    shProgram.Use();

    // Атрибути
    shProgram.iAttribVertex = gl.getAttribLocation(prog, "vertex");
    shProgram.iAttribNormal = gl.getAttribLocation(prog, "normal");

    // Матриці
    shProgram.iModelViewProjectionMatrix = gl.getUniformLocation(prog, "ModelViewProjectionMatrix");
    shProgram.iModelViewMatrix           = gl.getUniformLocation(prog, "ModelViewMatrix");
    shProgram.iNormalMatrix              = gl.getUniformLocation(prog, "NormalMatrix");

    // Освітлення / матеріал
    shProgram.iLightPosition = gl.getUniformLocation(prog, "uLightPosition");
    shProgram.iAmbientColor  = gl.getUniformLocation(prog, "uAmbientColor");
    shProgram.iDiffuseColor  = gl.getUniformLocation(prog, "uDiffuseColor");
    shProgram.iSpecularColor = gl.getUniformLocation(prog, "uSpecularColor");
    shProgram.iShininess     = gl.getUniformLocation(prog, "uShininess");

    // Створюємо поверхню: стартові значення U/V сегментів
    surface = new Model(gl, surfaceFunc, {
        uSegments: 40,
        vSegments: 40,
        uRange: { min: -1.2, max: 1.2 },
        vRange: { min: 0.1,  max: 3.05 }
    });

    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 1);

    // Базові параметри матеріалу (можна міняти під себе)
    gl.uniform3fv(shProgram.iAmbientColor,  new Float32Array([0.15, 0.15, 0.20]));
    gl.uniform3fv(shProgram.iDiffuseColor,  new Float32Array([0.6,  0.6,  0.9]));
    gl.uniform3fv(shProgram.iSpecularColor, new Float32Array([1.0,  1.0,  1.0]));
    gl.uniform1f(shProgram.iShininess, 32.0);
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
        if (!gl) {
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

    // === СЛАЙДЕРИ U/V ===
    let uSlider = document.getElementById("uSegments");
    let vSlider = document.getElementById("vSegments");
    let uLabel  = document.getElementById("uSegmentsValue");
    let vLabel  = document.getElementById("vSegmentsValue");

    function updateSegments() {
        if (!surface) return;

        let uSeg = parseInt(uSlider.value, 10);
        let vSeg = parseInt(vSlider.value, 10);

        surface.uSegments = uSeg;
        surface.vSegments = vSeg;
        surface.buildMesh(); // перегенерувати сітку

        if (uLabel) uLabel.textContent = uSeg;
        if (vLabel) vLabel.textContent = vSeg;
    }


    if (uSlider && vSlider) {
        uSlider.addEventListener("input", updateSegments);
        vSlider.addEventListener("input", updateSegments);

        // стартові значення
        updateSegments();
    } else {
        console.warn("uSegments / vSegments sliders not found in HTML");
    }

    // Стартова відмальовка + анімація світла
    draw();
}

