import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import anime from 'animejs';
import { createNoise3D, createNoise4D } from 'simplex-noise';

// --- Core Variables ---
let scene, camera, renderer, controls, clock;
let composer, bloomPass;
let particlesGeometry, particlesMaterial, particleSystem;
let currentPositions, sourcePositions, targetPositionsBuffer, swarmPositions;
let particleSizes, particleOpacities, particleEffectStrengths;
let noise3D, noise4D;
let morphTimeline = null;
let isInitialized = false;
let isFontLoaded = false;
let isMorphing = false;
let loadedFont = null;

// --- Mouse Interaction Variables ---
const mousePosition = new THREE.Vector2(Infinity, Infinity);
const mouseWorldPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
const raycaster = new THREE.Raycaster();
const interactionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const MOUSE_CONFIG = {
    influenceRadius: 6.0,
    maxForce: 1.5,
    // lerpFactor: 0.08 // Defined but not currently used in direct force application
};
let mouseForceActive = false;

// --- Config ---
const CONFIG = { particleCount: 15000, textSize: 12, textDepth: 2, swarmDistanceFactor: 1.5, swirlFactor: 4.0, noiseFrequency: 0.1, noiseTimeScale: 0.04, noiseMaxStrength: 2.8, colorScheme: 'fire', morphDuration: 4000, particleSizeRange: [0.08, 0.25], starCount: 18000, bloomStrength: 1.3, bloomRadius: 0.5, bloomThreshold: 0.05, idleFlowStrength: 0.25, idleFlowSpeed: 0.08, idleRotationSpeed: 0.02, morphSizeFactor: 0.5, morphBrightnessFactor: 0.6 };

// --- Color Schemes ---
const COLOR_SCHEMES = { fire: { startHue: 0, endHue: 45, saturation: 0.95, lightness: 0.6 }, neon: { startHue: 300, endHue: 180, saturation: 1.0, lightness: 0.65 }, nature: { startHue: 90, endHue: 160, saturation: 0.85, lightness: 0.55 }, rainbow: { startHue: 0, endHue: 360, saturation: 0.9, lightness: 0.6 } };

// --- Temp Vectors ---
const tempVec = new THREE.Vector3(); const sourceVec = new THREE.Vector3(); const targetVec = new THREE.Vector3(); const swarmVec = new THREE.Vector3(); const noiseOffset = new THREE.Vector3(); const flowVec = new THREE.Vector3(); const bezPos = new THREE.Vector3(); const swirlAxis = new THREE.Vector3(); const currentVec = new THREE.Vector3(); const _samplerPos = new THREE.Vector3();

// --- State Variables ---
const morphState = { progress: 0.0 };

// --- UI Elements ---
const textInput = document.getElementById('text-input'); const generateBtn = document.getElementById('generate-btn'); const loadingScreen = document.getElementById('loading'); const loadingText = document.getElementById('loading-text'); const progressBar = document.getElementById('progress'); const infoDiv = document.getElementById('info');

// --- Progress Update ---
let currentProgress = 0; const totalProgressSteps = 100;
function updateProgress(increment, message = null) { currentProgress += increment; currentProgress = Math.min(currentProgress, totalProgressSteps); progressBar.style.width = `${currentProgress}%`; if (message) loadingText.innerText = message; if (currentProgress >= totalProgressSteps && isFontLoaded) { setTimeout(() => { loadingScreen.classList.add('hidden'); }, 300); } }

