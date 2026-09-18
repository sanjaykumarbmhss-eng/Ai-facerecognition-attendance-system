import sys
import os

try:
    import cv2
    import numpy as np
    import face_recognition
    import face_handler
    print("SUCCESS: OpenCV, Face Recognition, NumPy, and Face Handler loaded successfully!")
    print(f"Python version: {sys.version}")
except Exception as e:
    print(f"ERROR during imports: {str(e)}")
    sys.exit(1)
