import json
import cv2
import numpy as np
import face_recognition

def bytes_to_cv2(image_bytes):
    """Convert raw image bytes to OpenCV BGR format."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    return cv2.imdecode(nparr, cv2.IMREAD_COLOR)

def get_face_encodings(cv_image):
    """
    Find all faces in a CV2 image and return their bounding boxes and 128D encodings.
    Bounding box is in (top, right, bottom, left) order.
    """
    # Convert BGR to RGB (face_recognition library expects RGB)
    rgb_image = cv2.cvtColor(cv_image, cv2.COLOR_BGR2RGB)
    
    # Detect face locations
    face_locations = face_recognition.face_locations(rgb_image)
    
    # Extract 128D embeddings
    face_encodings = face_recognition.face_encodings(rgb_image, face_locations)
    
    return face_locations, face_encodings

def match_face(detected_encoding, known_encodings_dict, tolerance=0.5):
    """
    Compare a single detected encoding with a dict of known encodings {student_id: 128D_list}.
    Returns (student_id, distance) if a match is found under the tolerance threshold, else (None, None).
    """
    if not known_encodings_dict:
        return None, None

    student_ids = list(known_encodings_dict.keys())
    # Convert stored JSON list back to numpy array
    known_arrays = [np.array(known_encodings_dict[sid]) for sid in student_ids]

    # Calculate Euclidean distances between the detected face and all known faces
    distances = face_recognition.face_distance(known_arrays, detected_encoding)
    
    if len(distances) == 0:
        return None, None
        
    best_match_idx = np.argmin(distances)
    best_distance = distances[best_match_idx]

    if best_distance <= tolerance:
        return student_ids[best_match_idx], float(best_distance)
        
    return None, float(best_distance)

def check_liveness(cv_image, face_box):
    """
    Perform a basic liveness check (anti-spoofing) to prevent photo cheating.
    It crops the face, converts to grayscale, and calculates the Laplacian variance.
    If the face is cropped from a digital screen or low-quality printed page,
    the Laplacian variance (sharpness/texture) will be abnormally low (blurry) 
    or extremely high (digital moire patterns/noise).
    
    Returns: (is_live, score)
    """
    top, right, bottom, left = face_box
    
    # Ensure coordinates are within image boundaries
    h, w, _ = cv_image.shape
    top, bottom = max(0, top), min(h, bottom)
    left, right = max(0, left), min(w, right)
    
    # Crop the face region
    face_crop = cv_image[top:bottom, left:right]
    if face_crop.size == 0:
        return False, 0.0
        
    # Convert to grayscale
    gray_face = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
    
    # Calculate Laplacian variance
    laplacian_var = cv2.Laplacian(gray_face, cv2.CV_64F).var()
    
    # Thresholds:
    # - Abnormally low variance (< 100) means the image is highly blurred or a flat photo/screen.
    # - Abnormally high variance (> 1000) can indicate digital grid/Moire pattern from a mobile screen.
    is_live = 100.0 <= laplacian_var <= 1200.0
    
    return bool(is_live), float(laplacian_var)

def detect_qr_code(cv_image):
    """
    Detect and decode a QR code in the image.
    Returns (data, bbox) if a QR code is detected and decoded, else (None, None).
    """
    detector = cv2.QRCodeDetector()
    data, bbox, _ = detector.detectAndDecode(cv_image)
    if bbox is not None and data:
        # Convert bounding box coordinates to simple list of points if needed
        return data, bbox.tolist()
    return None, None