// --- Initialization ---
function init() {
     updateProgress(0, 'Initializing Scene...'); clock = new THREE.Clock(); noise3D = createNoise3D(() => Math.random()); noise4D = createNoise4D(() => Math.random()); scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x000308, 0.03); updateProgress(5, 'Scene Created.');
     camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000); camera.position.set(0, 8, 35); camera.lookAt(scene.position); updateProgress(5, 'Camera Created.');
     const canvas = document.getElementById('webglCanvas'); renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); renderer.setSize(window.innerWidth, window.innerHeight); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1; updateProgress(10, 'Renderer Ready.');
     controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = 0.05; controls.minDistance = 5; controls.maxDistance = 100; controls.autoRotate = true; controls.autoRotateSpeed = 0.3; updateProgress(5, 'Controls Ready.');
     scene.add(new THREE.AmbientLight(0x404060)); const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.5); dirLight1.position.set(15, 20, 10); scene.add(dirLight1); const dirLight2 = new THREE.DirectionalLight(0x88aaff, 0.9); dirLight2.position.set(-15, -10, -15); scene.add(dirLight2); updateProgress(10, 'Lighting Added.');
     setupPostProcessing(); updateProgress(10, 'Post-processing Setup.'); createStarfield(); updateProgress(15, 'Starfield Created.');

     updateProgress(0, 'Loading Font...'); const fontLoader = new FontLoader(); const fontPath = 'https://unpkg.com/three@0.163.0/examples/fonts/helvetiker_regular.typeface.json';
     fontLoader.load(fontPath, (font) => { console.log("Font loaded successfully!"); loadedFont = font; isFontLoaded = true; updateProgress(20, 'Font Loaded.'); setupParticleSystem(); updateProgress(15, 'Particles Initialized.'); generateBtn.disabled = false; infoDiv.innerText = "Enter text and click Generate"; triggerMorph(textInput.value.trim() || "Hello"); isInitialized = true; updateProgress(5, 'Ready.'); }, undefined, (err) => { console.error('Error loading font:', err); loadingText.innerText = 'ERROR LOADING FONT!'; loadingText.style.color = 'red'; });

     // Event Listeners
     window.addEventListener('resize', onWindowResize);
     generateBtn.addEventListener('click', () => triggerMorph());
     textInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') triggerMorph(); });
     document.querySelectorAll('.color-option').forEach(option => { option.addEventListener('click', (e) => { if (!particleSystem) return; document.querySelectorAll('.color-option').forEach(o => o.classList.remove('active')); e.target.classList.add('active'); CONFIG.colorScheme = e.target.dataset.scheme; updateColors(); }); });
     document.querySelector(`.color-option[data-scheme="${CONFIG.colorScheme}"]`).classList.add('active');
     window.addEventListener('pointermove', onPointerMove);
     window.addEventListener('pointerleave', onPointerLeave);


     animate(); console.log("Base initialization complete. Waiting for font...");
}

// --- Post Processing ---
function setupPostProcessing() { composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera)); bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), CONFIG.bloomStrength, CONFIG.bloomRadius, CONFIG.bloomThreshold); composer.addPass(bloomPass); }

// --- Starfield ---
function createStarfield() {
    const starVertices = []; const starSizes = []; const starColors = [];
    const starGeometry = new THREE.BufferGeometry();
    for (let i = 0; i < CONFIG.starCount; i++) { tempVec.set( THREE.MathUtils.randFloatSpread(400), THREE.MathUtils.randFloatSpread(400), THREE.MathUtils.randFloatSpread(400) ); if (tempVec.length() < 100) tempVec.setLength(100 + Math.random() * 300); starVertices.push(tempVec.x, tempVec.y, tempVec.z); starSizes.push(Math.random() * 0.15 + 0.05); const color = new THREE.Color(); if (Math.random() < 0.1) { color.setHSL(Math.random(), 0.7, 0.65); } else { color.setHSL(0.6, Math.random() * 0.1, 0.8 + Math.random() * 0.2); } starColors.push(color.r, color.g, color.b); }
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
    starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
    starGeometry.setAttribute('size', new THREE.Float32BufferAttribute(starSizes, 1));

    const starTexture = createStarTexture();
    const starMaterial = new THREE.ShaderMaterial({
         uniforms: { pointTexture: { value: starTexture } },
         vertexShader: ` precision mediump float; attribute float size; varying vec3 vColor; varying float vSize; void main() { vColor = color; vSize = size; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * (400.0 / -mvPosition.z); gl_Position = projectionMatrix * mvPosition; }`,
         fragmentShader: ` precision mediump float; uniform sampler2D pointTexture; varying vec3 vColor; void main() { float alpha = texture2D(pointTexture, gl_PointCoord).a; if (alpha < 0.1) discard; gl_FragColor = vec4(vColor, alpha * 0.9); }`,
         blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, vertexColors: true
    });
    scene.add(new THREE.Points(starGeometry, starMaterial));
    console.log("Starfield added to scene (using ShaderMaterial).");
}
function createStarTexture() { const size = 64; const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size; const context = canvas.getContext('2d'); const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); gradient.addColorStop(0, 'rgba(255,255,255,1)'); gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)'); gradient.addColorStop(0.5, 'rgba(255,255,255,0.3)'); gradient.addColorStop(1, 'rgba(255,255,255,0)'); context.fillStyle = gradient; context.fillRect(0, 0, size, size); return new THREE.CanvasTexture(canvas); }

