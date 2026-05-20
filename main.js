'use strict';

let gl;                         // The webgl context.
let surface;                    // A surface model
let shProgram;                  // A shader program
let spaceball;                  // A SimpleRotator object that lets the user rotate the view by mouse.

let texCenterU = 0.5;
let texCenterV = 0.5;
let texAngle   = 0.0;

let texCenterLabel = null;  // посилання на span у HTML

let stereoCamera = null; // додавання stereo-параметрів

let stereoParams = {
    convergence: 7.0,
    eyeSeparation: 0.28,
    fov: 45.0,
    nearClip: 0.1,
    farClip: 100.0
};

let anaglyphEnabled = true;

let wireProgram = null; // MSVR #1

// MSVR 2
let phoneControlEnabled = true;
let phoneYaw = 0.0;          // filtered target yaw
let phoneYawRaw = 0.0;       // latest raw yaw from phone
let phoneYawSmoothed = 0.0;  // final rendered yaw
let phoneYawInitialized = false;
let phoneSocket = null;

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

function normalizeAngleRad(a) {
    while (a > Math.PI) a -= 2.0 * Math.PI;
    while (a < -Math.PI) a += 2.0 * Math.PI;
    return a;
}

function smoothAngleRad(current, target, factor) {
    const delta = normalizeAngleRad(target - current);
    return normalizeAngleRad(current + delta * factor);
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
    this.iAttribNormal = -1;

    // Матриці
    this.iModelViewProjectionMatrix = -1;
    this.iModelViewMatrix          = -1; 
    this.iNormalMatrix             = -1;  

    // Освітлення / матеріал
    this.iLightPosition = -1;    
    this.iAmbientColor  = -1;    
    this.iDiffuseColor  = -1;    
    this.iSpecularColor = -1;    
    this.iShininess     = -1;    

    this.iAttribTexCoord = -1; // NEW
    this.iAttribTangent  = -1; // NEW

    this.iSamplerDiffuse  = -1; // NEW
    this.iSamplerSpecular = -1; // NEW
    this.iSamplerNormal   = -1; // NEW

    this.Use = function() {
        gl.useProgram(this.prog);
    }
}

function getBaseViewMatrix() {
    let modelView = spaceball.getViewMatrix();

    let rotateX = m4.xRotation(-Math.PI / 6);
    let rotateY = m4.yRotation(Math.PI / 6);
    let rotateToPointZero = m4.multiply(rotateY, rotateX);
    let translateToPointZero = m4.translation(0, 0.6, -4.2);

    let phoneRotation = m4.identity();

    if (phoneControlEnabled) {
        phoneYawSmoothed = smoothAngleRad(phoneYawSmoothed, phoneYaw, 0.35);
        phoneRotation = m4.yRotation(-phoneYawSmoothed * 1.0);
    }

    let matAccum0 = m4.multiply(rotateToPointZero, modelView);
    matAccum0 = m4.multiply(phoneRotation, matAccum0);

    let matAccum1 = m4.multiply(translateToPointZero, matAccum0);

    return matAccum1;
}


function drawSceneWithMatrices(projectionMatrix, modelViewMatrix) {
    let modelViewProjection = m4.multiply(projectionMatrix, modelViewMatrix);

    let invModelView = m4.inverse(modelViewMatrix);
    let invTransModelView = m4.transpose(invModelView);
    let normalMatrix = mat3FromMat4(invTransModelView);

    let t = performance.now() * 0.001;
    let radius = 8.0;
    let lightX = radius * Math.cos(t);
    let lightZ = radius * Math.sin(t);
    let lightY = 4.0;
    texAngle = 0.5 * t;

    gl.uniform3fv(shProgram.iLightPosition, new Float32Array([lightX, lightY, lightZ]));
    gl.uniform2f(shProgram.iTexCenter, texCenterU, texCenterV);
    gl.uniform1f(shProgram.iTexAngle, texAngle);

    if (shProgram.iEyePosition !== -1 && shProgram.iEyePosition != null) {
        gl.uniform3fv(shProgram.iEyePosition, new Float32Array([0.0, 0.0, 0.0]));
    }

    gl.uniformMatrix4fv(shProgram.iModelViewProjectionMatrix, false, modelViewProjection);
    gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, modelViewMatrix);
    gl.uniformMatrix3fv(shProgram.iNormalMatrix, false, normalMatrix);

    surface.draw(
        shProgram.iAttribVertex,
        shProgram.iAttribNormal,
        shProgram.iAttribTexCoord,
        shProgram.iAttribTangent
    );
}

