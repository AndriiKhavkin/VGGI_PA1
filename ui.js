function clamp01(x){ return Math.max(0, Math.min(1, x)); }

function updateTexCenterMarker(){
  const canvas = document.getElementById("webglcanvas");
  const marker = document.getElementById("texCenterMarker");
  const label  = document.getElementById("texCenterLabel");
  if(!canvas || !marker || !label) return;

  const m = label.textContent.match(/([-0-9.]+)\s*,\s*([-0-9.]+)/);
  if(!m) return;

  let u = clamp01(parseFloat(m[1]));
  let v = clamp01(parseFloat(m[2]));

  // marker всередині .canvas-wrap, тому беремо РОЗМІР ВІДМАЛЬОВКИ canvas
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  
  const x = u * w;
  const y = (1 - v) * h;

  marker.style.left = `${x}px`;
  marker.style.top  = `${y}px`;

}

requestAnimationFrame(function tick(){
  updateTexCenterMarker();
  requestAnimationFrame(tick);
});

window.addEventListener("resize", updateTexCenterMarker);