// --- Particle System Setup ---
function setupParticleSystem() {
     if (particleSystem) { scene.remove(particleSystem); particlesGeometry.dispose(); } particlesGeometry = new THREE.BufferGeometry(); currentPositions = new Float32Array(CONFIG.particleCount * 3); sourcePositions = new Float32Array(CONFIG.particleCount * 3); targetPositionsBuffer = new Float32Array(CONFIG.particleCount * 3); swarmPositions = new Float32Array(CONFIG.particleCount * 3); particleSizes = new Float32Array(CONFIG.particleCount); particleOpacities = new Float32Array(CONFIG.particleCount); particleEffectStrengths = new Float32Array(CONFIG.particleCount);
     for (let i = 0; i < CONFIG.particleCount; i++) { const i3 = i * 3; currentPositions[i3] = (Math.random() - 0.5) * 0.1; currentPositions[i3 + 1] = (Math.random() - 0.5) * 0.1; currentPositions[i3 + 2] = (Math.random() - 0.5) * 0.1; particleSizes[i] = THREE.MathUtils.randFloat(CONFIG.particleSizeRange[0], CONFIG.particleSizeRange[1]); particleOpacities[i] = 1.0; particleEffectStrengths[i] = 0.0; } sourcePositions.set(currentPositions);
     particlesGeometry.setAttribute('position', new THREE.BufferAttribute(currentPositions, 3)); particlesGeometry.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1)); particlesGeometry.setAttribute('opacity', new THREE.BufferAttribute(particleOpacities, 1)); particlesGeometry.setAttribute('aEffectStrength', new THREE.BufferAttribute(particleEffectStrengths, 1)); const colors = new Float32Array(CONFIG.particleCount * 3); updateColorArray(colors, currentPositions); particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
     particlesMaterial = new THREE.ShaderMaterial({ uniforms: { pointTexture: { value: createStarTexture() } }, vertexShader: ` attribute float size; attribute float opacity; attribute float aEffectStrength; varying vec3 vColor; varying float vOpacity; varying float vEffectStrength; void main() { vColor = color; vOpacity = opacity; vEffectStrength = aEffectStrength; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); float sizeScale = 1.0 - vEffectStrength * ${CONFIG.morphSizeFactor.toFixed(2)}; gl_PointSize = size * sizeScale * (400.0 / -mvPosition.z); gl_Position = projectionMatrix * mvPosition; }`, fragmentShader: ` uniform sampler2D pointTexture; varying vec3 vColor; varying float vOpacity; varying float vEffectStrength; void main() { float alpha = texture2D(pointTexture, gl_PointCoord).a; if (alpha < 0.05) discard; vec3 finalColor = vColor * (1.0 + vEffectStrength * ${CONFIG.morphBrightnessFactor.toFixed(2)}); gl_FragColor = vec4(finalColor, alpha * vOpacity); }`, blending: THREE.AdditiveBlending, depthTest: true, depthWrite: false, transparent: true, vertexColors: true });
     particleSystem = new THREE.Points(particlesGeometry, particlesMaterial); scene.add(particleSystem); console.log("Particle system added to scene.");
}

// --- Generate Text Target Points ---
function generateTextTargetPoints(text) {
     if (!loadedFont || !text) return null; const geometry = new TextGeometry(text, { font: loadedFont, size: CONFIG.textSize, depth: CONFIG.textDepth, curveSegments: 8, bevelEnabled: false }); geometry.computeBoundingBox(); geometry.center(); const targetPoints = new Float32Array(CONFIG.particleCount * 3);
     if (!geometry.index && geometry.attributes.position.count < 3) { console.warn("Generated text geometry has too few vertices or no faces for:", text); targetPoints.fill(0); geometry.dispose(); return targetPoints; } const tempMaterial = new THREE.MeshBasicMaterial(); const tempMesh = new THREE.Mesh(geometry, tempMaterial); try { const sampler = new MeshSurfaceSampler(tempMesh).build(); for (let i = 0; i < CONFIG.particleCount; i++) { sampler.sample(_samplerPos); targetPoints[i * 3] = _samplerPos.x; targetPoints[i * 3 + 1] = _samplerPos.y; targetPoints[i * 3 + 2] = _samplerPos.z; } } catch (error) { console.error("Error during MeshSurfaceSampler execution:", error); targetPoints.fill(0); } geometry.dispose(); tempMaterial.dispose(); return targetPoints;
}

