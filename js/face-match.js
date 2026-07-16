/**
 * PorteàPorte — Face Matching
 * Compare 2 visages côté client (gratuit, privé, sans API tierce)
 * Utilise face-api.js + modèles hébergés sur jsdelivr
 *
 * Usage:
 *   await PapFace.loadModels();
 *   const result = await PapFace.compare(imageUrl1, imageUrl2);
 *   // result = { match: true|false, score: 0-1, distance: 0-1+ }
 */
(function() {
  if (window.PapFace) return;

  const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
  let modelsLoaded = false;
  let loadingPromise = null;

  async function ensureFaceApiLoaded() {
    if (window.faceapi) return;
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Impossible de charger face-api.js'));
      document.head.appendChild(script);
    });
  }

  async function loadModels() {
    if (modelsLoaded) return true;
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
      try {
        await ensureFaceApiLoaded();
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        modelsLoaded = true;
        if (window.PAP_DEBUG) console.log('[PapFace] Modèles chargés');
        return true;
      } catch (e) {
        loadingPromise = null;
        console.error('[PapFace]', e);
        throw e;
      }
    })();
    return loadingPromise;
  }

  async function getDescriptor(imgSrc) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imgSrc;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Impossible de charger l\'image: ' + imgSrc.slice(0,60)));
    });
    const detection = await faceapi
      .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (!detection) return null;
    return detection.descriptor;
  }

  /**
   * Compare 2 images. Renvoie un score 0-1 (1=identique)
   */
  async function compare(img1Src, img2Src, threshold = 0.55) {
    await loadModels();
    const [d1, d2] = await Promise.all([
      getDescriptor(img1Src),
      getDescriptor(img2Src)
    ]);
    if (!d1 || !d2) {
      return { match: null, score: 0, distance: null, reason: !d1 ? 'Visage non détecté image 1' : 'Visage non détecté image 2' };
    }
    const distance = faceapi.euclideanDistance(d1, d2);
    // distance < 0.6 = même personne (selon FaceNet)
    // Score de similarité (1 - distance/1.5 plafonné)
    const score = Math.max(0, Math.min(1, 1 - distance / 1.2));
    const match = distance < threshold;
    return { match, score, distance, reason: match ? 'Visages identiques' : 'Visages différents' };
  }

  window.PapFace = { loadModels, compare };
})();
