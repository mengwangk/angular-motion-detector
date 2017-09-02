import { TestBed, inject } from '@angular/core/testing';

import { MotionDetectorService } from './motion-detector.service';

describe('MotionDetectorService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MotionDetectorService]
    });
  });

  it('should be created', inject([MotionDetectorService], (service: MotionDetectorService) => {
    expect(service).toBeTruthy();
  }));
});
