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

import os
import base64
import json
import datetime
from io import BytesIO
from flask import Flask, request, jsonify, render_template, send_file, session, redirect, url_for
from sqlalchemy.orm import Session
from werkzeug.security import generate_password_hash, check_password_hash
import sqlalchemy

import numpy as np
import cv2

# Import database and models
from database import engine, Base, SessionLocal, get_db
from models import Student, Attendance, Admin
import face_handler

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "face_recognition_attendance_secret_key_12345")

# Ensure dataset and static directories exist
os.makedirs("static/dataset", exist_ok=True)

# Schema upgrade utility
DATABASE_FILE = "attendance.db"
if os.path.exists(DATABASE_FILE):
    try:
        # Check if parent_email column exists in the sqlite students table
        db = SessionLocal()
        db.execute(sqlalchemy.text("SELECT parent_email FROM students LIMIT 1"))
        db.close()
    except Exception:
        # Schema mismatch: close engine, delete old database file, force rebuild
        if 'db' in locals():
            db.close()
        engine.dispose()
        try:
            os.remove(DATABASE_FILE)
            print("Dropped old database schema successfully.")
        except Exception as e:
            print("Failed to remove old database:", e)

# Create Database tables on startup
Base.metadata.create_all(bind=engine)

# Seed database with admin and sample student historical data
def seed_database():
    db = SessionLocal()
    
    # 1. Seed Admin
    if db.query(Admin).count() == 0:
        default_admin = Admin(
            username="admin",
            password_hash=generate_password_hash("admin123")
        )
        db.add(default_admin)
        
    # 2. Seed Sample Students with historical attendance
    if db.query(Student).count() == 0:
        s1 = Student(
            name="John Doe",
            roll_number="CS-001",
            email="john.doe@university.edu",
            department="Computer Science",
            parent_email="john.parent@gmail.com",
            parent_phone="+1555019901"
        )
        s2 = Student(
            name="Jane Smith",
            roll_number="CS-002",
            email="jane.smith@university.edu",
            department="Computer Science",
            parent_email="jane.parent@gmail.com",
            parent_phone="+1555019902"
        )
        s3 = Student(
            name="Mark Taylor",
            roll_number="CS-003",
            email="mark.taylor@university.edu",
            department="Information Technology",
            parent_email="mark.parent@gmail.com",
            parent_phone="+1555019903"
        )
        db.add_all([s1, s2, s3])
        db.commit() # Commit to generate IDs
        
        # Seed 7 days of historical attendance for analytics demonstration
        subjects = ["Machine Learning", "Computer Vision", "Database Systems"]
        today = datetime.date.today()
        
        # John Doe (CS-001 / s1.id): 100% Present
        # Jane Smith (CS-002 / s2.id): ~42% Present (Low Attendance Warning)
        # Mark Taylor (CS-003 / s3.id): ~71% Present (Low Attendance Warning)
        
        for i in range(7):
            date_offset = today - datetime.timedelta(days=i)
            # Skip Sundays
            if date_offset.weekday() == 6:
                continue
                
            timestamp = datetime.datetime.combine(date_offset, datetime.time(10, 15))
            
            for subject in subjects:
                # John always present
                db.add(Attendance(student_id=s1.id, subject=subject, timestamp=timestamp, status="Present"))
                
                # Jane present every 3rd session
                jane_status = "Present" if (i % 3 == 0) else "Absent"
                db.add(Attendance(student_id=s2.id, subject=subject, timestamp=timestamp, status=jane_status))
                
                # Mark present except on alternate days
                mark_status = "Present" if (i % 2 == 0) else "Absent"
                db.add(Attendance(student_id=s3.id, subject=subject, timestamp=timestamp, status=mark_status))
                
        db.commit()
        print("Database seeded with sample students and historical logs.")
    db.close()

seed_database()

# --- HELPER FUNCTIONS ---
def require_login(f):
    """Decorator to require admin authentication."""
    import functools
    @functools.wraps(f)
    def decorated_function(*args, **kwargs):
        if "admin_logged_in" not in session:
            return jsonify({"error": "Unauthorized. Please login."}), 401
        return f(*args, **kwargs)
    return decorated_function

