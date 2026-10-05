-- A delivery can't be logged with a received date in the future. Checked
-- against today in India time (the business's timezone), on top of the
-- same check in the Receiving form and the logReceiving server action.
-- A trigger rather than another copy of log_receiving(), so the rule holds
-- however a row is written.

create function receiving_logs_received_date_not_future()
returns trigger
language plpgsql
as $$
begin
  if (new.received_date at time zone 'Asia/Kolkata')::date
       > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'The received date can''t be in the future.';
  end if;
  return new;
end;
$$;

create trigger receiving_logs_received_date_not_future
before insert or update of received_date on receiving_logs
for each row execute function receiving_logs_received_date_not_future();
