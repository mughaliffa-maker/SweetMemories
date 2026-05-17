const introScreen = document.getElementById("introScreen");
const cameraScreen = document.getElementById("cameraScreen");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const snapBtn = document.getElementById("snapBtn");
const shareBtn = document.getElementById("shareBtn");
const downloadBtn = document.getElementById("downloadBtn");
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const statusText = document.getElementById("statusText");
const loadingLayer = document.getElementById("loadingLayer");
const previewImage = document.getElementById("previewImage");
const ctx = canvas.getContext("2d", { willReadFrequently: false });

const cookieImage = new Image();
cookieImage.src = "assets/cookie.png";

let faceMesh = null;
let stream = null;
let animationFrameId = null;
let isRunning = false;
let isProcessingFrame = false;
let latestCaptureBlob = null;
let latestFaceLandmarks = null;
let lastVideoFrameTime = -1;
let smoothedFace = null;

function setStatus(message) {
  if (statusText) statusText.textContent = message;
}

function showCameraScreen() {
  introScreen.style.display = "none";
  cameraScreen.style.display = "flex";
}

function showIntroScreen() {
  cameraScreen.style.display = "none";
  introScreen.style.display = "flex";
}

function hideLoadingLayer() {
  loadingLayer.classList.add("hide");
}

function showLoadingLayer() {
  loadingLayer.classList.remove("hide");
}