def log_parent_notification(student, status, subject):
    """Logs simulated email/SMS notifications dispatched to parents."""
    if status.lower() != "absent":
        return
        
    parent_email = student.parent_email if student.parent_email else "sanjaykumarbmhss@gmail.com"
    parent_phone = student.parent_phone if student.parent_phone else "9043409263"
        
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_line = f"[{timestamp}] [ALERT] To: {parent_email} | SMS: {parent_phone} | Parent notified: {student.name} was marked {status.upper()} in {subject}.\n"
    try:
        with open("notifications.log", "a") as f:
            f.write(log_line)
    except Exception as e:
        print("Error logging parent notification:", e)

# --- PAGES ---
@app.route("/")
def index_page():
    if "admin_logged_in" not in session:
        return redirect(url_for("login_page"))
    return render_template("index.html")

@app.route("/login", methods=["GET"])
def login_page():
    if "admin_logged_in" in session:
        return redirect(url_for("index_page"))
    return render_template("login.html")

# --- AUTH API ---
@app.route("/api/auth/login", methods=["POST"])
def api_login():
    data = request.get_json() or {}
    username = data.get("username")
    password = data.get("password")
    
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
        
    db_session = SessionLocal()
    admin = db_session.query(Admin).filter(Admin.username == username).first()
    
    if admin and check_password_hash(admin.password_hash, password):
        session["admin_logged_in"] = True
        session["admin_username"] = username
        db_session.close()
        return jsonify({"success": True, "message": "Login successful"})
        
    db_session.close()
    return jsonify({"error": "Invalid username or password"}), 401

@app.route("/api/auth/logout", methods=["POST", "GET"])
def api_logout():
    session.pop("admin_logged_in", None)
    session.pop("admin_username", None)
    if request.method == "GET":
        return redirect(url_for("login_page"))
    return jsonify({"success": True, "message": "Logged out successfully"})

@app.route("/api/auth/status", methods=["GET"])
def api_auth_status():
    if "admin_logged_in" in session:
        return jsonify({"logged_in": True, "username": session.get("admin_username")})
    return jsonify({"logged_in": False})

# --- STUDENT CRUD ---
@app.route("/api/students", methods=["GET"])
@require_login
def get_students():
    db_session = SessionLocal()
    students = db_session.query(Student).all()
    result = []
    
    today_start = datetime.datetime.combine(datetime.date.today(), datetime.time.min)
    today_end = datetime.datetime.combine(datetime.date.today(), datetime.time.max)
    
    # Calculate each student's overall attendance rate
    for s in students:
        total = db_session.query(Attendance).filter(Attendance.student_id == s.id).count()
        present = db_session.query(Attendance).filter(Attendance.student_id == s.id, Attendance.status == "Present").count()
        rate = round((present / total * 100), 1) if total > 0 else 100.0
        
        # Determine today's status
        today_record = db_session.query(Attendance).filter(
            Attendance.student_id == s.id,
            Attendance.timestamp >= today_start,
            Attendance.timestamp <= today_end
        ).order_by(Attendance.timestamp.desc()).first()
        today_status = today_record.status if today_record else "Absent"
        
        check_in_time = None
        if today_record and today_record.timestamp:
            if hasattr(today_record.timestamp, "strftime"):
                check_in_time = today_record.timestamp.strftime("%I:%M %p")
            else:
                check_in_time = str(today_record.timestamp).split()[1] if len(str(today_record.timestamp).split()) > 1 else str(today_record.timestamp)
                
        created_at_str = None
        if s.created_at:
            if hasattr(s.created_at, "strftime"):
                created_at_str = s.created_at.strftime("%Y-%m-%d %H:%M:%S")
            else:
                created_at_str = str(s.created_at)
        
        result.append({
            "id": s.id,
            "roll_number": s.roll_number,
            "name": s.name,
            "email": s.email,
            "department": s.department,
            "parent_email": s.parent_email,
            "parent_phone": s.parent_phone,
            "has_face": s.face_encoding is not None,
            "image_path": s.image_path,
            "attendance_rate": rate,
            "is_at_risk": rate < 75.0 and total > 0,
            "created_at": created_at_str,
            "today_status": today_status,
            "check_in_time": check_in_time
        })
    db_session.close()
    return jsonify(result)