// --- Update Colors ---
function updateColorArray(colors, positionsArray) { const colorScheme = COLOR_SCHEMES[CONFIG.colorScheme]; const center = new THREE.Vector3(0, 0, 0); let maxRadiusSq = 0; for (let i = 0; i < CONFIG.particleCount; i++) { maxRadiusSq = Math.max(maxRadiusSq, positionsArray[i*3]**2 + positionsArray[i*3+1]**2 + positionsArray[i*3+2]**2); } const maxRadius = Math.max(Math.sqrt(maxRadiusSq), CONFIG.textSize, 5); for (let i = 0; i < CONFIG.particleCount; i++) { const i3 = i * 3; tempVec.fromArray(positionsArray, i3); const dist = tempVec.length(); let hue; if (CONFIG.colorScheme === 'rainbow') { const normX = (tempVec.x / maxRadius + 1) / 2; const normY = (tempVec.y / maxRadius + 1) / 2; const normZ = (tempVec.z / maxRadius + 1) / 2; hue = (normX * 120 + normY * 120 + normZ * 120) % 360; } else { hue = THREE.MathUtils.mapLinear( dist, 0, maxRadius, colorScheme.startHue, colorScheme.endHue ); } const noiseValue = (noise3D(tempVec.x * 0.2, tempVec.y * 0.2, tempVec.z * 0.2) + 1) * 0.5; const saturation = THREE.MathUtils.clamp(colorScheme.saturation * (0.9 + noiseValue * 0.2), 0, 1); const lightness = THREE.MathUtils.clamp(colorScheme.lightness * (0.85 + noiseValue * 0.3), 0.1, 0.9); const color = new THREE.Color().setHSL(hue / 360, saturation, lightness); color.toArray(colors, i3); } }
function updateColors() { if (!particlesGeometry || !particlesGeometry.attributes.color) return; const colors = particlesGeometry.attributes.color.array; updateColorArray(colors, particlesGeometry.attributes.position.array); particlesGeometry.attributes.color.needsUpdate = true; }

// --- Trigger Morph ---
function triggerMorph(optionalText = null) {
     if (isMorphing || !isFontLoaded || !particleSystem) { return; } const inputText = (optionalText !== null) ? optionalText : textInput.value.trim(); if (!inputText) { console.warn("Input text is empty, cannot morph."); return; } const newTargetPositions = generateTextTargetPoints(inputText); if (!newTargetPositions) { console.error("Failed to generate target points for text."); return; } isMorphing = true; controls.autoRotate = false; console.log(`Morphing to text: "${inputText}"`); infoDiv.innerText = `Gathering Dust...`; /* User customized text */ infoDiv.style.textShadow = '0 0 8px rgba(255, 150, 50, 0.9)'; sourcePositions.set(currentPositions); targetPositionsBuffer.set(newTargetPositions); const centerOffsetAmount = CONFIG.textSize * CONFIG.swarmDistanceFactor; for (let i = 0; i < CONFIG.particleCount; i++) { const i3 = i * 3; sourceVec.fromArray(sourcePositions, i3); targetVec.fromArray(targetPositionsBuffer, i3); swarmVec.lerpVectors(sourceVec, targetVec, 0.5); const offsetDir = tempVec.set( noise3D(i * 0.05, 10, 10), noise3D(20, i * 0.05, 20), noise3D(30, 30, i * 0.05) ).normalize(); const dist = sourceVec.distanceTo(targetVec); const distFactor = (dist < 0.001 ? 0 : dist * 0.1) + centerOffsetAmount; swarmVec.addScaledVector(offsetDir, distFactor * (0.5 + Math.random() * 0.8)); swarmPositions[i3] = swarmVec.x; swarmPositions[i3 + 1] = swarmVec.y; swarmPositions[i3 + 2] = swarmVec.z; } morphState.progress = 0; if (morphTimeline) morphTimeline.pause();
     morphTimeline = anime({ targets: morphState, progress: 1, duration: CONFIG.morphDuration, easing: 'cubicBezier(0.4, 0.0, 0.2, 1.0)', complete: () => { if (!particleSystem) return; console.log("Text morphing complete."); infoDiv.innerText = `Displaying: "${inputText}"`; infoDiv.style.textShadow = '0 0 5px rgba(0, 128, 255, 0.8)'; currentPositions.set(targetPositionsBuffer); particlesGeometry.attributes.position.array.set(targetPositionsBuffer); particlesGeometry.attributes.position.needsUpdate = true; particleEffectStrengths.fill(0.0); particlesGeometry.attributes.aEffectStrength.needsUpdate = true; sourcePositions.set(targetPositionsBuffer); updateColors(); isMorphing = false; controls.autoRotate = true; } });
}

