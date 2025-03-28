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
bloomPass.strength = 0; // No bloom for a clean white look without glow
bloomPass.radius = 0;   

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
    u_red: {type: 'f', value: 1.0},    // Pure white color (1,1,1)
    u_green: {type: 'f', value: 1.0},  
    u_blue: {type: 'f', value: 1.0}    
}

const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: document.getElementById('vertexshader').textContent,
    fragmentShader: document.getElementById('fragmentshader').textContent
});

const Scale = 1
const geo = new THREE.IcosahedronGeometry(1, 5); // Reduced details level for fewer triangles
const mesh = new THREE.Mesh(geo, mat);
mesh.scale.set(Scale, Scale, Scale); // Scale up by 4 times
scene.add(mesh);
mesh.material.wireframe = true;

const rotationSpeed = {
  x: 0.05,
  y: 0.03,
  z: 0.02
};

// Random starting rotation offsets
const rotationOffset = {
  x: Math.random() * Math.PI * 2,
  y: Math.random() * Math.PI * 2,
  z: Math.random() * Math.PI * 2
};

// Create and add our particle system
const particles = new ParticleSystem(1000, 2, scene);

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

// Function to request audio deletion
function requestAudioDeletion() {
  // Only delete once
  if (!isProcessingAudio) return;
  
  console.log("Requesting audio deletion");
  
  fetch('http://localhost:6969/delete-audio', {
    method: 'POST'
  })
  .then(() => {
    console.log("Audio file deleted successfully");
    isProcessingAudio = false;
    currentAudioId = null;
  })
  .catch(err => {
    console.log('Error deleting audio:', err);
    isProcessingAudio = false;
    currentAudioId = null;
  });
}

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
  audioLoader.load(`http://localhost:6969/uploads/audio.wav?t=${audioId}`, 
    // Success callback
    function(buffer) {
      console.log("Audio loaded successfully");
      
      // If sound is already playing, stop it
      if (sound.isPlaying) {
        sound.stop();
      }
      
      // Get audio duration
      const duration = buffer.duration;
      console.log("Audio duration:", duration, "seconds");
      
      // Small delay before playing to ensure buffer is fully processed
      setTimeout(() => {
        sound.setBuffer(buffer);
        sound.setLoop(false); // Ensure no looping
        sound.play();
        console.log("Audio started playing");
        
        // Set both an event handler AND a timeout to ensure cleanup
        sound.onEnded = function() {
          console.log("onEnded event triggered");
          requestAudioDeletion();
        };
        
        // Backup timeout in case the onEnded event doesn't fire
        // Set it to slightly longer than the audio duration
        setTimeout(requestAudioDeletion, (duration * 1000) + 500);
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
  
  fetch('http://localhost:6969/uploads/audio.wav', { 
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
  fetch('http://localhost:6969/cleanup', {
    method: 'GET'
  })
  .then(() => {
    console.log("Initial cleanup complete");
  })
  .catch(err => {
    console.log("Error during initial cleanup:", err);
  });
});

// Add cleanup handler when page unloads
window.addEventListener('beforeunload', function() {
  if (sound.isPlaying) {
    sound.stop();
    // Try to delete the file
    fetch('http://localhost:6969/delete-audio', {
      method: 'POST',
      // Use keepalive to ensure request completes even during page unload
      keepalive: true
    });
  }
});

// Check for new audio every 100ms
setInterval(checkForNewAudio, 100);

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
  
  // Add mesh rotation with varied speeds
  mesh.rotation.x = rotationOffset.x + (Math.sin(time * 0.4) * 0.2) + (time * rotationSpeed.x);
  mesh.rotation.y = rotationOffset.y + (Math.sin(time * 0.3) * 0.3) + (time * rotationSpeed.y);
  mesh.rotation.z = rotationOffset.z + (Math.sin(time * 0.7) * 0.1) + (time * rotationSpeed.z);
  
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