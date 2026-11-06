-- =====================================================================
-- Storage: private avatars bucket. A face + membership of this community
-- reveals health data, so avatars are NOT public; members get signed URLs.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Read: any member, or the owner (needed during onboarding before becoming a member).
create policy avatars_read on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_member()))
  );

-- Write: only inside your own folder "<user id>/..."
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- =====================================================================
-- Interests catalogue (reference data, safe for every environment)
-- =====================================================================
insert into public.interests (slug, label_es, label_en, emoji, sort_order) values
  ('padel',        'Pádel',            'Padel',           '🎾', 10),
  ('running',      'Running',          'Running',         '🏃', 20),
  ('fitness',      'Fitness',          'Fitness',         '🏋️', 30),
  ('cycling',      'Ciclismo',         'Cycling',         '🚴', 40),
  ('football',     'Fútbol',           'Football',        '⚽', 50),
  ('basketball',   'Baloncesto',       'Basketball',      '🏀', 55),
  ('swimming',     'Natación',         'Swimming',        '🏊', 60),
  ('hiking',       'Senderismo',       'Hiking',          '🥾', 70),
  ('climbing',     'Escalada',         'Climbing',        '🧗', 75),
  ('snowboard',    'Snowboard y esquí','Snowboard & ski', '🏂', 80),
  ('surf',         'Surf',             'Surfing',         '🏄', 85),
  ('yoga',         'Yoga',             'Yoga',            '🧘', 90),
  ('travel',       'Viajes',           'Travel',          '✈️', 100),
  ('music',        'Música',           'Music',           '🎵', 110),
  ('concerts',     'Conciertos',       'Concerts',        '🎤', 115),
  ('food',         'Gastronomía',      'Food',            '🍽️', 120),
  ('coffee',       'Café y charla',    'Coffee & chat',   '☕', 125),
  ('technology',   'Tecnología',       'Technology',      '💻', 130),
  ('gaming',       'Videojuegos',      'Gaming',          '🎮', 140),
  ('boardgames',   'Juegos de mesa',   'Board games',     '🎲', 145),
  ('entrepreneur', 'Emprendimiento',   'Entrepreneurship','🚀', 150),
  ('reading',      'Lectura',          'Reading',         '📚', 160),
  ('cinema',       'Cine y series',    'Film & TV',       '🎬', 170),
  ('photography',  'Fotografía',       'Photography',     '📷', 180),
  ('art',          'Arte y diseño',    'Art & design',    '🎨', 190),
  ('pets',         'Mascotas',         'Pets',            '🐾', 200),
  ('volunteering', 'Voluntariado',     'Volunteering',    '🤝', 210),
  ('other',        'Otros',            'Other',           '✨', 999)
on conflict (slug) do nothing;
