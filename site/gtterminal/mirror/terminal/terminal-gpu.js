import * as THREE from "three/webgpu";
import { Fn, rand, sin, smoothstep, time, uv, vec2, vec3, vec4 } from "three/tsl";

const canvas = document.querySelector("#terminal-signal-canvas");
const crt = document.querySelector(".crt");
const signalState = document.querySelector("#signal-state");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function setSignalState(label, mode) {
  if (signalState) signalState.textContent = label;
  if (crt) crt.dataset.signalRenderer = mode;
}

async function startSignalLayer() {
  if (!canvas || !crt) return;

  if (!navigator.gpu) {
    setSignalState("CSS", "css");
    canvas.hidden = true;
    return;
  }

  const renderer = new THREE.WebGPURenderer({
    canvas,
    alpha: true,
    antialias: false,
    powerPreference: "low-power"
  });

  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  camera.position.z = 1;

  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false
  });

  material.colorNode = Fn(() => {
    const st = uv();
    const animatedUV = st.mul(vec2(1380, 920)).add(vec2(time.mul(17.3), time.mul(9.7)));
    const grain = rand(animatedUV);
    const scan = sin(st.y.mul(1750).add(time.mul(8))).mul(0.5).add(0.5);
    const spark = smoothstep(0.986, 1, grain);
    const voltage = sin(time.mul(21.7)).mul(0.5).add(0.5);
    const alpha = grain.mul(0.034)
      .add(scan.mul(0.014))
      .add(spark.mul(0.05))
      .mul(voltage.mul(0.08).add(0.92));

    return vec4(vec3(0.44, 1, 0.54), alpha);
  })();

  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(screen);

  const resize = () => {
    const bounds = crt.getBoundingClientRect();
    renderer.setSize(Math.max(1, bounds.width), Math.max(1, bounds.height), false);
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(crt);
  resize();

  await renderer.init();

  const backend = renderer.backend?.isWebGPUBackend ? "webgpu" : "webgl2";
  setSignalState(backend.toUpperCase(), backend);

  if (reducedMotion) {
    renderer.render(scene, camera);
  } else {
    let lastFrame = 0;
    renderer.setAnimationLoop((timestamp) => {
      if (timestamp - lastFrame < 33) return;
      lastFrame = timestamp;
      renderer.render(scene, camera);
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      renderer.setAnimationLoop(null);
    } else if (!reducedMotion) {
      renderer.setAnimationLoop((timestamp) => {
        if (timestamp - lastFrame < 33) return;
        lastFrame = timestamp;
        renderer.render(scene, camera);
      });
    }
  });

  window.addEventListener("pagehide", () => {
    resizeObserver.disconnect();
    renderer.setAnimationLoop(null);
    renderer.dispose();
  }, { once: true });
}

startSignalLayer().catch((error) => {
  setSignalState("CSS", "css");
  canvas?.setAttribute("hidden", "");
  console.warn("[GT Terminal] GPU signal layer unavailable; CSS noise fallback active.", error);
});
