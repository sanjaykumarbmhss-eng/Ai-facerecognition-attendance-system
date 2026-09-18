import sys
import subprocess
try:
    import flask
    import sqlalchemy
    import face_recognition
except ImportError:
    print("Installing required dependencies... This may take a minute.")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "setuptools"])
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
    try:
        import dlib
    except ImportError:
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "https://github.com/sachadee/Dlib/raw/main/dlib-20.0.0-cp314-cp314-win_amd64.whl"])
        except subprocess.CalledProcessError:
            print("WARNING: Could not automatically install the provided dlib wheel. Trying standard pip install...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", "dlib"])
    subprocess.check_call([sys.executable, "-m", "pip", "install", "face_recognition"])

import time
import sys
import threading

# Import the flask app from app.py
import os
try:
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    from app import app
except Exception as e:
    print(f"Error importing app: {e}")
    sys.exit(1)

def run_flask():
    """Runs the Flask server directly, disabling reloader for Colab environment compatibility."""
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)

if __name__ == "__main__":
    print("Starting Face Recognition Attendance System in background thread...")
    server_thread = threading.Thread(target=run_flask, daemon=True)
    server_thread.start()
    
    # Wait 2 seconds for tables initialization and binding
    time.sleep(2)
    
    # Attempt to fetch Google Colab proxy URL
    try:
        from google.colab.output import eval_js  # type: ignore[import-not-found]
        proxy_url = eval_js("google.colab.kernel.proxyPort(5000)")
        
        print("\n" + "="*70)
        print("FACE RECOGNITION ATTENDANCE SYSTEM IS LIVE IN GOOGLE COLAB!")
        print("Click the link below to open the admin panel in your browser:")
        print(proxy_url)
        print("="*70 + "\n")
        print("Admin Credentials:")
        print("  - Username: admin")
        print("  - Password: admin123")
        print("\nLeave this cell running. Press Stop/Interrupt in Colab to shut down.")
    except Exception as e:
        print("\n" + "="*70)
        print("FACE RECOGNITION ATTENDANCE SYSTEM WEB SERVER")
        print("Server is listening on: http://localhost:5000")
        print("Admin Credentials:")
        print("  - Username: admin")
        print("  - Password: admin123")
        print("="*70 + "\n")
        print(f"(Colab proxy link generation bypassed: {e})")
        
    # Keep main thread alive to hold daemon running
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down server. Goodbye!")