function resizeCanvasToVideo() {
  const width = video.videoWidth || 720;
  const height = video.videoHeight || 960;

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function getMirroredPoint(landmarks, index) {
  return {
    x: canvas.width - landmarks[index].x * canvas.width,
    y: landmarks[index].y * canvas.height
  };
}

function getDistance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function lerpPoint(start, end, amount) {
  return {
    x: lerp(start.x, end.x, amount),
    y: lerp(start.y, end.y, amount)
  };
}

function drawMirroredVideo() {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawRoundedRectPath(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawCookieTexture(localX, localY, width, height, rotation = 0) {
  if (!cookieImage.complete) return;

  ctx.save();
  ctx.translate(localX, localY);
  ctx.rotate(rotation);
  ctx.drawImage(cookieImage, -width / 2, -height / 2, width, height);
  ctx.restore();
}

function drawChocolateChip(x, y, radius, rotation = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  ctx.fillStyle = "#4e2419";
  ctx.shadowColor = "rgba(0, 0, 0, 0.24)";
  ctx.shadowBlur = radius * 0.9;
  ctx.shadowOffsetY = radius * 0.15;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius, radius * 0.78, rotation, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.beginPath();
  ctx.ellipse(-radius * 0.18, -radius * 0.18, radius * 0.3, radius * 0.18, rotation, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function buildFaceMetrics(landmarks) {
  const leftOuter = getMirroredPoint(landmarks, 33);
  const leftInner = getMirroredPoint(landmarks, 133);
  const leftUpper = getMirroredPoint(landmarks, 159);
  const leftLower = getMirroredPoint(landmarks, 145);

  const rightOuter = getMirroredPoint(landmarks, 263);
  const rightInner = getMirroredPoint(landmarks, 362);
  const rightUpper = getMirroredPoint(landmarks, 386);
  const rightLower = getMirroredPoint(landmarks, 374);

  const leftCenter = {
    x: (leftOuter.x + leftInner.x) / 2,
    y: (leftUpper.y + leftLower.y) / 2
  };

  const rightCenter = {
    x: (rightOuter.x + rightInner.x) / 2,
    y: (rightUpper.y + rightLower.y) / 2
  };

  const leftEyeWidth = getDistance(leftOuter, leftInner);
  const rightEyeWidth = getDistance(rightOuter, rightInner);
  const leftEyeHeight = getDistance(leftUpper, leftLower);
  const rightEyeHeight = getDistance(rightUpper, rightLower);
  const eyeGap = getDistance(leftCenter, rightCenter);
  const faceTilt = Math.atan2(rightCenter.y - leftCenter.y, rightCenter.x - leftCenter.x);

  const freshMetrics = {
    leftCenter,
    rightCenter,
    leftEyeWidth,
    rightEyeWidth,
    leftEyeHeight,
    rightEyeHeight,
    eyeGap,
    faceTilt
  };

  if (!smoothedFace) {
    smoothedFace = freshMetrics;
    return freshMetrics;
  }

  const smoothAmount = 0.3;
  smoothedFace = {
    leftCenter: lerpPoint(smoothedFace.leftCenter, freshMetrics.leftCenter, smoothAmount),
    rightCenter: lerpPoint(smoothedFace.rightCenter, freshMetrics.rightCenter, smoothAmount),
    leftEyeWidth: lerp(smoothedFace.leftEyeWidth, freshMetrics.leftEyeWidth, smoothAmount),
    rightEyeWidth: lerp(smoothedFace.rightEyeWidth, freshMetrics.rightEyeWidth, smoothAmount),
    leftEyeHeight: lerp(smoothedFace.leftEyeHeight, freshMetrics.leftEyeHeight, smoothAmount),
    rightEyeHeight: lerp(smoothedFace.rightEyeHeight, freshMetrics.rightEyeHeight, smoothAmount),
    eyeGap: lerp(smoothedFace.eyeGap, freshMetrics.eyeGap, smoothAmount),
    faceTilt: lerp(smoothedFace.faceTilt, freshMetrics.faceTilt, smoothAmount)
  };

  return smoothedFace;
}

function drawCookieFrame(center, eyeWidth, eyeHeight, faceTilt, frameSeed) {
  const outerRx = Math.max(eyeWidth * 1.35, eyeHeight * 3.1);
  const outerRy = Math.max(eyeWidth * 0.98, eyeHeight * 2.65);
  const innerRx = Math.max(eyeWidth * 0.82, eyeHeight * 1.85);
  const innerRy = Math.max(eyeHeight * 1.08, eyeWidth * 0.34);
  const frameWidth = outerRx * 2.45;
  const frameHeight = outerRy * 2.35;
  const textureRotation = faceTilt * 0.25 + frameSeed * 0.08;

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(faceTilt);

  const framePath = new Path2D();
  framePath.ellipse(0, 0, outerRx, outerRy, 0, 0, Math.PI * 2);
  framePath.ellipse(0, 0, innerRx, innerRy, 0, 0, Math.PI * 2);

  ctx.save();
  ctx.clip(framePath, "evenodd");
  ctx.shadowColor = "rgba(56, 28, 14, 0.34)";
  ctx.shadowBlur = Math.max(18, eyeWidth * 0.35);
  ctx.shadowOffsetY = Math.max(8, eyeWidth * 0.1);
  drawCookieTexture(0, 0, frameWidth, frameHeight, textureRotation);
  ctx.restore();

  // Removed visible outline strokes so the cookie filter feels cleaner and more natural.

  const chipLayout = [
    { x: -0.66, y: -0.38, s: 0.11, r: -0.4 },
    { x: -0.22, y: -0.72, s: 0.09, r: 0.2 },
    { x: 0.18, y: -0.64, s: 0.095, r: -0.15 },
    { x: 0.64, y: -0.28, s: 0.1, r: 0.32 },
    { x: -0.72, y: 0.15, s: 0.09, r: -0.12 },
    { x: -0.32, y: 0.58, s: 0.08, r: 0.16 },
    { x: 0.26, y: 0.56, s: 0.085, r: -0.18 },
    { x: 0.74, y: 0.14, s: 0.09, r: 0.26 }
  ];

  chipLayout.forEach((chip, index) => {
    const jitter = (index % 2 === 0 ? 1 : -1) * frameSeed * 1.2;
    drawChocolateChip(
      chip.x * outerRx,
      chip.y * outerRy + jitter,
      Math.max(4, outerRx * chip.s),
      chip.r + frameSeed * 0.04
    );
  });

  const crumbLayout = [
    { x: -0.86, y: -0.1, r: 2.6 },
    { x: -0.56, y: -0.82, r: 2.2 },
    { x: 0.42, y: -0.88, r: 2.4 },
    { x: 0.9, y: 0.04, r: 2.3 },
    { x: 0.54, y: 0.78, r: 2.1 },
    { x: -0.48, y: 0.82, r: 2.4 }
  ];

  ctx.fillStyle = "rgba(217, 165, 95, 0.95)";
  crumbLayout.forEach((crumb) => {
    ctx.beginPath();
    ctx.arc(crumb.x * outerRx, crumb.y * outerRy, Math.max(1.6, crumb.r), 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();

  return { outerRx, outerRy, innerRx, innerRy };
}

function drawCookieBridge(leftCenter, rightCenter, leftFrame, rightFrame, faceTilt) {
  const center = {
    x: (leftCenter.x + rightCenter.x) / 2,
    y: (leftCenter.y + rightCenter.y) / 2
  };

  const width = Math.max(28, (rightCenter.x - leftCenter.x) - leftFrame.innerRx - rightFrame.innerRx + 16);
  const height = Math.max(14, Math.min(leftFrame.outerRy, rightFrame.outerRy) * 0.4);
  const radius = height / 2;

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(faceTilt);

  drawRoundedRectPath(-width / 2, -height / 2, width, height, radius);
  ctx.save();
  ctx.clip();
  drawCookieTexture(0, 0, width * 1.2, height * 1.8, faceTilt * 0.2);
  ctx.restore();

  // Removed bridge stroke outline for a softer cookie-glasses look.

  drawChocolateChip(-width * 0.16, 0, Math.max(3.8, height * 0.2), -0.15);
  drawChocolateChip(width * 0.18, -1, Math.max(3.5, height * 0.18), 0.2);

  ctx.restore();
}

function drawOuterCrumbSparkles(leftCenter, rightCenter, faceTilt, eyeGap) {
  const specs = [
    { x: leftCenter.x - eyeGap * 0.48, y: leftCenter.y - eyeGap * 0.16 },
    { x: leftCenter.x - eyeGap * 0.46, y: leftCenter.y + eyeGap * 0.12 },
    { x: rightCenter.x + eyeGap * 0.48, y: rightCenter.y - eyeGap * 0.16 },
    { x: rightCenter.x + eyeGap * 0.46, y: rightCenter.y + eyeGap * 0.14 }
  ];

  ctx.save();
  ctx.rotate(0);
  specs.forEach((point, index) => {
    const size = Math.max(2.4, eyeGap * 0.018);
    ctx.fillStyle = index % 2 === 0 ? "rgba(255,255,255,0.75)" : "rgba(159, 20, 27, 0.32)";
    ctx.beginPath();
    ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawBrandOverlay() {
  const scale = canvas.width / 720;
  const boxWidth = 330 * scale;
  const boxHeight = 64 * scale;
  const x = (canvas.width - boxWidth) / 2;
  const y = canvas.height - 92 * scale;
  const radius = 32 * scale;

  ctx.save();
  ctx.fillStyle = "rgba(255, 248, 239, 0.92)";
  ctx.strokeStyle = "rgba(159, 20, 27, 0.9)";
  ctx.lineWidth = 3 * scale;
  drawRoundedRectPath(x, y, boxWidth, boxHeight, radius);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#9f141b";
  ctx.textAlign = "center";
  ctx.font = `900 ${20 * scale}px Arial`;
  ctx.fillText("Snack. Scan. Share.", canvas.width / 2, y + 28 * scale);

  ctx.fillStyle = "#2f1b12";
  ctx.font = `800 ${15 * scale}px Arial`;
  ctx.fillText("#SweetMoments", canvas.width / 2, y + 49 * scale);
  ctx.restore();
}

function drawFilterFromLandmarks(landmarks) {
  const face = buildFaceMetrics(landmarks);

  const leftFrame = drawCookieFrame(
    face.leftCenter,
    face.leftEyeWidth,
    face.leftEyeHeight,
    face.faceTilt,
    1
  );

  const rightFrame = drawCookieFrame(
    face.rightCenter,
    face.rightEyeWidth,
    face.rightEyeHeight,
    face.faceTilt,
    2
  );

  drawCookieBridge(face.leftCenter, face.rightCenter, leftFrame, rightFrame, face.faceTilt);
}

function renderFrame() {
  if (!isRunning || video.readyState < 2) return;

  resizeCanvasToVideo();
  drawMirroredVideo();

  if (latestFaceLandmarks) {
    drawFilterFromLandmarks(latestFaceLandmarks);
  }

  drawBrandOverlay();
}

function handleFaceResults(results) {
  if (!isRunning) return;

  const faces = results.multiFaceLandmarks;
  latestFaceLandmarks = faces && faces.length ? faces[0] : null;

  if (latestFaceLandmarks) {
    setStatus("");
  } else {
    smoothedFace = null;
    setStatus("");
  }

  renderFrame();
}

async function createFaceMesh() {
  if (faceMesh) return faceMesh;

  if (typeof FaceMesh === "undefined") {
    throw new Error("Face tracking library could not load. Please check your internet connection.");
  }

  faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
  });

  faceMesh.onResults(handleFaceResults);
  return faceMesh;
}

async function startCamera() {
  try {
    isRunning = true;
    latestFaceLandmarks = null;
    latestCaptureBlob = null;
    smoothedFace = null;
    previewImage.classList.remove("show");
    showCameraScreen();
    showLoadingLayer();
    setStatus("Starting camera...");
    lastVideoFrameTime = -1;

    loadingLayer.querySelector("strong").textContent = "Loading CrumbCam";
    loadingLayer.querySelector("span").textContent = "Please allow camera permission";

    await createFaceMesh();

    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 720 },
        height: { ideal: 960 }
      }
    });

    video.srcObject = stream;
    await video.play();
    resizeCanvasToVideo();
    hideLoadingLayer();
    setStatus("Look at the camera");
    startFrameLoop();
  } catch (error) {
    console.error(error);
    setStatus("Camera blocked. Allow camera access and refresh.");
    showLoadingLayer();
    loadingLayer.querySelector("strong").textContent = "Camera needs permission";
    loadingLayer.querySelector("span").textContent = "Use Live Server or localhost in VS Code";
  }
}

function startFrameLoop() {
  const processFrame = async () => {
    if (!isRunning) return;

    renderFrame();

    const currentFrameTime = video.currentTime;
    const shouldProcess = video.readyState >= 2 && currentFrameTime !== lastVideoFrameTime;

    if (shouldProcess && !isProcessingFrame && faceMesh) {
      isProcessingFrame = true;
      lastVideoFrameTime = currentFrameTime;

      try {
        await faceMesh.send({ image: video });
      } catch (error) {
        console.error(error);
        setStatus("Tracking paused. Refresh and try again.");
      } finally {
        isProcessingFrame = false;
      }
    }

    animationFrameId = requestAnimationFrame(processFrame);
  };

  animationFrameId = requestAnimationFrame(processFrame);
}

function stopCamera() {
  isRunning = false;
  isProcessingFrame = false;
  latestFaceLandmarks = null;
  smoothedFace = null;
  lastVideoFrameTime = -1;

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  video.srcObject = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  showIntroScreen();
}

function captureCanvasAsBlob() {
  return new Promise((resolve) => {
    if (!canvas.width || !canvas.height) {
      resolve(null);
      return;
    }

    canvas.toBlob((blob) => resolve(blob), "image/png", 1);
  });
}

async function snapPhoto() {
  renderFrame();
  const blob = await captureCanvasAsBlob();

  if (!blob) {
    setStatus("Start the camera before snapping");
    return null;
  }

  latestCaptureBlob = blob;
  const url = URL.createObjectURL(blob);
  previewImage.src = url;
  previewImage.classList.add("show");
  setStatus("Snap ready");
  return blob;
}

async function downloadSnap() {
  const blob = latestCaptureBlob || await snapPhoto();

  if (!blob) return;

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "sweet-crumbs-crumbcam.png";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setStatus("Snap downloaded");
}

async function shareSnap() {
  const blob = latestCaptureBlob || await snapPhoto();

  if (!blob) return;

  const file = new File([blob], "sweet-crumbs-crumbcam.png", { type: "image/png" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: "The Sweet Crumbs CrumbCam",
        text: "My #SweetMoments cookie filter snap",
        files: [file]
      });
      setStatus("Shared successfully");
      return;
    } catch (error) {
      if (error.name !== "AbortError") console.error(error);
    }
  }

  await downloadSnap();
}

startBtn.addEventListener("click", startCamera);
stopBtn.addEventListener("click", stopCamera);
snapBtn.addEventListener("click", snapPhoto);
shareBtn.addEventListener("click", shareSnap);
downloadBtn.addEventListener("click", downloadSnap);

window.addEventListener("beforeunload", stopCamera);
