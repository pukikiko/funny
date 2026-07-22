import os
import cv2
import re
import pytesseract
from ultralytics import YOLO

# Initialize YOLO model on load
# Uses the smallest nano model to preserve memory/speed
MODEL = YOLO('yolov8n.pt') 

def extract_tags_from_video(video_path):
    """
    Analyzes a video file and extracts tags using OCR and Object Detection.
    Returns a comma-separated string of unique tags.
    """
    if not os.path.exists(video_path):
        return ""

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return ""

    # Calculate frame skip to process ~1 frame per second
    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or fps != fps: # NaN/0 check
        fps = 30
    frame_skip = int(fps)
    
    unique_tags = set()
    frame_count = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break
            
        if frame_count % frame_skip == 0:
            # 1. OCR (Tesseract)
            # Convert to grayscale for better OCR
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            # Optional thresholding
            _, thresh = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)
            
            text = pytesseract.image_to_string(thresh)
            # Extract basic words (3+ chars, alphanumeric)
            words = re.findall(r'[A-Za-z0-9]{3,}', text)
            for w in words:
                unique_tags.add(w.lower())
                
            # 2. Object Detection (YOLOv8)
            # run inference
            results = MODEL(frame, verbose=False)
            for r in results:
                # boxes contains the class IDs
                if r.boxes:
                    for cls_id in r.boxes.cls:
                        class_name = MODEL.names[int(cls_id)]
                        unique_tags.add(class_name.lower())

            # Cap the maximum number of tags to prevent unbounded growth on long videos
            if len(unique_tags) > 200:
                break
                
        frame_count += 1
        
    cap.release()
    
    return ", ".join(sorted(unique_tags))

if __name__ == "__main__":
    # Test script usage
    import sys
    if len(sys.argv) > 1:
        print(extract_tags_from_video(sys.argv[1]))