@app.route("/api/students", methods=["POST"])
@require_login
def create_student():
    data = request.get_json() or {}
    name = data.get("name")
    roll_number = data.get("roll_number")
    email = data.get("email")
    department = data.get("department")
    parent_email = data.get("parent_email")
    parent_phone = data.get("parent_phone")
    
    if not name or not roll_number:
        return jsonify({"error": "Name and Roll Number are required"}), 400
        
    db_session = SessionLocal()
    existing = db_session.query(Student).filter(Student.roll_number == roll_number).first()
    if existing:
        db_session.close()
        return jsonify({"error": f"Student with roll number {roll_number} already exists"}), 400
        
    student = Student(
        name=name,
        roll_number=roll_number,
        email=email,
        department=department,
        parent_email=parent_email,
        parent_phone=parent_phone
    )
    db_session.add(student)
    db_session.commit()
    student_id = student.id
    db_session.close()
    
    return jsonify({"success": True, "id": student_id, "message": "Student created successfully"})

@app.route("/api/students/<int:student_id>", methods=["PUT"])
@require_login
def update_student(student_id):
    data = request.get_json() or {}
    db_session = SessionLocal()
    student = db_session.query(Student).filter(Student.id == student_id).first()
    
    if not student:
        db_session.close()
        return jsonify({"error": "Student not found"}), 404
        
    if "name" in data:
        student.name = data["name"]
    if "email" in data:
        student.email = data["email"]
    if "department" in data:
        student.department = data["department"]
    if "parent_email" in data:
        student.parent_email = data["parent_email"]
    if "parent_phone" in data:
        student.parent_phone = data["parent_phone"]
    if "roll_number" in data:
        roll_num = data["roll_number"]
        existing = db_session.query(Student).filter(Student.roll_number == roll_num, Student.id != student_id).first()
        if existing:
            db_session.close()
            return jsonify({"error": f"Roll number {roll_num} is already taken"}), 400
        student.roll_number = roll_num
        
    db_session.commit()
    db_session.close()
    return jsonify({"success": True, "message": "Student updated successfully"})

@app.route("/api/students/<int:student_id>", methods=["DELETE"])
@require_login
def delete_student(student_id):
    db_session = SessionLocal()
    student = db_session.query(Student).filter(Student.id == student_id).first()
    if not student:
        db_session.close()
        return jsonify({"error": "Student not found"}), 404
        
    # Delete image if exists
    if student.image_path and os.path.exists(student.image_path):
        try:
            os.remove(student.image_path)
        except Exception:
            pass
            
    db_session.delete(student)
    db_session.commit()
    db_session.close()
    return jsonify({"success": True, "message": "Student deleted successfully"})

# --- FACE REGISTRATION ---
@app.route("/api/students/<int:student_id>/register-face", methods=["POST"])
@require_login
def register_face(student_id):
    data = request.get_json() or {}
    image_b64 = data.get("image")
    
    if not image_b64:
        return jsonify({"error": "No image data provided"}), 400
        
    db_session = SessionLocal()
    student = db_session.query(Student).filter(Student.id == student_id).first()
    if not student:
        db_session.close()
        return jsonify({"error": "Student not found"}), 404

    try:
        if "," in image_b64:
            header, image_data = image_b64.split(",", 1)
        else:
            image_data = image_b64
            
        img_bytes = base64.b64decode(image_data)
        cv_image = face_handler.bytes_to_cv2(img_bytes)
        
        if cv_image is None:
            db_session.close()
            return jsonify({"error": "Failed to decode image"}), 400
            
        face_locations, face_encodings = face_handler.get_face_encodings(cv_image)
        
        if len(face_encodings) == 0:
            db_session.close()
            return jsonify({"error": "No face detected in the image. Try again under clear lighting."}), 400
        elif len(face_encodings) > 1:
            db_session.close()
            return jsonify({"error": "Multiple faces detected. Please frame only one person."}), 400
            
        encoding = face_encodings[0]
        
        image_filename = f"static/dataset/student_{student_id}.jpg"
        cv2.imwrite(image_filename, cv_image)
        
        student.face_encoding = json.dumps(encoding.tolist())
        student.image_path = image_filename
        
        db_session.commit()
        db_session.close()
        return jsonify({"success": True, "message": "Face registered successfully!"})
        
    except Exception as e:
        db_session.close()
        return jsonify({"error": f"Error saving face: {str(e)}"}), 500

