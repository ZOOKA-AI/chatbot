-- Rollback for 0065.
--
-- Same guard as 0064: a table that still holds queued work is not dropped by a
-- rollback script, because those rows are somebody's scheduled post. Refuse and
-- let a human decide.
do $$
begin
  if to_regclass('public."TikTokPublishJob"') is not null then
    if exists (select 1 from "TikTokPublishJob" limit 1) then
      raise exception 'TikTokPublishJob still holds rows: rollback refused (forward_only)';
    end if;
  end if;
end $$;

do $$
begin
  if to_regclass('public."TikTokPublishJob"') is not null then
    drop table "TikTokPublishJob";
  end if;
end $$;
