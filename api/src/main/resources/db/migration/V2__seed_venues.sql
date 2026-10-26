-- Flyway runs this version once. Let the identity column allocate IDs so that
-- subsequent API inserts continue using the same sequence without collisions.
INSERT INTO venues (name, location, capacity, open_time, close_time, status)
VALUES
    ('羽毛球馆 A', '体育中心 1 层', 8, TIME '08:00', TIME '22:00', 'OPEN'),
    ('多功能教室 B', '教学楼 2 层', 30, TIME '09:00', TIME '21:00', 'OPEN'),
    ('会议室 C', '行政楼 3 层', 12, TIME '09:00', TIME '18:00', 'CLOSED');
