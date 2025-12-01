# VGGI – Practical Assignment №12 
### **Sievert's Surface (Variant 18)**  
**Author:** Andrii Khavkin  
**Group:** TR-52mp  
**Course:** Visualization of Graphical and Geometric Information  

---

## Overview

This project implements **Gouraud shading**, dynamic lighting, facet-average normals, and adjustable mesh resolution for the analytical **Sievert’s Surface (Variant 18)** using **WebGL 1.0**.

The work extends **PA1**, adding full shading and lighting pipeline functionality.


---

## Gallery

<div align="center">

<img src="screenshots/final_render.png" width="500">

<img src="screenshots/wireframe_vs_filled.png" width="500">

<img src="screenshots/surface_closeup.png" width="500">

<img src="screenshots/normals_visualization.png" width="500">

<img src="screenshots/pdf_reference.png" width="600">

</div>

---

## Assignment Requirements (PA2)

This project implements all requirements of Practical Assignment №2:

- Use PA1 as a starting point  
- Render filled **triangle mesh** instead of wireframe  
- Compute **vertex normals** using **Facet Average** method  
- Implement **Gouraud shading** (lighting in vertex shader)  
- Use **Ambient + Diffuse (Lambert) + Specular (Phong)** lighting components  
- Animate a **point light** moving around the surface  
- Provide two interactive sliders:
  - **U segments**
  - **V segments**
- Dynamically rebuild mesh on slider update  
- Render Sievert’s Surface (Variant 18)  
- Provide screenshots & video demonstration

---

## Sievert Surface – Variant 18

The parametric surface is defined by the following functions:

φ(u) = ...
r(u, v) = ...
a(u, v) = ...
z(u, v) = ...

*(These formulas come from the assignment PDF; see the attached reference below.)*

<div align="center">
<img src="screenshots/pdf_reference.png" width="600">
</div>

---

## Project Structure

WebGL/
│
├── index.html # UI + canvas + sliders
├── main.js # Rendering loop, matrices, light animation
├── model.js # Mesh generation, normals, buffers
├── shader.gpu # Vertex + fragment shaders
│
├── utils/
│ └── m4.js # Matrix operations (MV, MVP, NormalMatrix)
│
└── screenshots/
├── final_render.png
├── wireframe_vs_filled.png
├── surface_closeup.png
├── normals_visualization.png
└── pdf_reference.png

---

## Implementation Details

### 🔹 6.1. Triangle Mesh Generation
- The parametric domain *(u, v)* is discretized into **U × V** segments.
- For each grid cell, two triangles are created.
- Index buffer stores triangle connectivity.

### 🔹 6.2. Vertex Normals – Facet Average
For each triangle:

facetNormal = normalize(cross(v1 - v0, v2 - v0))

This normal is added to the normals of all three vertices:

vertexNormal[v0] += facetNormal
vertexNormal[v1] += facetNormal
vertexNormal[v2] += facetNormal

Finally, all vertex normals are normalized.

### 🔹 6.3. Gouraud Shading (Lighting in Vertex Shader)

Vertex shader computes full lighting:

color = Ambient
+ Diffuse * max(dot(N, L), 0)
+ Specular * pow(max(dot(R, V), 0), shininess)

Fragment shader simply interpolates:

gl_FragColor = vColor;

### 🔹 6.4. Matrices

Used:

- **ModelViewMatrix**
- **NormalMatrix** — inverse transpose of MV's top-left 3×3
- **ModelViewProjectionMatrix**

These are passed to the vertex shader each frame.

### 🔹 6.5. Animated Point Light

Light moves along a circular trajectory around the surface:

light.x = R * cos(t)
light.y = height
light.z = R * sin(t)

This provides dynamic highlights and realistic shading.

---

## 🎚 Interactive Controls (Sliders)

Two sliders allow adjusting the surface resolution:

- **U segments**
- **V segments**

Whenever the user moves a slider:

surface.uSegments = newValue
surface.vSegments = newValue
surface.buildMesh()

The mesh is regenerated instantly and rendered with new density.

---

## Running the Project

### **Option 1 – Live Server (VS Code)**  
Right-click `index.html` → **Open with Live Server**

### **Option 2 – http-server**

```bash
npm install -g http-server
http-server
Then open:

http://localhost:8080
WebGL does not allow file:// — local HTTP server is required.

🎥 Video Presentation (2 minutes)
A short video demonstrating:

mesh generation

sliders (U/V)

rotation with mouse

dynamic lighting

shading close-ups

👉 Insert link here:
https://youtu.be/your-video-link

✔️ PA2 Checklist
 Triangle mesh rendering

 Facet average vertex normals

 Gouraud shading

 Animated point light

 Ambient + Diffuse + Specular

 U/V sliders

 MVP + NormalMatrix

 Screenshots included

 Video included

 Branch name: PA2

📄 License & Author
Author: Andrii Khavkin
KPI — NTUU — VGGI Course — 2025

## Licensing

Educational project for KPI / VGGI course (2025).