# --- FACE RECOGNITION SCANNER ---
@app.route("/api/recognize", methods=["POST"])
@require_login
def recognize_face():
    data = request.get_json() or {}
    image_b64 = data.get("image")
    subject = data.get("subject", "General")
    enable_anti_spoof = data.get("anti_spoof", True)
    liveness_threshold = float(data.get("liveness_threshold", 100.0))
    mode = data.get("mode", "face_only") # 'face_only', 'qr_face', or 'qr_only'
    mark_as = data.get("mark_as", "auto") # 'auto', 'present', or 'absent'
    
    if not image_b64:
        return jsonify({"error": "No image data provided"}), 400
        
    db_session = None
    try:
        if "," in image_b64:
            header, image_data = image_b64.split(",", 1)
        else:
            image_data = image_b64
            
        img_bytes = base64.b64decode(image_data)
        cv_image = face_handler.bytes_to_cv2(img_bytes)
        
        if cv_image is None:
            return jsonify({"error": "Failed to decode image"}), 400
        
        # ---- QR-ONLY MODE: Scan QR → lookup student → mark attendance ----
        if mode == "qr_only":
            qr_roll_number, qr_bbox = face_handler.detect_qr_code(cv_image)
            
            if not qr_roll_number:
                return jsonify({
                    "success": True,
                    "results": [{
                        "status": "scan_qr_prompt",
                        "name": "ALIGN QR CODE IN FRAME"
                    }]
                })
            
            db_session = SessionLocal()
            student = db_session.query(Student).filter(Student.roll_number == qr_roll_number).first()
            
            if not student:
                db_session.close()
                return jsonify({
                    "success": True,
                    "results": [{
                        "status": "unknown_qr",
                        "name": "Unknown QR Code",
                        "roll_number": qr_roll_number,
                        "department": None,
                        "qr_box": qr_bbox
                    }]
                })
            
            # Mark attendance
            today_start = datetime.datetime.combine(datetime.date.today(), datetime.time.min)
            today_end = datetime.datetime.combine(datetime.date.today(), datetime.time.max)
            
            duplicate = db_session.query(Attendance).filter(
                Attendance.student_id == student.id,
                Attendance.subject == subject,
                Attendance.timestamp >= today_start,
                Attendance.timestamp <= today_end
            ).first()
            
            status_msg = "marked"
            attendance_status = "Present"
            if not duplicate:
                new_status = "Present" if mark_as != "absent" else "Absent"
                new_attendance = Attendance(
                    student_id=student.id,
                    subject=subject,
                    timestamp=datetime.datetime.utcnow(),
                    status=new_status
                )
                db_session.add(new_attendance)
                db_session.commit()
                status_msg = "marked" if new_status == "Present" else "marked_absent"
                attendance_status = new_status
                log_parent_notification(student, new_status, subject)
            else:
                time_diff = (datetime.datetime.utcnow() - duplicate.timestamp).total_seconds()
                if time_diff < 8:
                    status_msg = "already_marked" if duplicate.status == "Present" else "already_marked_absent"
                    attendance_status = duplicate.status
                else:
                    if mark_as == "auto" or mark_as == "present":
                        new_status = "Present"
                    else: # absent
                        new_status = "Absent"

                    if duplicate.status == new_status:
                        status_msg = "already_marked" if new_status == "Present" else "already_marked_absent"
                        attendance_status = new_status
                    else:
                        duplicate.status = new_status
                        duplicate.timestamp = datetime.datetime.utcnow()
                        db_session.commit()
                        status_msg = "marked" if new_status == "Present" else "marked_absent"
                        attendance_status = new_status
                        log_parent_notification(student, new_status, subject)
            
            result = {
                "status": status_msg,
                "student_id": student.id,
                "name": student.name,
                "roll_number": student.roll_number,
                "department": student.department or "N/A",
                "attendance_status": attendance_status,
                "qr_box": qr_bbox,
                "qr_verified": True
            }
            
            db_session.close()
            return jsonify({"success": True, "results": [result]})
            
        # Detect if a QR Code is visible in the frame (for QR + Face Verification mode)
        qr_roll_number = None
        qr_bbox = None
        if mode == "qr_face":
            qr_roll_number, qr_bbox = face_handler.detect_qr_code(cv_image)
            
        db_session = SessionLocal()
        results = []
        
        # Get face coordinates and encodings
        face_locations, face_encodings = face_handler.get_face_encodings(cv_image)
        
        # If no face detected but QR is requested
        if len(face_locations) == 0 and mode == "qr_face" and qr_roll_number:
            db_session.close()
            return jsonify({
                "success": True, 
                "results": [{
                    "status": "qr_only",
                    "name": "QR Detected, Scan Face",
                    "roll_number": qr_roll_number,
                    "qr_box": qr_bbox
                }]
            })
            
        # Standard Processing
        for location, encoding in zip(face_locations, face_encodings):
            top, right, bottom, left = location
            box = {"top": top, "right": right, "bottom": bottom, "left": left}
            
            # Anti-spoofing check
            is_live = True
            liveness_score = 0.0
            if enable_anti_spoof:
                # Run texture analysis
                is_live_base, liveness_score = face_handler.check_liveness(cv_image, (top, right, bottom, left))
                # Calibrate liveness check based on user threshold slider
                is_live = liveness_score >= liveness_threshold and liveness_score <= 1200.0
                
            if not is_live:
                results.append({
                    "status": "spoof_detected",
                    "name": "SPOOF DETECTED",
                    "box": box,
                    "score": liveness_score
                })
                continue
                
            # Perform Matching
            target_student = None
            distance = 1.0
            
            if mode == "qr_face" and qr_roll_number:
                # 1-to-1 Verification: Lookup QR student and verify face matches only them
                target_student = db_session.query(Student).filter(Student.roll_number == qr_roll_number).first()
                if target_student and target_student.face_encoding:
                    known_encoding = np.array(json.loads(target_student.face_encoding))
                    # Calculate distance
                    distance = float(face_handler.face_recognition.face_distance([known_encoding], encoding)[0])
                    # Ensure matching distance passes threshold
                    if distance > 0.5:
                        target_student = None # Face Mismatch
            else:
                # 1-to-N Search: Match against all registered students
                registered_students = db_session.query(Student).filter(Student.face_encoding != None).all()
                known_encodings = {s.id: json.loads(s.face_encoding) for s in registered_students}
                student_map = {s.id: s for s in registered_students}
                
                matched_id, distance = face_handler.match_face(encoding, known_encodings)
                if matched_id:
                    target_student = student_map[matched_id]
            
            if target_student is not None:
                # Mark attendance
                today_start = datetime.datetime.combine(datetime.date.today(), datetime.time.min)
                today_end = datetime.datetime.combine(datetime.date.today(), datetime.time.max)
                
                duplicate = db_session.query(Attendance).filter(
                    Attendance.student_id == target_student.id,
                    Attendance.subject == subject,
                    Attendance.timestamp >= today_start,
                    Attendance.timestamp <= today_end
                ).first()
                
                status_msg = "marked"
                if not duplicate:
                    new_status = "Present" if mark_as != "absent" else "Absent"
                    new_attendance = Attendance(
                        student_id=target_student.id,
                        subject=subject,
                        timestamp=datetime.datetime.utcnow(),
                        status=new_status
                    )
                    db_session.add(new_attendance)
                    db_session.commit()
                    status_msg = "marked" if new_status == "Present" else "marked_absent"
                    log_parent_notification(target_student, new_status, subject)
                else:
                    # Toggle check (with 8s cooldown protection)
                    time_diff = (datetime.datetime.utcnow() - duplicate.timestamp).total_seconds()
                    if time_diff < 8:
                        status_msg = "already_marked" if duplicate.status == "Present" else "already_marked_absent"
                    else:
                        if mark_as == "auto" or mark_as == "present":
                            new_status = "Present"
                        else: # absent
                            new_status = "Absent"

                        if duplicate.status == new_status:
                            status_msg = "already_marked" if new_status == "Present" else "already_marked_absent"
                        else:
                            duplicate.status = new_status
                            duplicate.timestamp = datetime.datetime.utcnow()
                            db_session.commit()
                            status_msg = "marked" if new_status == "Present" else "marked_absent"
                            log_parent_notification(target_student, new_status, subject)
                        
                results.append({
                    "status": status_msg,
                    "student_id": target_student.id,
                    "name": target_student.name,
                    "roll_number": target_student.roll_number,
                    "department": target_student.department,
                    "box": box,
                    "distance": distance,
                    "liveness_score": liveness_score,
                    "qr_verified": mode == "qr_face" and qr_roll_number is not None
                })
            else:
                # Flag mismatch if QR was detected but face failed verification
                status_label = "face_mismatch" if (mode == "qr_face" and qr_roll_number) else "unknown"
                name_label = "Face mismatch with QR!" if status_label == "face_mismatch" else "Unknown Person"
                
                results.append({
                    "status": status_label,
                    "name": name_label,
                    "roll_number": qr_roll_number if (mode == "qr_face") else None,
                    "box": box,
                    "distance": distance,
                    "liveness_score": liveness_score
                })
                
        # Handle cases where QR scanner was active but no faces are present to compare
        if len(face_locations) == 0 and mode == "qr_face" and not qr_roll_number:
            results.append({
                "status": "scan_qr_prompt",
                "name": "ALIGN QR CODE IN FRAME"
            })
            
        if db_session:
            db_session.close()
        return jsonify({"success": True, "results": results})
        
    except Exception as e:
        return jsonify({"error": f"Error running recognition: {str(e)}"}), 500
    finally:
        if db_session:
            try:
                db_session.close()
            except:
                pass

