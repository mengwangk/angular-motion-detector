import { Injectable, ViewChild } from "@angular/core";
import { Observable } from "rxjs/Observable";
import { Subscription } from "rxjs/Subscription";
import { Subject } from "rxjs/Subject";

import { MotionEvent } from "../../shared/model";
import { MotionDetectionSensitivity } from "./enum";

const SCALE = 10;

@Injectable()
export class MotionDetectorService {
  stream: any; // stream obtained from webcam
  video: any; // shows stream
  videoContainer: any; // video container
  captureCanvas: any; // internal canvas for capturing full images from video
  captureContext: CanvasRenderingContext2D; // context for capture canvas
  diffCanvas: any; // internal canvas for diffing downscaled captures
  diffContext: CanvasRenderingContext2D; // context for diff canvas
  motionCanvas: any; // receives processed diff images
  motionContext: CanvasRenderingContext2D; // context for motion canvas

  // Subscriptions
  onMotionDetectedEvent = new Subject<MotionEvent>();
  onMotionDetectedEventObserver: Observable<MotionEvent> = this.onMotionDetectedEvent.asObservable();
  onInitSuccessEvent = new Subject<MotionEvent>();
  onInitSuccessEventObserver: Observable<MotionEvent> = this.onInitSuccessEvent.asObservable();
  onInitErrorEvent = new Subject<MotionEvent>();
  onInitErrorEventObserver: Observable<MotionEvent> = this.onInitErrorEvent.asObservable();
  onStartCompleteEvent = new Subject<MotionEvent>();
  onStartCompleteEventObserver: Observable<MotionEvent> = this.onStartCompleteEvent.asObservable();
  onCaptureCallbackEvent = new Subject<MotionEvent>();
  onCaptureCallbackEventObserver: Observable<MotionEvent> = this.onCaptureCallbackEvent.asObservable();

  captureInterval: any; // interval for continuous captures
  captureIntervalTime: number; // time between captures, in ms
  captureWidth: number; // full captured image width
  captureHeight: number; // full captured image height
  diffWidth: number; // downscaled width for diff/motion
  diffHeight: number; // downscaled height for diff/motion
  isReadyToDiff: boolean; // has a previous capture been made to diff against?
  pixelDiffThreshold: number; // min for a pixel to be considered significant
  scoreThreshold: number; // min for an image to be considered significant
  includeMotionBox: boolean; // flag to calculate and draw motion bounding box
  includeMotionPixels: boolean; // flag to create object denoting pixels with motion

  constructor() {}

  init(options: any) {
    if (!options) {
      throw "No options object provided";
    }

    // incoming options with defaults
    this.video = options.video || document.createElement("video");
    this.videoContainer = options.videoContainer || undefined;
    this.motionCanvas =
      options.motionCanvas || document.createElement("canvas");
    this.captureIntervalTime = options.captureIntervalTime || 100;
    this.captureWidth = options.captureWidth || 640;
    this.captureHeight = options.captureHeight || 480;
    this.diffWidth = options.diffWidth || 64;
    this.diffHeight = options.diffHeight || 48;
    this.pixelDiffThreshold = options.pixelDiffThreshold || 32;
    this.scoreThreshold = options.scoreThreshold || 16;
    this.includeMotionBox = options.includeMotionBox || false;
    this.includeMotionPixels = options.includeMotionPixels || false;

    // non-configurable
    this.captureCanvas = document.createElement("canvas");
    this.diffCanvas = document.createElement("canvas");
    this.isReadyToDiff = false;
    // prep video
    this.video.autoplay = true;

    this.setCaptureParameters();
  }

  setCaptureParameters() {
    if (this.videoContainer && this.videoContainer.offsetWidth > 0) {
      this.captureWidth = this.videoContainer.offsetWidth;
    } else {
      if (this.video.videoWidth > 0) {
        this.captureWidth = this.video.videoWidth;
      }
    }

    if (this.videoContainer && this.videoContainer.offsetHeight > 0) {
      this.captureHeight = this.videoContainer.offsetHeight;
    } else {
      if (this.video.videoHeight > 0) {
        this.captureHeight = this.video.videoHeight;
      }
    }

    // prep capture canvas
    this.captureCanvas.width = this.captureWidth;
    this.captureCanvas.height = this.captureHeight;
    this.captureContext = this.captureCanvas.getContext("2d");

    // prep diff canvas
    this.diffWidth = this.captureWidth / this.getScale();
    this.diffHeight = this.captureHeight / this.getScale();

    this.diffCanvas.width = this.diffWidth;
    this.diffCanvas.height = this.diffHeight;
    this.diffContext = this.diffCanvas.getContext("2d");

    // prep motion canvas
    this.motionCanvas.width = this.diffWidth;
    this.motionCanvas.height = this.diffHeight;
    this.motionContext = this.motionCanvas.getContext("2d");
  }

  requestWebcam() {
    var constraints = {
      audio: false,
      video: { width: this.captureWidth, height: this.captureHeight }
    };

    navigator.mediaDevices
      .getUserMedia(constraints)
      .then(stream => this.initSuccess(stream))
      .catch(error => this.initError(error));
  }

  initSuccess(requestedStream) {
    this.stream = requestedStream;
    this.onInitSuccessEvent.next(
      new MotionEvent(MotionEvent.MOTION_INIT_SUCCESS)
    );
  }

  initError(error) {
    this.onInitErrorEvent.next(
      new MotionEvent(MotionEvent.MOTION_INIT_ERROR, error)
    );
  }

  start() {
    if (!this.stream) {
      throw "Cannot start after init fail";
    }
    // streaming takes a moment to start
    this.video.addEventListener("canplay", this.startComplete.bind(this));
    this.video.srcObject = this.stream;
  }

