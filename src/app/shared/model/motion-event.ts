export class MotionEvent {
    public static MOTION_INIT_SUCCESS = "MOTION_INIT_SUCCESS";
    public static MOTION_INIT_ERROR = "MOTION_INIT_ERROR";
    public static MOTION_START_COMPLETE = "MOTION_START_COMPLETE";
    public static MOTION_CAPTURE_CALLBACK = "MOTION_CAPTURE_CALLBACK";
  
    constructor(public eventName: string = "", public value: any = undefined) {}
  }
  