# --- REPORTS & ANALYTICS ---
@app.route("/api/attendance", methods=["GET"])
@require_login
def get_attendance_records():
    subject = request.args.get("subject")
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    
    db_session = SessionLocal()
    query = db_session.query(Attendance).join(Student)
    
    if subject:
        query = query.filter(Attendance.subject == subject)
    if start_date:
        s_date = datetime.datetime.strptime(start_date, "%Y-%m-%d")
        query = query.filter(Attendance.timestamp >= s_date)
    if end_date:
        e_date = datetime.datetime.strptime(end_date, "%Y-%m-%d") + datetime.timedelta(days=1)
        query = query.filter(Attendance.timestamp < e_date)
        
    records = query.order_by(Attendance.timestamp.desc()).all()
    
    result = []
    for r in records:
        result.append({
            "id": r.id,
            "roll_number": r.student.roll_number,
            "name": r.student.name,
            "department": r.student.department,
            "subject": r.subject,
            "timestamp": r.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            "status": r.status
        })
        
    db_session.close()
    return jsonify(result)

@app.route("/api/reports/excel", methods=["GET"])
@require_login
def export_excel():
    subject = request.args.get("subject")
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    
    db_session = SessionLocal()
    query = db_session.query(Attendance).join(Student)
    
    if subject:
        query = query.filter(Attendance.subject == subject)
    if start_date:
        s_date = datetime.datetime.strptime(start_date, "%Y-%m-%d")
        query = query.filter(Attendance.timestamp >= s_date)
    if end_date:
        e_date = datetime.datetime.strptime(end_date, "%Y-%m-%d") + datetime.timedelta(days=1)
        query = query.filter(Attendance.timestamp < e_date)
        
    records = query.order_by(Attendance.timestamp.desc()).all()
    
    import openpyxl
    from openpyxl.styles import Font, Alignment, PatternFill
    
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Attendance Report"
    
    # Minimal light design headers
    ws.merge_cells("A1:F1")
    title_cell = ws["A1"]
    title_cell.value = "Attendance Registry Report"
    title_cell.font = Font(name="Segoe UI", size=14, bold=True, color="0F172A")
    title_cell.fill = PatternFill(start_color="F1F5F9", fill_type="solid")
    title_cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 35
    
    ws["A3"] = "Date Range:"
    ws["B3"] = f"{start_date or 'All'} to {end_date or 'All'}"
    ws["A4"] = "Subject:"
    ws["B4"] = subject or "All Subjects"
    for r in [3, 4]:
        ws[f"A{r}"].font = Font(bold=True, name="Segoe UI")
        ws[f"B{r}"].font = Font(name="Segoe UI")
        
    headers = ["Roll Number", "Name", "Department", "Subject", "Timestamp", "Status"]
    header_col = 1
    ws.row_dimensions[6].height = 24
    header_fill = PatternFill(start_color="E2E8F0", fill_type="solid")
    header_font = Font(name="Segoe UI", size=10, bold=True, color="0F172A")
    
    for h in headers:
        cell = ws.cell(row=6, column=header_col)
        cell.value = h
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        header_col += 1
        
    row_num = 7
    for r in records:
        ws.cell(row=row_num, column=1, value=r.student.roll_number).font = Font(name="Segoe UI")
        ws.cell(row=row_num, column=2, value=r.student.name).font = Font(name="Segoe UI")
        ws.cell(row=row_num, column=3, value=r.student.department or "N/A").font = Font(name="Segoe UI")
        ws.cell(row=row_num, column=4, value=r.subject).font = Font(name="Segoe UI")
        ws.cell(row=row_num, column=5, value=r.timestamp.strftime("%Y-%m-%d %H:%M:%S")).font = Font(name="Segoe UI")
        
        status_cell = ws.cell(row=row_num, column=6, value=r.status)
        status_cell.font = Font(name="Segoe UI", bold=True)
        if r.status == "Present":
            status_cell.font = Font(color="047857", bold=True)
            status_cell.fill = PatternFill(start_color="D1FAE5", fill_type="solid")
        else:
            status_cell.font = Font(color="B91C1C", bold=True)
            status_cell.fill = PatternFill(start_color="FEE2E2", fill_type="solid")
        row_num += 1
        
    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 3, 12)
        
    db_session.close()
    
    excel_stream = BytesIO()
    wb.save(excel_stream)
    excel_stream.seek(0)
    
    return send_file(
        excel_stream,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=f"attendance_report_{datetime.date.today().strftime('%Y%m%d')}.xlsx"
    )

