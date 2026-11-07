-- Read receipts (✓✓): stream last_read_at changes to the other participants.
-- Realtime applies the conversation_participants RLS (participants only) to each subscriber.
alter publication supabase_realtime add table public.conversation_participants;
