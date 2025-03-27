import * as THREE from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass';
import ParticleSystem from './ParticleSystem.js';

const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);

renderer.outputColorSpace = THREE.SRGBColorSpace;

const renderScene = new RenderPass(scene, camera);

const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight));
bloomPass.threshold = 0;
bloomPass.strength = 0; // Increased bloom strength to enhance particles
bloomPass.radius = 0;   // Slight blur to blend everything

const bloomComposer = new EffectComposer(renderer);
bloomComposer.addPass(renderScene);
bloomComposer.addPass(bloomPass);

const outputPass = new OutputPass();
bloomComposer.addPass(outputPass);

camera.position.set(0, -2, 14);
camera.lookAt(0, 0, 0);

const uniforms = {
    u_time: {type: 'f', value: 0.0},
    u_frequency: {type: 'f', value: 0.0},
    u_red: {type: 'f', value: 0.2},    // Adjusted base color to complement blue particles
    u_green: {type: 'f', value: 0.4},  // Slightly more green for a teal shade
    u_blue: {type: 'f', value: 0.8}    // High blue value
}

const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: document.getElementById('vertexshader').textContent,
    fragmentShader: document.getElementById('fragmentshader').textContent
});

const geo = new THREE.IcosahedronGeometry(4, 30);
const mesh = new THREE.Mesh(geo, mat);
scene.add(mesh);
mesh.material.wireframe = true;

// Create and add our particle system
const particles = new ParticleSystem(200, 3.5, scene);

// Make sure audio context is created properly
let audioContextInitialized = false;
const initAudioContext = () => {
  if (audioContextInitialized) return;
  
  // Create audio context first
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContext();
  
  // Resume it (needed for Chrome and other browsers with autoplay policies)
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  
  audioContextInitialized = true;
};

// Initialize on first user interaction
window.addEventListener('click', initAudioContext, { once: true });
window.addEventListener('touchstart', initAudioContext, { once: true });

const listener = new THREE.AudioListener();
camera.add(listener);

const sound = new THREE.Audio(listener);
const analyser = new THREE.AudioAnalyser(sound, 32);

// Track if we're currently processing an audio file
let isProcessingAudio = false;
let currentAudioId = null;

// Function to load and play the audio
function loadAndPlayAudio(audioId) {
  // If we're already processing this file, skip
  if (isProcessingAudio && audioId === currentAudioId) {
    return;
  }
  
  isProcessingAudio = true;
  currentAudioId = audioId;
  console.log("Loading audio:", audioId);
  
  // Make sure audio context is initialized
  initAudioContext();
  
  const audioLoader = new THREE.AudioLoader();
  audioLoader.load(`http://localhost:3000/uploads/current-audio.mp3?t=${audioId}`, 
    // Success callback
    function(buffer) {
      console.log("Audio loaded successfully");
      
      // If sound is already playing, stop it
      if (sound.isPlaying) {
        sound.stop();
      }
      
      // Small delay before playing to ensure buffer is fully processed
      setTimeout(() => {
        sound.setBuffer(buffer);
        sound.setLoop(false); // Ensure no looping
        sound.play();
        
        // Delete the file after playback completes
        sound.onEnded = function() {
          console.log("Audio finished playing, requesting deletion");
          
          fetch('http://localhost:3000/delete-audio', {
            method: 'POST'
          })
          .then(() => {
            console.log("Audio file deleted successfully");
            // Reset flags after successful deletion
            isProcessingAudio = false;
            currentAudioId = null;
          })
          .catch(err => {
            console.log('Error deleting audio:', err);
            // Reset flags on error too
            isProcessingAudio = false;
            currentAudioId = null;
          });
        };
      }, 100); // 100ms delay
    },
    // Progress callback
    function(xhr) {
      console.log("Audio loading progress: " + (xhr.loaded / xhr.total * 100) + "%");
    },
    // Error callback
    function(err) {
      console.error("Error loading audio:", err);
      isProcessingAudio = false;
      currentAudioId = null;
    }
  );
}

// Function to check for new audio
function checkForNewAudio() {
  // Skip checking if we're already processing an audio file
  if (isProcessingAudio) {
    return;
  }
  
  fetch('http://localhost:3000/uploads/current-audio.mp3', { 
    method: 'HEAD',
    cache: 'no-store'
  })
    .then(response => {
      if (response.ok) {
        const audioId = Date.now(); // Generate a unique ID for this audio instance
        loadAndPlayAudio(audioId);
      }
    })
    .catch(error => {
      // File not found is normal and expected after deletion
    });
}

// Initial cleanup when page loads
window.addEventListener('load', function() {
  console.log("Page loaded, performing initial cleanup");
  // Reset state on page load
  isProcessingAudio = false;
  currentAudioId = null;
  
  // On refresh/load, force cleanup of any existing files
  fetch('http://localhost:3000/cleanup', {
    method: 'GET'
  })
  .then(() => {
    console.log("Initial cleanup complete");
  })
  .catch(err => {
    console.log("Error during initial cleanup:", err);
  });
});

// Check for new audio every second
setInterval(checkForNewAudio, 1000);

const clock = new THREE.Clock();
function animate() {
    const time = clock.getElapsedTime();
    uniforms.u_time.value = time;
    
    const frequency = analyser.getAverageFrequency();
    uniforms.u_frequency.value = frequency;
    
    // Update the particle system with current time
    particles.update(time);
    
    // Have particles respond to audio
    particles.respondToAudio(frequency);
    
    bloomComposer.render();
    requestAnimationFrame(animate);
}
animate();

window.addEventListener('resize', function() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    bloomComposer.setSize(window.innerWidth, window.innerHeight);
});