@app.route("/api/reports/pdf", methods=["GET"])
@require_login
def export_pdf():
    subject = request.args.get("subject")
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    
    db_session = SessionLocal()
    query = db_session.query(Attendance).join(Student)
    
    if subject:
        query = query.filter(Attendance.subject == subject)
    if start_date:
        s_date = datetime.datetime.strptime(start_date, "%Y-%m-%d")
        query = query.filter(Attendance.timestamp >= s_date)
    if end_date:
        e_date = datetime.datetime.strptime(end_date, "%Y-%m-%d") + datetime.timedelta(days=1)
        query = query.filter(Attendance.timestamp < e_date)
        
    records = query.order_by(Attendance.timestamp.desc()).all()
    
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    
    pdf_stream = BytesIO()
    doc = SimpleDocTemplate(pdf_stream, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    story = []
    
    styles = getSampleStyleSheet()
    
    # Custom Styles for Minimal light theme
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#0F172A'),
        spaceAfter=15
    )
    
    meta_style = ParagraphStyle(
        'MetaText',
        parent=styles['Normal'],
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#475569')
    )
    
    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontSize=9,
        leading=11,
        fontName='Helvetica-Bold',
        textColor=colors.HexColor('#0F172A'),
        alignment=0
    )
    
    table_cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor('#334155')
    )
    
    story.append(Paragraph("Attendance Registry Report", title_style))
    story.append(Paragraph(f"<b>Generated:</b> {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", meta_style))
    story.append(Paragraph(f"<b>Subject Filter:</b> {subject or 'All'}", meta_style))
    story.append(Paragraph(f"<b>Date Range:</b> {start_date or 'Any'} to {end_date or 'Any'}", meta_style))
    story.append(Paragraph(f"<b>Total:</b> {len(records)} entries found", meta_style))
    story.append(Spacer(1, 15))
    
    table_data = [[
        Paragraph("Roll Number", table_header_style),
        Paragraph("Name", table_header_style),
        Paragraph("Department", table_header_style),
        Paragraph("Subject", table_header_style),
        Paragraph("Timestamp", table_header_style),
        Paragraph("Status", table_header_style)
    ]]
    
    for r in records:
        status_text = f"<b><font color='#047857'>{r.status}</font></b>" if r.status == "Present" else f"<b><font color='#B91C1C'>{r.status}</font></b>"
        table_data.append([
            Paragraph(r.student.roll_number, table_cell_style),
            Paragraph(r.student.name, table_cell_style),
            Paragraph(r.student.department or "N/A", table_cell_style),
            Paragraph(r.subject, table_cell_style),
            Paragraph(r.timestamp.strftime("%Y-%m-%d %H:%M:%S"), table_cell_style),
            Paragraph(status_text, table_cell_style)
        ])
        
    col_widths = [75, 115, 85, 85, 115, 65]
    attendance_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    
    attendance_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#F1F5F9')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,0), 6),
        ('TOPPADDING', (0,0), (-1,0), 6),
        ('LINEBELOW', (0,0), (-1,0), 1, colors.HexColor('#CBD5E1')),
        ('LINEBELOW', (0,1), (-1,-1), 0.5, colors.HexColor('#F1F5F9')),
        ('TOPPADDING', (0,1), (-1,-1), 5),
        ('BOTTOMPADDING', (0,1), (-1,-1), 5),
    ]))
    
    story.append(attendance_table)
    doc.build(story)
    
    db_session.close()
    pdf_stream.seek(0)
    
    return send_file(
        pdf_stream,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=f"attendance_report_{datetime.date.today().strftime('%Y%m%d')}.pdf"
    )

