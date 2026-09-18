import os
import qrcode
from database import SessionLocal
from models import Student

def generate_student_qrcodes():
    # Ensure output directory exists
    output_dir = "static/qrcodes"
    os.makedirs(output_dir, exist_ok=True)
    
    db = SessionLocal()
    students = db.query(Student).all()
    
    if not students:
        print("No students found in the database.")
        db.close()
        return
        
    for student in students:
        # The QR code data is the student's roll number
        data = student.roll_number
        if not data:
            continue
            
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=10,
            border=4,
        )
        qr.add_data(data)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Save as PNG
        safe_name = "".join(c for c in student.name if c.isalnum() or c in " -_").strip()
        filename = f"{student.roll_number}_{safe_name}.png"
        filepath = os.path.join(output_dir, filename)
        
        img.save(filepath)
        print(f"Generated QR Code for {student.name} ({student.roll_number}) -> {filepath}")
        
    db.close()
    print("All QR codes generated successfully!")

if __name__ == "__main__":
    generate_student_qrcodes()