function drawWireframeWithMatrices(projectionMatrix, modelViewMatrix) {
    let modelViewProjection = m4.multiply(projectionMatrix, modelViewMatrix);

    gl.useProgram(wireProgram.prog);

    gl.uniformMatrix4fv(
        wireProgram.iModelViewProjectionMatrix,
        false,
        modelViewProjection
    );

    gl.uniform4fv(
        wireProgram.iWireColor,
        new Float32Array([1.0, 1.0, 1.0, 0.85])
    );

    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-1.0, -1.0);

    gl.disable(gl.CULL_FACE);
    gl.depthFunc(gl.LEQUAL);

    surface.drawWireframe(wireProgram.iAttribVertex);

    gl.depthFunc(gl.LESS);
    gl.disable(gl.POLYGON_OFFSET_FILL);

    shProgram.Use();
}


/* Draws a colored cube, along with a set of coordinate axes.
 * (Note that the use of the above drawPrimitive function is not an efficient
 * way to draw with WebGL.  Here, the geometry is so simple that it doesn't matter.)
 */
function draw() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = gl.canvas.width / gl.canvas.height;
    stereoCamera.setAspectRatio(aspect);

    const baseViewMatrix = getBaseViewMatrix();

    if (!anaglyphEnabled) {
        const projection = m4.perspective(
            stereoParams.fov * Math.PI / 180.0,
            aspect,
            stereoParams.nearClip,
            stereoParams.farClip
        );

        drawSceneWithMatrices(projection, baseViewMatrix);
        drawWireframeWithMatrices(projection, baseViewMatrix);
        requestAnimationFrame(draw);
        return;
    }

    // LEFT EYE -> RED
    gl.colorMask(true, false, false, true);
    let leftProjection = stereoCamera.getLeftProjectionMatrix();
    let leftModelView = m4.multiply(stereoCamera.getLeftViewShiftMatrix(), baseViewMatrix);
    drawSceneWithMatrices(leftProjection, leftModelView);
    drawWireframeWithMatrices(leftProjection, leftModelView);

    gl.clear(gl.DEPTH_BUFFER_BIT);

    // RIGHT EYE -> CYAN
    gl.colorMask(false, true, true, true);
    let rightProjection = stereoCamera.getRightProjectionMatrix();
    let rightModelView = m4.multiply(stereoCamera.getRightViewShiftMatrix(), baseViewMatrix);
    drawSceneWithMatrices(rightProjection, rightModelView);
    drawWireframeWithMatrices(rightProjection, rightModelView);

    gl.colorMask(true, true, true, true);

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

    //document.addEventListener("keydown", handleKeyDown);

    // Атрибути
    shProgram.iAttribVertex = gl.getAttribLocation(prog, "vertex");
    shProgram.iAttribNormal = gl.getAttribLocation(prog, "normal");
    shProgram.iAttribTexCoord = gl.getAttribLocation(prog, "texCoord"); 
    shProgram.iAttribTangent  = gl.getAttribLocation(prog, "tangent"); 

    // Матриці
    shProgram.iModelViewProjectionMatrix = gl.getUniformLocation(prog, "ModelViewProjectionMatrix");
    shProgram.iModelViewMatrix           = gl.getUniformLocation(prog, "ModelViewMatrix");
    shProgram.iNormalMatrix              = gl.getUniformLocation(prog, "NormalMatrix");

    // Освітлення / матеріал
    shProgram.iLightPosition = gl.getUniformLocation(prog, "uLightPosition"); 
    shProgram.iEyePosition    = gl.getUniformLocation(prog, "uEyePosition"); 

    shProgram.iAmbientColor  = gl.getUniformLocation(prog, "uAmbientColor");
    shProgram.iDiffuseColor  = gl.getUniformLocation(prog, "uDiffuseColor");
    shProgram.iSpecularColor = gl.getUniformLocation(prog, "uSpecularColor");
    shProgram.iShininess     = gl.getUniformLocation(prog, "uShininess");

    shProgram.iSamplerDiffuse  = gl.getUniformLocation(prog, "uSamplerDiffuse"); 
    shProgram.iSamplerSpecular = gl.getUniformLocation(prog, "uSamplerSpecular"); 
    shProgram.iSamplerNormal   = gl.getUniformLocation(prog, "uSamplerNormal"); 


    shProgram.iTexCenter = gl.getUniformLocation(prog, "uTexCenter");
    shProgram.iTexAngle  = gl.getUniformLocation(prog, "uTexAngle"); 

    //MSVR #1
    let wireProg = createProgram(gl, wireVertexShaderSource, wireFragmentShaderSource);

    wireProgram = {
        prog: wireProg,
        iAttribVertex: gl.getAttribLocation(wireProg, "vertex"),
        iModelViewProjectionMatrix: gl.getUniformLocation(wireProg, "ModelViewProjectionMatrix"),
        iWireColor: gl.getUniformLocation(wireProg, "uWireColor")
    };

    // Створюємо поверхню: стартові значення U/V сегментів
    surface = new Model(gl, surfaceFunc, {
        uSegments: 40,
        vSegments: 40,
        uRange: { min: -1.2, max: 1.2 },
        vRange: { min: 0.1,  max: 3.05 }
    });

    surface.idTextureDiffuse  = LoadTexture("textures/diffuse.jpg"); // NEW
    surface.idTextureSpecular = LoadTexture("textures/specular.jpg"); // NEW
    surface.idTextureNormal   = LoadTexture("textures/normal.jpg"); // NEW
 
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.02, 0.03, 0.06, 1.0);

    // привʼязка слайсерів
    gl.uniform1i(shProgram.iSamplerDiffuse,  0);
    gl.uniform1i(shProgram.iSamplerSpecular, 1);
    gl.uniform1i(shProgram.iSamplerNormal,   2);

    // Знайти span для відображення центру текстури
    texCenterLabel = document.getElementById("texCenterLabel");
    if (texCenterLabel) {
        texCenterLabel.textContent =
            "(" + texCenterU.toFixed(2) + ", " + texCenterV.toFixed(2) + ")";
    }

    // Підписатися на клавіатуру (WASD)
    window.addEventListener("keydown", handleKeyDown, false);

    // Базові параметри матеріалу (можна міняти під себе)
    gl.uniform3fv(shProgram.iAmbientColor,  new Float32Array([0.15, 0.15, 0.20]));
    gl.uniform3fv(shProgram.iDiffuseColor,  new Float32Array([1.2,  1.2,  1.2]));
    gl.uniform3fv(shProgram.iSpecularColor, new Float32Array([1.5,  1.5,  1.5]));
    gl.uniform1f(shProgram.iShininess, 32.0);

    
}


