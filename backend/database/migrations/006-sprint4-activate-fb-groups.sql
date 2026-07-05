-- Kích hoạt group/page Facebook đã seed (Sprint 4): is_active false -> true.
-- Adapter FB đã sẵn sàng (collector + processor + alert verified). Chiến lược: bật hết, monitor sau.
UPDATE osint.osint_groups
SET is_active = true, updated_at = NOW()
WHERE platform_id = (SELECT id FROM osint.osint_platforms WHERE name = 'facebook') AND is_active = false;