import zipfile
import os

source_dir = r"d:\face detection\face detection"
output_filename = r"d:\face detection\face_detection_project.zip"

print(f"Creating {output_filename}...")
with zipfile.ZipFile(output_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(source_dir):
        # Exclude unwanted large directories
        dirs[:] = [d for d in dirs if d not in ('venv', '__pycache__', '.git')]
        for file in files:
            if file == 'attendance.db': # exclude the large database file if preferred
                continue
            file_path = os.path.join(root, file)
            arcname = os.path.relpath(file_path, source_dir)
            zipf.write(file_path, arcname)

print("Zip file created successfully!")