  // TODO
  startWithStream(stream) {
    this.stream = stream;
    this.onInitSuccessEvent.next(
      new MotionEvent(MotionEvent.MOTION_INIT_SUCCESS)
    );
  }

  startComplete() {
    this.video.removeEventListener("canplay", this.startComplete);

    // Video is ready
    this.setCaptureParameters();

    this.captureInterval = setInterval(
      this.capture.bind(this),
      this.captureIntervalTime
    );
    this.onStartCompleteEvent.next(
      new MotionEvent(MotionEvent.MOTION_START_COMPLETE)
    );
  }

  stop() {
    clearInterval(this.captureInterval);
    this.video.src = "";
    this.motionContext.clearRect(0, 0, this.diffWidth, this.diffHeight);
    this.isReadyToDiff = false;
  }

  capture() {
    // save a full-sized copy of capture
    this.captureContext.drawImage(
      this.video,
      0,
      0,
      this.captureWidth,
      this.captureHeight
    );
    var captureImageData = this.captureContext.getImageData(
      0,
      0,
      this.captureWidth,
      this.captureHeight
    );

    // diff current capture over previous capture, leftover from last time
    this.diffContext.globalCompositeOperation = "difference";
    this.diffContext.drawImage(
      this.video,
      0,
      0,
      this.diffWidth,
      this.diffHeight
    );
    var diffImageData = this.diffContext.getImageData(
      0,
      0,
      this.diffWidth,
      this.diffHeight
    );

    if (this.isReadyToDiff) {
      var diff = this.processDiff(diffImageData);

      this.motionContext.putImageData(diffImageData, 0, 0);
      if (diff.motionBox) {
        this.motionContext.strokeStyle = "#fff";
        this.motionContext.strokeRect(
          diff.motionBox.x.min + 0.5,
          diff.motionBox.y.min + 0.5,
          diff.motionBox.x.max - diff.motionBox.x.min,
          diff.motionBox.y.max - diff.motionBox.y.min
        );
      }

      this.onCaptureCallbackEvent.next(
        new MotionEvent(MotionEvent.MOTION_CAPTURE_CALLBACK, {
          imageData: captureImageData,
          score: diff.score,
          hasMotion: diff.score >= this.scoreThreshold,
          motionBox: diff.motionBox,
          motionPixels: diff.motionPixels,
          getURL: function() {
            return this.getCaptureUrl(this.imageData);
          },
          checkMotionPixel: function(x, y) {
            return this.checkMotionPixel(this.motionPixels, x, y);
          }
        })
      );
    }

    // draw current capture normally over diff, ready for next time
    this.diffContext.globalCompositeOperation = "source-over";
    this.diffContext.drawImage(
      this.video,
      0,
      0,
      this.diffWidth,
      this.diffHeight
    );
    this.isReadyToDiff = true;
  }

  processDiff(diffImageData) {
    var rgba = diffImageData.data;

    // pixel adjustments are done by reference directly on diffImageData
    var score = 0;
    var motionPixels = this.includeMotionPixels ? [] : undefined;
    var motionBox = undefined;
    for (var i = 0; i < rgba.length; i += 4) {
      var pixelDiff = rgba[i] * 0.3 + rgba[i + 1] * 0.6 + rgba[i + 2] * 0.1;
      var normalized = Math.min(
        255,
        pixelDiff * (255 / this.pixelDiffThreshold)
      );
      rgba[i] = 0;
      rgba[i + 1] = normalized;
      rgba[i + 2] = 0;

      if (pixelDiff >= this.pixelDiffThreshold) {
        score++;
        var coords = this.calculateCoordinates(i / 4);

        if (this.includeMotionBox) {
          motionBox = this.calculateMotionBox(motionBox, coords.x, coords.y);
        }

        if (this.includeMotionPixels) {
          motionPixels = this.calculateMotionPixels(
            motionPixels,
            coords.x,
            coords.y,
            pixelDiff
          );
        }
      }
    }
    /*
    if (score > this.scoreThreshold) {
      console.log('score ---' + score);
    }
    */
    return {
      score: score,
      motionBox: score > this.scoreThreshold ? motionBox : undefined,
      motionPixels: motionPixels
    };
  }

  calculateCoordinates(pixelIndex) {
    return {
      x: pixelIndex % this.diffWidth,
      y: Math.floor(pixelIndex / this.diffWidth)
    };
  }

  calculateMotionBox(currentMotionBox, x, y) {
    // init motion box on demand
    var motionBox = currentMotionBox || {
      x: { min: x, max: x },
      y: { min: y, max: y }
    };

    motionBox.x.min = Math.min(motionBox.x.min, x);
    motionBox.x.max = Math.max(motionBox.x.max, x);
    motionBox.y.min = Math.min(motionBox.y.min, y);
    motionBox.y.max = Math.max(motionBox.y.max, y);

    return motionBox;
  }

  calculateMotionPixels(motionPixels, x, y, pixelDiff) {
    motionPixels[x] = motionPixels[x] || [];
    motionPixels[x][y] = true;

    return motionPixels;
  }

  getCaptureUrl(captureImageData) {
    // may as well borrow captureCanvas
    this.captureContext.putImageData(captureImageData, 0, 0);
    return this.captureCanvas.toDataURL();
  }

  checkMotionPixel(motionPixels, x, y) {
    return motionPixels && motionPixels[x] && motionPixels[x][y];
  }

  getPixelDiffThreshold() {
    return this.pixelDiffThreshold;
  }

  setPixelDiffThreshold(val) {
    this.pixelDiffThreshold = val;
  }

  getScoreThreshold() {
    return this.scoreThreshold;
  }

  setScoreThreshold(val) {
    this.scoreThreshold = val;
  }

  getScale(){
    return SCALE;
  }
}