// --- Mouse Event Handlers ---
function onPointerMove( event ) { mousePosition.x = ( event.clientX / window.innerWidth ) * 2 - 1; mousePosition.y = - ( event.clientY / window.innerHeight ) * 2 + 1; mouseForceActive = true; }
function onPointerLeave( event ) { mousePosition.set(Infinity, Infinity); mouseWorldPosition.set(Infinity, Infinity, Infinity); mouseForceActive = false; }
function updateMouseWorldPosition() { if (!camera) return; raycaster.setFromCamera( mousePosition, camera ); const intersects = raycaster.ray.intersectPlane( interactionPlane, mouseWorldPosition ); if (!intersects) { mouseWorldPosition.set(Infinity, Infinity, Infinity); mouseForceActive = false; } }


// --- Animate Function ---
function animate() {
     requestAnimationFrame(animate); if (!renderer) return; const elapsedTime = clock.getElapsedTime(); const deltaTime = clock.getDelta(); controls.update();
     if (mouseForceActive) { updateMouseWorldPosition(); }
     if (isInitialized && isFontLoaded && particleSystem && particlesGeometry?.attributes?.position) {
         const positions = particlesGeometry.attributes.position.array;
         const effectStrengths = particlesGeometry.attributes.aEffectStrength.array;
         try {
             let basePositionsCalculated = false;
             if (isMorphing) {
                 updateMorphAnimation(positions, effectStrengths, elapsedTime, deltaTime);
                 basePositionsCalculated = true;
             } else {
                 updateIdleAnimation(positions, effectStrengths, elapsedTime, deltaTime);
                 basePositionsCalculated = true;
             }

             // Apply Mouse Repulsion Force *after* base calculation
             if (basePositionsCalculated) {
                 const applyMouseForce = mouseForceActive && mouseWorldPosition.x !== Infinity;
                 const forceDirection = tempVec; // Reuse tempVec
                 const currentParticlePos = currentVec; // Reuse currentVec

                 for (let i = 0; i < CONFIG.particleCount; i++) {
                     const i3 = i * 3;
                     currentParticlePos.fromArray(positions, i3); // Read base position

                     if (applyMouseForce) {
                         forceDirection.subVectors(currentParticlePos, mouseWorldPosition);
                         const distanceSq = forceDirection.lengthSq();
                         const influenceRadiusSq = MOUSE_CONFIG.influenceRadius * MOUSE_CONFIG.influenceRadius;

                         if (distanceSq > 0.0001 && distanceSq < influenceRadiusSq) {
                             const distance = Math.sqrt(distanceSq);
                             const forceMagnitude = MOUSE_CONFIG.maxForce * (1.0 - distance / MOUSE_CONFIG.influenceRadius);
                             forceDirection.divideScalar(distance);
                             currentParticlePos.addScaledVector(forceDirection, forceMagnitude * deltaTime); // Apply force scaled by time
                         }
                     }
                     // Write potentially modified position back
                     positions[i3] = currentParticlePos.x;
                     positions[i3 + 1] = currentParticlePos.y;
                     positions[i3 + 2] = currentParticlePos.z;
                 }
             }
             particlesGeometry.attributes.position.needsUpdate = true;
             particlesGeometry.attributes.aEffectStrength.needsUpdate = true;

         } catch (error) { console.error("Error during particle update:", error); isMorphing = false; if (morphTimeline) morphTimeline.pause(); }
     }
     if (composer) { composer.render(deltaTime); } else if (renderer) { renderer.render(scene, camera); }
}


