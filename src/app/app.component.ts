import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  AfterViewInit,
  NgZone
} from "@angular/core";
import { Observable } from "rxjs/Observable";
import { Subscription } from "rxjs/Subscription";
import { MotionDetectorService } from "./core/vision";
import {
  MotionDetectionSensitivity,
  MotionDetectionAction
} from "./core/vision/enum";

const BROADCAST = "all";

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, AfterViewInit {
  onInitSuccessEventSubscriber: Subscription;
  onInitErrorEventSubscriber: Subscription;
  onStartCompleteEventSubscriber: Subscription;
  onCaptureCallbackEventSubscriber: Subscription;

  @ViewChild("video") video: any;
  @ViewChild("video") videoContainer: any;
  scale: number = this.motionDetectorService.getScale(); // capture resolution over motion resolution
  isActivated: boolean = false;
  isTargetInSight: boolean = false;
  isKnockedOver: boolean = false;
  lostTimeout: any;

  motionBoxVisibility: string = "hidden";
  motionBoxTop: any = 0;
  motionBoxRight: any = 0;
  motionBoxWidth: any = 0;
  motionBoxHeight: any = 0;

  lastDetectedMotion: number;

  constructor(
    public motionDetectorService: MotionDetectorService
  ) {
    this.lastDetectedMotion = new Date().getTime();
    // console.log(this.lastDetectedMotion);
  }

  ngOnInit() {
  }

  ngAfterViewInit() {
    this.subscribeEvents();
    this.motionDetectorService.requestWebcam();
  }

  ngOnDestroy() {
    if (this.onInitSuccessEventSubscriber)
      this.onInitSuccessEventSubscriber.unsubscribe();
    if (this.onInitErrorEventSubscriber)
      this.onInitErrorEventSubscriber.unsubscribe();
    if (this.onStartCompleteEventSubscriber)
      this.onStartCompleteEventSubscriber.unsubscribe();
    if (this.onCaptureCallbackEventSubscriber)
      this.onCaptureCallbackEventSubscriber.unsubscribe();

    this.motionDetectorService.stop();
  }

  subscribeEvents() {
    this.onInitSuccessEventSubscriber = this.motionDetectorService.onInitSuccessEventObserver.subscribe(
      results => {
        this.motionDetectorService.init({
          video: document.getElementById("video"),
          videoContainer: document.getElementById("videoContainer"),
          captureIntervalTime: 100,
          includeMotionBox: true,
          includeMotionPixels: true,
          captureCallback: this.capture,
          scoreThreshold: MotionDetectionSensitivity.Medium
        });

        this.motionDetectorService.start();
      }
    );

    this.onInitErrorEventSubscriber = this.motionDetectorService.onInitErrorEventObserver.subscribe(
      results => {
        console.error("Error starting - " + JSON.stringify(results));
      }
    );

    this.onStartCompleteEventSubscriber = this.motionDetectorService.onStartCompleteEventObserver.subscribe(
      results => {
        this.startComplete();
      }
    );
    this.onCaptureCallbackEventSubscriber = this.motionDetectorService.onCaptureCallbackEventObserver.subscribe(
      results => {
        this.capture(results.value);
        if (results.value.hasMotion) {
            // console.log("Motion is detected");
        }
      }
    );
  }

  startComplete() {
    setTimeout(this.activate.bind(this), 500);
  }

  activate() {
    this.isActivated = true;
  }

  capture(payload) {    
    if (!this.isActivated || this.isKnockedOver) {
      return;
    }
    var box = payload.motionBox;
    if (box) {    
      // video is flipped, so we're positioning from right instead of left
      var right = box.x.min * this.scale + 1;
      var top = box.y.min * this.scale + 1;
      var width = (box.x.max - box.x.min) * this.scale;
      var height = (box.y.max - box.y.min) * this.scale;

      this.motionBoxRight = right;
      this.motionBoxTop = top;
      this.motionBoxWidth = width;
      this.motionBoxHeight = height;
      this.motionBoxVisibility = "visible";

      if (!this.isTargetInSight) {
        this.isTargetInSight = true;
      }

      clearTimeout(this.lostTimeout);
      this.lostTimeout = setTimeout(this.declareLost, 2000);
    }
  }

  declareLost() {
    this.isTargetInSight = false;
  }

  knockOver() {
    this.isKnockedOver = true;
    clearTimeout(this.lostTimeout);
    this.motionBoxVisibility = "hidden";
  }
}