function handleKeyDown(e) {
    const step = 0.02;

    switch (e.key) {
        case "a":
        case "A":
            texCenterU -= step;
            break;

        case "d":
        case "D":
            texCenterU += step;
            break;

        case "w":
        case "W":
            texCenterV += step;
            break;

        case "s":
        case "S":
            texCenterV -= step;
            break;

        case "t":
        case "T":
            anaglyphEnabled = !anaglyphEnabled;
            return;
        case "m":
        case "M":
            phoneControlEnabled = !phoneControlEnabled;
            console.log("Phone control:", phoneControlEnabled ? "enabled" : "disabled");
            return;

        default:
            return;
    }

    texCenterU = Math.max(0.0, Math.min(1.0, texCenterU));
    texCenterV = Math.max(0.0, Math.min(1.0, texCenterV));

    if (texCenterLabel) {
        texCenterLabel.textContent =
            "(" + texCenterU.toFixed(2) + ", " + texCenterV.toFixed(2) + ")";
    }
}

let lastSensorLogTime = 0;

function initPhonePolling() {
    console.log("Phone sensor polling started");

    setInterval(async function () {
        try {
            const response = await fetch(window.location.origin + "/sensor?t=" + Date.now(), {
                cache: "no-store"
            });

            if (!response.ok) {
                console.warn("Sensor polling HTTP error:", response.status);
                return;
            }

            const data = await response.json();

            if (data.type === "phoneOrientation") {
                phoneYawRaw = Number(data.yaw) || 0;

                if (!phoneYawInitialized) {
                    phoneYaw = phoneYawRaw;
                    phoneYawSmoothed = phoneYawRaw;
                    phoneYawInitialized = true;
                } else {
                    let delta = normalizeAngleRad(phoneYawRaw - phoneYaw);

                    // Максимальний крок за один polling-запит.
                    // Не блокуємо рух, а тільки обрізаємо надто різкі скачки.
                    const maxStep = 10.0 * Math.PI / 180.0;

                    if (delta > maxStep) delta = maxStep;
                    if (delta < -maxStep) delta = -maxStep;

                    phoneYaw = normalizeAngleRad(phoneYaw + delta);
                }

                const now = performance.now();
                if (now - lastSensorLogTime > 500) {
                    console.log("Phone yaw received:", data.yawDeg, phoneYaw);
                    lastSensorLogTime = now;
                }
            }
        } catch (err) {
            console.warn("Sensor polling error:", err);
        }
    }, 50);
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



class StereoCamera {
    constructor(convergence, eyeSeparation, aspectRatio, fov, nearClip, farClip) {
        this.convergence = convergence;
        this.eyeSeparation = eyeSeparation;
        this.aspectRatio = aspectRatio;
        this.fov = fov;
        this.nearClip = nearClip;
        this.farClip = farClip;
    }

    setAspectRatio(aspectRatio) {
        this.aspectRatio = aspectRatio;
    }

    getLeftProjectionMatrix() {
        const top = this.nearClip * Math.tan((this.fov * Math.PI / 180.0) / 2.0);
        const bottom = -top;

        const a = this.aspectRatio * Math.tan((this.fov * Math.PI / 180.0) / 2.0) * this.convergence;
        const b = a - this.eyeSeparation / 2.0;
        const c = a + this.eyeSeparation / 2.0;

        const left = -b * this.nearClip / this.convergence;
        const right = c * this.nearClip / this.convergence;

        return m4.frustum(left, right, bottom, top, this.nearClip, this.farClip);
    }

    getRightProjectionMatrix() {
        const top = this.nearClip * Math.tan((this.fov * Math.PI / 180.0) / 2.0);
        const bottom = -top;

        const a = this.aspectRatio * Math.tan((this.fov * Math.PI / 180.0) / 2.0) * this.convergence;
        const b = a - this.eyeSeparation / 2.0;
        const c = a + this.eyeSeparation / 2.0;

        const left = -c * this.nearClip / this.convergence;
        const right = b * this.nearClip / this.convergence;

        return m4.frustum(left, right, bottom, top, this.nearClip, this.farClip);
    }

    getLeftViewShiftMatrix() {
        return m4.translation(this.eyeSeparation / 2.0, 0, 0);
    }

    getRightViewShiftMatrix() {
        return m4.translation(-this.eyeSeparation / 2.0, 0, 0);
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

    stereoCamera = new StereoCamera(
        stereoParams.convergence,
        stereoParams.eyeSeparation,
        gl.canvas.width / gl.canvas.height,
        stereoParams.fov,
        stereoParams.nearClip,
        stereoParams.farClip
    );

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

    let eyeSlider  = document.getElementById("eyeSeparation");
    let convSlider = document.getElementById("convergence");
    let fovSlider  = document.getElementById("fov");
    let nearSlider = document.getElementById("nearClip");

    let eyeValue  = document.getElementById("eyeSeparationValue");
    let convValue = document.getElementById("convergenceValue");
    let fovValue  = document.getElementById("fovValue");
    let nearValue = document.getElementById("nearClipValue");

    function updateStereoControls() {
        if (!stereoCamera) return;

        stereoParams.eyeSeparation = parseFloat(eyeSlider.value);
        stereoParams.convergence   = parseFloat(convSlider.value);
        stereoParams.fov           = parseFloat(fovSlider.value);
        stereoParams.nearClip      = parseFloat(nearSlider.value);

        stereoCamera.eyeSeparation = stereoParams.eyeSeparation;
        stereoCamera.convergence   = stereoParams.convergence;
        stereoCamera.fov           = stereoParams.fov;
        stereoCamera.nearClip      = stereoParams.nearClip;
        stereoCamera.farClip       = stereoParams.farClip;

        if (eyeValue)  eyeValue.textContent  = stereoParams.eyeSeparation.toFixed(2);
        if (convValue) convValue.textContent = stereoParams.convergence.toFixed(1);
        if (fovValue)  fovValue.textContent  = stereoParams.fov.toFixed(0);
        if (nearValue) nearValue.textContent = stereoParams.nearClip.toFixed(2);
    }

    if (eyeSlider && convSlider && fovSlider && nearSlider) {
        eyeSlider.addEventListener("input", updateStereoControls);
        convSlider.addEventListener("input", updateStereoControls);
        fovSlider.addEventListener("input", updateStereoControls);
        nearSlider.addEventListener("input", updateStereoControls);

        updateStereoControls();
    }

    initPhonePolling();

    // Стартова відмальовка + анімація світла
    draw();
}