// --- Update Morph Animation ---
function updateMorphAnimation(positions, effectStrengths, elapsedTime, deltaTime) {
     const t = morphState.progress; const targets = targetPositionsBuffer; const effectStrength = Math.sin(t * Math.PI); const currentSwirl = effectStrength * CONFIG.swirlFactor; const currentNoise = effectStrength * CONFIG.noiseMaxStrength;
     for (let i = 0; i < CONFIG.particleCount; i++) { const i3 = i * 3; sourceVec.fromArray(sourcePositions, i3); swarmVec.fromArray(swarmPositions, i3); targetVec.fromArray(targets, i3); const t_inv = 1.0 - t; const t_inv_sq = t_inv * t_inv; const t_sq = t * t; bezPos.copy(sourceVec).multiplyScalar(t_inv_sq); bezPos.addScaledVector(swarmVec, 2.0 * t_inv * t); bezPos.addScaledVector(targetVec, t_sq);
     if (currentSwirl > 0.001) { tempVec.subVectors(bezPos, sourceVec); swirlAxis.set( noise3D(i * 0.02, elapsedTime * 0.1, 0), noise3D(0, i * 0.02, elapsedTime * 0.1 + 5), noise3D(elapsedTime * 0.1 + 10, 0, i * 0.02) ).normalize(); if (swirlAxis.lengthSq() > 0.1) { tempVec.applyAxisAngle(swirlAxis, currentSwirl * deltaTime * 50 * (0.5 + Math.random() * 0.5)); bezPos.copy(sourceVec).add(tempVec); } }
     if (currentNoise > 0.001) { const noiseTime = elapsedTime * CONFIG.noiseTimeScale; noiseOffset.set( noise4D(bezPos.x * CONFIG.noiseFrequency, bezPos.y * CONFIG.noiseFrequency, bezPos.z * CONFIG.noiseFrequency, noiseTime), noise4D(bezPos.x * CONFIG.noiseFrequency + 100, bezPos.y * CONFIG.noiseFrequency + 100, bezPos.z * CONFIG.noiseFrequency + 100, noiseTime), noise4D(bezPos.x * CONFIG.noiseFrequency + 200, bezPos.y * CONFIG.noiseFrequency + 200, bezPos.z * CONFIG.noiseFrequency + 200, noiseTime) ); bezPos.addScaledVector(noiseOffset, currentNoise); }
     if (isNaN(bezPos.x) || isNaN(bezPos.y) || isNaN(bezPos.z)) { bezPos.set(0, 0, 0); }
     // Store base position for this frame (mouse applied later)
     positions[i3] = bezPos.x; positions[i3 + 1] = bezPos.y; positions[i3 + 2] = bezPos.z;
     effectStrengths[i] = effectStrength; }
}

// --- Update Idle Animation ---
function updateIdleAnimation(positions, effectStrengths, elapsedTime, deltaTime) {
     const breathScale = 1.0 + Math.sin(elapsedTime * 0.5) * 0.015; const timeScaled = elapsedTime * CONFIG.idleFlowSpeed; const freq = 0.1; let needsEffectStrengthReset = false;
     for (let i = 0; i < CONFIG.particleCount; i++) { const i3 = i * 3; sourceVec.fromArray(sourcePositions, i3); tempVec.copy(sourceVec).multiplyScalar(breathScale); flowVec.set( noise4D(tempVec.x * freq, tempVec.y * freq, tempVec.z * freq, timeScaled), noise4D(tempVec.x * freq + 10, tempVec.y * freq + 10, tempVec.z * freq + 10, timeScaled), noise4D(tempVec.x * freq + 20, tempVec.y * freq + 20, tempVec.z * freq + 20, timeScaled) ); tempVec.addScaledVector(flowVec, CONFIG.idleFlowStrength); currentVec.fromArray(positions, i3); currentVec.lerp(tempVec, 0.05);
     if (isNaN(currentVec.x) || isNaN(currentVec.y) || isNaN(currentVec.z)) { currentVec.copy(sourceVec); }
     // Store base position for this frame (mouse applied later)
     positions[i3] = currentVec.x; positions[i3 + 1] = currentVec.y; positions[i3 + 2] = currentVec.z;
     if (effectStrengths[i] !== 0.0) { effectStrengths[i] = 0.0; needsEffectStrengthReset = true; } }
     // Effect strength update now happens in main animate loop check
}


// --- Window Resize ---
function onWindowResize() { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight); }

// --- Start ---
init();