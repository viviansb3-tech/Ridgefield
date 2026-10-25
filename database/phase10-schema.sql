USE ridgefield;

CREATE TABLE IF NOT EXISTS users_rel (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(190) NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','teacher','parent','student') NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS students_rel (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  parent_user_id BIGINT UNSIGNED NULL,
  student_number VARCHAR(50) NOT NULL UNIQUE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  grade VARCHAR(30) NULL,
  class_name VARCHAR(80) NULL,
  status ENUM('Active','Inactive','Graduated','Archived') NOT NULL DEFAULT 'Active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users_rel(id) ON DELETE SET NULL,
  FOREIGN KEY(parent_user_id) REFERENCES users_rel(id) ON DELETE SET NULL,
  INDEX idx_student_parent(parent_user_id),
  INDEX idx_student_grade(grade)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS subjects_rel (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(30) NULL UNIQUE,
  active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS teachers_rel (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  employee_number VARCHAR(50) NULL UNIQUE,
  FOREIGN KEY(user_id) REFERENCES users_rel(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS results_rel (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  subject_id BIGINT UNSIGNED NOT NULL,
  teacher_id BIGINT UNSIGNED NULL,
  term VARCHAR(30) NOT NULL,
  assessment VARCHAR(120) NOT NULL,
  mark DECIMAL(8,2) NOT NULL,
  out_of DECIMAL(8,2) NOT NULL DEFAULT 100,
  comment TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(student_id) REFERENCES students_rel(id) ON DELETE CASCADE,
  FOREIGN KEY(subject_id) REFERENCES subjects_rel(id) ON DELETE RESTRICT,
  FOREIGN KEY(teacher_id) REFERENCES teachers_rel(id) ON DELETE SET NULL,
  INDEX idx_result_student(student_id),
  INDEX idx_result_subject(subject_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attendance_rel (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  attendance_date DATE NOT NULL,
  status ENUM('Present','Late','Absent','Excused') NOT NULL,
  note VARCHAR(255) NULL,
  FOREIGN KEY(student_id) REFERENCES students_rel(id) ON DELETE CASCADE,
  UNIQUE KEY uq_student_date(student_id,attendance_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS invoices_rel (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  invoice_no VARCHAR(60) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  due_date DATE NOT NULL,
  status ENUM('Unpaid','Partially Paid','Paid','Cancelled') NOT NULL DEFAULT 'Unpaid',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(student_id) REFERENCES students_rel(id) ON DELETE RESTRICT,
  INDEX idx_invoice_student(student_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments_rel (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  receipt_no VARCHAR(60) NOT NULL UNIQUE,
  amount DECIMAL(12,2) NOT NULL,
  method VARCHAR(50) NOT NULL,
  reference VARCHAR(120) NULL,
  payment_date DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(student_id) REFERENCES students_rel(id) ON DELETE RESTRICT,
  INDEX idx_payment_student(student_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS messages_rel (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  from_user_id BIGINT UNSIGNED NOT NULL,
  to_user_id BIGINT UNSIGNED NOT NULL,
  subject VARCHAR(190) NOT NULL,
  body TEXT NOT NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(from_user_id) REFERENCES users_rel(id) ON DELETE CASCADE,
  FOREIGN KEY(to_user_id) REFERENCES users_rel(id) ON DELETE CASCADE,
  INDEX idx_message_recipient(to_user_id,read_at),
  INDEX idx_message_sender(from_user_id)
) ENGINE=InnoDB;