@app.route("/api/dashboard/stats", methods=["GET"])
@require_login
def get_dashboard_stats():
    db_session = SessionLocal()
    
    # Total registered students
    total_students = db_session.query(Student).count()
    
    # Today's boundaries
    today_start = datetime.datetime.combine(datetime.date.today(), datetime.time.min)
    today_end = datetime.datetime.combine(datetime.date.today(), datetime.time.max)
    
    # Today's present count
    present_today = db_session.query(Attendance.student_id).filter(
        Attendance.timestamp >= today_start,
        Attendance.timestamp <= today_end,
        Attendance.status == "Present"
    ).distinct().count()
    
    absent_today = max(0, total_students - present_today)
    
    attendance_rate = 0.0
    if total_students > 0:
        attendance_rate = round((present_today / total_students) * 100, 1)
        
    # Department breakdown (pie chart data)
    dept_query = db_session.query(Student.department, sqlalchemy.func.count(Student.id)).group_by(Student.department).all()
    departments = {dept if dept else "Unassigned": count for dept, count in dept_query}
        
    # Weekly attendance trends (last 7 days)
    weekly_trend = []
    today = datetime.date.today()
    for i in range(6, -1, -1):
        day = today - datetime.timedelta(days=i)
        d_start = datetime.datetime.combine(day, datetime.time.min)
        d_end = datetime.datetime.combine(day, datetime.time.max)
        
        count = db_session.query(Attendance.student_id).filter(
            Attendance.timestamp >= d_start,
            Attendance.timestamp <= d_end,
            Attendance.status == "Present"
        ).distinct().count()
        
        weekly_trend.append({
            "date": day.strftime("%a"),
            "count": count
        })
        
    # Calculate At Risk counts (how many students have attendance rate < 75%)
    students = db_session.query(Student).all()
    at_risk_count = 0
    for s in students:
        total = db_session.query(Attendance).filter(Attendance.student_id == s.id).count()
        present = db_session.query(Attendance).filter(Attendance.student_id == s.id, Attendance.status == "Present").count()
        rate = (present / total * 100) if total > 0 else 100.0
        if rate < 75.0 and total > 0:
            at_risk_count += 1
            
    db_session.close()
    
    return jsonify({
        "total_students": total_students,
        "present_today": present_today,
        "absent_today": absent_today,
        "attendance_rate": attendance_rate,
        "department_distribution": departments,
        "weekly_trend": weekly_trend,
        "at_risk_count": at_risk_count
    })

@app.route("/api/notifications", methods=["GET"])
@require_login
def get_notifications():
    notifications = []
    if os.path.exists("notifications.log"):
        try:
            with open("notifications.log", "r") as f:
                lines = f.readlines()
                # Return last 30 entries in reverse
                for line in reversed(lines[-30:]):
                    if line.strip():
                        notifications.append(line.strip())
        except Exception as e:
            notifications.append(f"Error loading logs: {str(e)}")
    else:
        notifications.append("No notification logs available yet.")
    return jsonify(notifications)

if __name__ == "__main__":
    # In Windows environment, running python app.py starts server on port 5000
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)
