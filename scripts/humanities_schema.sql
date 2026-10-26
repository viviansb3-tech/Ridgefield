-- Ridgefield Academy Humanities Portal Schema
-- Target: Supabase (PostgreSQL)

-- 1. Enums
CREATE TYPE user_role AS ENUM ('student', 'teacher', 'admin');

-- 2. Profiles Table (Extends auth.users)
CREATE TABLE profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'student',
    email TEXT UNIQUE NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Modules Table
CREATE TABLE modules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    academic_year TEXT NOT NULL,
    publication_status TEXT DEFAULT 'draft', -- 'draft', 'published'
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Teaching Assignments
CREATE TABLE teaching_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    module_id UUID REFERENCES modules(id) ON DELETE CASCADE,
    UNIQUE(teacher_id, module_id)
);

-- 5. Enrolments
CREATE TABLE enrolments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    module_id UUID REFERENCES modules(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'active',
    enrolled_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(student_id, module_id)
);

-- 6. Resources Table
CREATE TABLE resources (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    module_id UUID REFERENCES modules(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    edition_year TEXT,
    author TEXT,
    storage_path TEXT NOT NULL,
    mime_type TEXT DEFAULT 'application/pdf',
    byte_size BIGINT,
    checksum TEXT,
    publication_status TEXT DEFAULT 'draft',
    download_allowed BOOLEAN DEFAULT false,
    rights_confirmed BOOLEAN DEFAULT false,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Reading Progress
CREATE TABLE reading_progress (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    resource_id UUID REFERENCES resources(id) ON DELETE CASCADE,
    last_page INTEGER DEFAULT 1,
    completed BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(student_id, resource_id)
);

-- 8. Audit Events
CREATE TABLE audit_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    actor_id UUID REFERENCES profiles(id),
    action TEXT NOT NULL,
    target_id UUID,
    timestamp TIMESTAMPTZ DEFAULT now(),
    metadata JSONB
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE teaching_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrolments ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- PROFILES POLICIES
CREATE POLICY "Profiles are viewable by authenticated users"
    ON profiles FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Profiles can be updated by owners or admins"
    ON profiles FOR UPDATE
    USING (auth.uid() = id OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- MODULES POLICIES
CREATE POLICY "Modules are viewable by enrolled students, assigned teachers, or admins"
    ON modules FOR SELECT
    USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin' OR
        EXISTS (SELECT 1 FROM teaching_assignments WHERE teacher_id = auth.uid() AND module_id = modules.id) OR
        EXISTS (SELECT 1 FROM enrolments WHERE student_id = auth.uid() AND module_id = modules.id)
    );

CREATE POLICY "Modules can be managed by admins"
    ON modules FOR ALL
    USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- RESOURCES POLICIES
CREATE POLICY "Resources are viewable by enrolled students, assigned teachers, or admins"
    ON resources FOR SELECT
    USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin' OR
        EXISTS (SELECT 1 FROM teaching_assignments WHERE teacher_id = auth.uid() AND module_id = resources.module_id) OR
        EXISTS (SELECT 1 FROM enrolments WHERE student_id = auth.uid() AND module_id = resources.module_id)
    );

CREATE POLICY "Resources can be managed by assigned teachers or admins"
    ON resources FOR ALL
    USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin' OR
        EXISTS (SELECT 1 FROM teaching_assignments WHERE teacher_id = auth.uid() AND module_id = resources.module_id)
    );

-- READING PROGRESS POLICIES
CREATE POLICY "Progress is viewable by owners, assigned teachers, or admins"
    ON reading_progress FOR SELECT
    USING (
        auth.uid() = student_id OR
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin' OR
        EXISTS (
            SELECT 1 FROM teaching_assignments ta
            JOIN resources r ON r.module_id = ta.module_id
            WHERE ta.teacher_id = auth.uid() AND r.id = reading_progress.resource_id
        )
    );

CREATE POLICY "Progress can be updated by students"
    ON reading_progress FOR UPDATE
    USING (auth.uid() = student_id);

-- AUDIT EVENTS POLICIES
CREATE POLICY "Audit events are viewable only by admins"
    ON audit_events FOR SELECT
    USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Audit events are insertable by authenticated users"
    ON audit_events FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');
