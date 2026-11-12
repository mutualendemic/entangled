alter table realtime.messages enable row level security;

drop policy if exists "event members can receive private realtime messages" on realtime.messages;
drop policy if exists "event members can send private realtime messages" on realtime.messages;

create policy "event members can receive private realtime messages"
on realtime.messages
for select
to authenticated
using (
  realtime.topic() = 'event:' || (select auth.jwt() ->> 'event_id')
    || ':tile:' || (select auth.jwt() ->> 'tile_x')
    || ':' || (select auth.jwt() ->> 'tile_y')
);

create policy "event members can send private realtime messages"
on realtime.messages
for insert
to authenticated
with check (
  realtime.topic() = 'event:' || (select auth.jwt() ->> 'event_id')
    || ':tile:' || (select auth.jwt() ->> 'tile_x')
    || ':' || (select auth.jwt() ->> 'tile_y')
  and (
    (
      payload ? 'id'
      and payload ->> 'id' = (select auth.jwt() ->> 'sub')
      and payload ->> 'username' = (select auth.jwt() ->> 'username')
      and payload ->> 'avatar' = (select auth.jwt() ->> 'avatar')
      and payload ->> 'source' in ('gps', 'ble', 'local')
      and jsonb_typeof(payload -> 'x') = 'number'
      and jsonb_typeof(payload -> 'y') = 'number'
      and (payload ->> 'x')::numeric between 0 and ((select auth.jwt() ->> 'event_width_m')::numeric)
      and (payload ->> 'y')::numeric between 0 and ((select auth.jwt() ->> 'event_height_m')::numeric)
      and (
        payload ->> 'source' = 'local'
        or (
          jsonb_typeof(payload -> 'accuracy') = 'number'
          and case
            when jsonb_typeof(payload -> 'accuracy') = 'number'
              then (payload ->> 'accuracy')::numeric between 0 and 10000
            else false
          end
        )
      )
      and (
        payload ->> 'source' <> 'gps'
        or (
          case
            when jsonb_typeof(payload -> 'lat') = 'number'
              then (payload ->> 'lat')::numeric between -90 and 90
            else false
          end
          and case
            when jsonb_typeof(payload -> 'lon') = 'number'
              then (payload ->> 'lon')::numeric between -180 and 180
            else false
          end
        )
      )
    )
    or
    (
      payload ? 'senderId'
      and payload ->> 'senderId' = (select auth.jwt() ->> 'sub')
      and payload ->> 'username' = (select auth.jwt() ->> 'username')
      and payload ->> 'avatar' = (select auth.jwt() ->> 'avatar')
      and jsonb_typeof(payload -> 'text') = 'string'
      and char_length(payload ->> 'text') between 1 and 500
    )
  )
);